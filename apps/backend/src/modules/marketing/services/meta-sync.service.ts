import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { decrypt } from '../../../common/utils/encryption';
import { MetaAdsService } from '../integrations/meta/meta-ads.service';
import { MetaTokenError } from '../integrations/meta/meta-graph.client';
import { MKT_INSIGHTS_LOOKBACK_DAYS } from '../marketing.constants';

const p = (prisma: PrismaService) => prisma as any;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Persistência do espelho local da Meta. Chamado pelo processor (ciclo) e pelo
 * "kick" imediato após o usuário escolher a ad account.
 */
@Injectable()
export class MetaSyncService {
  private readonly logger = new Logger(MetaSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaAds: MetaAdsService,
  ) {}

  private async loadAccount(adAccountId: string) {
    const acc = await p(this.prisma).metaAdAccount.findUnique({
      where: { id: adAccountId },
      include: { connection: true },
    });
    if (!acc) return null;
    if (acc.connection?.status !== 'active') return null;
    let token: string;
    try { token = decrypt(acc.connection.accessToken); } catch { return null; }
    return { acc, token, connectionId: acc.connection.id };
  }

  private async onTokenError(connectionId: string, msg: string) {
    await p(this.prisma).metaConnection.update({
      where: { id: connectionId },
      data: { status: 'expired', lastError: msg?.slice(0, 500) ?? 'token inválido' },
    }).catch(() => {});
  }

  /** Campanhas + adsets + ads → upsert por @@unique. */
  async syncStructure(adAccountId: string): Promise<{ campaigns: number; adSets: number; ads: number } | null> {
    const loaded = await this.loadAccount(adAccountId);
    if (!loaded) return null;
    const { acc, token, connectionId } = loaded;
    const HARD_LIMIT = 5000;
    const syncStart = new Date();

    try {
      const [campaigns, adSets, ads] = await Promise.all([
        this.metaAds.getCampaigns(acc.fbAdAccountId, token),
        this.metaAds.getAdSets(acc.fbAdAccountId, token),
        this.metaAds.getAds(acc.fbAdAccountId, token),
      ]);

      const campByFb = new Map<string, string>(); // fbCampaignId -> local id
      for (const c of campaigns) {
        const row = await p(this.prisma).metaCampaign.upsert({
          where: { adAccountId_fbCampaignId: { adAccountId, fbCampaignId: c.fbCampaignId } },
          create: { adAccountId, ...c, syncedAt: syncStart },
          update: { ...c, syncedAt: syncStart },
        });
        campByFb.set(c.fbCampaignId, row.id);
      }

      const adSetByFb = new Map<string, string>();
      for (const s of adSets) {
        const campaignLocalId = campByFb.get(s.fbCampaignId);
        if (!campaignLocalId) continue; // adset órfão (campanha filtrada) — ignora
        const { fbCampaignId, ...rest } = s;
        const row = await p(this.prisma).metaAdSet.upsert({
          where: { campaignId_fbAdSetId: { campaignId: campaignLocalId, fbAdSetId: s.fbAdSetId } },
          create: { campaignId: campaignLocalId, ...rest, syncedAt: syncStart },
          update: { ...rest, syncedAt: syncStart },
        });
        adSetByFb.set(s.fbAdSetId, row.id);
      }

      for (const a of ads) {
        const adSetLocalId = adSetByFb.get(a.fbAdSetId);
        if (!adSetLocalId) continue;
        const { fbAdSetId, ...rest } = a;
        await p(this.prisma).metaAd.upsert({
          where: { adSetId_fbAdId: { adSetId: adSetLocalId, fbAdId: a.fbAdId } },
          create: { adSetId: adSetLocalId, ...rest, syncedAt: syncStart },
          update: { ...rest, syncedAt: syncStart },
        });
      }

      // Objetos que a Meta não devolveu mais neste ciclo = arquivados/excluídos
      // no Facebook. Sem isso o status local congelava no último visto ("PAUSED"
      // eternamente). Só marca se o fetch não truncou no hardLimit.
      if (campaigns.length < HARD_LIMIT) {
        await p(this.prisma).metaCampaign.updateMany({
          where: { adAccountId, syncedAt: { lt: syncStart }, effectiveStatus: { not: 'ARCHIVED' } },
          data: { status: 'ARCHIVED', effectiveStatus: 'ARCHIVED', syncedAt: syncStart },
        });
      }
      if (adSets.length < HARD_LIMIT) {
        await p(this.prisma).metaAdSet.updateMany({
          where: { campaign: { adAccountId }, syncedAt: { lt: syncStart }, effectiveStatus: { not: 'ARCHIVED' } },
          data: { status: 'ARCHIVED', effectiveStatus: 'ARCHIVED', syncedAt: syncStart },
        });
      }
      if (ads.length < HARD_LIMIT) {
        await p(this.prisma).metaAd.updateMany({
          where: { adSet: { campaign: { adAccountId } }, syncedAt: { lt: syncStart }, effectiveStatus: { not: 'ARCHIVED' } },
          data: { status: 'ARCHIVED', effectiveStatus: 'ARCHIVED', syncedAt: syncStart },
        });
      }

      // status/nome da própria conta (pega restrição de pagamento, desativação etc.)
      try {
        const info = await this.metaAds.getAdAccount(acc.fbAdAccountId, token);
        await p(this.prisma).metaAdAccount.update({
          where: { id: adAccountId },
          data: {
            status: info.status || acc.status,
            name: info.name ?? acc.name,
            currency: info.currency ?? acc.currency,
            lastSyncedAt: new Date(),
          },
        });
      } catch {
        await p(this.prisma).metaAdAccount.update({ where: { id: adAccountId }, data: { lastSyncedAt: new Date() } });
      }
      return { campaigns: campaigns.length, adSets: adSets.length, ads: ads.length };
    } catch (err: any) {
      if (err instanceof MetaTokenError) { await this.onTokenError(connectionId, err.message); return null; }
      throw err;
    }
  }

