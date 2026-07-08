import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

interface ContinueFlowData {
  flowId:          string;
  chatId:          string;
  fromNodeId:      string;
  skipWaitBefore?: boolean; // true = executar o nó diretamente (waitBefore já foi cumprido)
  broadcastId?:    string;  // presente quando o job veio de um disparo do Remarketing Master
  botIdOverride?:  string;  // entrega pelo bot de origem do lead em vez do bot fixo do fluxo
}

@Processor('scheduled-tasks')
export class ScheduledTasksProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledTasksProcessor.name);

  constructor(private readonly webhooksService: WebhooksService) {
    super();
  }

  async process(job: Job<ContinueFlowData>): Promise<void> {
    if (job.name !== 'continue-flow') return;

    // Protege contra clock drift e jobs expirados (mesma lógica dos outros processors)
    const MAX_JOB_AGE_MS = 10 * 24 * 60 * 60 * 1000;
    const MAX_FUTURE_MS  = 11 * 24 * 60 * 60 * 1000;
    const jobAge = Date.now() - job.timestamp;
    if (jobAge < -MAX_FUTURE_MS || jobAge > MAX_JOB_AGE_MS) {
      this.logger.warn(
        `[ScheduledTasks] Job inválido descartado: id=${job.id}` +
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
