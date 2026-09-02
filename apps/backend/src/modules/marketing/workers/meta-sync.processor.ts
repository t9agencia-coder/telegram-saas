import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { MetaSyncService } from '../services/meta-sync.service';
import { MKT_SYNC_QUEUE, MKT_SYNC_INTERVAL_MS } from '../marketing.constants';

interface SyncJobData {
  adAccountId: string;
  /** true = ciclo periódico (re-enfileira a si mesmo); false/undefined = disparo único ("kick"). */
  chain?: boolean;
  seq?: number;
}

const JOB_OPTS = { removeOnComplete: true, removeOnFail: true };

/**
 * Um job por ad account selecionada. Faz estrutura + insights e, se `chain`,
 * re-agenda a si mesmo daqui a MKT_SYNC_INTERVAL_MS. jobId alterna -a/-b pra
 * não colidir com o job ainda ativo (mesmo padrão do remarketing cíclico).
 */
@Processor(MKT_SYNC_QUEUE, { concurrency: 3 })
export class MetaSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MetaSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: MetaSyncService,
    @InjectQueue(MKT_SYNC_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<void> {
    const { adAccountId, chain, seq = 0 } = job.data;

    // A conta ainda existe e está selecionada?
    const acc = await (this.prisma as any).metaAdAccount.findUnique({
      where: { id: adAccountId },
      select: { isSelected: true },
    });
    if (!acc?.isSelected) {
      this.logger.log(`[MetaSync] ${adAccountId} não está mais selecionada — cadeia encerrada`);
      return;
    }

    try {
      const s = await this.sync.syncStructure(adAccountId);
      const i = await this.sync.syncInsights(adAccountId);
      if (s || i) {
        this.logger.log(`[MetaSync] ${adAccountId} camp=${s?.campaigns ?? '-'} adset=${s?.adSets ?? '-'} ad=${s?.ads ?? '-'} insights=${i?.rows ?? '-'}`);
      } else {
        this.logger.warn(`[MetaSync] ${adAccountId} — conexão inativa/token expirado, cadeia encerrada`);
        return; // token expirado: para de re-agendar até reconectar
      }
    } catch (err: any) {
      this.logger.error(`[MetaSync] ${adAccountId} falhou: ${err.message}`);
      // deixa o BullMQ tentar de novo (attempts/backoff do defaultJobOptions);
      // se estourar, a cadeia periódica abaixo ainda re-agenda o próximo ciclo.
      if (!chain) throw err;
    }

    if (chain) {
      const nextSeq = seq + 1;
      const jobId = `mkt-sync-${adAccountId}-${nextSeq % 2 === 0 ? 'a' : 'b'}`;
      await this.queue.add(
        'sync',
        { adAccountId, chain: true, seq: nextSeq },
        { delay: MKT_SYNC_INTERVAL_MS, jobId, ...JOB_OPTS },
      );
    }
  }
}
