import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { decrypt } from '../../common/utils/encryption';
import { sendTelegramMedia } from '../../common/send-telegram-media';
import { resolvePrecacheDelayFromCompleteness } from '../../common/media-precache';
import { resolveFlowDeletionDelay } from '../../common/message-deletion';
import {
  computeRemarketingSends,
  REMARKETING_INTERVAL_MS,
  REMARKETING_WINDOW_MS,
  REMARKETING_DELETE_MS,
} from '../../common/remarketing-schedule';
import { TelegramBlacklistService } from '../telegram-blacklist/telegram-blacklist.service';

// Payload mínimo — token e mídia ficam no banco, nunca no Redis
interface RemarketingJobData {
  chatId:          string;
  leadId:          string;
  flowId:          string;
  // Modelo cíclico (atual): distingue pelo chainStartedAt
  botId?:          string | null;
  slotIndex?:      number;
  chainStartedAt?: number;   // epoch ms — janela de 5 dias
  seq?:            number;   // nº do disparo (só p/ log)
  // Caminho legado — objeto único (cadeias antigas drenando)
  sendIndex?:      number;
  totalSends?:     number;
  nextDelayMs?:    number;
  // Caminho legado — multi-slot com timing por slot (cadeias antigas drenando)
  slotSendIndex?:  number;
  slotTotalSends?: number;
  slotIntervalMs?: number;
}

const JOB_OPTS = {
  removeOnComplete: { count: 500, age: 24 * 3600 },
  removeOnFail:     { count: 100, age: 7 * 24 * 3600 },
};

// Concorrência 10: antes era 1 job por vez (default). O disparo de remarketing/
// broadcast enfileira um job por lead, e uma fila global serial fazia o envio
// rastejar (milhares de leads × tempo de cada envio, um atrás do outro). Os jobs
// são independentes entre si (um chatId cada) e não passam pelo motor de execução
// do fluxo principal — dá pra paralelizar sem risco de mensagem fora de ordem.
@Processor('telegram-remarketing', { concurrency: 15 })
export class RemarketingProcessor extends WorkerHost {
  private readonly logger = new Logger(RemarketingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramBlacklist: TelegramBlacklistService,
    @InjectQueue('telegram-remarketing') private readonly queue: Queue,
    @InjectQueue('telegram-messages') private readonly msgQueue: Queue,
  ) {
    super();
  }

  // ─── Agenda exclusão da mensagem via BullMQ, seguindo o temporizador
  // configurado no fluxo (mesmo mecanismo usado no fluxo principal e no
  // upsell — reaproveita o handler 'delete-message' já existente).
  private async scheduleMessageDeletion(
    token: string, chatId: string, messageId: number | null | undefined, flowId: string,
  ): Promise<void> {
    if (!messageId) return;
    try {
      const delayMs = await resolveFlowDeletionDelay(this.prisma, flowId);
      await this.msgQueue.add(
        'delete-message',
        { token, chatId, messageId },
        { delay: delayMs, attempts: 1 },
      );
    } catch (err: any) {
      this.logger.warn(`[Remarketing] Falha ao agendar exclusão msgId=${messageId}: ${err?.message}`);
    }
  }

  async process(job: Job<RemarketingJobData>): Promise<void> {
    if (job.name !== 'remarketing-send') return;

    // Protege contra clock drift: rejeita jobs criados no futuro ou com mais de 10 dias
    const MAX_JOB_AGE_MS  = 10 * 24 * 60 * 60 * 1000;
    const MAX_FUTURE_MS   = 11 * 24 * 60 * 60 * 1000;
    const jobAge = Date.now() - job.timestamp;
    if (jobAge < -MAX_FUTURE_MS || jobAge > MAX_JOB_AGE_MS) {
      this.logger.warn(
        `[Remarketing] Job inválido descartado: id=${job.id} idade=${Math.round(jobAge / 86400000)} dias` +
        ` (criado em ${new Date(job.timestamp).toISOString()})`,
      );
      return;
    }

    // Blacklist global: cobre os dois caminhos (legado e multi-slot) num
    // único ponto — job de remarketing roda fora do webhook, então o
    // usuário pode ter sido bloqueado depois de já entrar nessa fila.
    if (await this.telegramBlacklist.isBlocked(job.data.chatId)) {
      this.logger.log(`Remarketing: chatId=${job.data.chatId} bloqueado — cadeia encerrada sem envio.`);
      return;
    }

    // Modelo cíclico (atual) — identificado pelo chainStartedAt no payload
    if (job.data.chainStartedAt !== undefined) {
      return this.handleRemarketingCycle(job.data);
    }

    // ── Abaixo: cadeias ANTIGAS ainda drenando (não geradas para leads novos) ──
    if (job.data.slotIndex !== undefined) {
      return this.handleRemarketingMultiSlot(job.data);
    }

    await this.handleRemarketingSend(job.data);
  }

