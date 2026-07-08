import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Response } from 'express';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { decrypt } from '../../common/utils/encryption';
import { sendTelegramMedia } from '../../common/send-telegram-media';
import { saveMediaCacheEntry, saveRemarketingLegacyCache, saveRemarketingSlotCache } from '../../common/media-cache-store';
import { getFlowCacheStatus } from '../../common/media-precache';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('telegram-messages')    private messageQueue:      Queue,
    @InjectQueue('webhook-events')       private webhookQueue:      Queue,
    @InjectQueue('scheduled-tasks')      private scheduledQueue:    Queue,
    @InjectQueue('telegram-remarketing') private remarketingQueue:  Queue,
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
      const cacheStatus = bot?.precacheEnabled ? getFlowCacheStatus(f, f.botId) : { complete: true, missing: 0, total: 0 };
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

  async findOneFlow(id: string) {
    const flow = await this.prisma.flow.findUnique({
      where: { id },
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

  async createFlow(workspaceId: string, dto: CreateFlowDto) {
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

  async updateFlow(id: string, dto: UpdateFlowDto) {
    const flow = await this.prisma.flow.findUnique({ where: { id } });
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

  async deleteFlow(id: string) {
    return this.prisma.flow.delete({ where: { id } });
  }

  async activateFlow(id: string) {
    const flow = await this.prisma.flow.findUnique({
      where: { id },
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

  async deactivateFlow(id: string) {
    return this.prisma.flow.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async duplicateFlow(workspaceId: string, id: string, targetBotId?: string) {
    const original = await this.prisma.flow.findUnique({ where: { id } });
    if (!original) throw new NotFoundException('Flow not found');

    const duplicated = await this.prisma.flow.create({
      data: {
        workspaceId,
        botId:       targetBotId ?? original.botId,
        name:        `${original.name} (cópia)`,
        description: original.description,
        trigger:     original.trigger,
        config:      original.config as any,
        nodes:       original.nodes as any,
        edges:       original.edges as any,
        isActive:    false,
      },
    });
    this.triggerMediaWarmup(duplicated).catch((e) => this.logger.warn(`triggerMediaWarmup falhou (flow=${duplicated.id}): ${e.message}`));
    return duplicated;
  }

  // Pré-cache proativo: se o bot desse fluxo já tem um chat de aquecimento
  // configurado (/start cachewarmup via QR code), manda pra lá qualquer mídia
  // que ainda não tenha file_id cacheado — antes que um lead real bata nela.
  // Sem warmupChatId configurado, não faz nada (rede de segurança reativa
  // já existente continua cobrindo esse caso).
  private async triggerMediaWarmup(flow: any): Promise<void> {
    if (!flow?.botId) return;
    const bot = await this.prisma.telegramBot.findUnique({
      where: { id: flow.botId },
      select: { botToken: true, warmupChatId: true },
    });
    if (!bot?.warmupChatId || !bot?.botToken) return;

    const token       = decrypt(bot.botToken);
    const warmupChat  = bot.warmupChatId;
    const botId       = flow.botId as string;
    const flowId      = flow.id as string;
    const cfg         = (flow.config as any) || {};
    const mediaCache  = cfg.mediaCache || {};

    const warmupOne = async (
      type: 'photo' | 'video',
      fileUrl: string | undefined,
      fileData: string | undefined,
      onSave: (fileId: string) => Promise<void>,
    ) => {
      if (!fileUrl && !fileData) return;
      try {
        const { messageId, fileId } = await sendTelegramMedia({
          botToken: token, chatId: warmupChat, type, fileUrl, fileData,
        });
        if (fileId) {
          await onSave(fileId);
          this.logger.log(`Warmup: mídia cacheada proativamente → flow=${flowId}`);
        }
        if (messageId) {
          axios.post(`https://api.telegram.org/bot${token}/deleteMessage`, {
            chat_id: warmupChat, message_id: messageId,
          }).catch(() => {});
        }
      } catch (e: any) {
        this.logger.warn(`Warmup falhou → flow=${flowId}: ${e.message}`);
      }
    };

    // 1. Nós de mídia do fluxo principal
    const nodes = Array.isArray(flow.nodes) ? (flow.nodes as any[]) : [];
    for (const node of nodes) {
      if (node.type !== 'image' && node.type !== 'video') continue;
      const key = `${node.id}:${botId}`;
      const cached = mediaCache[key];
      if (cached?.botId === botId && cached?.fileId) continue;
      await warmupOne(
        node.type === 'image' ? 'photo' : 'video',
        node.data?.fileUrl || undefined,
        node.data?.fileData || undefined,
        (fileId) => saveMediaCacheEntry(this.prisma, flowId, key, fileId, botId),
      );
    }

    // 2. Upsells
    const upsells = Array.isArray(cfg.upsells) ? cfg.upsells : [];
    for (let idx = 0; idx < upsells.length; idx++) {
      const u = upsells[idx];
      if (!u?.enabled || (u.mediaType !== 'image' && u.mediaType !== 'video')) continue;
      const key = `upsell:${idx}:${botId}`;
      const cached = mediaCache[key];
      if (cached?.botId === botId && cached?.fileId) continue;
      await warmupOne(
        u.mediaType === 'image' ? 'photo' : 'video',
        u.mediaUrl || undefined,
        u.mediaData || undefined,
        (fileId) => saveMediaCacheEntry(this.prisma, flowId, key, fileId, botId),
      );
    }

    // 3. Remarketing legado
    const legacy = cfg.remarketing;
    if (legacy?.enabled && (legacy.mediaType === 'image' || legacy.mediaType === 'video')) {
      const cacheOk = legacy.cachedBotId === botId && !!legacy.cachedFileId;
      if (!cacheOk) {
        await warmupOne(
          legacy.mediaType === 'image' ? 'photo' : 'video',
          legacy.mediaUrl || undefined,
          legacy.mediaData || undefined,
          (fileId) => saveRemarketingLegacyCache(this.prisma, flowId, fileId, botId),
        );
      }
    }

    // 4. Remarketing multi-slot
    const slots = Array.isArray(cfg.remarketings) ? cfg.remarketings : [];
    for (let idx = 0; idx < slots.length; idx++) {
      const s = slots[idx];
      if (!s?.enabled || (s.mediaType !== 'image' && s.mediaType !== 'video')) continue;
      const cacheOk = s.cachedBotId === botId && !!s.cachedFileId;
      if (cacheOk) continue;
      await warmupOne(
        s.mediaType === 'image' ? 'photo' : 'video',
        s.mediaUrl || undefined,
        s.mediaData || undefined,
        (fileId) => saveRemarketingSlotCache(this.prisma, flowId, idx, fileId, botId),
      );
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
