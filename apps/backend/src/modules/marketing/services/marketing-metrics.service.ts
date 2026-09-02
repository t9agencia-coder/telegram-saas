import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { MarketingPeriod } from '../marketing.constants';

const p = (prisma: PrismaService) => prisma as any;

function safeDiv(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

export interface PeriodRange { since: Date; until: Date }

export function resolvePeriod(period: MarketingPeriod, from?: string, to?: string): PeriodRange {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const today = startOfDay(now);
  switch (period) {
    case 'today':      return { since: today, until: now };
    case 'yesterday':  { const y = new Date(today.getTime() - 86400000); return { since: y, until: today }; }
    case 'last7':      return { since: new Date(today.getTime() - 6 * 86400000), until: now };
    case 'last30':     return { since: new Date(today.getTime() - 29 * 86400000), until: now };
    case 'this_month': return { since: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), until: now };
    case 'prev_month': return {
      since: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
      until: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    };
    case 'custom':
      return {
        since: from ? new Date(from) : new Date(today.getTime() - 6 * 86400000),
        until: to ? new Date(to) : now,
      };
    default:           return { since: new Date(today.getTime() - 6 * 86400000), until: now };
  }
}

@Injectable()
export class MarketingMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  private async selectedAccount(workspaceId: string) {
    return p(this.prisma).metaAdAccount.findFirst({ where: { workspaceId, isSelected: true } });
  }

  /** Cards + série temporal da Visão Geral. Fase 1: lado do gasto + leads FB do workspace. */
  async overview(workspaceId: string, r: PeriodRange) {
    const acc = await this.selectedAccount(workspaceId);
    if (!acc) return { connected: false };

    const insights: Array<{ date: Date; spend: number; impressions: number; clicks: number; linkClicks: number }> =
      await p(this.prisma).$queryRaw`
        SELECT "date",
               COALESCE(SUM("spend"),0)::float       AS spend,
               COALESCE(SUM("impressions"),0)::int   AS impressions,
               COALESCE(SUM("clicks"),0)::int        AS clicks,
               COALESCE(SUM("linkClicks"),0)::int    AS "linkClicks"
        FROM "MetaInsightDaily"
        WHERE "workspaceId" = ${workspaceId}
          AND "date" >= ${r.since} AND "date" <= ${r.until}
        GROUP BY "date" ORDER BY "date" ASC`;

    const spend       = insights.reduce((s, x) => s + Number(x.spend), 0);
    const impressions = insights.reduce((s, x) => s + Number(x.impressions), 0);
    const clicks      = insights.reduce((s, x) => s + Number(x.clicks), 0);

    // Leads vindos do Facebook no período (workspace) — atribuição por campanha
    // exata chega na Fase 2. Aqui: Tracking.utmSource ~ 'FB'/'facebook'.
    const leadsRow: Array<{ n: number }> = await p(this.prisma).$queryRaw`
      SELECT COUNT(*)::int AS n
      FROM "Lead" l JOIN "Tracking" t ON t."leadId" = l."id"
      WHERE l."workspaceId" = ${workspaceId}
        AND l."createdAt" >= ${r.since} AND l."createdAt" <= ${r.until}
        AND (lower(t."utmSource") IN ('fb','facebook','meta','ig','instagram'))`;
    const leads = leadsRow[0]?.n ?? 0;

    return {
      connected: true,
      currency: acc.currency ?? 'BRL',
      lastSyncedAt: acc.lastSyncedAt,
      cards: {
        spend,
        impressions,
        clicks,
        leads,
        cpl: safeDiv(spend, leads),
        // Fase 2:
        revenue: null,
        sales: null,
        cpa: null,
        roas: null,
      },
      series: insights.map((x) => ({
        date: x.date,
        spend: Number(x.spend),
        clicks: Number(x.clicks),
        revenue: null,
        sales: null,
      })),
    };
  }

  /** Tabela por campanha. Fase 1: gasto/impressões/cliques/CTR/CPC. */
  async campaignTable(workspaceId: string, r: PeriodRange) {
    const acc = await this.selectedAccount(workspaceId);
    if (!acc) return { connected: false, campaigns: [] };

    const campaigns: any[] = await p(this.prisma).metaCampaign.findMany({
      where: { adAccountId: acc.id },
      orderBy: { name: 'asc' },
    });

    const agg: Array<{ fbCampaignId: string; spend: number; impressions: number; clicks: number }> =
      await p(this.prisma).$queryRaw`
        SELECT "fbCampaignId",
               COALESCE(SUM("spend"),0)::float     AS spend,
               COALESCE(SUM("impressions"),0)::int AS impressions,
               COALESCE(SUM("clicks"),0)::int      AS clicks
        FROM "MetaInsightDaily"
        WHERE "workspaceId" = ${workspaceId}
          AND "date" >= ${r.since} AND "date" <= ${r.until}
          AND "fbCampaignId" IS NOT NULL
        GROUP BY "fbCampaignId"`;
    const byFb = new Map(agg.map((a) => [a.fbCampaignId, a]));

    return {
      connected: true,
      currency: acc.currency ?? 'BRL',
      campaigns: campaigns.map((c) => {
        const m = byFb.get(c.fbCampaignId) ?? { spend: 0, impressions: 0, clicks: 0 };
        return {
          id: c.id,
          fbCampaignId: c.fbCampaignId,
          name: c.name,
          status: c.status,
          effectiveStatus: c.effectiveStatus,
          objective: c.objective,
          dailyBudget: c.dailyBudget ? Number(c.dailyBudget) : null,
          lifetimeBudget: c.lifetimeBudget ? Number(c.lifetimeBudget) : null,
          spend: Number(m.spend),
          impressions: Number(m.impressions),
          clicks: Number(m.clicks),
          ctr: safeDiv(Number(m.clicks), Number(m.impressions)),
          cpc: safeDiv(Number(m.spend), Number(m.clicks)),
          leads: null, revenue: null, sales: null, cpa: null, roas: null, // Fase 2
        };
      }),
    };
  }

  /** Detalhe de uma campanha: adsets + ads com métricas. */
  async campaignDetail(workspaceId: string, campaignLocalId: string, r: PeriodRange) {
    const acc = await this.selectedAccount(workspaceId);
    if (!acc) return { connected: false };
    const campaign = await p(this.prisma).metaCampaign.findFirst({
      where: { id: campaignLocalId, adAccountId: acc.id },
      include: { adSets: { include: { ads: true }, orderBy: { name: 'asc' } } },
    });
    if (!campaign) return { connected: true, notFound: true };

    const adAgg: Array<{ fbAdId: string; spend: number; impressions: number; clicks: number }> =
      await p(this.prisma).$queryRaw`
        SELECT "fbAdId",
               COALESCE(SUM("spend"),0)::float     AS spend,
               COALESCE(SUM("impressions"),0)::int AS impressions,
               COALESCE(SUM("clicks"),0)::int      AS clicks
        FROM "MetaInsightDaily"
        WHERE "workspaceId" = ${workspaceId} AND "fbCampaignId" = ${campaign.fbCampaignId}
          AND "date" >= ${r.since} AND "date" <= ${r.until}
        GROUP BY "fbAdId"`;
    const byAd = new Map(adAgg.map((a) => [a.fbAdId, a]));
    const sum = (ids: string[], k: 'spend' | 'impressions' | 'clicks') =>
      ids.reduce((s, id) => s + Number((byAd.get(id) as any)?.[k] ?? 0), 0);

    return {
      connected: true,
      currency: acc.currency ?? 'BRL',
      campaign: {
        id: campaign.id, fbCampaignId: campaign.fbCampaignId, name: campaign.name,
        status: campaign.status, effectiveStatus: campaign.effectiveStatus, objective: campaign.objective,
        dailyBudget: campaign.dailyBudget ? Number(campaign.dailyBudget) : null,
        lifetimeBudget: campaign.lifetimeBudget ? Number(campaign.lifetimeBudget) : null,
        spend: sum([...byAd.keys()], 'spend'),
      },
      adSets: campaign.adSets.map((s: any) => {
        const adIds = s.ads.map((a: any) => a.fbAdId);
        return {
          id: s.id, fbAdSetId: s.fbAdSetId, name: s.name, status: s.status, effectiveStatus: s.effectiveStatus,
          dailyBudget: s.dailyBudget ? Number(s.dailyBudget) : null,
          spend: sum(adIds, 'spend'), impressions: sum(adIds, 'impressions'), clicks: sum(adIds, 'clicks'),
          ads: s.ads.map((a: any) => {
            const m = byAd.get(a.fbAdId) ?? { spend: 0, impressions: 0, clicks: 0 };
            return {
              id: a.id, fbAdId: a.fbAdId, name: a.name, status: a.status, effectiveStatus: a.effectiveStatus,
              spend: Number(m.spend), impressions: Number(m.impressions), clicks: Number(m.clicks),
            };
          }),
        };
      }),
    };
  }
}
