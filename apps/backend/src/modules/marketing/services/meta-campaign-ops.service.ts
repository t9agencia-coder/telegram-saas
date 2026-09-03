import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { AuditLogService } from '../../../common/audit-log.service';
import { decrypt } from '../../../common/utils/encryption';
import { MetaAdsService } from '../integrations/meta/meta-ads.service';
import {
  MetaTokenError, MetaRateLimitError, MetaPermissionError, MetaApiError,
} from '../integrations/meta/meta-graph.client';

const p = (prisma: PrismaService) => prisma as any;

export interface CampaignUpdateDto {
  name?: string;
  dailyBudget?: number | null;   // R$ (não centavos)
  lifetimeBudget?: number | null;
}

/**
 * Fase 3 — gestão de campanha via Meta Graph (write). Chamado direto do request
 * (ação manual do usuário, 1 campanha por vez). Resolve o token da conexão da
 * conta dona da campanha, chama a Meta, atualiza o espelho local e audita.
 */
@Injectable()
export class MetaCampaignOpsService {
  private readonly logger = new Logger(MetaCampaignOpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaAds: MetaAdsService,
    private readonly audit: AuditLogService,
  ) {}

  private async resolve(workspaceId: string, campaignLocalId: string) {
    const c = await p(this.prisma).metaCampaign.findFirst({
      where: { id: campaignLocalId, adAccount: { workspaceId } },
      include: { adAccount: { include: { connection: true } } },
    });
    if (!c) throw new NotFoundException('Campanha não encontrada');
    const conn = c.adAccount?.connection;
    if (!conn || conn.status !== 'active') {
      throw new BadRequestException('Perfil do Facebook desconectado ou token expirado — reconecte em Integrações.');
    }
    let token: string;
    try { token = decrypt(conn.accessToken); } catch { throw new BadRequestException('Token da conexão inválido.'); }
    return { c, conn, token };
  }

  /** Traduz erro da Meta em algo que o frontend mostra; token → marca expired. */
  private async translate(err: any, connectionId: string): Promise<never> {
    if (err instanceof MetaTokenError) {
      await p(this.prisma).metaConnection.update({
        where: { id: connectionId },
        data: { status: 'expired', lastError: err.message?.slice(0, 500) },
      }).catch(() => {});
      throw new BadRequestException('Token do Facebook expirou — reconecte o perfil em Integrações.');
    }
    if (err instanceof MetaRateLimitError) throw new BadRequestException('A Meta está limitando as requisições agora. Tente de novo em alguns minutos.');
    if (err instanceof MetaPermissionError) throw new BadRequestException(`Sem permissão na Meta pra essa ação: ${err.message}`);
    if (err instanceof MetaApiError) throw new BadRequestException(err.message || 'A Meta rejeitou a alteração.');
    throw err;
  }

  async setStatus(workspaceId: string, campaignLocalId: string, active: boolean, userId: string) {
    const { c, conn, token } = await this.resolve(workspaceId, campaignLocalId);
    const status = active ? 'ACTIVE' : 'PAUSED';
    try {
      await this.metaAds.updateCampaign(c.fbCampaignId, token, { status });
    } catch (err: any) {
      await this.translate(err, conn.id);
    }
    await p(this.prisma).metaCampaign.update({
      where: { id: c.id },
      data: { status, effectiveStatus: status },
    });
    await this.audit.log({
      userId, workspaceId,
      action: active ? 'tracking.campaign.activate' : 'tracking.campaign.pause',
      entity: 'MetaCampaign', entityId: c.id,
      metadata: { fbCampaignId: c.fbCampaignId, name: c.name },
    }).catch(() => {});
    this.logger.log(`[MetaOps] campanha ${c.fbCampaignId} -> ${status} (ws=${workspaceId})`);
    return { id: c.id, status, effectiveStatus: status };
  }

  async update(workspaceId: string, campaignLocalId: string, dto: CampaignUpdateDto, userId: string) {
    const { c, conn, token } = await this.resolve(workspaceId, campaignLocalId);

    const graphFields: Record<string, any> = {};
    const localData: Record<string, any> = {};

    if (typeof dto.name === 'string' && dto.name.trim() && dto.name.trim() !== c.name) {
      graphFields.name = dto.name.trim().slice(0, 400);
      localData.name = graphFields.name;
    }
    if (dto.dailyBudget != null && Number(dto.dailyBudget) > 0) {
      graphFields.daily_budget = Math.round(Number(dto.dailyBudget) * 100);
      localData.dailyBudget = graphFields.daily_budget / 100;
    }
    if (dto.lifetimeBudget != null && Number(dto.lifetimeBudget) > 0) {
      graphFields.lifetime_budget = Math.round(Number(dto.lifetimeBudget) * 100);
      localData.lifetimeBudget = graphFields.lifetime_budget / 100;
    }
    if (graphFields.daily_budget && graphFields.lifetime_budget) {
      throw new BadRequestException('Escolha só um tipo de orçamento: diário OU total.');
    }
    if (!Object.keys(graphFields).length) return { id: c.id, unchanged: true };

    try {
      await this.metaAds.updateCampaign(c.fbCampaignId, token, graphFields);
    } catch (err: any) {
      await this.translate(err, conn.id);
    }
    await p(this.prisma).metaCampaign.update({ where: { id: c.id }, data: localData });
    await this.audit.log({
      userId, workspaceId,
      action: 'tracking.campaign.update',
      entity: 'MetaCampaign', entityId: c.id,
      metadata: { fbCampaignId: c.fbCampaignId, changes: graphFields },
    }).catch(() => {});
    this.logger.log(`[MetaOps] campanha ${c.fbCampaignId} atualizada: ${Object.keys(graphFields).join(', ')}`);
    return { id: c.id, ...localData };
  }
}
