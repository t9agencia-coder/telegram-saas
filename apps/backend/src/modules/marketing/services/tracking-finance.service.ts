import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { PeriodRange } from './marketing-metrics.service';
import { brlPerUnit } from '../integrations/meta/fx';

const p = (prisma: PrismaService) => prisma as any;
const num = (v: any) => (v == null ? 0 : Number(v));
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

export type FeeKind = 'percent' | 'fixed';
export interface Fee {
  id?: string;
  name: string;
  kind: FeeKind;
  value: number;
  enabled: boolean;
}

const MAX_FEES = 30;

/**
 * Visão Geral financeira do módulo Tracking.
 * Cruza as vendas DO SISTEMA (Payment via Lead.workspaceId) com o gasto de
 * anúncios já sincronizado da Meta (MetaInsightDaily). Nada é buscado na Meta aqui.
 */
@Injectable()
export class TrackingFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista de taxas do workspace (ordenada). Faz o seed lazy do singleton antigo. */
  async getFees(workspaceId: string): Promise<Fee[]> {
    let rows = await p(this.prisma).trackingFee.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (rows.length === 0) {
      const legacy = await p(this.prisma).trackingFeeConfig.findUnique({ where: { workspaceId } });
      const seed: any[] = [];
      if (legacy && Number(legacy.percentFee) > 0) {
        seed.push({ workspaceId, name: 'Taxa da adquirente', kind: 'percent', value: Number(legacy.percentFee), sortOrder: 0 });
      }
      if (legacy && Number(legacy.fixedFee) > 0) {
        seed.push({ workspaceId, name: 'Taxa fixa por venda', kind: 'fixed', value: Number(legacy.fixedFee), sortOrder: 1 });
      }
      if (seed.length) {
        await p(this.prisma).trackingFee.createMany({ data: seed });
        rows = await p(this.prisma).trackingFee.findMany({
          where: { workspaceId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
      }
    }

    return rows.map((r: any): Fee => ({
      id: r.id,
      name: r.name,
      kind: r.kind === 'fixed' ? 'fixed' : 'percent',
      value: Number(r.value),
      enabled: r.enabled,
    }));
  }

  /** Substitui a lista inteira (form com "salvar"). */
  async saveFees(workspaceId: string, list: Fee[]): Promise<Fee[]> {
    const clean = (Array.isArray(list) ? list : []).slice(0, MAX_FEES).map((f, i) => {
      const kind: FeeKind = f.kind === 'fixed' ? 'fixed' : 'percent';
      let value = Math.max(0, Number(String(f.value ?? 0).replace(',', '.')) || 0);
      if (kind === 'percent') value = Math.min(100, value);
      return {
        workspaceId,
        name: (f.name || '').trim().slice(0, 80) || (kind === 'percent' ? 'Taxa (%)' : 'Taxa fixa'),
        kind,
        value,
        enabled: f.enabled !== false,
        sortOrder: i,
      };
    });

    await p(this.prisma).$transaction([
      p(this.prisma).trackingFee.deleteMany({ where: { workspaceId } }),
      ...(clean.length ? [p(this.prisma).trackingFee.createMany({ data: clean })] : []),
    ]);

    return this.getFees(workspaceId);
  }

  /** compat: shim do endpoint antigo POST /fees {percentFee, fixedFee}. */
  async setLegacyFees(workspaceId: string, dto: { percentFee?: number; fixedFee?: number }): Promise<Fee[]> {
    const percentFee = Math.max(0, Math.min(100, Number(dto.percentFee ?? 0)));
    const fixedFee = Math.max(0, Number(dto.fixedFee ?? 0));
    const list: Fee[] = [];
    if (percentFee > 0) list.push({ name: 'Taxa da adquirente', kind: 'percent', value: percentFee, enabled: true });
    if (fixedFee > 0) list.push({ name: 'Taxa fixa por venda', kind: 'fixed', value: fixedFee, enabled: true });
    return this.saveFees(workspaceId, list);
  }

  private feeTotals(fees: Fee[]) {
    let percent = 0;
    let fixed = 0;
    for (const f of fees) {
      if (!f.enabled) continue;
      if (f.kind === 'percent') percent += f.value;
      else fixed += f.value;
    }
    return { percent, fixed, pctFrac: percent / 100 };
  }

  async overview(workspaceId: string, r: PeriodRange) {
    const fees = await this.getFees(workspaceId);
    const { percent: totalPercent, fixed: totalFixed, pctFrac } = this.feeTotals(fees);

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

    // Gasto vem na moeda de cada conta → converte tudo pra BRL.
    const accts: Array<{ fbAdAccountId: string; currency: string | null }> =
      await p(this.prisma).metaAdAccount.findMany({ where: { workspaceId }, select: { fbAdAccountId: true, currency: true } });
    const fxByAcct = new Map<string, number>(accts.map((a) => [a.fbAdAccountId, brlPerUnit(a.currency)]));
    const fx = (id: string) => fxByAcct.get(id) ?? 1;

    const spendRows = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT "fbAdAccountId" AS acct, COALESCE(SUM("spend"), 0)::float AS spend
      FROM "MetaInsightDaily"
      WHERE "workspaceId" = ${workspaceId} AND "date" >= ${r.sinceDate} AND "date" <= ${r.untilDate}
      GROUP BY 1
    `;

    const salesCount = num(agg?.sales_count);
    const gross = num(agg?.gross);
    const refunds = num(agg?.refunded_amount);
    const adSpend = spendRows.reduce((t: number, x: any) => t + num(x.spend) * fx(String(x.acct)), 0);
    const taxes = gross * pctFrac + salesCount * totalFixed;
    const net = gross - taxes - refunds;
    const profit = net - adSpend;

    // ── série diária ───────────────────────────────────────────────────────
    const salesByDay = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT to_char(date_trunc('day', p."paidAt" AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS d,
             COALESCE(SUM(p."amount"), 0)::float AS gross,
             COUNT(*)::int AS cnt
      FROM "Payment" p JOIN "Lead" l ON l."id" = p."leadId"
      WHERE l."workspaceId" = ${workspaceId} AND p."status" = 'APPROVED'
        AND p."paidAt" >= ${r.since} AND p."paidAt" <= ${r.until}
      GROUP BY 1 ORDER BY 1
    `;
    const refundsByDay = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT to_char(date_trunc('day', p."updatedAt" AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS d,
             COALESCE(SUM(p."amount"), 0)::float AS refunded
      FROM "Payment" p JOIN "Lead" l ON l."id" = p."leadId"
      WHERE l."workspaceId" = ${workspaceId} AND p."status" = 'REFUNDED'
        AND p."updatedAt" >= ${r.since} AND p."updatedAt" <= ${r.until}
      GROUP BY 1
    `;
    const spendByDayRaw = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT to_char("date", 'YYYY-MM-DD') AS d, "fbAdAccountId" AS acct, COALESCE(SUM("spend"), 0)::float AS spend
      FROM "MetaInsightDaily"
      WHERE "workspaceId" = ${workspaceId} AND "date" >= ${r.sinceDate} AND "date" <= ${r.untilDate}
      GROUP BY 1, 2
    `;
    const spendByDay: Array<{ d: string; spend: number }> = [];
    { const m = new Map<string, number>();
      for (const x of spendByDayRaw) m.set(String(x.d), (m.get(String(x.d)) ?? 0) + num(x.spend) * fx(String(x.acct)));
      for (const [d, spend] of m) spendByDay.push({ d, spend }); }

    const refByDay = new Map<string, number>(refundsByDay.map((x: any): [string, number] => [String(x.d), num(x.refunded)]));
    const spByDay = new Map<string, number>(spendByDay.map((x): [string, number] => [String(x.d), num(x.spend)]));
    const days = new Set<string>([
      ...salesByDay.map((x: any) => x.d),
      ...refundsByDay.map((x: any) => x.d),
      ...spendByDay.map((x: any) => x.d),
    ]);
    const salesMap = new Map(salesByDay.map((x: any) => [x.d, x]));

    const series = [...days].sort().map((d) => {
      const s = salesMap.get(d) as any;
      const dayGross = s ? num(s.gross) : 0;
      const dayCnt = s ? num(s.cnt) : 0;
      const dayRef = refByDay.get(d) ?? 0;
      const daySpend = spByDay.get(d) ?? 0;
      const dayTax = dayGross * pctFrac + dayCnt * totalFixed;
      const dayNet = dayGross - dayTax - dayRef;
      return { date: d, gross: dayGross, net: dayNet, profit: dayNet - daySpend, adSpend: daySpend };
    });

    return {
      currency: 'BRL',
      fees: { list: fees, totalPercent, totalFixed },
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
