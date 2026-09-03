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
export interface MetaFeeSide { enabled: boolean; percent: number }
/**
 * Taxa Meta Ads. `br` incide no gasto de contas em BRL, `intl` no gasto das
 * demais (USD/EUR…). `enabled`/`percent` no topo = compat com o frontend antigo
 * (espelham o lado BR).
 */
export interface MetaFee {
  br: MetaFeeSide;
  intl: MetaFeeSide;
  enabled: boolean;
  percent: number;
}

const MAX_FEES = 30;
// Linhas reservadas em TrackingFee: taxa da Meta sobre o gasto de anúncio (~13%).
const META_FEE_KIND = 'meta_spend_br';        // contas em BRL
const META_FEE_KIND_INTL = 'meta_spend_intl'; // contas internacionais
const META_FEE_KINDS = [META_FEE_KIND, META_FEE_KIND_INTL];
const DEFAULT_META_PCT = 13;
const isBrl = (c: string | null | undefined) => (c || '').toUpperCase() === 'BRL';

/**
 * Visão Geral financeira do módulo Tracking.
 * Cruza as vendas DO SISTEMA (Payment via Lead.workspaceId) com o gasto de
 * anúncios já sincronizado da Meta (MetaInsightDaily). Nada é buscado na Meta aqui.
 */
