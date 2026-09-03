import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { decrypt } from '../../../common/utils/encryption';
import { MetaAdsService } from '../integrations/meta/meta-ads.service';
import { MetaGraphClient } from '../integrations/meta/meta-graph.client';
import { normAccountStatus } from '../integrations/meta/account-status';

const p = (prisma: PrismaService) => prisma as any;

/** Contas de anúncio que um workspace pode manter sincronizando ao mesmo tempo. */
export const MAX_ACTIVE_AD_ACCOUNTS = 20;

@Injectable()
export class MetaConnectionService {
  private readonly logger = new Logger(MetaConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaAds: MetaAdsService,
    private readonly graph: MetaGraphClient,
  ) {}

  /** Estado das conexões — NUNCA devolve o token. */
  async getStatus(workspaceId: string) {
    const conns = await p(this.prisma).metaConnection.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      include: { adAccounts: { orderBy: { name: 'asc' } } },
    });

    const mapAccount = (a: any) => ({
      id: a.id,
      metaConnectionId: a.metaConnectionId,
      fbAdAccountId: a.fbAdAccountId,
      name: a.name,
      currency: a.currency,
      status: a.status,
      statusToken: normAccountStatus(a.status),
      isSelected: a.isSelected,
      lastSyncedAt: a.lastSyncedAt,
    });

    const connections = conns.map((conn: any) => {
      let tokenSuffix: string | null = null;
      try { const raw = decrypt(conn.accessToken); if (raw.length >= 6) tokenSuffix = raw.slice(-6); } catch { /* corrompido */ }
      return {
        id: conn.id,
        status: conn.status,
        connected: conn.status === 'active',
        lastError: conn.lastError,
        metaUserId: conn.metaUserId,
        tokenSuffix,
        tokenExpiresAt: conn.tokenExpiresAt,
        scopes: conn.scopes,
        adAccounts: conn.adAccounts.map(mapAccount),
      };
    });

    const allAccounts = connections.flatMap((c: any) => c.adAccounts);
    const activeCount = allAccounts.filter((a: any) => a.isSelected).length;

    return {
      configured: this.graph.configured,
      connected: connections.some((c: any) => c.connected),
      connectionCount: connections.length,
      maxConnections: 5,
      activeAccountCount: activeCount,
      maxActiveAccounts: MAX_ACTIVE_AD_ACCOUNTS,
      connections,
      // compat: lista achatada de todas as ad accounts do workspace
      adAccounts: allAccounts,
    };
  }

  async markExpired(connectionId: string, message: string) {
    await p(this.prisma).metaConnection.update({
      where: { id: connectionId },
      data: { status: 'expired', lastError: message?.slice(0, 500) ?? 'token inválido' },
    }).catch(() => {});
    this.logger.warn(`[Meta] conexão ${connectionId} marcada expired: ${message}`);
  }

  /**
   * Busca as ad accounts na Meta e persiste. Sem connectionId → varre todas as
   * conexões ativas do workspace (chamado após um OAuth passa só o id novo).
   */
  async refreshAdAccounts(workspaceId: string, connectionId?: string) {
    const conns = await p(this.prisma).metaConnection.findMany({
      where: { workspaceId, ...(connectionId ? { id: connectionId } : { status: 'active' }) },
    });
    if (!conns.length) throw new NotFoundException('Nenhuma conexão Meta neste workspace');

    for (const conn of conns) {
      let token: string;
      try { token = decrypt(conn.accessToken); } catch { continue; }
      let accounts: any[];
      try {
        accounts = await this.metaAds.getAdAccounts(token);
      } catch (err: any) {
        this.logger.warn(`[Meta] refreshAdAccounts conn=${conn.id}: ${err.message}`);
        continue;
      }
      for (const acc of accounts) {
        await p(this.prisma).metaAdAccount.upsert({
          where: { workspaceId_fbAdAccountId: { workspaceId, fbAdAccountId: acc.fbAdAccountId } },
          create: { workspaceId, metaConnectionId: conn.id, ...acc },
          update: { metaConnectionId: conn.id, name: acc.name, currency: acc.currency, timezoneName: acc.timezoneName, status: acc.status },
        });
      }
    }
    return this.getStatus(workspaceId);
  }

  /**
   * Liga/desliga uma ad account do sync (botão on/off). Ao ligar, respeita o
   * teto de MAX_ACTIVE_AD_ACCOUNTS por workspace.
   */
  async toggleAdAccount(workspaceId: string, adAccountId: string, active: boolean) {
    const acc = await p(this.prisma).metaAdAccount.findFirst({ where: { id: adAccountId, workspaceId } });
    if (!acc) throw new NotFoundException('Ad account não encontrada');

    if (active && !acc.isSelected) {
      const activeCount = await p(this.prisma).metaAdAccount.count({ where: { workspaceId, isSelected: true } });
      if (activeCount >= MAX_ACTIVE_AD_ACCOUNTS) {
        throw new BadRequestException(
          `Limite de ${MAX_ACTIVE_AD_ACCOUNTS} contas de anúncio ativas neste workspace. Desative uma antes de ativar outra.`,
        );
      }
    }

    await p(this.prisma).metaAdAccount.update({ where: { id: adAccountId }, data: { isSelected: active } });
    return { id: adAccountId, isSelected: active };
  }

  /** Desconecta um perfil do Facebook (ou todos, sem connectionId). */
  async disconnect(workspaceId: string, connectionId?: string) {
    if (connectionId) {
      const { count } = await p(this.prisma).metaConnection.deleteMany({ where: { id: connectionId, workspaceId } });
      if (!count) throw new NotFoundException('Conexão não encontrada');
      return { disconnected: connectionId };
    }
    await p(this.prisma).metaConnection.deleteMany({ where: { workspaceId } });
    return { disconnected: 'all' };
  }
}
