import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { PeriodRange } from './marketing-metrics.service';
import { MarketingSalesService, SalesAgg } from './marketing-sales.service';
import { TrackingFinanceService } from './tracking-finance.service';
import { normAccountStatus } from '../integrations/meta/account-status';
import { brlPerUnit } from '../integrations/meta/fx';

const p = (prisma: PrismaService) => prisma as any;
const n = (v: any) => (v == null ? 0 : Number(v));
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

interface FeeTotals { pctFrac: number; fixed: number }

export type GridLevel = 'accounts' | 'campaigns' | 'adsets' | 'ads';
export type StatusFilter = 'any' | 'active' | 'paused' | 'with_issues';

const PAUSED_STATES = ['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'];
const ISSUE_STATES = ['DISAPPROVED', 'WITH_ISSUES', 'PENDING_REVIEW', 'PENDING_BILLING_INFO', 'AD_GROUP_PAUSED', 'IN_PROCESS'];

function matchStatus(row: { status: string | null; effectiveStatus: string | null }, f: StatusFilter): boolean {
  if (f === 'any') return true;
  const s = (row.effectiveStatus || row.status || '').toUpperCase();
  if (f === 'active') return s === 'ACTIVE';
  if (f === 'paused') return PAUSED_STATES.includes(s);
  return ISSUE_STATES.includes(s); // with_issues
}

/**
 * Grid drill-down Contas → Campanhas → Conjuntos → Criativos (estilo UTMify).
 * Colunas de gasto/impressões/cliques vêm de MetaInsightDaily (real, já sincronizado).
 * Colunas de receita (Vendas/Faturamento/Lucro/ROI/ROAS/Margem/CPA) = null até a
 * Fase 2b (atribuição venda→anúncio). O esqueleto já mostra tudo.
 */
