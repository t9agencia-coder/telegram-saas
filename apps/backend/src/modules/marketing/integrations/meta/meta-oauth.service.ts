import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../../../../common/prisma.service';
import { encrypt } from '../../../../common/utils/encryption';
import { MetaGraphClient, META_GRAPH_VERSION } from './meta-graph.client';

const SCOPES = ['ads_read', 'ads_management', 'business_management'];
const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class MetaOAuthService {
  private readonly logger = new Logger(MetaOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MetaGraphClient,
  ) {}

  private stateSecret(): string {
    // Reaproveita a ENCRYPTION_KEY (já exigida no boot) — não é o token, só
    // assina o state do OAuth pra amarrar o callback ao workspace sem sessão.
    return (process.env.ENCRYPTION_KEY || '').slice(0, 32);
  }

  private signState(payload: string): string {
    return createHmac('sha256', this.stateSecret()).update(payload).digest('base64url');
  }

  buildAuthUrl(workspaceId: string): string {
    if (!this.graph.configured) {
      throw new BadRequestException('Integração Meta não configurada no servidor (META_APP_ID / META_APP_SECRET).');
    }
    const payload = Buffer.from(JSON.stringify({ w: workspaceId, n: randomBytes(8).toString('hex'), t: Date.now() })).toString('base64url');
    const state = `${payload}.${this.signState(payload)}`;
    const p = new URLSearchParams({
      client_id: this.graph.appId,
      redirect_uri: this.graph.redirectUri,
      state,
      scope: SCOPES.join(','),
      response_type: 'code',
    });
    return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${p.toString()}`;
  }

  verifyState(state: string): string {
    const [payload, sig] = (state || '').split('.');
    if (!payload || !sig || sig !== this.signState(payload)) {
      throw new BadRequestException('state inválido no callback OAuth');
    }
    let parsed: any;
    try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
    catch { throw new BadRequestException('state corrompido'); }
    if (!parsed?.w || Date.now() - Number(parsed.t) > STATE_TTL_MS) {
      throw new BadRequestException('state expirado — refaça a conexão');
    }
    return parsed.w as string;
  }

  /** Troca o code por token long-lived, resolve o meta user id e salva a conexão. */
  async handleCallback(code: string, workspaceId: string): Promise<{ connectionId: string }> {
    // 1. code -> short-lived token
    const short = await this.graph.get<{ access_token: string }>('oauth/access_token', {
      client_id: this.graph.appId,
      client_secret: this.graph.appSecret,
      redirect_uri: this.graph.redirectUri,
      code,
    });

    // 2. short -> long-lived (~60 dias)
    const long = await this.graph.get<{ access_token: string; expires_in?: number }>('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: this.graph.appId,
      client_secret: this.graph.appSecret,
      fb_exchange_token: short.access_token,
    });

    const token = long.access_token;
    const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null;

    // 3. quem é o usuário
    const me = await this.graph.get<{ id: string }>('me', { fields: 'id', access_token: token });

    // 4. upsert — uma conexão por workspace (a mais recente vence)
    const existing = await (this.prisma as any).metaConnection.findFirst({ where: { workspaceId } });
    const data = {
      metaUserId: me.id,
      accessToken: encrypt(token),
      tokenExpiresAt: expiresAt,
      scopes: SCOPES,
      status: 'active',
      lastError: null,
    };
    const conn = existing
      ? await (this.prisma as any).metaConnection.update({ where: { id: existing.id }, data })
      : await (this.prisma as any).metaConnection.create({ data: { workspaceId, ...data } });

    this.logger.log(`[Meta OAuth] workspace=${workspaceId} conectado metaUser=${me.id}`);
    return { connectionId: conn.id };
  }
}
