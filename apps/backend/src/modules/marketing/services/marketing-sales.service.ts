import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { MarketingAttributionService } from './marketing-attribution.service';
import { PeriodRange } from './marketing-metrics.service';
import { MKT_SALES_BATCH, MKT_SALES_BACKFILL_DAYS } from '../marketing.constants';

const p = (prisma: PrismaService) => prisma as any;
const SCAN_ID = 'sales-scan';

export interface SalesAgg { sales: number; revenue: number }

/**
 * Deriva MarketingSale de Payment (status APPROVED, por cursor paidAt) e agrega
 * as vendas atribuídas pro grid. NUNCA escreve em Payment; só SELECT.
 */
@Injectable()
export class MarketingSalesService {
  private readonly logger = new Logger(MarketingSalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attribution: MarketingAttributionService,
  ) {}

  /** Uma passada do scan. Devolve quantos processou (== BATCH → ainda tem backlog). */
  async scanOnce(): Promise<{ processed: number; backlog: boolean }> {
    const state = await p(this.prisma).marketingScanState.findUnique({ where: { id: SCAN_ID } });
    const cursor: Date = state?.lastPaidAt
      ?? new Date(Date.now() - MKT_SALES_BACKFILL_DAYS * 24 * 3600 * 1000);

    const payments: any[] = await p(this.prisma).payment.findMany({
      where: { status: 'APPROVED', paidAt: { gt: cursor, lte: new Date() } },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      take: MKT_SALES_BATCH,
      include: { lead: { select: { id: true, workspaceId: true } } },
    });

    if (!payments.length) return { processed: 0, backlog: false };

    let last = cursor;
    let lastId: string | null = state?.lastPaymentId ?? null;
    for (const pay of payments) {
      const workspaceId = pay.lead?.workspaceId;
      if (!workspaceId || !pay.paidAt) { last = pay.paidAt ?? last; lastId = pay.id; continue; }

      const attr = await this.attribution.resolveForLead(workspaceId, pay.lead?.id ?? null);
      await p(this.prisma).marketingSale.upsert({
        where: { paymentId: pay.id },
        create: {
          workspaceId,
          paymentId: pay.id,
          leadId: pay.lead?.id ?? null,
          amount: pay.amount,
          currency: pay.currency ?? 'BRL',
          occurredAt: pay.paidAt,
          fbAdAccountId: attr.fbAdAccountId,
          fbCampaignId: attr.fbCampaignId,
          fbAdSetId: attr.fbAdSetId,
          fbAdId: attr.fbAdId,
          attributionSource: attr.source,
        },
        update: {
          amount: pay.amount,
          occurredAt: pay.paidAt,
          fbAdAccountId: attr.fbAdAccountId,
          fbCampaignId: attr.fbCampaignId,
          fbAdSetId: attr.fbAdSetId,
          fbAdId: attr.fbAdId,
          attributionSource: attr.source,
        },
      });
      last = pay.paidAt;
      lastId = pay.id;
    }

    await p(this.prisma).marketingScanState.upsert({
      where: { id: SCAN_ID },
      create: { id: SCAN_ID, lastPaidAt: last, lastPaymentId: lastId },
      update: { lastPaidAt: last, lastPaymentId: lastId },
    });

    this.logger.log(`[SalesScan] ${payments.length} pagamento(s) processados até ${last.toISOString()}`);
    return { processed: payments.length, backlog: payments.length >= MKT_SALES_BATCH };
  }

  /**
   * Agrega MarketingSale por uma coluna fb (whitelist) no período.
   * Mesmo padrão do insightsBy do grid.
   */
  async salesBy(workspaceId: string, col: 'fbAdAccountId' | 'fbCampaignId' | 'fbAdSetId' | 'fbAdId', r: PeriodRange) {
    const rows: any[] = await p(this.prisma).$queryRawUnsafe(
      `SELECT "${col}" AS key,
              COUNT(*)::int                        AS sales,
              COALESCE(SUM("amount"), 0)::float    AS revenue
       FROM "MarketingSale"
       WHERE "workspaceId" = $1 AND "occurredAt" >= $2 AND "occurredAt" <= $3 AND "${col}" IS NOT NULL
       GROUP BY "${col}"`,
      workspaceId, r.since, r.until,
    );
    return new Map<string, SalesAgg>(rows.map((x) => [String(x.key), { sales: Number(x.sales), revenue: Number(x.revenue) }]));
  }
}