@Injectable()
export class TrackingGridService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesSvc: MarketingSalesService,
    private readonly finance: TrackingFinanceService,
  ) {}

  private async activeAccounts(workspaceId: string) {
    return p(this.prisma).metaAdAccount.findMany({
      where: { workspaceId, isSelected: true }, orderBy: { name: 'asc' },
    });
  }

  private async feeTotals(workspaceId: string): Promise<FeeTotals> {
    const fees = await this.finance.getFees(workspaceId);
    let pct = 0;
    let fixed = 0;
    for (const f of fees) {
      if (!f.enabled) continue;
      if (f.kind === 'percent') pct += f.value;
      else fixed += f.value;
    }
    return { pctFrac: pct / 100, fixed };
  }

  /** o scan de vendas já rodou pelo menos uma vez? (decide entre 0 e "—") */
  private async salesReady(): Promise<boolean> {
    const st = await p(this.prisma).marketingScanState.findUnique({ where: { id: 'sales-scan' } });
    return !!st?.lastPaidAt;
  }

  /** agrega MetaInsightDaily por uma coluna fb (fbCampaignId | fbAdSetId | fbAdId | fbAdAccountId) */
  private async insightsBy(workspaceId: string, col: string, r: PeriodRange, extraWhere = '') {
    const rows: Array<any> = await p(this.prisma).$queryRawUnsafe(
      `SELECT "${col}" AS key,
              COALESCE(SUM("spend"),0)::float       AS spend,
              COALESCE(SUM("impressions"),0)::int   AS impressions,
              COALESCE(SUM("reach"),0)::int         AS reach,
              COALESCE(SUM("clicks"),0)::int        AS clicks,
              COALESCE(SUM("linkClicks"),0)::int    AS link_clicks
       FROM "MetaInsightDaily"
       WHERE "workspaceId" = $1 AND "date" >= $2 AND "date" <= $3 AND "${col}" IS NOT NULL ${extraWhere}
       GROUP BY "${col}"`,
      workspaceId, r.sinceDate, r.untilDate,
    );
    return new Map(rows.map((x: any) => [x.key, x]));
  }

  /**
   * `fx` = quantos BRL vale 1 unidade da moeda da conta. Todo o grid é exibido em
   * BRL: gasto/CPC/CPM/CPA/orçamento vêm da Meta na moeda da conta e são
   * convertidos aqui; faturamento/lucro já são BRL (vendas via PIX).
   */
  private metricsRow(base: any, m: any, s: SalesAgg | undefined, fees: FeeTotals, salesReady: boolean, fx = 1) {
    const spend = n(m?.spend) * fx;
    const impressions = n(m?.impressions);
    const clicks = n(m?.clicks);
    if (base.dailyBudget != null) base = { ...base, dailyBudget: base.dailyBudget * fx };
    if (base.lifetimeBudget != null) base = { ...base, lifetimeBudget: base.lifetimeBudget * fx };

    let sales: number | null = null;
    let revenue: number | null = null;
    let profit: number | null = null;
    let roi: number | null = null;
    let roas: number | null = null;
    let margin: number | null = null;
    let cpa: number | null = null;

    if (s || salesReady) {
      sales = s ? s.sales : 0;
      revenue = s ? s.revenue : 0;
      const taxes = revenue * fees.pctFrac + sales * fees.fixed;
      profit = revenue - taxes - spend;
      roas = div(revenue, spend);
      roi = div(profit, spend);
      margin = revenue > 0 ? profit / revenue : null;
      cpa = div(spend, sales);
    }

    return {
      ...base,
      spend,
      impressions,
      reach: n(m?.reach),
      clicks,
      linkClicks: n(m?.link_clicks),
      ctr: div(clicks, impressions),
      cpc: div(spend, clicks),
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      sales, revenue, profit, roi, roas, margin, cpa,
    };
  }

  async grid(
    workspaceId: string,
    level: GridLevel,
    parentId: string | undefined,
    r: PeriodRange,
    page = 0,
    status: StatusFilter = 'any',
  ) {
    const active: any[] = await this.activeAccounts(workspaceId);
    if (!active.length) return { connected: false, level, rows: [], breadcrumb: [], accounts: [] };
    const acc = active[0];
    const accountList = active.map((a) => ({ id: a.id, name: a.name || a.fbAdAccountId }));
    const [fees, ready] = await Promise.all([this.feeTotals(workspaceId), this.salesReady()]);

    if (level === 'accounts') {
      const accounts: any[] = active;
      const [byFb, salesFb] = await Promise.all([
        this.insightsBy(workspaceId, 'fbAdAccountId', r),
        this.salesSvc.salesBy(workspaceId, 'fbAdAccountId', r),
      ]);
      return {
        connected: true, level, breadcrumb: [], accounts: accountList,
        currency: 'BRL',
        rows: accounts.map((a) => this.metricsRow(
          { id: a.id, fbId: a.fbAdAccountId, name: a.name || a.fbAdAccountId, status: a.status, effectiveStatus: normAccountStatus(a.status), objective: null, dailyBudget: null, lifetimeBudget: null, hasChildren: true },
          byFb.get(a.fbAdAccountId), salesFb.get(a.fbAdAccountId), fees, ready, brlPerUnit(a.currency),
        )),
      };
    }

    if (level === 'campaigns') {
      // Sem conta-pai → campanhas de TODAS as contas ativas, misturadas.
      // Com conta-pai → só daquela conta.
      const account = parentId
        ? await p(this.prisma).metaAdAccount.findFirst({ where: { id: parentId, workspaceId } })
        : null;
      if (parentId && !account) return { connected: true, level, rows: [], breadcrumb: [], accounts: accountList };
      const accountIds = account ? [account.id] : active.map((a) => a.id);
      const acctById = new Map<string, any>(active.map((a) => [a.id, a]));

      const campaigns: any[] = await p(this.prisma).metaCampaign.findMany({
        where: { adAccountId: { in: accountIds } },
      });
      const [byFb, salesFb] = await Promise.all([
        this.insightsBy(workspaceId, 'fbCampaignId', r),
        this.salesSvc.salesBy(workspaceId, 'fbCampaignId', r),
      ]);

      let rows = campaigns.map((c) => {
        const owner = account || acctById.get(c.adAccountId);
        return {
          ...this.metricsRow(
            { id: c.id, fbId: c.fbCampaignId, name: c.name || c.fbCampaignId, status: c.status, effectiveStatus: c.effectiveStatus, objective: c.objective, dailyBudget: c.dailyBudget ? Number(c.dailyBudget) : null, lifetimeBudget: c.lifetimeBudget ? Number(c.lifetimeBudget) : null, hasChildren: true },
            byFb.get(c.fbCampaignId), salesFb.get(c.fbCampaignId), fees, ready, brlPerUnit(owner?.currency),
          ),
          accountName: account ? null : (owner?.name || owner?.fbAdAccountId || null),
        };
      });

      if (status !== 'any') rows = rows.filter((row: any) => matchStatus(row, status));

      // Mais vendas em cima; empate → maior gasto.
      rows.sort((a: any, b: any) => (b.sales ?? -1) - (a.sales ?? -1) || b.spend - a.spend);

      const PAGE_SIZE = 100;
      const total = rows.length;
      const pg = Math.max(0, Math.floor(page) || 0);
      rows = rows.slice(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE);

      return {
        connected: true, level, accounts: accountList,
        currency: 'BRL',
        breadcrumb: account ? [{ level: 'accounts', id: account.id, name: account.name || account.fbAdAccountId }] : [],
        rows,
        page: pg,
        pageSize: PAGE_SIZE,
        total,
        hasMore: (pg + 1) * PAGE_SIZE < total,
      };
    }

    if (level === 'adsets') {
      const campaign = await p(this.prisma).metaCampaign.findFirst({
        where: { id: parentId, adAccount: { workspaceId } }, include: { adAccount: true },
      });
      if (!campaign) return { connected: true, level, rows: [], breadcrumb: [], accounts: accountList };
      const adsets: any[] = await p(this.prisma).metaAdSet.findMany({
        where: { campaignId: campaign.id }, orderBy: { name: 'asc' },
      });
      const [byFb, salesFb] = await Promise.all([
        this.insightsBy(workspaceId, 'fbAdSetId', r),
        this.salesSvc.salesBy(workspaceId, 'fbAdSetId', r),
      ]);
      const fxAd = brlPerUnit(campaign.adAccount.currency);
      return {
        connected: true, level, accounts: accountList,
        currency: 'BRL',
        breadcrumb: [
          { level: 'accounts', id: campaign.adAccount.id, name: campaign.adAccount.name || campaign.adAccount.fbAdAccountId },
          { level: 'campaigns', id: campaign.id, name: campaign.name || campaign.fbCampaignId },
        ],
        rows: adsets.map((s) => this.metricsRow(
          { id: s.id, fbId: s.fbAdSetId, name: s.name || s.fbAdSetId, status: s.status, effectiveStatus: s.effectiveStatus, objective: null, dailyBudget: s.dailyBudget ? Number(s.dailyBudget) : null, lifetimeBudget: s.lifetimeBudget ? Number(s.lifetimeBudget) : null, hasChildren: true },
          byFb.get(s.fbAdSetId), salesFb.get(s.fbAdSetId), fees, ready, fxAd,
        )),
      };
    }

    // ads
    const adset = await p(this.prisma).metaAdSet.findFirst({
      where: { id: parentId, campaign: { adAccount: { workspaceId } } },
      include: { campaign: { include: { adAccount: true } } },
    });
    if (!adset) return { connected: true, level, rows: [], breadcrumb: [], accounts: accountList };
    const ads: any[] = await p(this.prisma).metaAd.findMany({ where: { adSetId: adset.id }, orderBy: { name: 'asc' } });
    const [byFb, salesFb] = await Promise.all([
      this.insightsBy(workspaceId, 'fbAdId', r),
      this.salesSvc.salesBy(workspaceId, 'fbAdId', r),
    ]);
    const fxAds = brlPerUnit(adset.campaign.adAccount.currency);
    return {
      connected: true, level, accounts: accountList,
      currency: 'BRL',
      breadcrumb: [
        { level: 'accounts', id: adset.campaign.adAccount.id, name: adset.campaign.adAccount.name || adset.campaign.adAccount.fbAdAccountId },
        { level: 'campaigns', id: adset.campaign.id, name: adset.campaign.name || adset.campaign.fbCampaignId },
        { level: 'adsets', id: adset.id, name: adset.name || adset.fbAdSetId },
      ],
      rows: ads.map((a) => this.metricsRow(
        { id: a.id, fbId: a.fbAdId, name: a.name || a.fbAdId, status: a.status, effectiveStatus: a.effectiveStatus, objective: null, dailyBudget: null, lifetimeBudget: null, hasChildren: false },
        byFb.get(a.fbAdId), salesFb.get(a.fbAdId), fees, ready, fxAds,
      )),
    };
  }
}
