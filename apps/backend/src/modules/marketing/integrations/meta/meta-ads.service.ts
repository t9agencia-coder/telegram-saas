import { Injectable } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';

/** Leitura pura da Meta Marketing API. Sem persistência (isso é do sync service). */
@Injectable()
export class MetaAdsService {
  constructor(private readonly graph: MetaGraphClient) {}

  /** Meta manda orçamento em centavos da moeda da conta, como string. */
  private money(v: any): number | null {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n / 100 : null;
  }

  async getAdAccounts(token: string) {
    const rows = await this.graph.getAll<any>('me/adaccounts', {
      fields: 'account_id,name,currency,timezone_name,account_status',
      access_token: token,
    });
    return rows.map((r) => ({
      fbAdAccountId: r.id || `act_${r.account_id}`,
      name: r.name ?? null,
      currency: r.currency ?? null,
      timezoneName: r.timezone_name ?? null,
      status: String(r.account_status ?? ''),
    }));
  }

  async getCampaigns(fbAdAccountId: string, token: string) {
    const rows = await this.graph.getAll<any>(`${fbAdAccountId}/campaigns`, {
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget',
      access_token: token,
    });
    return rows.map((r) => ({
      fbCampaignId: r.id,
      name: r.name ?? null,
      status: r.status ?? null,
      effectiveStatus: r.effective_status ?? null,
      objective: r.objective ?? null,
      dailyBudget: this.money(r.daily_budget),
      lifetimeBudget: this.money(r.lifetime_budget),
    }));
  }

  async getAdSets(fbAdAccountId: string, token: string) {
    const rows = await this.graph.getAll<any>(`${fbAdAccountId}/adsets`, {
      fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id',
      access_token: token,
    });
    return rows.map((r) => ({
      fbAdSetId: r.id,
      fbCampaignId: r.campaign_id,
      name: r.name ?? null,
      status: r.status ?? null,
      effectiveStatus: r.effective_status ?? null,
      dailyBudget: this.money(r.daily_budget),
      lifetimeBudget: this.money(r.lifetime_budget),
    }));
  }

  async getAds(fbAdAccountId: string, token: string) {
    const rows = await this.graph.getAll<any>(`${fbAdAccountId}/ads`, {
      fields: 'id,name,status,effective_status,adset_id',
      access_token: token,
    });
    return rows.map((r) => ({
      fbAdId: r.id,
      fbAdSetId: r.adset_id,
      name: r.name ?? null,
      status: r.status ?? null,
      effectiveStatus: r.effective_status ?? null,
    }));
  }

  /** Insights por anúncio e por dia. `since`/`until` = 'YYYY-MM-DD'. */
  async getInsights(fbAdAccountId: string, token: string, since: string, until: string) {
    const rows = await this.graph.getAll<any>(`${fbAdAccountId}/insights`, {
      level: 'ad',
      fields: 'ad_id,adset_id,campaign_id,spend,impressions,reach,clicks,inline_link_clicks',
      time_range: JSON.stringify({ since, until }),
      time_increment: 1,
      access_token: token,
    });
    return rows.map((r) => ({
      fbAdId: r.ad_id,
      fbAdSetId: r.adset_id ?? null,
      fbCampaignId: r.campaign_id ?? null,
      date: r.date_start as string, // 'YYYY-MM-DD'
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      reach: Number(r.reach ?? 0),
      clicks: Number(r.clicks ?? 0),
      linkClicks: Number(r.inline_link_clicks ?? 0),
    }));
  }
}
