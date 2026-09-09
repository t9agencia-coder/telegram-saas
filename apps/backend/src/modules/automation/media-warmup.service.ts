import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { decrypt } from '../../common/utils/encryption';
import { sendTelegramMedia } from '../../common/send-telegram-media';
import { recoverTelegramFileId } from '../../common/telegram-media-recover';
import { isFileIdValid } from '../../common/media-cache-validate';
import {
  saveMediaCacheEntry,
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
}

type Item = {
  label: string;
  type: 'photo' | 'video';
  fileUrl?: string;
  fileData?: string;
  cachedFileId?: string;
  save: (fileId: string) => Promise<void>;
};

@Injectable()
export class MediaWarmupService {
  private readonly logger = new Logger(MediaWarmupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
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
      await stripCachedMediaFromFlow(this.prisma, flowId, botId, (fid) =>
        isFileIdValid(this.redis as any, token, fid),
      ).catch(() => {});
      return;
    }

    await this.setProgress(flowId, {
      total: pending.length, done: 0, current: pending[0].label, state: 'running', updatedAt: 0,
    });

    let done = 0;
    for (const it of pending) {
      await this.setProgress(flowId, {
        total: pending.length, done, current: it.label, state: 'running', updatedAt: 0,
      });

      const newId = await this.warmOne(token, warmupChat, it);
      if (newId) {
        await it.save(newId).catch((e) =>
          this.logger.warn(`warmup save falhou (flow=${flowId} ${it.label}): ${e.message}`),
        );
      } else {
        this.logger.warn(`warmup: não consegui cachear ${it.label} (flow=${flowId})`);
      }
      done++;
    }

    await this.setProgress(flowId, {
      total: pending.length, done, current: null, state: 'done', updatedAt: 0,
    });

    // C5: tira o base64 do config na hora — não espera o cron semanal.
    await stripCachedMediaFromFlow(this.prisma, flowId, botId, (fid) =>
      isFileIdValid(this.redis as any, token, fid),
    ).catch((e) => this.logger.warn(`strip pós-warmup falhou (flow=${flowId}): ${e.message}`));
  }

  /** 1 item: tenta fonte (url/base64); se não tem fonte mas tem file_id morto
   *  recuperável, faz getFile→download→reupload. */
  private async warmOne(token: string, chat: string, it: Item): Promise<string | null> {
    // Rede de segurança contra corrida (2 warmups do mesmo item).
    const lock = `warmup:lock:${chat}:${it.label}`;
    try {
      const got = await this.redis.set(lock, '1', 'EX', 180, 'NX');
      if (!got) return null;
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
    const items: Item[] = [];
    const flowId = flow.id as string;

    const nodes: any[] = Array.isArray(flow.nodes) ? flow.nodes : [];
    for (const n of nodes) {
      if (n.type !== 'image' && n.type !== 'video') continue;
      const key = `${n.id}:${botId}`;
      items.push({
        label: n.type === 'image' ? 'Imagem' : 'Vídeo',
        type: n.type === 'image' ? 'photo' : 'video',
        fileUrl: n.data?.fileUrl || undefined,
        fileData: n.data?.fileData || undefined,
        cachedFileId: mc[key]?.botId === botId ? mc[key]?.fileId : undefined,
        save: (fid) => saveMediaCacheEntry(this.prisma, flowId, key, fid, botId),
      });
    }

    const upsells: any[] = Array.isArray(cfg.upsells) ? cfg.upsells : [];
    upsells.forEach((u, idx) => {
      if (!u?.enabled || (u.mediaType !== 'image' && u.mediaType !== 'video')) return;
      const key = `upsell:${idx}:${botId}`;
      items.push({
        label: `Upsell ${idx + 1}`,
        type: u.mediaType === 'image' ? 'photo' : 'video',
        fileUrl: u.mediaUrl || undefined,
        fileData: u.mediaData || undefined,
        cachedFileId: mc[key]?.botId === botId ? mc[key]?.fileId : undefined,
        save: (fid) => saveMediaCacheEntry(this.prisma, flowId, key, fid, botId),
      });
    });

    const legacy = cfg.remarketing;
    if (legacy?.enabled && (legacy.mediaType === 'image' || legacy.mediaType === 'video')) {
      items.push({
        label: 'Remarketing',
        type: legacy.mediaType === 'image' ? 'photo' : 'video',
        fileUrl: legacy.mediaUrl || undefined,
        fileData: legacy.mediaData || undefined,
        cachedFileId: legacy.cachedBotId === botId ? legacy.cachedFileId : undefined,
        save: (fid) => saveRemarketingLegacyCache(this.prisma, flowId, fid, botId),
      });
    }

    const slots: any[] = Array.isArray(cfg.remarketings) ? cfg.remarketings : [];
    slots.forEach((s, idx) => {
      if (!s?.enabled || (s.mediaType !== 'image' && s.mediaType !== 'video')) return;
      items.push({
        label: `Remarketing ${idx + 1}`,
        type: s.mediaType === 'image' ? 'photo' : 'video',
        fileUrl: s.mediaUrl || undefined,
        fileData: s.mediaData || undefined,
        cachedFileId: s.cachedBotId === botId ? s.cachedFileId : undefined,
        save: (fid) => saveRemarketingSlotCache(this.prisma, flowId, idx, fid, botId),
      });
    });

    return items;
  }
}
