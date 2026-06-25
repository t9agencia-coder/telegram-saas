import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { decrypt } from '../../common/utils/encryption';

const prismaAny = (p: PrismaService) => p as any;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function stripNulls(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v != null && v !== ''),
  );
}

// Monta user_data completo a partir dos dados de tracking do lead
function buildUserData(tracking: TrackingData): Record<string, any> {
  const ud: Record<string, any> = {
    client_ip_address: tracking.ip   || undefined,
    client_user_agent: tracking.userAgent || undefined,
    fbp:               tracking.fbp  || undefined,
    fbc:               tracking.fbc  || undefined,
    country:           sha256('br'),  // todos os leads são do Brasil
  };

  if (tracking.phone) ud.ph = sha256(normalizePhone(tracking.phone));
  if (tracking.email) ud.em = sha256(tracking.email.toLowerCase().trim());

  // external_id: identificador persistente do usuário (telegramId)
  if (tracking.chatId) ud.external_id = sha256(tracking.chatId);

  // nome: fn = primeiro nome, ln = último sobrenome
  if (tracking.name) {
    const parts = tracking.name.trim().split(/\s+/).filter(Boolean);
    if (parts[0]) ud.fn = sha256(parts[0].toLowerCase());
    if (parts.length > 1) ud.ln = sha256(parts[parts.length - 1].toLowerCase());
  }

  return ud;
}

interface TrackingData {
  ip?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
  chatId?: string;
  phone?: string;
  email?: string;
  name?: string;
  botId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}

@Injectable()
export class FacebookCapiService {
  private readonly logger = new Logger(FacebookCapiService.name);

  constructor(private prisma: PrismaService) {}

  // ── Ponto de entrada: redirect acessado (PageView) ─────────────────────────
  async handlePageView(
    workspaceId: string,
    ctx: {
      ip?: string;
      userAgent?: string;
      fbp?: string;
      fbc?: string;
      sourceUrl?: string;
      botId?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      utmContent?: string;
      utmTerm?: string;
    },
  ): Promise<void> {
    const allCreds = await this.resolveAllCredentials(workspaceId, 'eventPageView', ctx.botId);
    if (allCreds.length === 0) return;

    const userData = stripNulls({
      client_ip_address: ctx.ip,
      client_user_agent: ctx.userAgent,
      fbp:               ctx.fbp,
      fbc:               ctx.fbc,
      country:           sha256('br'),
    });

    const customData = stripNulls({
      utm_source:   ctx.utmSource,
      utm_medium:   ctx.utmMedium,
      utm_campaign: ctx.utmCampaign,
      utm_content:  ctx.utmContent,
      utm_term:     ctx.utmTerm,
    });

    const meta = {
      workspaceId,
      chatId:    null,
      orderId:   null,
      value:     null,
      sourceUrl: ctx.sourceUrl,
    };

    await Promise.allSettled(allCreds.map(creds =>
      this.sendCapiEvent('PageView', creds.pixelId, creds.accessToken, userData,
        Object.keys(customData).length ? customData : undefined, meta),
    ));
  }

  // ── Ponto de entrada: PIX gerado (AddToCart) ───────────────────────────────
  async handlePixCreated(params: {
    workspaceId: string;
    leadId: string;
    amount: number;
    productId?: string;
    productName?: string;
    transactionId?: string;
  }): Promise<void> {
    const tracking   = await this.resolveTracking(params.leadId);
    const allCreds   = await this.resolveAllCredentials(params.workspaceId, 'eventAddToCart', tracking?.botId);
    if (allCreds.length === 0) return;
    const userData   = stripNulls(buildUserData(tracking ?? {}));

    const customData = stripNulls({
      value:        params.amount,
      currency:     'BRL',
      content_ids:  params.productId ? [params.productId] : undefined,
      content_name: params.productName,
      content_type: 'product',
      order_id:     params.transactionId,
      num_items:    1,
      utm_source:   tracking?.utmSource,
      utm_medium:   tracking?.utmMedium,
      utm_campaign: tracking?.utmCampaign,
      utm_content:  tracking?.utmContent,
      utm_term:     tracking?.utmTerm,
    });

    const meta = {
      workspaceId: params.workspaceId,
      chatId:  tracking?.chatId ?? null,
      orderId: params.transactionId ?? null,
      value:   params.amount,
    };

    await Promise.allSettled(allCreds.map(creds =>
      this.sendCapiEvent('AddToCart', creds.pixelId, creds.accessToken, userData, customData, meta),
    ));
  }

