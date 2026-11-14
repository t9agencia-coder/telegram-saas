import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Response } from 'express';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { decrypt } from '../../common/utils/encryption';
import { getFlowCacheStatus } from '../../common/media-precache';
import { isFileIdValid } from '../../common/media-cache-validate';
import { RedisService } from '../../common/redis.service';
import { MediaWarmupService } from './media-warmup.service';
import { MEDIA_WARMUP_QUEUE } from './media-warmup.processor';
import { saveMediaCacheEntry, saveMediaAssetRef, remarketingCachedFileId } from '../../common/media-cache-store';
import { MediaStoreService } from '../../common/media-store.service';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mediaWarmup: MediaWarmupService,
    private readonly mediaStore: MediaStoreService,
    @InjectQueue('telegram-messages')    private messageQueue:      Queue,
    @InjectQueue('webhook-events')       private webhookQueue:      Queue,
    @InjectQueue('scheduled-tasks')      private scheduledQueue:    Queue,
    @InjectQueue('telegram-remarketing') private remarketingQueue:  Queue,
    @InjectQueue(MEDIA_WARMUP_QUEUE)     private warmupQueue:       Queue,
  ) {}

  // A listagem só precisa de um resumo — nodes/config podem ter dezenas de MB de
  // mídia em base64 embutida (já visto casos reais de 30+MB por fluxo), então
  // nunca devolvemos esses campos inteiros aqui. edges não é usado na listagem,
  // então nem é buscado. findOneFlow continua trazendo tudo, pro editor.
  async findAllFlows(workspaceId: string) {
    const flows = await this.prisma.flow.findMany({
      where: { workspaceId },
      select: {
        id: true, name: true, description: true, trigger: true, isActive: true,
        botId: true, version: true, createdAt: true, updatedAt: true,
        nodes: true, config: true,
        bot: { select: { id: true, username: true, status: true, isActive: true, precacheEnabled: true, warmupChatId: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return flows.map((f) => {
      const nodes = Array.isArray(f.nodes) ? (f.nodes as any[]) : [];
      const nodeCount = nodes.filter((n) => n?.type !== 'trigger').length;
      // Só relevante pra bots novos (precacheEnabled) — bots antigos sempre "completo",
      // pra não mudar nada do que já funciona pra eles.
      const bot = f.bot as any;
      const cacheStatus = bot?.precacheEnabled ? getFlowCacheStatus(f, f.botId) : { complete: true, missing: 0, total: 0, items: [] };
      return {
        id: f.id, name: f.name, description: f.description, trigger: f.trigger,
        isActive: f.isActive, botId: f.botId, version: f.version,
        createdAt: f.createdAt, updatedAt: f.updatedAt,
        bot: bot ? { id: bot.id, username: bot.username, status: bot.status, isActive: bot.isActive, warmupChatId: bot.warmupChatId } : null,
        nodeCount,
        cacheComplete: cacheStatus.complete,
        cacheMissing:  cacheStatus.missing,
        config: { startPayload: (f.config as any)?.startPayload },
      };
    });
  }

  async findOneFlow(workspaceId: string, id: string) {
    const flow = await this.prisma.flow.findFirst({
      where: { id, workspaceId },
      include: {
        bot: {
          select: { id: true, username: true, status: true, isActive: true },
        },
      },
    });
    if (!flow) throw new NotFoundException('Flow not found');
    return flow;
  }

  // Resolve um file_id do Telegram já cacheado (fluxo principal, upsell ou
  // remarketing) em bytes reais, pra o construtor conseguir mostrar uma prévia
  // mesmo em fluxos antigos que tiveram fileData/fileUrl removidos pra economizar
  // espaço. O token do bot nunca é exposto ao navegador — só o proxy usa ele.
  async streamMediaPreview(workspaceId: string, flowId: string, key: string, res: Response): Promise<void> {
    const flow = await this.prisma.flow.findFirst({ where: { id: flowId, workspaceId } });
    if (!flow) { res.status(404).end(); return; }

    const cfg = (flow.config as any) || {};
    let fileId: string | undefined;
    let botId: string | undefined;

    if (key === 'remarketing:legacy') {
      fileId = cfg.remarketing?.cachedFileId;
      botId  = cfg.remarketing?.cachedBotId;
    } else if (key?.startsWith('remarketing:slot:')) {
      const idx  = parseInt(key.slice('remarketing:slot:'.length), 10);
      const slot = Array.isArray(cfg.remarketings) ? cfg.remarketings[idx] : undefined;
      fileId = slot?.cachedFileId;
      botId  = slot?.cachedBotId;
    } else {
      const cached = cfg.mediaCache?.[key];
      fileId = cached?.fileId;
      botId  = cached?.botId;
    }

    if (!fileId || !botId) { res.status(404).end(); return; }

    const bot = await this.prisma.telegramBot.findUnique({ where: { id: botId } });
    if (!bot?.botToken) { res.status(404).end(); return; }
    const token = decrypt(bot.botToken);

    try {
      const fileInfo = await axios.get(`https://api.telegram.org/bot${token}/getFile`, {
        params: { file_id: fileId }, timeout: 10_000,
      });
      const filePath = fileInfo.data?.result?.file_path;
      if (!filePath) { res.status(404).end(); return; }

      const fileRes = await axios.get(`https://api.telegram.org/file/bot${token}/${filePath}`, {
        responseType: 'stream', timeout: 15_000,
      });

      // Telegram nem sempre devolve um content-type útil no arquivo bruto — infere
      // pela extensão (mais confiável pro <video>/<img> do navegador conseguirem tocar).
      const ext = filePath.split('.').pop()?.toLowerCase();
      const mimeByExt: Record<string, string> = {
        mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
      };
      const contentType = (ext && mimeByExt[ext]) || String(fileRes.headers['content-type'] || 'application/octet-stream');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=1800');
      fileRes.data.pipe(res);
    } catch (e: any) {
      this.logger.warn(`streamMediaPreview falhou (flow=${flowId} key=${key}): ${e.message}`);
      if (!res.headersSent) res.status(502).end();
    }
  }

  // config é um JSON solto (upsells, mediaCache, remarketing legado, etc.) — só
  // validamos o campo remarketings especificamente aqui, sem tipar o resto do
  // objeto, pra não arriscar quebrar nenhuma outra chave que já passa por ele.
  private validateRemarketingsConfig(config: Record<string, any> | undefined): void {
    const remarketings = config?.remarketings;
    if (remarketings === undefined) return;
    if (!Array.isArray(remarketings)) {
      throw new BadRequestException('remarketings deve ser um array');
    }
    if (remarketings.length > 10) {
      throw new BadRequestException('Máximo de 10 remarketings por fluxo');
    }
    const validMediaTypes = ['none', 'image', 'video'];
    remarketings.forEach((slot: any, i: number) => {
      if (slot?.mediaType !== undefined && !validMediaTypes.includes(slot.mediaType)) {
        throw new BadRequestException(`remarketings[${i}].mediaType inválido`);
      }
      if (slot?.buttons !== undefined) {
        if (!Array.isArray(slot.buttons)) {
          throw new BadRequestException(`remarketings[${i}].buttons deve ser um array`);
        }
        if (slot.buttons.length > 3) {
          throw new BadRequestException(`remarketings[${i}].buttons: máximo de 3 botões`);
        }
      }
    });
  }

  async createFlow(workspaceId: string, dto: CreateFlowDto) {
    this.validateRemarketingsConfig(dto.config);
    const flow = await this.prisma.flow.create({
      data: {
        workspaceId,
        botId: dto.botId,
        name: dto.name,
        description: dto.description,
        nodes: dto.nodes || [],
        edges: dto.edges || [],
        config: dto.config || {},
        trigger: dto.trigger || 'start',
      },
    });
    this.triggerMediaWarmup(flow).catch((e) => this.logger.warn(`triggerMediaWarmup falhou (flow=${flow.id}): ${e.message}`));
    return flow;
  }

  async updateFlow(workspaceId: string, id: string, dto: UpdateFlowDto) {
    this.validateRemarketingsConfig(dto.config);
    const flow = await this.prisma.flow.findFirst({ where: { id, workspaceId } });
    if (!flow) throw new NotFoundException('Flow not found');

    const data: any = { ...dto, version: { increment: 1 } };
    if (dto.config) {
      data.config = { ...(flow.config as Record<string, any>), ...dto.config };
    }

    const updated = await this.prisma.flow.update({ where: { id }, data });

    // Grava snapshot da versão para histórico/restauração
    await this.prisma.flowVersion.create({
      data: {
        flowId:  id,
        version: updated.version,
        nodes:   updated.nodes as any,
        edges:   updated.edges as any,
        config:  updated.config as any,
      },
    });

    // Mantém apenas as últimas 50 versões por fluxo
    const versions = await this.prisma.flowVersion.findMany({
      where: { flowId: id },
      orderBy: { version: 'desc' },
      skip: 50,
      select: { id: true },
    });
    if (versions.length > 0) {
      await this.prisma.flowVersion.deleteMany({
        where: { id: { in: versions.map(v => v.id) } },
      });
    }

    this.triggerMediaWarmup(updated).catch((e) => this.logger.warn(`triggerMediaWarmup falhou (flow=${updated.id}): ${e.message}`));
    return updated;
  }

  async deleteFlow(workspaceId: string, id: string) {
    const flow = await this.prisma.flow.findFirst({ where: { id, workspaceId } });
    if (!flow) throw new NotFoundException('Flow not found');
    return this.prisma.flow.delete({ where: { id } });
  }

  async getFlowCacheStatus(workspaceId: string, id: string) {
    const flow = await this.prisma.flow.findFirst({
      where: { id, workspaceId },
      include: { bot: true },
    });
    if (!flow) throw new NotFoundException('Flow not found');

    if (!flow.botId || !(flow.bot as any)?.precacheEnabled) {
      return { applicable: false, complete: true, missing: 0, total: 0, items: [] };
    }

    const status = getFlowCacheStatus(flow, flow.botId);

    // Valida os file_id "cacheados" no getFile (memoizado) — um file_id de outro
    // bot passava como pronto. Rebaixa os mortos pra "falta cachear".
    const botToken = (flow.bot as any)?.botToken ? decrypt((flow.bot as any).botToken) : null;
    if (botToken) {
      const mc: Record<string, any> = (flow.config as any)?.mediaCache || {};
      for (const it of status.items) {
        if (!it.cached) continue;
        let fid: string | undefined;
        // Mapa por bot antes do campo antigo — ver remarketingCachedFileId.
        if (it.key === 'remarketing') fid = remarketingCachedFileId(flow.config, null, flow.botId);
        else if (it.key.startsWith('remarketing:')) {
          fid = remarketingCachedFileId(flow.config, Number(it.key.split(':')[1]), flow.botId);
        } else fid = mc[`${it.key}:${flow.botId}`]?.fileId;
        if (fid && !(await isFileIdValid(this.redis as any, botToken, fid))) {
          it.cached = false;
        }
      }
      status.missing = status.items.filter((i) => !i.cached).length;
      status.complete = status.missing === 0;
    }

    return {
      applicable: true,
      warmupConfigured: !!(flow.bot as any).warmupChatId,
      ...status,
    };
  }

  async activateFlow(workspaceId: string, id: string) {
    const flow = await this.prisma.flow.findFirst({
      where: { id, workspaceId },
      include: { bot: true },
    });
    if (!flow) throw new NotFoundException('Flow not found');

    if (!flow.nodes || (flow.nodes as any[]).length === 0) {
      throw new BadRequestException('O fluxo precisa ter pelo menos um bloco para ser ativado');
    }

    if (!flow.botId) {
      throw new BadRequestException('Conecte um bot ao fluxo antes de ativar');
    }

    if (!flow.bot || flow.bot.status !== 'ACTIVE') {
      throw new BadRequestException('O bot conectado precisa estar com status ACTIVE. Verifique se o token do bot é válido.');
    }

    // Bots novos (precacheEnabled) só ativam depois que toda mídia do fluxo
    // (nós, upsells, remarketing) estiver cacheada — evita lead real batendo em
    // bloco "frio" e sobrecarregando o sistema. Bots antigos nunca são afetados.
    if ((flow.bot as any).precacheEnabled) {
      const cacheStatus = getFlowCacheStatus(flow, flow.botId);
      if (!cacheStatus.complete) {
        // Itens sem fileData/fileUrl e nunca cacheados por nenhum bot não têm
        // nada pra enviar — iam ficar "aguardando" pra sempre. Erro específico
        // em vez do genérico, apontando exatamente o bloco que falta preencher.
        const stuck = cacheStatus.items.filter((i) => !i.cached && !i.hasSource);
        if (stuck.length > 0) {
          throw new BadRequestException(
            `Selecione a mídia que falta antes de ativar: ${stuck.map((i) => i.label).join(', ')}.`,
          );
        }
        if (!(flow.bot as any).warmupChatId) {
          throw new BadRequestException(
            `Configure o pré-cache desse bot antes de ativar (em "Meus Robôs" → ⋯ → Configurar Pré-Cache). Faltam ${cacheStatus.missing} de ${cacheStatus.total} mídia(s) cachear.`,
          );
        }
        throw new BadRequestException(
          `Aguardando o chat de aquecimento cachear a mídia (${cacheStatus.missing} de ${cacheStatus.total} pendente${cacheStatus.missing > 1 ? 's' : ''}). Aguarde alguns segundos e tente ativar de novo.`,
        );
      }
    }

    // Verifica se já existe outro fluxo ativo para o mesmo bot
    const conflicting = await this.prisma.flow.findFirst({
      where: { botId: flow.botId, isActive: true, id: { not: id } },
      select: { id: true, name: true },
    });
    if (conflicting) {
      throw new ConflictException('BOT_HAS_ACTIVE_FLOW');
    }

    return this.prisma.flow.update({
      where: { id },
      data: { isActive: true },
    });
  }

  async deactivateFlow(workspaceId: string, id: string) {
    const flow = await this.prisma.flow.findFirst({ where: { id, workspaceId } });
    if (!flow) throw new NotFoundException('Flow not found');
    return this.prisma.flow.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async duplicateFlow(workspaceId: string, id: string, targetBotId?: string) {
    const original = await this.prisma.flow.findFirst({ where: { id, workspaceId } });
    if (!original) throw new NotFoundException('Flow not found');

    const newBotId = targetBotId ?? original.botId;
    // file_id do Telegram é preso ao bot que subiu. Ao duplicar pra outro bot,
    // o cache herdado nunca funciona pra ele (e enganava o getFlowCacheStatus,
    // que só checa se a string existe). Descarta o cache do bot antigo — o
    // warmup re-preenche do zero, correto.
    let config = original.config as any;
    if (newBotId && newBotId !== original.botId && config && typeof config === 'object') {
      config = { ...config };
      if (config.mediaCache && typeof config.mediaCache === 'object') {
        config.mediaCache = Object.fromEntries(
          Object.entries(config.mediaCache).filter(([, v]: any) => v?.botId === newBotId),
        );
      }
      if (config.remarketing?.cachedBotId && config.remarketing.cachedBotId !== newBotId) {
        const { cachedFileId, cachedBotId, ...rest } = config.remarketing;
        config.remarketing = rest;
      }
      if (Array.isArray(config.remarketings)) {
        config.remarketings = config.remarketings.map((s: any) =>
          s?.cachedBotId && s.cachedBotId !== newBotId
            ? (({ cachedFileId, cachedBotId, ...rest }) => rest)(s)
            : s,
        );
      }
    }

    const duplicated = await this.prisma.flow.create({
      data: {
        workspaceId,
        botId:       newBotId,
        name:        `${original.name} (cópia)`,
        description: original.description,
        trigger:     original.trigger,
        config:      config as any,
        nodes:       original.nodes as any,
        edges:       original.edges as any,
        isActive:    false,
      },
    });
    this.triggerMediaWarmup(duplicated).catch((e) => this.logger.warn(`triggerMediaWarmup falhou (flow=${duplicated.id}): ${e.message}`));
    return duplicated;
  }

  // Pré-cache de mídia — enfileira o aquecimento pra rodar fora do processo do
  // save (fila media-warmup + worker). O fluxo salva sem esperar. Todo o
  // trabalho (validar file_id no getFile, recuperar file_id morto, tirar o
  // base64 do config) fica no MediaWarmupService.
  private async triggerMediaWarmup(flow: any): Promise<void> {
    if (!flow?.id || !flow?.botId) return;
    const jobId = `warmup-${flow.id}`;
    try {
      // O jobId fixo deduplica só enquanto o job anterior ainda está em voo
      // (waiting/active/delayed) — evita 2 warmups do mesmo fluxo rodando ao
      // mesmo tempo. Mas o BullMQ trata jobId como identidade permanente: se
      // já existe um job com esse id em estado TERMINAL (completed/failed),
      // adicionar de novo com o mesmo id é uma NO-OP silenciosa (não lança
      // erro, não reagenda nada) — encontrado em produção: fluxo editado
      // depois do 1º warmup concluído nunca reprocessava a mídia nova, ficando
      // preso em "aguardando cache" pra sempre. Por isso removemos o job
      // antigo primeiro se ele já tiver terminado, liberando o id pro novo.
      const existing = await this.warmupQueue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'completed' || state === 'failed') {
          await existing.remove().catch(() => {});
        }
      }

      await this.warmupQueue.add(
        'warmup',
        { flowId: flow.id },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 200, age: 24 * 3600 },
          removeOnFail: { count: 100, age: 3 * 24 * 3600 },
        },
      );
    } catch (e: any) {
      this.logger.warn(`enfileirar warmup falhou (flow=${flow.id}): ${e.message}`);
    }
  }

  /** Progresso do aquecimento de mídia — a tela do builder faz poll disso. */
  async getWarmupProgress(workspaceId: string, id: string) {
    const flow = await this.prisma.flow.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!flow) throw new NotFoundException('Flow not found');
    return (
      (await this.mediaWarmup.getProgress(id)) ??
      { state: 'idle', total: 0, done: 0, current: null }
    );
  }

  /**
   * Botão "Tentar novamente" do pré-cache — pra quando o usuário reenviou a
   * mídia que faltava (ou só quer forçar uma nova tentativa) sem precisar
   * editar e salvar o fluxo inteiro de novo.
   *
   * Usa um jobId ÚNICO por chamada (em vez do `warmup-${flowId}` fixo do
   * enfileiramento automático) de propósito: cobre também o caso mais raro de
   * um job antigo ter ficado preso em "active" pra sempre (worker reiniciado
   * no meio do processamento, por exemplo) — o `triggerMediaWarmup` normal só
   * limpa jobs já TERMINADOS (completed/failed); um "active" travado bloquearia
   * até esse botão. `warmOne()` já tem lock por item (Redis NX, 180s) então
   * rodar 2 jobs em paralelo por um instante não duplica nenhum envio real.
   */
  async retryWarmup(workspaceId: string, id: string) {
    const flow = await this.prisma.flow.findFirst({
      where: { id, workspaceId },
      include: { bot: true },
    });
    if (!flow) throw new NotFoundException('Flow not found');
    if (!flow.botId) {
      throw new BadRequestException('Esse fluxo não tem bot conectado.');
    }
    if (!(flow.bot as any)?.precacheEnabled) {
      throw new BadRequestException('Esse bot não usa pré-cache de mídia.');
    }
    if (!(flow.bot as any)?.warmupChatId) {
      throw new BadRequestException('Configure o pré-cache desse bot antes (⋯ → Configurar Pré-Cache).');
    }

    await this.warmupQueue.add(
      'warmup',
      { flowId: id },
      {
        jobId: `warmup-retry-${id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 200, age: 24 * 3600 },
        removeOnFail: { count: 100, age: 3 * 24 * 3600 },
      },
    );

    return { queued: true };
  }

  /**
   * Cacheia UMA mídia na hora, chamado direto do editor assim que o usuário
   * escolhe o arquivo — não espera o fluxo (nem o resto dele) ser salvo, nem
   * o job de fundo do warmup em lote. Já persiste em `config.mediaCache`
   * (mesmo formato/chave que o warmup em lote usa: `"<nodeId>:<botId>"`), pra
   * o resto do sistema (getFlowCacheStatus, activateFlow, etc.) enxergar o
   * item como pronto imediatamente — sem depender de o usuário clicar em
   * "Salvar" no resto do fluxo.
   */
  async warmMediaNow(
    workspaceId: string,
    flowId: string,
    nodeId: string,
    type: 'photo' | 'video',
    source: { fileUrl?: string; fileData?: string },
  ) {
    const flow = await this.prisma.flow.findFirst({ where: { id: flowId, workspaceId } });
    if (!flow) throw new NotFoundException('Flow not found');
    if (!flow.botId) throw new BadRequestException('Conecte um bot ao fluxo antes de cachear mídia.');

    // Mesma chave usada pelo warmup em lote (media-warmup.service.ts::collectItems)
    // em config.mediaCache E no lock de corrida contra o "Salvar" do resto do fluxo.
    const itemKey = `${nodeId}:${flow.botId}`;

    // ── Mídia-teca ───────────────────────────────────────────────────────────
    // ANTES de qualquer coisa com o Telegram: guarda o arquivo original em disco.
    // Este é o ponto em que a plataforma passa a ser dona da mídia — a partir
    // daqui, trocar ou excluir o bot deixa de destruir o vídeo do cliente,
    // porque o file_id vira cache recalculável em vez de cópia única.
    // Best-effort de propósito: se a gravação falhar, o cache do Telegram ainda
    // acontece (comportamento de hoje), só não ganhamos a proteção extra.
    const assetId = await this.storeFlowMedia(workspaceId, flowId, nodeId, type, source);

    let result: { fileId: string };
    try {
      result = await this.mediaWarmup.warmMediaNow(flow.botId, itemKey, type, source);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Falha ao cachear a mídia.');
    }

    await saveMediaCacheEntry(this.prisma, flowId, itemKey, result.fileId, flow.botId);
    return { ...result, assetId };
  }

  /**
   * Guarda o arquivo original na mídia-teca e amarra ao item do fluxo em
   * `config.mediaAssets["<nodeId>"]`.
   *
   * Repare que a chave aqui NÃO leva o botId — é o ponto principal da mudança:
   * o arquivo não pertence a bot nenhum. `config.mediaCache` continua com chave
   * por bot (é cache do Telegram, esse sim é por bot); a mídia-teca é a camada
   * de baixo, independente, de onde qualquer bot pode reenviar quando precisar.
   */
  private async storeFlowMedia(
    workspaceId: string,
    flowId: string,
    nodeId: string,
    type: 'photo' | 'video',
    source: { fileUrl?: string; fileData?: string },
  ): Promise<string | null> {
    try {
      let buf: Buffer | null = null;
      let mime = type === 'photo' ? 'image/jpeg' : 'video/mp4';

      if (source.fileData) {
        const parsed = MediaStoreService.parseDataUri(source.fileData);
        if (parsed) { buf = parsed.buf; mime = parsed.mime; }
      } else if (source.fileUrl) {
        // URL também é guardada: o link do cliente pode sair do ar a qualquer
        // momento e aí a mídia estaria perdida do mesmo jeito.
        const r = await axios.get(source.fileUrl, {
          responseType: 'arraybuffer',
          timeout: 60_000,
          maxContentLength: 60 * 1024 * 1024,
        });
        buf = Buffer.from(r.data);
        mime = String(r.headers['content-type'] || mime).split(';')[0];
      }

      if (!buf?.length) return null;

      const asset = await this.mediaStore.store(workspaceId, buf, { mime, type });
      await saveMediaAssetRef(this.prisma, flowId, nodeId, asset.id);
      return asset.id;
    } catch (e: any) {
      this.logger.warn(`mídia-teca: não consegui guardar ${nodeId} (flow=${flowId}): ${e.message}`);
      return null;
    }
  }

  async queueTelegramMessage(botId: string, chatId: string, message: any) {
    await this.messageQueue.add('send-message', {
      botId,
      chatId,
      message,
    });
  }

  async queueWebhook(url: string, payload: any) {
    await this.webhookQueue.add('process-webhook', {
      url,
      payload,
    });
  }

  async queueScheduledTask(task: string, data: any, delayMs: number) {
    await this.scheduledQueue.add(
      task,
      data,
      { delay: delayMs },
    );
  }

  async processFlow(flowId: string, leadId: string) {
    const flow = await this.prisma.flow.findUnique({
      where: { id: flowId },
      include: { bot: true },
    });

    if (!flow || !flow.isActive) {
      this.logger.warn(`Flow ${flowId} not found or inactive`);
      return;
    }

    const nodes = flow.nodes as any[];
    const edges = flow.edges as any[];

    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || !lead.telegramId) return;
    if (!flow.bot) return;

    const botId = flow.bot.id;
    await this.executeFlowGraph(nodes, edges, botId, lead.telegramId);
  }

  private async executeFlowGraph(
    nodes: any[], edges: any[], botId: string, chatId: string,
  ) {
    const startNode = nodes.find(n => n.type === 'trigger' || n.id === 'start');
    if (!startNode) {
      this.logger.warn('No trigger node found');
      return;
    }

    let currentNodeId: string | null = startNode.id;

    while (currentNodeId) {
      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) break;

      if (node.type === 'trigger') {
        const edge = edges.find(e => e.source === node.id);
        currentNodeId = edge ? edge.target : null;
        continue;
      }

      const nextId = await this.execNode(node, botId, chatId, nodes, edges);
      if (nextId === 'DELAYED') return;
      currentNodeId = nextId;
    }
  }

  private async execNode(
    node: any, botId: string, chatId: string,
    nodes: any[], edges: any[],
  ): Promise<string | 'DELAYED' | null> {
    try {
      switch (node.type) {
        case 'text':
          await this.execText(node, botId, chatId);
          break;
        case 'image':
          await this.execImage(node, botId, chatId);
          break;
        case 'video':
          await this.execVideo(node, botId, chatId);
          break;
        case 'buttons':
          await this.execButtons(node, botId, chatId);
          break;
        case 'delay':
          await this.execDelay(node, botId, chatId, nodes, edges);
          return 'DELAYED';
        case 'webhook':
          await this.execWebhook(node);
          break;
        default:
          this.logger.warn(`Unknown node type: ${node.type}`);
      }
    } catch (err) {
      this.logger.error(`execNode error for ${node.id}: ${err.message}`);
      return null;
    }

    const edge = edges.find(e => e.source === node.id);
    return edge ? edge.target : null;
  }

  private async execText(node: any, botId: string, chatId: string) {
    const content = node.data?.content || '';
    if (!content) return;
    await this.queueTelegramMessage(botId, chatId, { type: 'text', text: content });
  }

  private async execImage(node: any, botId: string, chatId: string) {
    const url = node.data?.fileUrl;
    if (!url) return;
    await this.queueTelegramMessage(botId, chatId, {
      type: 'photo', url, caption: node.data?.caption || '',
    });
  }

  private async execVideo(node: any, botId: string, chatId: string) {
    const url = node.data?.fileUrl;
    if (!url) return;
    await this.queueTelegramMessage(botId, chatId, {
      type: 'video', url, caption: node.data?.caption || '',
    });
  }

  private async execButtons(node: any, botId: string, chatId: string) {
    const content = node.data?.content || '';
    const buttons: { label: string; type: string; url?: string }[] = node.data?.buttons || [];
    if (buttons.length === 0) {
      if (content) {
        await this.queueTelegramMessage(botId, chatId, { type: 'text', text: content });
      }
      return;
    }
    const rows = buttons.map(b => b.type === 'url' && b.url
      ? [{ text: b.label, url: b.url }]
      : [{ text: b.label, callback_data: `btn_${b.label}` }]
    );
    await this.queueTelegramMessage(botId, chatId, {
      type: 'buttons', text: content, keyboard: rows,
    });
  }

  private async execDelay(
    node: any, botId: string, chatId: string,
    nodes: any[], edges: any[],
  ) {
    const delay = node.data?.delay;
    if (!delay || !delay.value) return;
    const delayMs = this.delayToMs(delay);
    const edge = edges.find(e => e.source === node.id);
    const nextId = edge ? edge.target : null;
    if (nextId) {
      await this.queueScheduledTask('continue-flow', {
        nodes, edges, botId, chatId, fromNodeId: nextId,
      }, delayMs);
    }
  }

  private async execWebhook(node: any) {
    const url = node.data?.url;
    const payload = node.data?.payload || {};
    if (url) {
      await this.queueWebhook(url, payload);
    }
  }

  private delayToMs(d: { value: number; unit: string }): number {
    if (d.unit === 'seconds') return d.value * 1000;
    if (d.unit === 'minutes') return d.value * 60 * 1000;
    if (d.unit === 'hours') return d.value * 3600 * 1000;
    return d.value * 1000;
  }

  async getRemarketingSummary(workspaceId: string) {
    const flows = await this.prisma.flow.findMany({
      where: { workspaceId },
      include: { bot: { select: { id: true, username: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    // Conta jobs delayed+waiting por flowId — limitado a 5000 para não sobrecarregar o Redis
    const queuedJobs = await this.remarketingQueue.getJobs(['delayed', 'waiting'], 0, 4999);
    const countByFlow = new Map<string, number>();
    for (const job of queuedJobs) {
      const fid = job.data?.flowId;
      if (fid) countByFlow.set(fid, (countByFlow.get(fid) ?? 0) + 1);
    }

    const result: any[] = [];

    for (const flow of flows) {
      const cfg = flow.config as any;
      const slots: any[] = [];

      if (Array.isArray(cfg?.remarketings)) {
        cfg.remarketings.forEach((slot: any, idx: number) => {
          if (!slot?.enabled) return;
          const hasContent = slot.content || (slot.mediaType && slot.mediaType !== 'none') || slot.buttons?.length;
          if (!hasContent) return;
          slots.push({
            index:        idx,
            firstDelay:   slot.firstDelay  ?? 30,
            interval:     slot.interval    ?? 5,
            stopAfter:    slot.stopAfter   ?? 3,
            content:      (slot.content ?? '').replace(/<[^>]*>/g, '').trim(),
            mediaType:    slot.mediaType   ?? 'none',
            buttonsCount: (slot.buttons    ?? []).length,
          });
        });
      } else if (cfg?.remarketing?.enabled) {
        const r = cfg.remarketing;
        const hasContent = r.content || (r.mediaType && r.mediaType !== 'none') || r.buttons?.length;
        if (hasContent) {
          slots.push({
            index:        0,
            firstDelay:   r.firstDelay  ?? 30,
            interval:     r.interval    ?? 5,
            stopAfter:    r.stopAfter   ?? 3,
            content:      (r.content ?? '').replace(/<[^>]*>/g, '').trim(),
            mediaType:    r.mediaType   ?? 'none',
            buttonsCount: (r.buttons    ?? []).length,
          });
        }
      }

      if (slots.length === 0) continue;

      result.push({
        flowId:         flow.id,
        flowName:       flow.name,
        isActive:       flow.isActive,
        botUsername:    flow.bot?.username ?? null,
        slots,
        scheduledCount: countByFlow.get(flow.id) ?? 0,
      });
    }

    return result;
  }
}
