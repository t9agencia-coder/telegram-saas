import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { PeriodRange } from './marketing-metrics.service';

const p = (prisma: PrismaService) => prisma as any;
const n = (v: any) => (v == null ? 0 : Number(v));
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export type GridLevel = 'accounts' | 'campaigns' | 'adsets' | 'ads';

/**
 * Grid drill-down Contas → Campanhas → Conjuntos → Criativos (estilo UTMify).
 * Colunas de gasto/impressões/cliques vêm de MetaInsightDaily (real, já sincronizado).
 * Colunas de receita (Vendas/Faturamento/Lucro/ROI/ROAS/Margem/CPA) = null até a
 * Fase 2b (atribuição venda→anúncio). O esqueleto já mostra tudo.
 */
@Injectable()
export class TrackingGridService {
  constructor(private readonly prisma: PrismaService) {}

  private async activeAccounts(workspaceId: string) {
    return p(this.prisma).metaAdAccount.findMany({
      where: { workspaceId, isSelected: true }, orderBy: { name: 'asc' },
    });
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
      workspaceId, r.since, r.until,
    );
    return new Map(rows.map((x: any) => [x.key, x]));
  }

  private metricsRow(base: any, m: any) {
    const spend = n(m?.spend);
    const impressions = n(m?.impressions);
    const clicks = n(m?.clicks);
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
      // Fase 2b — atribuição:
      sales: null as number | null,
      revenue: null as number | null,
      profit: null as number | null,
      roi: null as number | null,
      roas: null as number | null,
      margin: null as number | null,
      cpa: null as number | null,
    };
  }

  async grid(workspaceId: string, level: GridLevel, parentId: string | undefined, r: PeriodRange) {
    const active: any[] = await this.activeAccounts(workspaceId);
    if (!active.length) return { connected: false, level, rows: [], breadcrumb: [] };
    const acc = active[0];

    // Sem conta-pai e com mais de uma conta ativa → mostra a lista de contas.
    if (level === 'campaigns' && !parentId && active.length > 1) level = 'accounts';

    if (level === 'accounts') {
      const accounts: any[] = active;
      const byFb = await this.insightsBy(workspaceId, 'fbAdAccountId', r);
      return {
        connected: true, level, breadcrumb: [],
        currency: acc.currency ?? 'BRL',
        rows: accounts.map((a) => this.metricsRow(
          { id: a.id, fbId: a.fbAdAccountId, name: a.name || a.fbAdAccountId, status: a.status, effectiveStatus: null, objective: null, dailyBudget: null, lifetimeBudget: null, hasChildren: true },
          byFb.get(a.fbAdAccountId),
        )),
      };
    }

    if (level === 'campaigns') {
      const account = parentId
        ? await p(this.prisma).metaAdAccount.findFirst({ where: { id: parentId, workspaceId } })
        : acc;
      if (!account) return { connected: true, level, rows: [], breadcrumb: [] };
      const campaigns: any[] = await p(this.prisma).metaCampaign.findMany({
        where: { adAccountId: account.id }, orderBy: { name: 'asc' },
      });
      const byFb = await this.insightsBy(workspaceId, 'fbCampaignId', r);
      return {
        connected: true, level,
        currency: account.currency ?? 'BRL',
        breadcrumb: [{ level: 'accounts', id: account.id, name: account.name || account.fbAdAccountId }],
        rows: campaigns.map((c) => this.metricsRow(
          { id: c.id, fbId: c.fbCampaignId, name: c.name || c.fbCampaignId, status: c.status, effectiveStatus: c.effectiveStatus, objective: c.objective, dailyBudget: c.dailyBudget ? Number(c.dailyBudget) : null, lifetimeBudget: c.lifetimeBudget ? Number(c.lifetimeBudget) : null, hasChildren: true },
          byFb.get(c.fbCampaignId),
        )),
      };
    }

    if (level === 'adsets') {
      const campaign = await p(this.prisma).metaCampaign.findFirst({
        where: { id: parentId, adAccount: { workspaceId } }, include: { adAccount: true },
      });
      if (!campaign) return { connected: true, level, rows: [], breadcrumb: [] };
      const adsets: any[] = await p(this.prisma).metaAdSet.findMany({
        where: { campaignId: campaign.id }, orderBy: { name: 'asc' },
      });
      const byFb = await this.insightsBy(workspaceId, 'fbAdSetId', r);
      return {
        connected: true, level,
        currency: campaign.adAccount.currency ?? 'BRL',
        breadcrumb: [
          { level: 'accounts', id: campaign.adAccount.id, name: campaign.adAccount.name || campaign.adAccount.fbAdAccountId },
          { level: 'campaigns', id: campaign.id, name: campaign.name || campaign.fbCampaignId },
        ],
        rows: adsets.map((s) => this.metricsRow(
          { id: s.id, fbId: s.fbAdSetId, name: s.name || s.fbAdSetId, status: s.status, effectiveStatus: s.effectiveStatus, objective: null, dailyBudget: s.dailyBudget ? Number(s.dailyBudget) : null, lifetimeBudget: s.lifetimeBudget ? Number(s.lifetimeBudget) : null, hasChildren: true },
          byFb.get(s.fbAdSetId),
        )),
      };
    }

    // ads
    const adset = await p(this.prisma).metaAdSet.findFirst({
      where: { id: parentId, campaign: { adAccount: { workspaceId } } },
      include: { campaign: { include: { adAccount: true } } },
    });
    if (!adset) return { connected: true, level, rows: [], breadcrumb: [] };
    const ads: any[] = await p(this.prisma).metaAd.findMany({ where: { adSetId: adset.id }, orderBy: { name: 'asc' } });
    const byFb = await this.insightsBy(workspaceId, 'fbAdId', r);
    return {
      connected: true, level,
      currency: adset.campaign.adAccount.currency ?? 'BRL',
      breadcrumb: [
        { level: 'accounts', id: adset.campaign.adAccount.id, name: adset.campaign.adAccount.name || adset.campaign.adAccount.fbAdAccountId },
        { level: 'campaigns', id: adset.campaign.id, name: adset.campaign.name || adset.campaign.fbCampaignId },
        { level: 'adsets', id: adset.id, name: adset.name || adset.fbAdSetId },
      ],
      rows: ads.map((a) => this.metricsRow(
        { id: a.id, fbId: a.fbAdId, name: a.name || a.fbAdId, status: a.status, effectiveStatus: a.effectiveStatus, objective: null, dailyBudget: null, lifetimeBudget: null, hasChildren: false },
        byFb.get(a.fbAdId),
      )),
    };
  }
}