  // ── Ponto de entrada: PIX aprovado (Purchase) ──────────────────────────────
  async handlePixApproved(params: {
    workspaceId: string;
    leadId: string;
    amount: number;
    transactionId?: string;
    productId?: string;
    productName?: string;
  }): Promise<void> {
    const tracking   = await this.resolveTracking(params.leadId);
    const allCreds   = await this.resolveAllCredentials(params.workspaceId, 'eventPurchase', tracking?.botId);
    if (allCreds.length === 0) return;
    const userData   = stripNulls(buildUserData(tracking ?? {}));

    const customData = stripNulls({
      value:        params.amount,
      currency:     'BRL',
      content_ids:  params.productId ? [params.productId] : undefined,
      content_name: params.productName,
      content_type: 'product',
      order_id:     params.transactionId,
      num_items:    1,
      utm_source:   tracking?.utmSource,
      utm_medium:   tracking?.utmMedium,
      utm_campaign: tracking?.utmCampaign,
      utm_content:  tracking?.utmContent,
      utm_term:     tracking?.utmTerm,
    });

    const meta = {
      workspaceId: params.workspaceId,
      chatId:  tracking?.chatId ?? null,
      orderId: params.transactionId ?? null,
      value:   params.amount,
    };

    await Promise.allSettled(allCreds.map(creds =>
      this.sendCapiEvent('Purchase', creds.pixelId, creds.accessToken, userData, customData, meta),
    ));
  }

  // ── Resolução de credenciais ───────────────────────────────────────────────
  // Retorna TODOS os pixels elegíveis para o evento (fan-out).
  // Prioridade: pixels do bot → pixels padrão (botId null) → legado FacebookIntegration
  private async resolveAllCredentials(
    workspaceId: string,
    eventToggle: 'eventPageView' | 'eventAddToCart' | 'eventPurchase',
    botId?: string,
  ): Promise<Array<{ pixelId: string; accessToken: string }>> {
    try {
      // 1. Todos os pixels vinculados a este bot (pode ser mais de 1)
      if (botId) {
        const botPixels = await prismaAny(this.prisma).facebookPixel.findMany({
          where: { workspaceId, botId, isActive: true, [eventToggle]: true },
        });
        const valid = botPixels.filter((p: any) => p.pixelId && p.accessToken);
        if (valid.length > 0) {
          return valid.map((p: any) => ({ pixelId: p.pixelId, accessToken: decrypt(p.accessToken) }));
        }
      }

      // 2. Pixels padrão do workspace (sem bot — migrado do sistema legado)
      const defaultPixels = await prismaAny(this.prisma).facebookPixel.findMany({
        where: { workspaceId, botId: null, isActive: true, [eventToggle]: true },
      });
      const validDefaults = defaultPixels.filter((p: any) => p.pixelId && p.accessToken);
      if (validDefaults.length > 0) {
        return validDefaults.map((p: any) => ({ pixelId: p.pixelId, accessToken: decrypt(p.accessToken) }));
      }

      // 3. Fallback legado: FacebookIntegration
      const config = await this.prisma.facebookIntegration.findUnique({ where: { workspaceId } });
      if (!config?.isActive || !(config as any)[eventToggle] || !config.pixelId || !config.accessToken) return [];
      return [{ pixelId: config.pixelId, accessToken: decrypt(config.accessToken) }];
    } catch {
      return [];
    }
  }

  // ── Resolução de dados de tracking por leadId ──────────────────────────────
  private async resolveTracking(leadId: string): Promise<TrackingData | null> {
    try {
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { telegramId: true, phone: true, email: true, name: true, botId: true },
      });

