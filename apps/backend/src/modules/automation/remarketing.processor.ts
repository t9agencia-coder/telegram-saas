import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { decrypt } from '../../common/utils/encryption';
import { sendTelegramMedia } from '../../common/send-telegram-media';

// Payload mínimo — token e mídia ficam no banco, nunca no Redis
interface RemarketingJobData {
  chatId:      string;
  leadId:      string;
  flowId:      string;
  sendIndex:   number;
  totalSends:  number;
  nextDelayMs: number;
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

    await this.handleRemarketingSend(job.data);
  }

  private async handleRemarketingSend(data: RemarketingJobData): Promise<void> {
    const { chatId, leadId, flowId, sendIndex, totalSends, nextDelayMs } = data;

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

    try {
      if (hasMedia) {
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

        // Persiste o file_id retornado (novo upload ou cache inválido invalidado)
        if (newFileId && newFileId !== cachedFileId && flow.botId) {
          const newConfig = {
            ...(flow.config as any),
            remarketing: { ...cfg, cachedFileId: newFileId, cachedBotId: flow.botId },
          };
          await this.prisma.flow.update({ where: { id: flowId }, data: { config: newConfig } });
          this.logger.log(`Remarketing: file_id ${cachedFileId ? 'atualizado' : 'cacheado'} → flow=${flowId}`);
        }
      } else {
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

    // Cadeia: agenda o próximo disparo (1 job no Redis por lead a qualquer momento)
    if (sendIndex + 1 < totalSends) {
      await this.queue.add(
        'remarketing-send',
        { chatId, leadId, flowId, sendIndex: sendIndex + 1, totalSends, nextDelayMs },
        {
          delay: nextDelayMs,
          jobId: `rmkt:${leadId}:${sendIndex + 1}`,
          ...JOB_OPTS,
        },
      );
    }
  }
}
