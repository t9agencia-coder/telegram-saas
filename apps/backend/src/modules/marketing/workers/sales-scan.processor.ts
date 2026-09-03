import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MarketingSalesService } from '../services/marketing-sales.service';
import { MKT_SALES_QUEUE, MKT_SALES_INTERVAL_MS } from '../marketing.constants';

const JOB_OPTS = { removeOnComplete: true, removeOnFail: true };

/**
 * Scan de vendas: Payment(APPROVED) → MarketingSale com atribuição. Self-requeue —
 * imediato enquanto há backlog (backfill), depois a cada MKT_SALES_INTERVAL_MS.
 * jobId alterna -a/-b (mesmo padrão do meta-sync / remarketing cíclico).
 */
@Processor(MKT_SALES_QUEUE, { concurrency: 1 })
export class SalesScanProcessor extends WorkerHost {
  private readonly logger = new Logger(SalesScanProcessor.name);

  constructor(
    private readonly sales: MarketingSalesService,
    @InjectQueue(MKT_SALES_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ seq?: number }>): Promise<void> {
    const seq = job.data?.seq ?? 0;
    let backlog = false;
    try {
      const r = await this.sales.scanOnce();
      backlog = r.backlog;
    } catch (err: any) {
      this.logger.error(`[SalesScan] falhou: ${err.message}`);
    }

    const nextSeq = seq + 1;
    const jobId = `mkt-sales-${nextSeq % 2 === 0 ? 'a' : 'b'}`;
    await this.queue.add(
      'scan',
      { seq: nextSeq },
      { delay: backlog ? 1000 : MKT_SALES_INTERVAL_MS, jobId, ...JOB_OPTS },
    );
  }
}