      let userTracking: any = null;
      if (lead?.telegramId) {
        userTracking = await prismaAny(this.prisma).userTracking.findFirst({
          where: { chatId: lead.telegramId },
          orderBy: { capturedAt: 'desc' },
        });
      }

      return {
        ip:          userTracking?.ip          ?? undefined,
        userAgent:   userTracking?.userAgent   ?? undefined,
        fbp:         userTracking?.fbp         ?? undefined,
        fbc:         userTracking?.fbc         ?? undefined,
        chatId:      lead?.telegramId          ?? undefined,
        phone:       lead?.phone               ?? undefined,
        email:       lead?.email               ?? undefined,
        name:        lead?.name                ?? undefined,
        botId:       (lead as any)?.botId      ?? undefined,
        utmSource:   userTracking?.utmSource   ?? undefined,
        utmMedium:   userTracking?.utmMedium   ?? undefined,
        utmCampaign: userTracking?.utmCampaign ?? undefined,
        utmContent:  userTracking?.utmContent  ?? undefined,
        utmTerm:     userTracking?.utmTerm     ?? undefined,
      };
    } catch {
      return null;
    }
  }

  // ── Envio CAPI + log ───────────────────────────────────────────────────────
  private async sendCapiEvent(
    eventName: string,
    pixelId: string,
    accessToken: string,
    rawUserData: Record<string, any>,
    customData: Record<string, any> | undefined,
    meta: {
      workspaceId: string;
      chatId: string | null;
      orderId: string | null;
      value: number | null;
      sourceUrl?: string;
    },
  ): Promise<void> {
    const testEventCode = process.env.FACEBOOK_TEST_EVENT_CODE || null;
    const userData = stripNulls(rawUserData);

    const eventPayload: Record<string, any> = {
      event_name:     eventName,
      event_time:     Math.floor(Date.now() / 1000),
      event_id:       randomUUID(),
      action_source:  'website',
      user_data:      userData,
      ...(meta.sourceUrl ? { event_source_url: meta.sourceUrl } : {}),
      ...(customData ? { custom_data: stripNulls(customData as any) } : {}),
    };

    const payload: Record<string, any> = { data: [eventPayload] };
    if (testEventCode) payload.test_event_code = testEventCode;

    // Log seguro — mascara PII hasheada
    const safeUserData = {
      ...userData,
      em:          userData.em          ? '***' : undefined,
      ph:          userData.ph          ? '***' : undefined,
      fn:          userData.fn          ? '***' : undefined,
      ln:          userData.ln          ? '***' : undefined,
      external_id: userData.external_id ? '***' : undefined,
    };
    this.logger.log(
      `[CAPI] ${eventName} pixel=${pixelId} user_data=${JSON.stringify(safeUserData)} custom_data=${JSON.stringify(eventPayload.custom_data ?? {})}` +
      (testEventCode ? ` test_code=${testEventCode}` : ''),
    );

    let status = 'success';
    let responseData: any = null;
    let errorMessage: string | null = null;

    try {
      const res = await fetch(
        `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      responseData = await res.json();

      if (responseData?.error) {
        status = 'error';
        errorMessage = responseData.error.message || 'Facebook API error';
        this.logger.error(`[CAPI] ${eventName} → ERRO: ${errorMessage} | response=${JSON.stringify(responseData)}`);
      } else {
        const received = responseData?.events_received ?? 0;
        this.logger.log(`[CAPI] ${eventName} → ${received} evento(s) recebido(s) | pixel=${pixelId} workspace=${meta.workspaceId}${testEventCode ? ' (TEST)' : ''}`);
      }
    } catch (err: any) {
      status = 'error';
      errorMessage = err?.message || 'Network error';
      this.logger.error(`[CAPI] ${eventName} falha crítica: ${errorMessage}`);
    }

    prismaAny(this.prisma).facebookEventLog.create({
      data: {
        workspaceId: meta.workspaceId,
        chatId:      meta.chatId,
        eventName,
        pixelId,
        orderId:     meta.orderId,
        value:       meta.value,
        status,
        response:    responseData,
        errorMessage,
      },
    }).catch((e: any) =>
      this.logger.error(`[CAPI] Falha ao salvar log: ${e?.message}`),
    );
  }
}