  // ─── Modelo cíclico: 1 disparo, ciclando pelos slots habilitados ──────────
  private async handleRemarketingCycle(data: RemarketingJobData): Promise<void> {
    const { chatId, leadId, flowId } = data;
    const slotIndex      = data.slotIndex ?? 0;
    const chainStartedAt = data.chainStartedAt ?? Date.now();
    const seq            = data.seq ?? 0;
    const botId          = data.botId ?? null;

    // Janela de 5 dias — a cadeia morre sozinha, sem estado nem cleanup
    if (Date.now() - chainStartedAt > REMARKETING_WINDOW_MS) {
      this.logger.log(`Remarketing cíclico: janela de 5 dias fechada — lead=${leadId} flow=${flowId} (${seq} disparos)`);
      return;
    }

    // Query enxuta: só o slot atual + flags de habilitado + token do bot.
    // Nunca carrega o config inteiro (que pode ter dezenas de MB de mídia base64).
    const rows = await this.prisma.$queryRaw<Array<{
      is_active:     boolean | null;
      bot_token:     string | null;
      slot:          any;
      enabled_flags: boolean[] | null;
    }>>`
      SELECT
        f."isActive"                                AS is_active,
        b."botToken"                                AS bot_token,
        f.config->'remarketings'->${slotIndex}::int AS slot,
        (SELECT jsonb_agg(COALESCE((s->>'enabled')::boolean, false))
           FROM jsonb_array_elements(f.config->'remarketings') s) AS enabled_flags
      FROM "Flow" f
      JOIN "TelegramBot" b ON b.id = f."botId"
      WHERE f.id = ${flowId}
    `;
    const row = rows[0];
    if (!row || row.is_active === false || !row.bot_token) {
      this.logger.log(`Remarketing cíclico: fluxo inativo / sem bot — encerrando lead=${leadId} flow=${flowId}`);
      return;
    }

    const enabledFlags: boolean[] = Array.isArray(row.enabled_flags) ? row.enabled_flags : [];
    const enabledIdx: number[] = [];
    enabledFlags.forEach((on, i) => { if (on) enabledIdx.push(i); });
    if (enabledIdx.length === 0) {
      this.logger.log(`Remarketing cíclico: nenhum slot habilitado — encerrando lead=${leadId} flow=${flowId}`);
      return;
    }

    const slot = row.slot;
    const slotHasContent = slot && (slot.content || (slot.mediaType && slot.mediaType !== 'none') || slot.buttons?.length);

    // Envia o slot atual — se foi desabilitado desde o agendamento, só avança o ciclo
    if (slot?.enabled && slotHasContent) {
      const botToken = decrypt(row.bot_token);
      try {
        await this.deliverRemarketingSlot(botToken, chatId, botId, slot, flowId, slotIndex);
        this.logger.log(`Remarketing cíclico slot ${slotIndex + 1} (disparo #${seq + 1}) → chatId=${chatId} lead=${leadId}`);
      } catch (e: any) {
        this.logger.warn(`Remarketing cíclico slot ${slotIndex + 1} falhou → lead=${leadId}: ${e.message}`);
        const fatal = e.message || '';
        if (
          fatal.includes('bot was blocked by the user') ||
          fatal.includes('user is deactivated') ||
          fatal.includes('chat not found') ||
          fatal.includes('bot was kicked')
        ) {
          this.logger.log(`Remarketing cíclico: chatId=${chatId} encerrado permanentemente (${fatal.split('\n')[0]})`);
          return; // cadeia encerra, sem retry
        }
        throw e; // transitório → retry com backoff exponencial
      }
    }

    // Próximo slot habilitado, com wrap-around (…→último→volta pro primeiro→…)
    const pos      = enabledIdx.indexOf(slotIndex);
    const nextSlot = pos === -1 ? enabledIdx[0] : enabledIdx[(pos + 1) % enabledIdx.length];

    // Alterna o id (par → -a, ímpar → -b) pra não colidir com o job atual, que
    // ainda está ATIVO neste ponto. Ver comentário em scheduleRemarketingMulti.
    const nextSeq = seq + 1;
    const nextJobId = `rmkt-${flowId}-${leadId}-${nextSeq % 2 === 0 ? 'a' : 'b'}`;

    await this.queue.add(
      'remarketing-send',
      { chatId, leadId, flowId, botId, slotIndex: nextSlot, chainStartedAt, seq: nextSeq },
      {
        delay: REMARKETING_INTERVAL_MS,
        jobId: nextJobId,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  // Envia uma mensagem de slot de remarketing (mídia via file_id cacheado →
  // URL → base64, ou só texto). Persiste o file_id novo no slot. Agenda a
  // exclusão da mensagem em 1 h (fixo). Propaga erro de envio pro caller.
  private async deliverRemarketingSlot(
    botToken: string, chatId: string, botId: string | null,
    slot: any, flowId: string, slotIndex: number,
  ): Promise<void> {
    const content   = slot.content   || '';
    const mediaType = slot.mediaType  || 'none';
    const mediaUrl  = slot.mediaUrl   || '';
    const mediaData = slot.mediaData  || '';
    const buttons: Array<{ label: string; type: string; value: string }> = slot.buttons || [];
    const hasMedia = mediaType === 'image' || mediaType === 'video';

    const inlineKeyboard = buttons.length > 0
      ? buttons.map(btn => {
          const b: any = { text: btn.label };
          if (btn.type === 'url') b.url = btn.value;
          else b.callback_data = `rmkt:${btn.type}:${btn.value}`;
          return [b];
        })
      : undefined;

    const media    = mediaUrl || mediaData;
    const isBase64 = !!media && media.startsWith('data:');
    const cachedFileId = slot.cachedFileId as string | undefined;
    const useCache     = hasMedia && !!cachedFileId && slot.cachedBotId === botId;
    const hasUsableMediaSource = useCache || !!media;

    if (hasMedia && hasUsableMediaSource) {
      const { fileId: newFileId, messageId } = await sendTelegramMedia({
        botToken, chatId,
        type:        mediaType === 'image' ? 'photo' : 'video',
        fileId:      useCache ? cachedFileId : undefined,
        fileUrl:     !isBase64 && media ? media : undefined,
        fileData:     isBase64 && media ? media : undefined,
        caption:     content || undefined,
        replyMarkup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
      });
      await this.scheduleRemarketingDeletion(botToken, chatId, messageId);

      if (newFileId && newFileId !== cachedFileId && botId) {
        const slotPath = `{remarketings,${slotIndex}}`;
        await this.prisma.$executeRaw`
          UPDATE "Flow"
          SET config = jsonb_set(
            config, ${slotPath}::text[],
            COALESCE(config->'remarketings'->${slotIndex}::int, '{}'::jsonb)
              || jsonb_build_object('cachedFileId', ${newFileId}, 'cachedBotId', ${botId})
          )
          WHERE id = ${flowId}
        `;
        this.logger.log(`Remarketing: file_id ${cachedFileId ? 'atualizado' : 'cacheado'} → slot=${slotIndex} flow=${flowId}`);
      }
    } else {
      if (hasMedia && !hasUsableMediaSource) {
        this.logger.warn(`Remarketing cíclico: mídia ausente → slot=${slotIndex} flow=${flowId}. Enviando só o texto.`);
      }
      const params: any = { chat_id: chatId, text: content || ' ', parse_mode: 'HTML', protect_content: true };
      if (inlineKeyboard) params.reply_markup = { inline_keyboard: inlineKeyboard };
      const res = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, params, { timeout: 15_000 });
      await this.scheduleRemarketingDeletion(botToken, chatId, res.data?.result?.message_id);
    }
  }

  // Exclusão da mensagem de remarketing: 1 h fixo (padrão do modelo cíclico).
  // Não consulta o temporizador do fluxo — evita uma query do config gordo por disparo.
  private async scheduleRemarketingDeletion(
    token: string, chatId: string, messageId: number | null | undefined,
  ): Promise<void> {
    if (!messageId) return;
    try {
      await this.msgQueue.add(
        'delete-message',
        { token, chatId, messageId },
        { delay: REMARKETING_DELETE_MS, attempts: 1 },
      );
    } catch (err: any) {
      this.logger.warn(`[Remarketing] Falha ao agendar exclusão msgId=${messageId}: ${err?.message}`);
    }
  }

  private async handleRemarketingSend(data: RemarketingJobData): Promise<void> {
    const { chatId, leadId, flowId } = data;
    const sendIndex  = data.sendIndex  ?? 0;
    const totalSends = data.totalSends ?? 1;
    const nextDelayMs = data.nextDelayMs ?? 0;

    // Busca flow + bot do banco — zero dados sensíveis no Redis
    const flow = await this.prisma.flow.findUnique({
      where:   { id: flowId },
      include: { bot: true },
    });

    if (!flow?.bot?.botToken) {
      this.logger.warn(`Remarketing: bot não encontrado para flow=${flowId}, abortando.`);
      return;
    }

    const cfg = (flow.config as any)?.remarketing;
    if (!cfg?.enabled) return;

    const botToken  = decrypt(flow.bot.botToken);
    const content   = cfg.content   || '';
    const mediaType = cfg.mediaType || 'none';
    const mediaUrl  = cfg.mediaUrl  || '';
    const mediaData = cfg.mediaData || '';
    const buttons: Array<{ label: string; type: string; value: string }> = cfg.buttons || [];

    const hasMedia = mediaType === 'image' || mediaType === 'video';

    const inlineKeyboard = buttons.length > 0
      ? buttons.map(btn => {
          const b: any = { text: btn.label };
          if (btn.type === 'url') b.url = btn.value;
          else b.callback_data = `rmkt:${btn.type}:${btn.value}`;
          return [b];
        })
      : undefined;

    const media    = mediaUrl || mediaData;
    const isBase64 = !!media && media.startsWith('data:');

    // Cache de file_id — evita re-upload de base64 em cada disparo de remarketing
    const cachedFileId = cfg.cachedFileId as string | undefined;
    const cachedBotId  = cfg.cachedBotId  as string | undefined;
    const useCache     = hasMedia && !!cachedFileId && cachedBotId === flow.botId;
    // Sem cache utilizável (bot mudou desde que foi cacheado) E sem URL/base64 — não há
    // nenhuma fonte de mídia real. Antes disso caía silenciosamente sem enviar nada.
    const hasUsableMediaSource = useCache || !!media;

    try {
      if (hasMedia && hasUsableMediaSource) {
        // sendTelegramMedia tenta: file_id → URL → base64, com log detalhado em cada falha
        const { fileId: newFileId, messageId } = await sendTelegramMedia({
          botToken, chatId,
          type:     mediaType === 'image' ? 'photo' : 'video',
          fileId:   useCache ? cachedFileId : undefined,
          fileUrl:  !isBase64 && media ? media   : undefined,
          fileData:  isBase64 && media ? media   : undefined,
          caption:  content || undefined,
          replyMarkup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
        });
        await this.scheduleMessageDeletion(botToken, chatId, messageId, flowId);

        // Persiste o file_id para reutilizar sem re-upload (base64 mantida como fallback).
        // Merge atômico via jsonb — evita perder o update quando vários leads terminam
        // o upload quase ao mesmo tempo (comum no modo de pré-cache).
        if (newFileId && newFileId !== cachedFileId && flow.botId) {
          await this.prisma.$executeRaw`
            UPDATE "Flow"
            SET config = jsonb_set(
              COALESCE(config, '{}'::jsonb),
              '{remarketing}',
              COALESCE(config->'remarketing', '{}'::jsonb) || jsonb_build_object('cachedFileId', ${newFileId}, 'cachedBotId', ${flow.botId})
            )
            WHERE id = ${flowId}
          `;
          this.logger.log(`Remarketing: file_id ${cachedFileId ? 'atualizado' : 'cacheado'} → flow=${flowId}`);
        }
      } else {
        if (hasMedia && !hasUsableMediaSource) {
          this.logger.warn(
            `Remarketing: mídia ausente (sem file_id válido pro bot atual nem URL/base64) → flow=${flowId} lead=${leadId}. ` +
            `Enviando só o texto — é preciso reenviar a mídia pelo construtor de fluxos.`,
          );
        }
        const params: any = { chat_id: chatId, text: content || ' ', parse_mode: 'HTML', protect_content: true };
        if (inlineKeyboard) params.reply_markup = { inline_keyboard: inlineKeyboard };
        const res = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, params, { timeout: 15_000 });
        await this.scheduleMessageDeletion(botToken, chatId, res.data?.result?.message_id, flowId);
      }

      this.logger.log(`Remarketing #${sendIndex + 1}/${totalSends} → chatId=${chatId} lead=${leadId}`);
    } catch (e: any) {
      this.logger.warn(`Remarketing #${sendIndex + 1}/${totalSends} falhou → lead=${leadId}: ${e.message}`);

      // Bot bloqueado ou usuário desativado — encerra a cadeia sem retry
      const fatalMsg = e.message || '';
      if (
        fatalMsg.includes('bot was blocked by the user') ||
        fatalMsg.includes('user is deactivated') ||
        fatalMsg.includes('chat not found') ||
        fatalMsg.includes('bot was kicked')
      ) {
        this.logger.log(`Remarketing: chatId=${chatId} encerrado permanentemente (${fatalMsg.split('\n')[0]})`);
        return; // job vai para completed, não gera retry nem failed
      }

      throw e; // outros erros fazem retry com backoff exponencial
    }

    // Se o fluxo já foi migrado pro sistema multi-slot (config.remarketings, até 10 slots),
    // a cadeia legada não deve mais se perpetuar — evita leads presos recebendo a mensagem
    // antiga pra sempre depois que o dono reconfigurou o remarketing pelo novo painel.
    const migratedToMultiSlot = Array.isArray((flow.config as any)?.remarketings);
    if (migratedToMultiSlot) {
      this.logger.log(`Remarketing legado: flow=${flowId} lead=${leadId} já migrado pra multi-slot — encerrando cadeia legada em sendIndex=${sendIndex}`);
      return;
    }

    // Cadeia: agenda o próximo disparo — jobId inclui flowId para não colidir entre fluxos
    if (sendIndex + 1 < totalSends) {
      // Enquanto a mídia desse slot ainda não tiver file_id cacheado (só pra bots
      // novos, precacheEnabled=true), comprime o delay pra aquecer o cache rápido.
      const isComplete = !hasMedia || useCache;
      const effectiveDelayMs = resolvePrecacheDelayFromCompleteness((flow as any).bot?.precacheEnabled, isComplete, nextDelayMs);
      await this.queue.add(
        'remarketing-send',
        { chatId, leadId, flowId, sendIndex: sendIndex + 1, totalSends, nextDelayMs },
        {
          delay: effectiveDelayMs,
          jobId: `rmkt-${flowId}-${leadId}-${sendIndex + 1}`,
          ...JOB_OPTS,
        },
      );
    }
  }

  // ─── Multi-slot: processa um slot específico da array ─────────────────────
  private async handleRemarketingMultiSlot(data: RemarketingJobData): Promise<void> {
    const { chatId, leadId, flowId, slotIndex } = data;
    const slotSendIndex  = data.slotSendIndex  ?? 0;
    const slotTotalSends = data.slotTotalSends ?? 1;
    const slotIntervalMs = data.slotIntervalMs ?? 5 * 3600 * 1000;

    const flow = await this.prisma.flow.findUnique({
      where:   { id: flowId },
      include: { bot: true },
    });

    if (!flow?.bot?.botToken) {
      this.logger.warn(`Remarketing multi: bot não encontrado para flow=${flowId}, abortando.`);
      return;
    }

    const slots = (flow.config as any)?.remarketings as any[];
    if (!Array.isArray(slots)) return;

    const cfg = slots[slotIndex!];
    const hasContent = cfg?.content || (cfg?.mediaType && cfg.mediaType !== 'none') || cfg?.buttons?.length;
    if (!cfg?.enabled || !hasContent) {
      // Slot desativado ou sem conteúdo desde o agendamento — pula para o próximo
      await this.queueNextRemarketingSlot(slots, slotIndex!, chatId, leadId, flowId, flow.botId, (flow as any).bot?.precacheEnabled);
      return;
    }

    const botToken  = decrypt(flow.bot.botToken);
    const content   = cfg.content   || '';
    const mediaType = cfg.mediaType || 'none';
    const mediaUrl  = cfg.mediaUrl  || '';
    const mediaData = cfg.mediaData || '';
    const buttons: Array<{ label: string; type: string; value: string }> = cfg.buttons || [];

    const hasMedia = mediaType === 'image' || mediaType === 'video';

    const inlineKeyboard = buttons.length > 0
      ? buttons.map(btn => {
          const b: any = { text: btn.label };
          if (btn.type === 'url') b.url = btn.value;
          else b.callback_data = `rmkt:${btn.type}:${btn.value}`;
          return [b];
        })
      : undefined;

    const media    = mediaUrl || mediaData;
    const isBase64 = !!media && media.startsWith('data:');

    // Cache de file_id por slot — evita re-upload a cada disparo
    const cachedFileId = cfg.cachedFileId as string | undefined;
    const cachedBotId  = cfg.cachedBotId  as string | undefined;
    const useCache     = hasMedia && !!cachedFileId && cachedBotId === flow.botId;
    // Sem cache utilizável (bot mudou desde que foi cacheado) E sem URL/base64 — não há
    // nenhuma fonte de mídia real. Antes disso caía silenciosamente sem enviar nada.
    const hasUsableMediaSource = useCache || !!media;

    try {
      if (hasMedia && hasUsableMediaSource) {
        const { fileId: newFileId, messageId } = await sendTelegramMedia({
          botToken, chatId,
          type:        mediaType === 'image' ? 'photo' : 'video',
          fileId:      useCache ? cachedFileId : undefined,
          fileUrl:     !isBase64 && media ? media  : undefined,
          fileData:     isBase64 && media ? media  : undefined,
          caption:     content || undefined,
          replyMarkup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
        });
        await this.scheduleMessageDeletion(botToken, chatId, messageId, flowId);

        // Persiste file_id no slot para reutilizar sem re-upload (base64 mantida como fallback).
        // Merge atômico via jsonb — evita perder o update de outro slot/lead concorrente.
        if (newFileId && newFileId !== cachedFileId && flow.botId) {
          const slotPath = `{remarketings,${slotIndex}}`;
          await this.prisma.$executeRaw`
            UPDATE "Flow"
            SET config = jsonb_set(
              config,
              ${slotPath}::text[],
              COALESCE(config->'remarketings'->${slotIndex}::int, '{}'::jsonb) || jsonb_build_object('cachedFileId', ${newFileId}, 'cachedBotId', ${flow.botId})
            )
            WHERE id = ${flowId}
          `;
          this.logger.log(`Remarketing multi: file_id ${cachedFileId ? 'atualizado' : 'cacheado'} → slot=${slotIndex} flow=${flowId}`);
        }
      } else {
        if (hasMedia && !hasUsableMediaSource) {
          this.logger.warn(
            `Remarketing multi: mídia ausente (sem file_id válido pro bot atual nem URL/base64) → slot=${slotIndex} flow=${flowId} lead=${leadId}. ` +
            `Enviando só o texto — é preciso reenviar a mídia pelo construtor de fluxos.`,
          );
        }
        const params: any = { chat_id: chatId, text: content || ' ', parse_mode: 'HTML', protect_content: true };
        if (inlineKeyboard) params.reply_markup = { inline_keyboard: inlineKeyboard };
        const res = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, params, { timeout: 15_000 });
        await this.scheduleMessageDeletion(botToken, chatId, res.data?.result?.message_id, flowId);
      }

      this.logger.log(`Remarketing multi slot ${slotIndex! + 1} envio ${slotSendIndex + 1}/${slotTotalSends} → chatId=${chatId} lead=${leadId}`);
    } catch (e: any) {
      this.logger.warn(`Remarketing multi slot ${slotIndex! + 1} envio ${slotSendIndex + 1}/${slotTotalSends} falhou → lead=${leadId}: ${e.message}`);

      const fatalMsg = e.message || '';
      if (
        fatalMsg.includes('bot was blocked by the user') ||
        fatalMsg.includes('user is deactivated') ||
        fatalMsg.includes('chat not found') ||
        fatalMsg.includes('bot was kicked')
      ) {
        this.logger.log(`Remarketing multi: chatId=${chatId} encerrado permanentemente (${fatalMsg.split('\n')[0]})`);
        return;
      }

      throw e; // outros erros → retry com backoff exponencial
    }

    // Reenvio dentro do mesmo slot, ou avança para o próximo slot
    if (slotSendIndex + 1 < slotTotalSends) {
      const nextSendIdx = slotSendIndex + 1;
      const isComplete = !hasMedia || useCache;
      const effectiveDelayMs = resolvePrecacheDelayFromCompleteness((flow as any).bot?.precacheEnabled, isComplete, slotIntervalMs);
      await this.queue.add(
        'remarketing-send',
        { chatId, leadId, flowId, slotIndex: slotIndex!, slotSendIndex: nextSendIdx, slotTotalSends, slotIntervalMs },
        { delay: effectiveDelayMs, jobId: `rmkt-${flowId}-${leadId}-s${slotIndex}-${nextSendIdx}`, ...JOB_OPTS },
      );
    } else {
      await this.queueNextRemarketingSlot(slots, slotIndex!, chatId, leadId, flowId, flow.botId, (flow as any).bot?.precacheEnabled);
    }
  }

