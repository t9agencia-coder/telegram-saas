import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { decrypt } from '../../common/utils/encryption';
import { sendTelegramMedia } from '../../common/send-telegram-media';
import { resolvePrecacheDelayFromCompleteness } from '../../common/media-precache';

// Payload mínimo — token e mídia ficam no banco, nunca no Redis
interface RemarketingJobData {
  chatId:          string;
  leadId:          string;
  flowId:          string;
  // Caminho legado (objeto único)
  sendIndex?:      number;
  totalSends?:     number;
  nextDelayMs?:    number;
  // Caminho multi-slot (array de slots)
  slotIndex?:      number;
  slotSendIndex?:  number;
  slotTotalSends?: number;
  slotIntervalMs?: number;
}

const JOB_OPTS = {
  removeOnComplete: { count: 500, age: 24 * 3600 },
  removeOnFail:     { count: 100, age: 7 * 24 * 3600 },
};

@Processor('telegram-remarketing')
export class RemarketingProcessor extends WorkerHost {
  private readonly logger = new Logger(RemarketingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('telegram-remarketing') private readonly queue: Queue,
  ) {
    super();
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

    // Novo caminho: multi-slot com slotIndex definido
    if (job.data.slotIndex !== undefined) {
      return this.handleRemarketingMultiSlot(job.data);
    }

    await this.handleRemarketingSend(job.data);
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
        const { fileId: newFileId } = await sendTelegramMedia({
          botToken, chatId,
          type:     mediaType === 'image' ? 'photo' : 'video',
          fileId:   useCache ? cachedFileId : undefined,
          fileUrl:  !isBase64 && media ? media   : undefined,
          fileData:  isBase64 && media ? media   : undefined,
          caption:  content || undefined,
          replyMarkup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
        });

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
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, params, { timeout: 15_000 });
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

    // Se o fluxo já foi migrado pro sistema de 3 slots (config.remarketings), a cadeia
    // legada não deve mais se perpetuar — evita leads presos recebendo a mensagem antiga
    // pra sempre depois que o dono reconfigurou o remarketing pelo novo painel.
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
        const { fileId: newFileId } = await sendTelegramMedia({
          botToken, chatId,
          type:        mediaType === 'image' ? 'photo' : 'video',
          fileId:      useCache ? cachedFileId : undefined,
          fileUrl:     !isBase64 && media ? media  : undefined,
          fileData:     isBase64 && media ? media  : undefined,
          caption:     content || undefined,
          replyMarkup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
        });

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
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, params, { timeout: 15_000 });
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

    const nextSlot     = slots[nextIdx];
    const firstDelayMs = (nextSlot.firstDelay || 30) * 60 * 1000;

    // Comprime o delay pra aquecer o cache da mídia do PRÓXIMO slot (só bots novos)
    const nextHasMedia = nextSlot.mediaType === 'image' || nextSlot.mediaType === 'video';
    const nextIsComplete = !nextHasMedia || (!!nextSlot.cachedFileId && nextSlot.cachedBotId === botId);
    const effectiveDelayMs = resolvePrecacheDelayFromCompleteness(precacheEnabled, nextIsComplete, firstDelayMs);

    await this.queue.add(
      'remarketing-send',
      { chatId, leadId, flowId, slotIndex: nextIdx, slotSendIndex: 0, slotTotalSends: 1, slotIntervalMs: 0 },
      { delay: effectiveDelayMs, jobId: `rmkt-${flowId}-${leadId}-s${nextIdx}-0`, ...JOB_OPTS },
    );
  }
}
