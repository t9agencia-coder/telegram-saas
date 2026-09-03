import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MetaCampaignOpsService } from '../services/meta-campaign-ops.service';
import { MKT_OPS_QUEUE } from '../marketing.constants';
import { MetaRateLimitError } from '../integrations/meta/meta-graph.client';

interface StatusJob {
  workspaceId: string;
  campaignId: string;
  active: boolean;
  userId: string;
}
interface DuplicateJob {
  workspaceId: string;
  campaignId: string;
  deepCopy: boolean;
  nameSuffix: string;
  userId: string;
}

/**
 * Escrita na Meta, 1 por job: ativar/pausar (`campaign-status`) e duplicar
 * (`campaign-duplicate`). Concorrência baixa + backoff exponencial (nas opts do
 * job) respeitam o rate limit da Meta em ações em massa. Rate limit sobe cru →
 * BullMQ re-tenta.
 */
@Processor(MKT_OPS_QUEUE, { concurrency: 2 })
export class MetaOpsProcessor extends WorkerHost {
  private readonly logger = new Logger(MetaOpsProcessor.name);

  constructor(private readonly ops: MetaCampaignOpsService) {
    super();
  }

  async process(job: Job<StatusJob | DuplicateJob>): Promise<void> {
    try {
      if (job.name === 'campaign-duplicate') {
        const { workspaceId, campaignId, deepCopy, nameSuffix, userId } = job.data as DuplicateJob;
        await this.ops.duplicateOnce(workspaceId, campaignId, { deepCopy, nameSuffix, userId }, { rethrow: true });
        return;
      }
      const { workspaceId, campaignId, active, userId } = job.data as StatusJob;
      await this.ops.setStatus(workspaceId, campaignId, active, userId, { rethrow: true });
    } catch (err: any) {
      if (err instanceof MetaRateLimitError) {
        this.logger.warn(`[MetaOps] rate limit em ${(job.data as any).campaignId} (${job.name}) — re-tentando (tentativa ${job.attemptsMade + 1})`);
      }
      throw err; // deixa o BullMQ aplicar o backoff/attempts
    }
  }
}
