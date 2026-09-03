import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { parseNameId, isMetaSource } from '../attribution/utm';

const p = (prisma: PrismaService) => prisma as any;

export interface Attribution {
  fbAdAccountId: string | null;
  fbCampaignId: string | null;
  fbAdSetId: string | null;
  fbAdId: string | null;
  source: 'utm_id' | 'utm_name' | 'none';
}

const NONE: Attribution = { fbAdAccountId: null, fbCampaignId: null, fbAdSetId: null, fbAdId: null, source: 'none' };

/**
 * Resolve de qual anúncio/conjunto/campanha veio um lead, lendo APENAS o que o
 * redirecionador já gravou (`Tracking` por leadId). Prioridade ad → adset →
 * campanha; se o id não bate com nada sincronizado, tenta por nome dentro do
 * workspace. 100% read-only.
 */
@Injectable()
export class MarketingAttributionService {
  private readonly logger = new Logger(MarketingAttributionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveForLead(workspaceId: string, leadId: string | null): Promise<Attribution> {
    if (!leadId) return NONE;
    const t = await p(this.prisma).tracking.findUnique({ where: { leadId } });
    if (!t) return NONE;

    const ad = parseNameId(t.utmContent);
    const adset = parseNameId(t.utmMedium);
    const camp = parseNameId(t.utmCampaign);

    // Nada que aponte pra Meta → não gasta query nas tabelas Meta*.
    const looksMeta = isMetaSource(t.utmSource) || !!(ad.raw || adset.raw || camp.raw) || !!t.fbclid;
    if (!looksMeta) return NONE;

    // ── por ID (utm_id) ────────────────────────────────────────────────────
    if (ad.id) {
      const row = await p(this.prisma).metaAd.findFirst({
        where: { fbAdId: ad.id, adSet: { campaign: { adAccount: { workspaceId } } } },
        include: { adSet: { include: { campaign: { include: { adAccount: true } } } } },
      });
      if (row) {
        return {
          fbAdId: row.fbAdId,
          fbAdSetId: row.adSet.fbAdSetId,
          fbCampaignId: row.adSet.campaign.fbCampaignId,
          fbAdAccountId: row.adSet.campaign.adAccount.fbAdAccountId,
          source: 'utm_id',
        };
      }
    }
    if (adset.id) {
      const row = await p(this.prisma).metaAdSet.findFirst({
        where: { fbAdSetId: adset.id, campaign: { adAccount: { workspaceId } } },
        include: { campaign: { include: { adAccount: true } } },
      });
      if (row) {
        return {
          fbAdId: null,
          fbAdSetId: row.fbAdSetId,
          fbCampaignId: row.campaign.fbCampaignId,
          fbAdAccountId: row.campaign.adAccount.fbAdAccountId,
          source: 'utm_id',
        };
      }
    }
    if (camp.id) {
      const row = await p(this.prisma).metaCampaign.findFirst({
        where: { fbCampaignId: camp.id, adAccount: { workspaceId } },
        include: { adAccount: true },
      });
      if (row) {
        return {
          fbAdId: null, fbAdSetId: null,
          fbCampaignId: row.fbCampaignId,
          fbAdAccountId: row.adAccount.fbAdAccountId,
          source: 'utm_id',
        };
      }
    }

    // ── fallback por NOME (utm_name) ───────────────────────────────────────
    const byName = async (name: string | null) => {
      if (!name) return null;
      return p(this.prisma).metaCampaign.findFirst({
        where: { adAccount: { workspaceId }, name: { equals: name, mode: 'insensitive' } },
        include: { adAccount: true },
      });
    };
    const campByName = await byName(camp.name);
    if (campByName) {
      return {
        fbAdId: null, fbAdSetId: null,
        fbCampaignId: campByName.fbCampaignId,
        fbAdAccountId: campByName.adAccount.fbAdAccountId,
        source: 'utm_name',
      };
    }

    return NONE;
  }
}