@Injectable()
export class TrackingFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Taxa Meta Ads — % sobre o gasto de anúncio (lado BR = contas BRL, lado intl = demais). */
  async getMetaFee(workspaceId: string): Promise<MetaFee> {
    const rows = await p(this.prisma).trackingFee.findMany({ where: { workspaceId, kind: { in: META_FEE_KINDS } } });
    const pick = (kind: string): MetaFeeSide => {
      const row = rows.find((x: any) => x.kind === kind);
      return { enabled: !!row?.enabled, percent: row ? Number(row.value) : DEFAULT_META_PCT };
    };
    const br = pick(META_FEE_KIND);
    const intl = pick(META_FEE_KIND_INTL);
    return { br, intl, enabled: br.enabled, percent: br.percent };
  }

  private async upsertMetaSide(
    workspaceId: string, kind: string, name: string,
    dto: { enabled?: boolean; percent?: number } | undefined,
  ) {
    if (!dto) return;
    const existing = await p(this.prisma).trackingFee.findFirst({ where: { workspaceId, kind } });
    const percent = dto.percent === undefined
      ? (existing ? Number(existing.value) : DEFAULT_META_PCT)
      : Math.max(0, Math.min(100, Number(String(dto.percent).replace(',', '.')) || 0));
    const enabled = dto.enabled === undefined ? (existing?.enabled ?? false) : !!dto.enabled;
    if (existing) {
      await p(this.prisma).trackingFee.update({ where: { id: existing.id }, data: { enabled, value: percent, name } });
    } else {
      await p(this.prisma).trackingFee.create({
        data: { workspaceId, kind, name, value: percent, enabled, sortOrder: 999 },
      });
    }
  }

  async setMetaFee(
    workspaceId: string,
    dto: {
      enabled?: boolean; percent?: number; // compat: mapeia pro lado BR
      br?: { enabled?: boolean; percent?: number };
      intl?: { enabled?: boolean; percent?: number };
    },
  ): Promise<MetaFee> {
    const brDto = dto.br ?? (dto.enabled !== undefined || dto.percent !== undefined
      ? { enabled: dto.enabled, percent: dto.percent } : undefined);
    await this.upsertMetaSide(workspaceId, META_FEE_KIND, 'Taxa Meta Ads (Brasil)', brDto);
    await this.upsertMetaSide(workspaceId, META_FEE_KIND_INTL, 'Taxa Meta Ads (Internacional)', dto.intl);
    return this.getMetaFee(workspaceId);
  }

  /** Lista de taxas do workspace (ordenada). Faz o seed lazy do singleton antigo. */
  async getFees(workspaceId: string): Promise<Fee[]> {
    let rows = await p(this.prisma).trackingFee.findMany({
      where: { workspaceId, kind: { notIn: META_FEE_KINDS } },
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
          where: { workspaceId, kind: { notIn: META_FEE_KINDS } },
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
      p(this.prisma).trackingFee.deleteMany({ where: { workspaceId, kind: { notIn: META_FEE_KINDS } } }),
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

  /**
   * Funil de conversão da operação (todos os leads/vendas do workspace, não só
   * os atribuídos ao FB). Topo = cliques nos anúncios (100%); cada etapa mostra
   * o % em relação ao topo.
   */
  async funnel(workspaceId: string, r: PeriodRange) {
    const [clicksRow] = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT COALESCE(SUM("clicks"), 0)::int AS n
      FROM "MetaInsightDaily"
      WHERE "workspaceId" = ${workspaceId} AND "date" >= ${r.sinceDate} AND "date" <= ${r.untilDate}
    `;
    // Page view = clique no redirecionador (landing). Lê só do banco, nada é
    // alterado no redirecionador. Exclui destination='blocked' (bot/cloaker).
    const [pageviewRow] = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT COUNT(*)::int AS n
      FROM "RedirectorClick" rc
      JOIN "Redirector" rd ON rd."id" = rc."redirectorId"
      WHERE rd."workspaceId" = ${workspaceId}
        AND rc."createdAt" >= ${r.since} AND rc."createdAt" <= ${r.until}
        AND rc."destination" <> 'blocked'
    `;
    const [startsRow] = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT COUNT(*)::int AS n FROM "Lead"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${r.since} AND "createdAt" <= ${r.until}
    `;
    const [genRow] = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT COUNT(*)::int AS n
      FROM "Payment" pmt JOIN "Lead" l ON l."id" = pmt."leadId"
      WHERE l."workspaceId" = ${workspaceId} AND pmt."createdAt" >= ${r.since} AND pmt."createdAt" <= ${r.until}
    `;
    const [apprRow] = await p(this.prisma).$queryRaw<Array<any>>`
      SELECT COUNT(*)::int AS n
      FROM "Payment" pmt JOIN "Lead" l ON l."id" = pmt."leadId"
      WHERE l."workspaceId" = ${workspaceId} AND pmt."status" = 'APPROVED'
        AND pmt."paidAt" >= ${r.since} AND pmt."paidAt" <= ${r.until}
    `;

    const clicks = num(clicksRow?.n);
    const pageview = num(pageviewRow?.n);
    const starts = num(startsRow?.n);
    const generated = num(genRow?.n);
    const approved = num(apprRow?.n);
    const top = clicks || pageview || starts || 0; // sem Meta conectada → ancora no page view / starts
    const pctOf = (v: number) => (top > 0 ? v / top : 0);

    return {
      top,
      stages: [
        { key: 'clicks', label: 'Cliques nos anúncios', count: clicks, pct: pctOf(clicks) },
        { key: 'pageview', label: 'Page view', count: pageview, pct: pctOf(pageview) },
        { key: 'starts', label: 'Starts no bot', count: starts, pct: pctOf(starts) },
        { key: 'generated', label: 'Vendas geradas', count: generated, pct: pctOf(generated) },
        { key: 'approved', label: 'Vendas aprovadas', count: approved, pct: pctOf(approved) },
      ],
    };
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
    const metaFeeCfg = await this.getMetaFee(workspaceId);
    const brFrac = metaFeeCfg.br.enabled ? metaFeeCfg.br.percent / 100 : 0;
    const intlFrac = metaFeeCfg.intl.enabled ? metaFeeCfg.intl.percent / 100 : 0;
    const funnel = await this.funnel(workspaceId, r);

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
    const brByAcct = new Map<string, boolean>(accts.map((a) => [a.fbAdAccountId, isBrl(a.currency)]));
    const fx = (id: string) => fxByAcct.get(id) ?? 1;
    // taxa Meta: contas BRL usam o % do lado BR; demais, o % do lado internacional
    const metaFeeFor = (id: string, spendBrl: number) => spendBrl * (brByAcct.get(id) ? brFrac : intlFrac);

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
    const metaAdsFee = spendRows.reduce(
      (t: number, x: any) => t + metaFeeFor(String(x.acct), num(x.spend) * fx(String(x.acct))), 0,
    );
    const taxes = gross * pctFrac + salesCount * totalFixed;
    const net = gross - taxes - refunds;
    const profit = net - adSpend - metaAdsFee;

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
    const metaFeeByDay = new Map<string, number>();
    { const m = new Map<string, number>();
      for (const x of spendByDayRaw) {
        const spendBrl = num(x.spend) * fx(String(x.acct));
        m.set(String(x.d), (m.get(String(x.d)) ?? 0) + spendBrl);
        const mf = metaFeeFor(String(x.acct), spendBrl);
        if (mf) metaFeeByDay.set(String(x.d), (metaFeeByDay.get(String(x.d)) ?? 0) + mf);
      }
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
      const dayMetaFee = metaFeeByDay.get(d) ?? 0;
      const dayTax = dayGross * pctFrac + dayCnt * totalFixed;
      const dayNet = dayGross - dayTax - dayRef;
      return { date: d, gross: dayGross, net: dayNet, profit: dayNet - daySpend - dayMetaFee, adSpend: daySpend, metaFee: dayMetaFee };
    });

    return {
      currency: 'BRL',
      fees: { list: fees, totalPercent, totalFixed },
      metaFee: { ...metaFeeCfg, amount: metaAdsFee },
      funnel,
      cards: {
        grossRevenue: gross,
        netRevenue: net,
        profit,
        adSpend,
        metaAdsFee,
        taxes,
        refunds,
        sales: salesCount,
        pendingSales: num(agg?.pending_count),
        pendingAmount: num(agg?.pending_amount),
        cancelledSales: num(agg?.cancelled_count),
        refundedSales: num(agg?.refunded_count),
        avgTicket: safeDiv(gross, salesCount),
        roas: safeDiv(gross, adSpend + metaAdsFee),
      },
      series,
    };
  }
}
