import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { PeriodRange } from './marketing-metrics.service';

const p = (prisma: PrismaService) => prisma as any;
const num = (v: any) => (v == null ? 0 : Number(v));
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

export interface FeeConfig { percentFee: number; fixedFee: number }

/**
 * Visão Geral financeira do módulo Tracking (Fase 2a).
 * Cruza as vendas DO SISTEMA (Payment via Lead.workspaceId) com o gasto de
 * anúncios já sincronizado da Meta (MetaInsightDaily). Nada é buscado na Meta aqui.
 */
@Injectable()
export class TrackingFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getFees(workspaceId: string): Promise<FeeConfig> {
    const row = await p(this.prisma).trackingFeeConfig.findUnique({ where: { workspaceId } });
    return {
      percentFee: row ? Number(row.percentFee) : 0,
      fixedFee: row ? Number(row.fixedFee) : 0,
    };
  }

  async setFees(workspaceId: string, dto: { percentFee?: number; fixedFee?: number }): Promise<FeeConfig> {
    const percentFee = Math.max(0, Math.min(100, Number(dto.percentFee ?? 0)));
    const fixedFee = Math.max(0, Number(dto.fixedFee ?? 0));
    await p(this.prisma).trackingFeeConfig.upsert({
      where: { workspaceId },
      create: { workspaceId, percentFee, fixedFee },
      update: { percentFee, fixedFee },
    });
    return { percentFee, fixedFee };
  }

  async overview(workspaceId: string, r: PeriodRange) {
    const fees = await this.getFees(workspaceId);
    const pct = fees.percentFee / 100;

    // ── totais do período ──────────────────────────────────────────────────
    const [agg] = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT
        COUNT(*) FILTER (WHERE p."status" = 'APPROVED' AND p."paidAt"    >= ${r.since} AND p."paidAt"    <= ${r.until})::int  AS sales_count,
        COALESCE(SUM(p."amount") FILTER (WHERE p."status" = 'APPROVED' AND p."paidAt" >= ${r.since} AND p."paidAt" <= ${r.until}), 0)::float AS gross,
        COUNT(*) FILTER (WHERE p."status" = 'PENDING'  AND p."createdAt" >= ${r.since} AND p."createdAt" <= ${r.until})::int  AS pending_count,
        COALESCE(SUM(p."amount") FILTER (WHERE p."status" = 'PENDING' AND p."createdAt" >= ${r.since} AND p."createdAt" <= ${r.until}), 0)::float AS pending_amount,
        COUNT(*) FILTER (WHERE p."status" = 'REFUNDED' AND p."updatedAt" >= ${r.since} AND p."updatedAt" <= ${r.until})::int  AS refunded_count,
        COALESCE(SUM(p."amount") FILTER (WHERE p."status" = 'REFUNDED' AND p."updatedAt" >= ${r.since} AND p."updatedAt" <= ${r.until}), 0)::float AS refunded_amount,
        COUNT(*) FILTER (WHERE p."status" IN ('CANCELLED','EXPIRED') AND p."updatedAt" >= ${r.since} AND p."updatedAt" <= ${r.until})::int AS cancelled_count
      FROM "Payment" p
      JOIN "Lead" l ON l."id" = p."leadId"
      WHERE l."workspaceId" = ${workspaceId}
    `;

    const [spendRow] = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT COALESCE(SUM("spend"), 0)::float AS ad_spend
      FROM "MetaInsightDaily"
      WHERE "workspaceId" = ${workspaceId} AND "date" >= ${r.since} AND "date" <= ${r.until}
    `;

    const salesCount   = num(agg?.sales_count);
    const gross        = num(agg?.gross);
    const refunds      = num(agg?.refunded_amount);
    const adSpend      = num(spendRow?.ad_spend);
    const taxes        = gross * pct + salesCount * fees.fixedFee;
    const net          = gross - taxes - refunds;
    const profit       = net - adSpend;

    // ── série diária ───────────────────────────────────────────────────────
    const salesByDay = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT to_char(date_trunc('day', p."paidAt"), 'YYYY-MM-DD') AS d,
             COALESCE(SUM(p."amount"), 0)::float AS gross,
             COUNT(*)::int AS cnt
      FROM "Payment" p JOIN "Lead" l ON l."id" = p."leadId"
      WHERE l."workspaceId" = ${workspaceId} AND p."status" = 'APPROVED'
        AND p."paidAt" >= ${r.since} AND p."paidAt" <= ${r.until}
      GROUP BY 1 ORDER BY 1
    `;
    const refundsByDay = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT to_char(date_trunc('day', p."updatedAt"), 'YYYY-MM-DD') AS d,
             COALESCE(SUM(p."amount"), 0)::float AS refunded
      FROM "Payment" p JOIN "Lead" l ON l."id" = p."leadId"
      WHERE l."workspaceId" = ${workspaceId} AND p."status" = 'REFUNDED'
        AND p."updatedAt" >= ${r.since} AND p."updatedAt" <= ${r.until}
      GROUP BY 1
    `;
    const spendByDay = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT to_char("date", 'YYYY-MM-DD') AS d, COALESCE(SUM("spend"), 0)::float AS spend
      FROM "MetaInsightDaily"
      WHERE "workspaceId" = ${workspaceId} AND "date" >= ${r.since} AND "date" <= ${r.until}
      GROUP BY 1
    `;

    const refByDay = new Map<string, number>(refundsByDay.map((x: any): [string, number] => [String(x.d), num(x.refunded)]));
    const spByDay  = new Map<string, number>(spendByDay.map((x: any): [string, number] => [String(x.d), num(x.spend)]));
    const days = new Set<string>([
      ...salesByDay.map((x: any) => x.d),
      ...refundsByDay.map((x: any) => x.d),
      ...spendByDay.map((x: any) => x.d),
    ]);
    const salesMap = new Map(salesByDay.map((x: any) => [x.d, x]));

    const series = [...days].sort().map((d) => {
      const s = salesMap.get(d) as any;
      const dayGross = s ? num(s.gross) : 0;
      const dayCnt   = s ? num(s.cnt) : 0;
      const dayRef   = refByDay.get(d) ?? 0;
      const daySpend = spByDay.get(d) ?? 0;
      const dayTax   = dayGross * pct + dayCnt * fees.fixedFee;
      const dayNet   = dayGross - dayTax - dayRef;
      return {
        date: d,
        gross: dayGross,
        net: dayNet,
        profit: dayNet - daySpend,
        adSpend: daySpend,
      };
    });

    return {
      currency: 'BRL',
      fees,
      cards: {
        grossRevenue: gross,
        netRevenue: net,
        profit,
        adSpend,
        taxes,
        refunds,
        sales: salesCount,
        pendingSales: num(agg?.pending_count),
        pendingAmount: num(agg?.pending_amount),
        cancelledSales: num(agg?.cancelled_count),
        refundedSales: num(agg?.refunded_count),
        avgTicket: safeDiv(gross, salesCount),
        roas: safeDiv(gross, adSpend),
      },
      series,
    };
  }
}