  private async queueNextRemarketingSlot(
    slots: any[], currentIdx: number,
    chatId: string, leadId: string, flowId: string,
    botId?: string | null, precacheEnabled?: boolean,
  ): Promise<void> {
    const nextIdx = slots.findIndex(
      (s, i) => i > currentIdx && s?.enabled && (s.content || (s.mediaType && s.mediaType !== 'none') || s.buttons?.length),
    );
    if (nextIdx === -1) return; // cadeia encerrada

    const nextSlot = slots[nextIdx];

    // Quantidade de reenvios e intervalo entre eles, a partir de interval/stopAfter
    // configurados no slot — sem isso o slot dispara uma vez só e nunca repete.
    const sends = computeRemarketingSends(nextSlot);
    if (!sends) {
      this.logger.warn(`Remarketing multi: slot ${nextIdx} com timing inválido (firstDelay/interval/stopAfter) — encerrando cadeia lead=${leadId} flow=${flowId}`);
      return;
    }
    const { firstDelayMs, totalSends, intervalMs } = sends;

    // Comprime o delay pra aquecer o cache da mídia do PRÓXIMO slot (só bots novos)
    const nextHasMedia = nextSlot.mediaType === 'image' || nextSlot.mediaType === 'video';
    const nextIsComplete = !nextHasMedia || (!!nextSlot.cachedFileId && nextSlot.cachedBotId === botId);
    const effectiveDelayMs = resolvePrecacheDelayFromCompleteness(precacheEnabled, nextIsComplete, firstDelayMs);

    await this.queue.add(
      'remarketing-send',
      { chatId, leadId, flowId, slotIndex: nextIdx, slotSendIndex: 0, slotTotalSends: totalSends, slotIntervalMs: intervalMs },
      { delay: effectiveDelayMs, jobId: `rmkt-${flowId}-${leadId}-s${nextIdx}-0`, ...JOB_OPTS },
    );
  }
}
