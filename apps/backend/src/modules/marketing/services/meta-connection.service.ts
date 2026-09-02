import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { decrypt } from '../../../common/utils/encryption';
import { MetaAdsService } from '../integrations/meta/meta-ads.service';
import { MetaGraphClient } from '../integrations/meta/meta-graph.client';

const p = (prisma: PrismaService) => prisma as any;

@Injectable()
export class MetaConnectionService {
  private readonly logger = new Logger(MetaConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaAds: MetaAdsService,
    private readonly graph: MetaGraphClient,
  ) {}

  /** Estado da conexão — NUNCA devolve o token. */
  async getStatus(workspaceId: string) {
    const conn = await p(this.prisma).metaConnection.findFirst({
      where: { workspaceId },
      include: { adAccounts: { orderBy: { name: 'asc' } } },
    });

    if (!conn) {
      return { configured: this.graph.configured, connected: false };
    }

    let tokenSuffix: string | null = null;
    try { const raw = decrypt(conn.accessToken); if (raw.length >= 6) tokenSuffix = raw.slice(-6); } catch { /* corrompido */ }

    return {
      configured: this.graph.configured,
      connected: conn.status === 'active',
      status: conn.status,
      lastError: conn.lastError,
      metaUserId: conn.metaUserId,
      tokenSuffix,
      tokenExpiresAt: conn.tokenExpiresAt,
      scopes: conn.scopes,
      adAccounts: conn.adAccounts.map((a: any) => ({
        id: a.id,
        fbAdAccountId: a.fbAdAccountId,
        name: a.name,
        currency: a.currency,
        status: a.status,
        isSelected: a.isSelected,
        lastSyncedAt: a.lastSyncedAt,
      })),
    };
  }

  /** Token descriptografado pra uso interno (workers). */
  async getToken(workspaceId: string): Promise<{ connectionId: string; token: string }> {
    const conn = await p(this.prisma).metaConnection.findFirst({ where: { workspaceId } });
    if (!conn) throw new NotFoundException('Nenhuma conexão Meta neste workspace');
    return { connectionId: conn.id, token: decrypt(conn.accessToken) };
  }

  async markExpired(connectionId: string, message: string) {
    await p(this.prisma).metaConnection.update({
      where: { id: connectionId },
      data: { status: 'expired', lastError: message?.slice(0, 500) ?? 'token inválido' },
    }).catch(() => {});
    this.logger.warn(`[Meta] conexão ${connectionId} marcada expired: ${message}`);
  }

  /** Busca as ad accounts na Meta e persiste (chamado logo após o OAuth). */
  async refreshAdAccounts(workspaceId: string) {
    const conn = await p(this.prisma).metaConnection.findFirst({ where: { workspaceId } });
    if (!conn) throw new NotFoundException('Nenhuma conexão Meta neste workspace');
    const token = decrypt(conn.accessToken);

    const accounts = await this.metaAds.getAdAccounts(token);
    for (const acc of accounts) {
      await p(this.prisma).metaAdAccount.upsert({
        where: { workspaceId_fbAdAccountId: { workspaceId, fbAdAccountId: acc.fbAdAccountId } },
        create: { workspaceId, metaConnectionId: conn.id, ...acc },
        update: { metaConnectionId: conn.id, name: acc.name, currency: acc.currency, timezoneName: acc.timezoneName, status: acc.status },
      });
    }
    return this.getStatus(workspaceId);
  }

  /** Marca UMA ad account como a sincronizada (desmarca as outras do workspace). */
  async selectAdAccount(workspaceId: string, adAccountId: string) {
    const acc = await p(this.prisma).metaAdAccount.findFirst({ where: { id: adAccountId, workspaceId } });
    if (!acc) throw new NotFoundException('Ad account não encontrada');
    await p(this.prisma).metaAdAccount.updateMany({ where: { workspaceId }, data: { isSelected: false } });
    await p(this.prisma).metaAdAccount.update({ where: { id: adAccountId }, data: { isSelected: true } });
    return { selected: adAccountId };
  }

  async disconnect(workspaceId: string) {
    await p(this.prisma).metaConnection.deleteMany({ where: { workspaceId } });
    return { disconnected: true };
  }
}
