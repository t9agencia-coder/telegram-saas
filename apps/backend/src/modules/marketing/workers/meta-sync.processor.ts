import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { MetaSyncService } from '../services/meta-sync.service';
import { MKT_SYNC_QUEUE } from '../marketing.constants';

interface SyncJobData {
  adAccountId: string;
  chain?: boolean; // vestigial — a sync NÃO é mais periódica (só no botão "Atualizar")
  seq?: number;
}

/**
 * Um job por ad account selecionada. Faz estrutura + insights, UMA vez.
 * NÃO re-agenda mais (a sincronização periódica de 15 em 15 min foi removida —
 * puxava a Meta o tempo todo e podia contribuir pro bloqueio do App). Agora só
 * roda quando o usuário aperta "Atualizar da Meta" ou (des)ativa uma conta.
 */
@Processor(MKT_SYNC_QUEUE, { concurrency: 3 })
export class MetaSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MetaSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: MetaSyncService,
  ) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<void> {
    const { adAccountId } = job.data;

    // A conta ainda existe e está selecionada?
    const acc = await (this.prisma as any).metaAdAccount.findUnique({
      where: { id: adAccountId },
      select: { isSelected: true },
    });
    if (!acc?.isSelected) {
      this.logger.log(`[MetaSync] ${adAccountId} não está mais selecionada — ignorado`);
      return;
    }

    try {
      const s = await this.sync.syncStructure(adAccountId);
      const i = await this.sync.syncInsights(adAccountId);
      if (s || i) {
        this.logger.log(`[MetaSync] ${adAccountId} camp=${s?.campaigns ?? '-'} adset=${s?.adSets ?? '-'} ad=${s?.ads ?? '-'} insights=${i?.rows ?? '-'}`);
      } else {
        this.logger.warn(`[MetaSync] ${adAccountId} — conexão inativa/token expirado`);
      }
    } catch (err: any) {
      // 1 tentativa só — sem throw (não queremos retry storm batendo na Meta).
      // Se falhar, o usuário aperta "Atualizar" de novo.
      this.logger.error(`[MetaSync] ${adAccountId} falhou: ${err.message}`);
    }
  }
}
