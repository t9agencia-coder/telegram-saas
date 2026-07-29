import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { decrypt } from '../../common/utils/encryption';
import { sendWebhookHttp } from './webhook-http';
import { OUTBOUND_WEBHOOK_QUEUE, WEBHOOK_BACKOFF_MS } from './webhook-dispatch.service';

// Worker dos webhooks de saída. Retry via backoff customizado (imediata → 30s → 2min
// → 10min). Concorrência >1 porque webhooks de vendas diferentes rodam em paralelo;
// a mesma venda nunca duplica por causa do jobId (= eventId).
@Processor(OUTBOUND_WEBHOOK_QUEUE, {
  concurrency: 10,
  settings: {
    // attemptsMade = nº de tentativas já feitas quando a atual falhou.
    // 1→30s, 2→2min, 3→10min; na 4ª o BullMQ para (attempts=4).
    backoffStrategy: (attemptsMade: number) => WEBHOOK_BACKOFF_MS[attemptsMade - 1] ?? 0,
  },
})
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ logId: string }>): Promise<void> {
    const { logId } = job.data;
    const log = await this.prisma.webhookLog.findUnique({ where: { id: logId } });
    if (!log) return; // log removido — nada a fazer

    // Secret carregado do banco na hora (nunca trafega pelo Redis).
    let secret: string | undefined;
    const settings = await this.prisma.webhookSettings.findUnique({ where: { workspaceId: log.workspaceId } });
    if (settings?.secret) {
      try { secret = decrypt(settings.secret); } catch { secret = undefined; }
    }

    const attemptNumber = job.attemptsMade + 1;

    const result = await sendWebhookHttp({
      url: log.url,
      secret,
      event: log.event,
      eventId: log.eventId,
      payload: log.payload,
    });

    await this.prisma.webhookLog.update({
      where: { id: logId },
      data: {
        responseStatus: result.responseStatus,
        responseBody: result.responseBody,
        executionMs: result.executionMs,
        attempts: attemptNumber,
        success: result.success,
        errorMessage: result.errorMessage,
      },
    });

    if (!result.success) {
      // Lança pra o BullMQ reagendar com o backoff customizado (ou marcar failed na última).
      throw new Error(`Webhook ${log.event} falhou (tentativa ${attemptNumber}): ${result.errorMessage}`);
    }

    this.logger.log(`Webhook ${log.event} entregue (${result.responseStatus}, ${result.executionMs}ms) log=${logId}`);
  }
}
