import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { decrypt } from '../../common/utils/encryption';
import { sendTelegramMedia } from '../../common/send-telegram-media';
import { recoverTelegramFileId } from '../../common/telegram-media-recover';
import { isFileIdValid } from '../../common/media-cache-validate';
import { MediaStoreService } from '../../common/media-store.service';
import {
  saveMediaCacheEntry,
  saveMediaAssetRef,
  saveRemarketingLegacyCache,
  saveRemarketingSlotCache,
  stripCachedMediaFromFlow,
} from '../../common/media-cache-store';

export interface WarmupProgress {
  total: number;
  done: number;
  current: string | null;
  state: 'running' | 'done' | 'error' | 'skipped';
  reason?: string;
  updatedAt: number;
  // Itens que o Telegram recusou/falhou de verdade nesta rodada — `done` inclui
  // essas tentativas (senão a % nunca fecha), mas `state` só vira 'done' com
  // `failed.length === 0`. Com falha, fica 'error' pra deixar claro que NÃO
  // terminou de verdade (antes, "concluía" silenciosamente sem cachear nada).
  failed?: string[];
}

type Item = {
  // Identifica o item de forma ÚNICA (mesma chave usada em config.mediaCache,
  // ex.: "<nodeId>:<botId>", "upsell:0:<botId>", "remarketing:<botId>") — usado
  // pro lock de corrida. Diferente de `label` (que é só um texto bonito pra
  // exibir, e se repete: todo nó de vídeo tem label "Vídeo").
  key: string;
  // Chave na mídia-teca — igual à `key` porém SEM o botId, porque o arquivo não
  // pertence a bot nenhum ("video_abc", "upsell:0", "remarketing:2").
  assetKey: string;
  label: string;
  type: 'photo' | 'video';
  fileUrl?: string;
  fileData?: string;
  cachedFileId?: string;
  // Arquivo original na mídia-teca (config.mediaAssets). É o que torna a troca
  // de bot indolor: o file_id morre junto com o bot, o arquivo não.
  mediaAssetId?: string;
  save: (fileId: string) => Promise<void>;
};

// Sentinela de "alguém já está cacheando esse item agora" — distinto de `null`
// (falha de verdade). Nunca se confunde com um file_id real do Telegram.
const LOCKED = '__LOCKED__';

@Injectable()
export class MediaWarmupService {
  private readonly logger = new Logger(MediaWarmupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mediaStore: MediaStoreService,
  ) {}

  private key(flowId: string) {
    return `warmup:progress:${flowId}`;
  }

  async getProgress(flowId: string): Promise<WarmupProgress | null> {
    try {
      const raw = await this.redis.get(this.key(flowId));
      return raw ? (JSON.parse(raw) as WarmupProgress) : null;
    } catch {
      return null;
    }
  }

  private async setProgress(flowId: string, p: WarmupProgress) {
    p.updatedAt = Date.now();
    try {
      await this.redis.set(this.key(flowId), JSON.stringify(p), 'EX', 3600);
    } catch {
      /* best-effort */
    }
  }

