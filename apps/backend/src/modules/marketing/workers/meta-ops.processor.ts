import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MetaCampaignOpsService } from '../services/meta-campaign-ops.service';
import { MKT_OPS_QUEUE } from '../marketing.constants';
import { MetaRateLimitError } from '../integrations/meta/meta-graph.client';

interface OpsJob {
  workspaceId: string;
  campaignId: string;
  active: boolean;
  userId: string;
}

/**
 * Executa ativar/pausar de campanha na Meta, 1 por job. Concorrência baixa +
 * backoff exponencial (nas opts do job) pra respeitar o rate limit da Meta em
 * ações em massa. Erro de rate limit sobe cru → BullMQ re-tenta.
 */
@Processor(MKT_OPS_QUEUE, { concurrency: 2 })
export class MetaOpsProcessor extends WorkerHost {
  private readonly logger = new Logger(MetaOpsProcessor.name);

  constructor(private readonly ops: MetaCampaignOpsService) {
    super();
  }

  async process(job: Job<OpsJob>): Promise<void> {
    const { workspaceId, campaignId, active, userId } = job.data;
    try {
      await this.ops.setStatus(workspaceId, campaignId, active, userId, { rethrow: true });
    } catch (err: any) {
      if (err instanceof MetaRateLimitError) {
        this.logger.warn(`[MetaOps] rate limit em ${campaignId} — re-tentando (tentativa ${job.attemptsMade + 1})`);
      }
      throw err; // deixa o BullMQ aplicar o backoff/attempts
    }
  }
}
