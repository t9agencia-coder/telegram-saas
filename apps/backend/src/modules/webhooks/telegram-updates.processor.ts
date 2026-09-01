import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

interface TelegramUpdateJob {
  id:   string; // botId (novo padrão) ou workspaceId (retrocompatível)
  body: any;    // update cru do Telegram
}

// Processa os updates recebidos no webhook do Telegram FORA do ciclo da request
// HTTP — o controller já respondeu 200 e o Telegram não fica esperando o funil
// inteiro terminar. Ver o comentário em WebhooksService.processTelegramWebhook.
//
// Concorrência 20: cada job é de um chatId diferente e independente dos demais.
// A ordem entre updates de chats distintos não importa; para o mesmo chat, o
// caso real de corrida (gerar PIX 2×) já é coberto pelo lock no Redis.
@Processor('telegram-updates', { concurrency: 20 })
export class TelegramUpdatesProcessor extends WorkerHost {
  private readonly logger = new Logger(TelegramUpdatesProcessor.name);

  constructor(private readonly webhooksService: WebhooksService) {
    super();
  }

  async process(job: Job<TelegramUpdateJob>): Promise<void> {
    if (job.name !== 'telegram-update') return;

    // Descarta updates presos na fila há tempo demais (ex.: acúmulo durante uma
    // queda) — reenviar mensagem de fluxo com muito atraso é pior que não enviar.
    const MAX_JOB_AGE_MS = 10 * 60 * 1000;
    const jobAge = Date.now() - job.timestamp;
    if (jobAge > MAX_JOB_AGE_MS) {
      this.logger.warn(
        `[TelegramUpdates] Update descartado por idade: id=${job.id} idade=${Math.round(jobAge / 1000)}s`,
      );
      return;
    }

    const { id, body } = job.data;
    await this.webhooksService.handleTelegramUpdate(id, body);
  }
}