  /** Chamado pelo processor da fila media-warmup. Nunca lança. */
  async runWarmup(flowId: string): Promise<void> {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId } });
    if (!flow?.botId) return;

    const bot = await this.prisma.telegramBot.findUnique({
      where: { id: flow.botId },
      select: { botToken: true, warmupChatId: true },
    });

    const cfg: any = flow.config || {};
    const items = this.collectItems(flow, cfg, flow.botId);

    // Sem chat de aquecimento: não dá pra cachear proativamente. Marca o estado
    // pra a tela mostrar "configure o pré-cache" em vez de "enviando…" pra sempre.
    if (!bot?.warmupChatId || !bot?.botToken) {
      await this.setProgress(flowId, {
        total: items.length, done: 0, current: null,
        state: 'skipped', reason: 'sem_warmup_chat', updatedAt: 0,
      });
      return;
    }

    const token = decrypt(bot.botToken);
    const warmupChat = bot.warmupChatId;
    const botId = flow.botId;

    // Descobre o que realmente falta: valida os file_id cacheados no getFile
    // (um file_id de outro bot passava como "ok" e nunca era re-cacheado).
    const pending: Item[] = [];
    for (const it of items) {
      const valid = it.cachedFileId
        ? await isFileIdValid(this.redis as any, token, it.cachedFileId)
        : false;
      if (!valid) pending.push(it);
    }

    if (pending.length === 0) {
      await this.setProgress(flowId, {
        total: items.length, done: items.length, current: null, state: 'done', updatedAt: 0,
      });
      await stripCachedMediaFromFlow(
        this.prisma, flowId, botId,
        (fid) => isFileIdValid(this.redis as any, token, fid),
        (assetId) => this.mediaStore.exists(assetId),
      ).catch(() => {});
      return;
    }

    await this.setProgress(flowId, {
      total: pending.length, done: 0, current: pending[0].label, state: 'running', updatedAt: 0,
    });

    // `done` conta TENTATIVAS (senão a barra nunca fecha os 100%), mas cada
    // item só é considerado sucesso de verdade se ganhou um fileId novo E o
    // save no banco não falhou — os que caírem em qualquer um desses dois vão
    // pra `failed`, e SÓ ISSO decide se o estado final é 'done' ou 'error'.
    // Antes, um item que nunca teve como cachear (ex.: mídia perdida, dona de
    // outro bot) fazia o progresso fechar em "100%" do mesmo jeito — escondendo
    // o erro atrás de uma barra cheia, exatamente o que gerava confusão aqui.
    let done = 0;
    const failed: string[] = [];
    for (const it of pending) {
      await this.setProgress(flowId, {
        total: pending.length, done, current: it.label, state: 'running', updatedAt: 0,
      });

      // Guarda o arquivo ANTES de tentar o Telegram. Só o upload instantâneo do
      // editor gravava na mídia-teca, e ele só está ligado nos blocos do canvas
      // — mídia de upsell/order bump/remarketing (e fluxo duplicado, e mídia por
      // URL) nunca ganhava asset. Aí o strip removia o base64 apoiado só no
      // file_id do bot da vez, e a troca de bot voltava a perder a mídia.
      // Capturando aqui, TODO caminho que passa pelo aquecimento fica protegido.
      await this.ensureAsset(flow.workspaceId, flowId, it);

      const newId = await this.warmOne(token, warmupChat, it);
      if (newId === LOCKED) {
        // Outra chamada (upload instantâneo do editor, ou outro job) já está
        // cacheando esse item agora — não é falha, só não tinha o que fazer
        // aqui. Não entra em `failed`; a outra ponta que estiver com o lock
        // vai salvar sozinha, e uma próxima rodada de warmup confirma.
        this.logger.log(`warmup: ${it.label} já sendo cacheado por outra chamada (flow=${flowId}), pulando`);
      } else if (newId) {
        try {
          await it.save(newId);
        } catch (e: any) {
          this.logger.warn(`warmup save falhou (flow=${flowId} ${it.label}): ${e.message}`);
          failed.push(it.label);
        }
      } else {
        this.logger.warn(`warmup: não consegui cachear ${it.label} (flow=${flowId})`);
        failed.push(it.label);
      }
      done++;
    }

    await this.setProgress(flowId, {
      total: pending.length,
      done,
      current: null,
      state: failed.length > 0 ? 'error' : 'done',
      ...(failed.length > 0 ? { reason: 'itens_falharam', failed } : {}),
      updatedAt: 0,
    });

    // C5: tira o base64 do config na hora — não espera o cron semanal.
    await stripCachedMediaFromFlow(
      this.prisma, flowId, botId,
      (fid) => isFileIdValid(this.redis as any, token, fid),
      (assetId) => this.mediaStore.exists(assetId),
    ).catch((e) => this.logger.warn(`strip pós-warmup falhou (flow=${flowId}): ${e.message}`));
  }

  /**
   * Cacheia UMA mídia na hora — chamado direto do editor do fluxo assim que o
   * usuário escolhe o arquivo, ANTES de salvar o fluxo inteiro (o warmup em
   * fila continua existindo como rede de segurança pra fluxo duplicado/mídia
   * antiga, mas o caminho normal de "acabei de subir isso" não deveria esperar
   * um job de fundo).
   *
   * Usa o MESMO lock (por `itemKey`, ex.: "<nodeId>:<botId>") que `warmOne` —
   * sem isso, apertar "Salvar" no resto do fluxo enquanto esse upload
   * instantâneo ainda está em voo dispara o warmup em lote, que tenta cachear
   * essa MESMA mídia de novo e manda ela 2x pro Telegram. Se o lock já
   * estiver com o outro lado (o warmup em lote pegou primeiro), erro claro em
   * vez de mandar duplicado.
   *
   * Diferente de `warmOne`, nunca engole o erro em `null` — o editor precisa
   * do motivo real pra mostrar (em vez de só "falhou", saber se foi porque o
   * pré-cache não tá configurado, ou o Telegram recusou o arquivo, etc.).
   */
  async warmMediaNow(
    botId: string,
    itemKey: string,
    type: 'photo' | 'video',
    source: { fileUrl?: string; fileData?: string },
  ): Promise<{ fileId: string }> {
    const bot = await this.prisma.telegramBot.findUnique({
      where: { id: botId },
      select: { botToken: true, warmupChatId: true, precacheEnabled: true },
    });
    if (!bot) throw new Error('Bot não encontrado.');
    if (!bot.precacheEnabled) throw new Error('Esse bot não usa pré-cache de mídia.');
    if (!bot.warmupChatId) throw new Error('Configure o pré-cache desse bot antes (⋯ → Configurar Pré-Cache).');
    if (!source.fileUrl && !source.fileData) throw new Error('Nenhum arquivo pra cachear.');

    const lock = `warmup:lock:${itemKey}`;
    let locked = false;
    try {
      locked = !!(await this.redis.set(lock, '1', 'EX', 180, 'NX'));
    } catch {
      locked = true; // Redis fora do ar: segue sem lock (mesmo fallback do warmOne)
    }
    if (!locked) {
      throw new Error('Essa mídia já está sendo cacheada agora (fluxo salvo ao mesmo tempo) — aguarde alguns segundos e tente de novo.');
    }

    try {
      const token = decrypt(bot.botToken);
      const { messageId, fileId } = await sendTelegramMedia({
        botToken: token, chatId: bot.warmupChatId, type, fileUrl: source.fileUrl, fileData: source.fileData,
      });
      this.deleteMsg(token, bot.warmupChatId, messageId);
      if (!fileId) throw new Error('O Telegram aceitou o arquivo mas não devolveu um file_id — tente de novo.');
      return { fileId };
    } finally {
      this.redis.del(lock).catch(() => {});
    }
  }

  /**
   * Garante que o arquivo original deste item está na mídia-teca.
   *
   * Best-effort e idempotente: se já tem asset, não faz nada; se não tem bytes
   * pra guardar (item que só tem file_id), também não faz nada — não há o que
   * capturar. Falha aqui nunca interrompe o aquecimento: no pior caso o item
   * segue no comportamento antigo, sem a proteção extra.
   */
  private async ensureAsset(workspaceId: string, flowId: string, it: Item): Promise<void> {
    if (it.mediaAssetId) return;
    if (!it.fileData && !it.fileUrl) return;

    try {
      let buf: Buffer | null = null;
      let mime = it.type === 'photo' ? 'image/jpeg' : 'video/mp4';

      if (it.fileData) {
        const p = MediaStoreService.parseDataUri(it.fileData);
        if (p) { buf = p.buf; mime = p.mime; }
      } else if (it.fileUrl) {
        // A URL é do cliente e pode sair do ar — guardar uma cópia é o ponto.
        const r = await axios.get(it.fileUrl, {
          responseType: 'arraybuffer', timeout: 60_000, maxContentLength: 60 * 1024 * 1024,
        });
        buf = Buffer.from(r.data);
        mime = String(r.headers['content-type'] || mime).split(';')[0];
      }
      if (!buf?.length) return;

      const asset = await this.mediaStore.store(workspaceId, buf, { mime, type: it.type });
      await saveMediaAssetRef(this.prisma, flowId, it.assetKey, asset.id);
      it.mediaAssetId = asset.id;
      this.logger.log(`mídia-teca: ${it.label} guardado no aquecimento (flow=${flowId})`);
    } catch (e: any) {
      this.logger.warn(`mídia-teca: não consegui guardar ${it.label} (flow=${flowId}): ${e.message}`);
    }
  }

  /** 1 item: tenta fonte (url/base64); se não tem fonte mas tem file_id morto
   *  recuperável, faz getFile→download→reupload.
   *  Retorna `LOCKED` (não `null`) se outra chamada (a instantânea do editor,
   *  ou outro job) já está cacheando esse MESMO item agora — evita mandar a
   *  mesma mídia 2x pro Telegram quando o usuário aperta "Salvar" enquanto o
   *  upload instantâneo do bloco ainda está em voo. */
  private async warmOne(token: string, chat: string, it: Item): Promise<string | null | typeof LOCKED> {
    // Lock por `key` (único por item: "<nodeId>:<botId>", não o `label`, que se
    // repete entre todo nó de vídeo/imagem do fluxo) — mesma chave que
    // `warmMediaNow` usa, pra travar contra o caminho instantâneo do editor.
    const lock = `warmup:lock:${it.key}`;
    try {
      const got = await this.redis.set(lock, '1', 'EX', 180, 'NX');
      if (!got) return LOCKED;
    } catch {
      /* segue sem lock */
    }

    try {
      if (it.fileUrl || it.fileData) {
        const { messageId, fileId } = await sendTelegramMedia({
          botToken: token, chatId: chat, type: it.type, fileUrl: it.fileUrl, fileData: it.fileData,
        });
        this.deleteMsg(token, chat, messageId);
        return fileId ?? null;
      }

      // Mídia-teca: o arquivo original é nosso, então dá pra reenviar por
      // QUALQUER bot, a qualquer momento. É este ramo que faz "trocar o bot do
      // fluxo" virar rotina automática em vez de perda de mídia — e por isso
      // ele vem antes do `recover` abaixo, que é um resgate limitado (só
      // funciona no mesmo bot e só até 20 MB).
      if (it.mediaAssetId) {
        const asset = await this.mediaStore.read(it.mediaAssetId);
        if (asset) {
          const dataUri = `data:${asset.mime};base64,${asset.buf.toString('base64')}`;
          const { messageId, fileId } = await sendTelegramMedia({
            botToken: token, chatId: chat, type: it.type, fileData: dataUri,
          });
          this.deleteMsg(token, chat, messageId);
          if (fileId) return fileId;
        }
      }

      if (it.cachedFileId) {
        const rec = await recoverTelegramFileId(token, it.cachedFileId, chat, it.type);
        if (rec) {
          this.deleteMsg(token, chat, rec.messageId);
          return rec.fileId;
        }
      }
      return null;
    } catch (e: any) {
      this.logger.warn(`warmOne(${it.label}): ${e.message}`);
      return null;
    } finally {
      this.redis.del(lock).catch(() => {});
    }
  }

  private deleteMsg(token: string, chat: string, messageId: number | null) {
    if (!messageId) return;
    axios
      .post(`https://api.telegram.org/bot${token}/deleteMessage`, { chat_id: chat, message_id: messageId })
      .catch(() => {});
  }

  /** Lista todas as mídias do fluxo (nós + upsell + remarketing) num formato único. */
  private collectItems(flow: any, cfg: any, botId: string): Item[] {
    const mc: Record<string, any> = cfg.mediaCache || {};
    // Mídia-teca: chave SEM botId, porque o arquivo não pertence a bot nenhum.
    const assets: Record<string, string> = cfg.mediaAssets || {};
    const items: Item[] = [];
    const flowId = flow.id as string;

    const nodes: any[] = Array.isArray(flow.nodes) ? flow.nodes : [];
    for (const n of nodes) {
      if (n.type !== 'image' && n.type !== 'video') continue;
      const key = `${n.id}:${botId}`;
      items.push({
        key,
        assetKey: n.id,
        label: n.type === 'image' ? 'Imagem' : 'Vídeo',
        type: n.type === 'image' ? 'photo' : 'video',
        fileUrl: n.data?.fileUrl || undefined,
        fileData: n.data?.fileData || undefined,
        cachedFileId: mc[key]?.botId === botId ? mc[key]?.fileId : undefined,
        mediaAssetId: assets[n.id] || undefined,
        save: (fid) => saveMediaCacheEntry(this.prisma, flowId, key, fid, botId),
      });
    }

    const upsells: any[] = Array.isArray(cfg.upsells) ? cfg.upsells : [];
    upsells.forEach((u, idx) => {
      if (!u?.enabled || (u.mediaType !== 'image' && u.mediaType !== 'video')) return;
      const key = `upsell:${idx}:${botId}`;
      items.push({
        key,
        assetKey: `upsell:${idx}`,
        label: `Upsell ${idx + 1}`,
        type: u.mediaType === 'image' ? 'photo' : 'video',
        fileUrl: u.mediaUrl || undefined,
        fileData: u.mediaData || undefined,
        cachedFileId: mc[key]?.botId === botId ? mc[key]?.fileId : undefined,
        mediaAssetId: assets[`upsell:${idx}`] || undefined,
        save: (fid) => saveMediaCacheEntry(this.prisma, flowId, key, fid, botId),
      });
    });

    const legacy = cfg.remarketing;
    if (legacy?.enabled && (legacy.mediaType === 'image' || legacy.mediaType === 'video')) {
      items.push({
        key: `remarketing:${botId}`,
        assetKey: 'remarketing',
        label: 'Remarketing',
        type: legacy.mediaType === 'image' ? 'photo' : 'video',
        fileUrl: legacy.mediaUrl || undefined,
        fileData: legacy.mediaData || undefined,
        cachedFileId: legacy.cachedBotId === botId ? legacy.cachedFileId : undefined,
        mediaAssetId: assets['remarketing'] || undefined,
        save: (fid) => saveRemarketingLegacyCache(this.prisma, flowId, fid, botId),
      });
    }

    const slots: any[] = Array.isArray(cfg.remarketings) ? cfg.remarketings : [];
    slots.forEach((s, idx) => {
      if (!s?.enabled || (s.mediaType !== 'image' && s.mediaType !== 'video')) return;
      items.push({
        key: `remarketing:${idx}:${botId}`,
        assetKey: `remarketing:${idx}`,
        label: `Remarketing ${idx + 1}`,
        type: s.mediaType === 'image' ? 'photo' : 'video',
        fileUrl: s.mediaUrl || undefined,
        fileData: s.mediaData || undefined,
        cachedFileId: s.cachedBotId === botId ? s.cachedFileId : undefined,
        mediaAssetId: assets[`remarketing:${idx}`] || undefined,
        save: (fid) => saveRemarketingSlotCache(this.prisma, flowId, idx, fid, botId),
      });
    });

    return items;
  }
}
