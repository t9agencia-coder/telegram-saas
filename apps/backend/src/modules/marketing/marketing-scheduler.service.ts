import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { MKT_SYNC_QUEUE, MKT_SALES_QUEUE } from './marketing.constants';

/**
 * Garante que cada ad account selecionada tem uma cadeia de sync rodando.
 * OnModuleInit (no boot do worker) re-inicia as cadeias; `kick()` é chamado
 * pelo controller logo após o usuário escolher a conta, pro 1º sync ser imediato.
 * Só age onde a fila roda (worker) — no backend/api o InjectQueue continua
 * sendo só produtor, então kick() funciona de qualquer processo.
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
    // Evita rodar em processos que não consomem a fila (backend/api): sem worker
    // a cadeia periódica só encheria o Redis. O produtor `kick` continua ok.
    if ((process.env.QUEUE_ROLE || 'all').toLowerCase() === 'api') return;
    try {
      const selected = await (this.prisma as any).metaAdAccount.findMany({
        where: { isSelected: true },
        select: { id: true },
      });
      for (const acc of selected) await this.startChain(acc.id, true);
      if (selected.length) this.logger.log(`[MarketingScheduler] ${selected.length} cadeia(s) de sync iniciada(s)`);
    } catch (err: any) {
      this.logger.warn(`[MarketingScheduler] boot: ${err.message}`);
    }

    // cadeia única do scan de vendas
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

  /** Dispara um sync imediato + (opcional) inicia a cadeia periódica. */
  async kick(adAccountId: string) {
    await this.startChain(adAccountId, true);
  }

  private async startChain(adAccountId: string, chain: boolean) {
    await this.queue.add(
      'sync',
      { adAccountId, chain, seq: 0 },
      { jobId: `mkt-sync-${adAccountId}-a`, removeOnComplete: true, removeOnFail: true },
    ).catch((e) => this.logger.warn(`[MarketingScheduler] enqueue ${adAccountId}: ${e.message}`));
  }
}
