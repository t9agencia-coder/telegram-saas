import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

interface ContinueFlowData {
  flowId:          string;
  chatId:          string;
  fromNodeId:      string;
  skipWaitBefore?: boolean;
  broadcastId?:    string;
  botIdOverride?:  string;
}

// Igual ao ScheduledTasksProcessor, mas para a fila 'broadcast-tasks' — os
// disparos do Remarketing Master. Fica numa fila própria pra rodar na instância
// worker (QUEUE_ROLE=worker) e NÃO no backend (api), assim uma campanha grande
// não disputa o event loop com o /start e a continuação de funil.
// A continuação pós-nó de delay (sem broadcastId) volta pra 'scheduled-tasks'
// normal — é barata e pontual, o custo do broadcast é o fan-out inicial.
@Processor('broadcast-tasks', { concurrency: 10 })
export class BroadcastTasksProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastTasksProcessor.name);

  constructor(private readonly webhooksService: WebhooksService) {
    super();
  }

  async process(job: Job<ContinueFlowData>): Promise<void> {
    if (job.name !== 'continue-flow') return;

    const MAX_JOB_AGE_MS = 10 * 24 * 60 * 60 * 1000;
    const MAX_FUTURE_MS  = 11 * 24 * 60 * 60 * 1000;
    const jobAge = Date.now() - job.timestamp;
    if (jobAge < -MAX_FUTURE_MS || jobAge > MAX_JOB_AGE_MS) {
      this.logger.warn(
        `[BroadcastTasks] Job inválido descartado: id=${job.id}` +
        ` idade=${Math.round(jobAge / 86400000)} dias (criado em ${new Date(job.timestamp).toISOString()})`,
      );
      return;
    }

    const { flowId, chatId, fromNodeId, skipWaitBefore, broadcastId, botIdOverride } = job.data;

    if (skipWaitBefore) {
      await this.webhooksService.executeFlowNodeDirect(flowId, chatId, fromNodeId, broadcastId, botIdOverride);
    } else {
      await this.webhooksService.continueFlowFrom(flowId, chatId, fromNodeId, botIdOverride);
    }
  }
}