  /** Insights dos últimos N dias → upsert MetaInsightDaily por (fbAdId, date). */
  async syncInsights(adAccountId: string): Promise<{ rows: number } | null> {
    const loaded = await this.loadAccount(adAccountId);
    if (!loaded) return null;
    const { acc, token, connectionId } = loaded;

    const until = new Date();
    const since = new Date(Date.now() - MKT_INSIGHTS_LOOKBACK_DAYS * 24 * 3600 * 1000);

    try {
      const rows = await this.metaAds.getInsights(acc.fbAdAccountId, token, ymd(since), ymd(until));
      for (const r of rows) {
        const date = new Date(`${r.date}T00:00:00.000Z`);
        await p(this.prisma).metaInsightDaily.upsert({
          where: { fbAdId_date: { fbAdId: r.fbAdId, date } },
          create: {
            workspaceId: acc.workspaceId,
            fbAdAccountId: acc.fbAdAccountId,
            fbCampaignId: r.fbCampaignId,
            fbAdSetId: r.fbAdSetId,
            fbAdId: r.fbAdId,
            date,
            spend: r.spend, impressions: r.impressions, reach: r.reach,
            clicks: r.clicks, linkClicks: r.linkClicks,
          },
          update: {
            fbCampaignId: r.fbCampaignId, fbAdSetId: r.fbAdSetId,
            spend: r.spend, impressions: r.impressions, reach: r.reach,
            clicks: r.clicks, linkClicks: r.linkClicks,
          },
        });
      }
      await p(this.prisma).metaAdAccount.update({ where: { id: adAccountId }, data: { lastInsightsAt: new Date() } });
      return { rows: rows.length };
    } catch (err: any) {
      if (err instanceof MetaTokenError) { await this.onTokenError(connectionId, err.message); return null; }
      throw err;
    }
  }
}
