import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { MKT_SYNC_QUEUE, MKT_SALES_QUEUE } from './marketing.constants';
import { runsHeavyQueues } from '../../common/queue-role';

/**
 * A sincronização de dados da Meta (campanhas/gasto/insights) NÃO é mais
 * periódica — puxava a Meta de 15 em 15 min o tempo todo e podia contribuir pro
 * bloqueio do App. Agora só roda quando o usuário aperta "Atualizar da Meta"
 * (`kickAll`) ou (des)ativa uma conta (`kick`). O scan de vendas
 * (Payment → MarketingSale) continua rodando — é só banco local, não toca a Meta.
 */
@Injectable()
export class MarketingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(MarketingSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(MKT_SYNC_QUEUE) private readonly queue: Queue,
    @InjectQueue(MKT_SALES_QUEUE) private readonly salesQueue: Queue,
  ) {}

  async onModuleInit() {
    // Só onde as filas pesadas rodam (worker/all).
    if (!runsHeavyQueues()) return;

    // Limpa qualquer job de sync periódico que tenha ficado agendado do modelo
    // antigo (delayed de 15 min). A sync agora é 100% sob demanda.
    try {
      await this.queue.drain(true);
    } catch (err: any) {
      this.logger.warn(`[MarketingScheduler] drain sync queue: ${err.message}`);
    }

    // Scan de vendas — self-requeue, só lê Payment/MarketingSale local (sem Meta API).
    try {
      await this.salesQueue.add(
        'scan', { seq: 0 },
        { jobId: 'mkt-sales-a', removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log('[MarketingScheduler] scan de vendas iniciado');
    } catch (err: any) {
      this.logger.warn(`[MarketingScheduler] sales boot: ${err.message}`);
    }
  }

  /** (Des)ativar conta → 1 sync sob demanda dessa conta. */
  async kick(adAccountId: string) {
    await this.enqueueSync(adAccountId);
  }

  /** Botão "Atualizar da Meta" → 1 sync sob demanda de todas as contas selecionadas. */
  async kickAll(workspaceId: string): Promise<number> {
    const accts = await (this.prisma as any).metaAdAccount.findMany({
      where: { workspaceId, isSelected: true },
      select: { id: true },
    });
    for (const a of accts) await this.enqueueSync(a.id);
    return accts.length;
  }

  private async enqueueSync(adAccountId: string) {
    // Remove job pendente/agendado da mesma conta (dedup) e enfileira 1 sync agora.
    await this.queue.remove(`mkt-sync-${adAccountId}-a`).catch(() => {});
    await this.queue.remove(`mkt-sync-${adAccountId}-b`).catch(() => {});
    await this.queue.add(
      'sync',
      { adAccountId, seq: 0 },
      { jobId: `mkt-sync-${adAccountId}-a`, removeOnComplete: true, removeOnFail: true },
    ).catch((e) => this.logger.warn(`[MarketingScheduler] enqueue ${adAccountId}: ${e.message}`));
  }
}
