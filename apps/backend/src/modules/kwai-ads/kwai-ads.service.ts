import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { UpdateKwaiConfigDto } from './dto/update-kwai-config.dto';
import { encrypt, decrypt } from '../../common/utils/encryption';

const prismaAny = (p: PrismaService) => p as any;
const ADSNEBULA_URL = 'https://www.adsnebula.com/log/common/api';

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

@Injectable()
export class KwaiAdsService {
  private readonly logger = new Logger(KwaiAdsService.name);

  constructor(private prisma: PrismaService) {}

  // ── Config (legacy) ────────────────────────────────────────────────────────
  async getConfig(workspaceId: string) {
    const config = await this.prisma.kwaiIntegration.findUnique({ where: { workspaceId } });
    if (!config) return null;

    let tokenSuffix: string | null = null;
    try {
      const raw = decrypt(config.accessToken);
      if (raw && raw.length >= 6) tokenSuffix = raw.slice(-6);
    } catch { /* token corrompido */ }

    let testTokenSuffix: string | null = null;
    try {
      const raw = decrypt((config as any).testToken || '');
      if (raw && raw.length >= 6) testTokenSuffix = raw.slice(-6);
    } catch { /* token corrompido */ }

    return {
      id:              config.id,
      pixelId:         (config as any).pixelId  as string,
      tokenSuffix,
      testTokenSuffix,
      isActive:        config.isActive,
      eventAddToCart:  (config as any).eventAddToCart as boolean,
      eventPurchase:   (config as any).eventPurchase  as boolean,
    };
  }

  async updateConfig(workspaceId: string, dto: UpdateKwaiConfigDto) {
    const data: any = {};
    if (dto.pixelId        !== undefined) data.pixelId      = dto.pixelId;
    if (dto.accessToken)                  data.accessToken  = encrypt(dto.accessToken);
    if (dto.testToken !== undefined)      data.testToken    = dto.testToken ? encrypt(dto.testToken) : '';
    if (dto.isActive       !== undefined) data.isActive     = dto.isActive;
    if (dto.eventAddToCart !== undefined) data.eventAddToCart = dto.eventAddToCart;
    if (dto.eventPurchase  !== undefined) data.eventPurchase  = dto.eventPurchase;

    await this.prisma.kwaiIntegration.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        pixelId:        dto.pixelId    || '',
        accessToken:    dto.accessToken ? encrypt(dto.accessToken) : '',
        testToken:      dto.testToken  ? encrypt(dto.testToken)   : '',
        isActive:       dto.isActive   ?? false,
        eventAddToCart: dto.eventAddToCart ?? true,
        eventPurchase:  dto.eventPurchase  ?? true,
      } as any,
      update: data,
    });

    return this.getConfig(workspaceId);
  }

  // ── Multi-conta ────────────────────────────────────────────────────────────
  private formatAccount(a: any) {
    let tokenSuffix: string | null = null;
    try {
      const raw = decrypt(a.accessToken);
      if (raw && raw.length >= 6) tokenSuffix = raw.slice(-6);
    } catch {}

    let testTokenSuffix: string | null = null;
    try {
      const raw = decrypt(a.testToken || '');
      if (raw && raw.length >= 6) testTokenSuffix = raw.slice(-6);
    } catch {}

    return {
      id:             a.id,
      name:           a.name ?? null,
      pixelId:        a.pixelId,
      tokenSuffix,
      testTokenSuffix,
      botId:          a.botId ?? null,
      botUsername:    a.bot?.username ?? null,
      isActive:       a.isActive,
      eventAddToCart: a.eventAddToCart,
      eventPurchase:  a.eventPurchase,
      createdAt:      a.createdAt,
    };
  }

  async listAccounts(workspaceId: string) {
    const accounts = await prismaAny(this.prisma).kwaiAccount.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'asc' },
      include: { bot: { select: { id: true, username: true } } },
    });

    if (accounts.length === 0) {
      const legacy = await this.prisma.kwaiIntegration.findUnique({ where: { workspaceId } });
      if (legacy && (legacy as any).pixelId && legacy.accessToken) {
        try {
          const created = await prismaAny(this.prisma).kwaiAccount.create({
            data: {
              workspaceId,
              name:           'Conta Principal',
              pixelId:        (legacy as any).pixelId,
              accessToken:    legacy.accessToken,
              testToken:      (legacy as any).testToken || '',
              isActive:       legacy.isActive,
              eventAddToCart: (legacy as any).eventAddToCart ?? true,
              eventPurchase:  (legacy as any).eventPurchase  ?? true,
            },
            include: { bot: { select: { id: true, username: true } } },
          });
          return [this.formatAccount(created)];
        } catch { /* ignora race condition */ }
      }
      return [];
    }

    return accounts.map((a: any) => this.formatAccount(a));
  }

  async createAccount(workspaceId: string, dto: any) {
    const count = await prismaAny(this.prisma).kwaiAccount.count({ where: { workspaceId } });
    if (count >= 5) throw new Error('Limite máximo de 5 contas por workspace atingido');
    if (!dto.pixelId?.trim())     throw new Error('Pixel ID é obrigatório');
    if (!dto.accessToken?.trim()) throw new Error('Access Token é obrigatório');

    const created = await prismaAny(this.prisma).kwaiAccount.create({
      data: {
        workspaceId,
        name:           dto.name?.trim() || null,
        pixelId:        dto.pixelId.trim(),
        accessToken:    encrypt(dto.accessToken),
        testToken:      dto.testToken ? encrypt(dto.testToken) : '',
        botId:          dto.botId || null,
        isActive:       dto.isActive   ?? true,
        eventAddToCart: dto.eventAddToCart ?? true,
        eventPurchase:  dto.eventPurchase  ?? true,
      },
      include: { bot: { select: { id: true, username: true } } },
    });
    return this.formatAccount(created);
  }

  async updateAccount(workspaceId: string, accountId: string, dto: any) {
    const account = await prismaAny(this.prisma).kwaiAccount.findFirst({
      where: { id: accountId, workspaceId },
    });
    if (!account) throw new Error('Conta não encontrada');

    const data: any = {};
    if (dto.name           !== undefined) data.name           = dto.name?.trim() || null;
    if (dto.pixelId        !== undefined) {
      const pid = dto.pixelId?.trim();
      if (!pid) throw new Error('Pixel ID não pode ser vazio');
      data.pixelId = pid;
    }
    if (dto.accessToken)                  data.accessToken    = encrypt(dto.accessToken);
    if (dto.testToken      !== undefined) data.testToken      = dto.testToken ? encrypt(dto.testToken) : '';
    if (dto.botId          !== undefined) data.botId          = dto.botId || null;
    if (dto.isActive       !== undefined) data.isActive       = dto.isActive;
    if (dto.eventAddToCart !== undefined) data.eventAddToCart = dto.eventAddToCart;
    if (dto.eventPurchase  !== undefined) data.eventPurchase  = dto.eventPurchase;

    const updated = await prismaAny(this.prisma).kwaiAccount.update({
      where:   { id: accountId },
      data,
      include: { bot: { select: { id: true, username: true } } },
    });
    return this.formatAccount(updated);
  }

  async deleteAccount(workspaceId: string, accountId: string) {
    const { count } = await prismaAny(this.prisma).kwaiAccount.deleteMany({
      where: { id: accountId, workspaceId },
    });
    if (count === 0) throw new Error('Conta não encontrada');
    return { ok: true };
  }

  async testAccountById(workspaceId: string, accountId: string) {
    const account = await prismaAny(this.prisma).kwaiAccount.findFirst({
      where: { id: accountId, workspaceId },
    });
    if (!account) return { ok: false, message: 'Conta não encontrada' };

    const pixelId = account.pixelId as string;
    if (!pixelId)             return { ok: false, message: 'Pixel ID não configurado' };
    if (!account.accessToken) return { ok: false, message: 'Token de acesso não configurado' };
    if (!account.testToken)   return { ok: false, message: 'Token de teste não configurado. Adicione o token de teste gerado no painel Kwai.' };

    let accessToken: string;
    let testClickId: string;
    try {
      accessToken = decrypt(account.accessToken);
      testClickId = decrypt(account.testToken);
    } catch {
      return { ok: false, message: 'Erro ao descriptografar os tokens' };
    }

    return this.runTestEvents(pixelId, accessToken, testClickId);
  }

  // ── Teste de conexão (legacy) ─────────────────────────────────────────────
  async testConnection(workspaceId: string) {
    const config = await this.prisma.kwaiIntegration.findUnique({ where: { workspaceId } });
    if (!config) return { ok: false, message: 'Não configurado' };

    const pixelId = (config as any).pixelId as string;
    if (!pixelId) return { ok: false, message: 'Pixel ID não configurado' };
    if (!config.accessToken) return { ok: false, message: 'Token de acesso não configurado' };

    const rawTestToken = (config as any).testToken as string;
    if (!rawTestToken) return { ok: false, message: 'Token de teste não configurado. Adicione o token de teste gerado no painel Kwai.' };

    let accessToken: string;
    let testClickId: string;
    try {
      accessToken = decrypt(config.accessToken);
      testClickId = decrypt(rawTestToken);
    } catch {
      return { ok: false, message: 'Erro ao descriptografar os tokens' };
    }

    return this.runTestEvents(pixelId, accessToken, testClickId);
  }

  private async runTestEvents(pixelId: string, accessToken: string, testClickId: string) {
    const basePayload = {
      access_token:    accessToken,
      clickid:         testClickId,
      is_attributed:   1,
      mmpcode:         'PL',
      pixelId,
      pixelSdkVersion: '9.9.9',
      testFlag:        false,
      trackFlag:       true,
      currency:        'BRL',
      value:           '1',
    };

    const sendEvent = async (eventName: string) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      try {
        const res = await fetch(ADSNEBULA_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ...basePayload, event_name: eventName }),
          signal:  ctrl.signal,
        });
        return res.json() as Promise<any>;
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      const r1 = await sendEvent('EVENT_ADD_TO_CART');
      await new Promise(resolve => setTimeout(resolve, 500));
      const r2 = await sendEvent('EVENT_PURCHASE');

      this.logger.log(`[Kwai] testConnection pixelId=${pixelId} → AddToCart=${r1?.result} Purchase=${r2?.result}`);

      const ok = (r1?.result === 1 || r1?.result === 10005) && (r2?.result === 1 || r2?.result === 10005);
      if (ok) return { ok: true, message: 'Eventos de teste enviados com sucesso — verifique no painel Kwai' };

      const failResult = r1?.result !== 1 && r1?.result !== 10005 ? r1 : r2;
      return {
        ok: false,
        message: `Erro da API (${failResult?.result}): ${failResult?.error_msg || failResult?.message || JSON.stringify(failResult)}`,
      };
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'Timeout 10s' : err?.message || 'Erro de rede';
      this.logger.error(`[Kwai] testConnection falhou: ${msg}`);
      return { ok: false, message: msg };
    }
  }

  // ── PIX gerado → EVENT_ADD_TO_CART ────────────────────────────────────────
  async handleAddToCart(params: {
    workspaceId: string;
    leadId:      string;
    amount:      number;
    transactionId?: string;
  }): Promise<void> {
    return this.dispatchEvent({ ...params, toggle: 'eventAddToCart', eventName: 'EVENT_ADD_TO_CART' });
  }

  // ── PIX aprovado → EVENT_PURCHASE ─────────────────────────────────────────
  async handlePurchase(params: {
    workspaceId: string;
    leadId:      string;
    amount:      number;
    transactionId?: string;
  }): Promise<void> {
    return this.dispatchEvent({ ...params, toggle: 'eventPurchase', eventName: 'EVENT_PURCHASE' });
  }

  private async dispatchEvent(params: {
    workspaceId:    string;
    leadId:         string;
    amount:         number;
    transactionId?: string;
    toggle:         'eventAddToCart' | 'eventPurchase';
    eventName:      string;
  }): Promise<void> {
    const tracking = await this.resolveTracking(params.leadId);
    const clickId  = tracking?.kwaiId;

    if (!clickId) {
      this.logger.log(`[Kwai] ${params.eventName} skipped — sem kwaiId | workspace=${params.workspaceId}`);
      return;
    }

    const credsList = await this.resolveAllCredentials(params.workspaceId, params.toggle);
    if (!credsList.length) return;

    await Promise.allSettled(
      credsList.map(creds => this.sendAdsNebulaEvent({
        ...creds,
        workspaceId:   params.workspaceId,
        eventName:     params.eventName,
        clickId,
        amount:        params.amount,
        transactionId: params.transactionId,
        chatId:        tracking?.chatId,
        phone:         tracking?.phone,
        email:         tracking?.email,
        name:          tracking?.name,
        utmCampaign:   tracking?.utmCampaign,
        utmMedium:     tracking?.utmMedium,
      }))
    );
  }

  // ── Resolução de credenciais multi-conta ───────────────────────────────────
  private async resolveAllCredentials(
    workspaceId: string,
    eventToggle: 'eventAddToCart' | 'eventPurchase',
  ): Promise<{ pixelId: string; accessToken: string }[]> {
    try {
      const accounts = await prismaAny(this.prisma).kwaiAccount.findMany({
        where: { workspaceId, isActive: true, [eventToggle]: true },
      });

      if (accounts.length > 0) {
        return accounts
          .map((a: any) => {
            try {
              const pixelId     = a.pixelId as string;
              const accessToken = decrypt(a.accessToken);
              if (!pixelId || !accessToken) return null;
              return { pixelId, accessToken };
            } catch {
              this.logger.warn(`[Kwai] Token corrompido na conta ${a.id} (workspace=${a.workspaceId}) — conta ignorada`);
              return null;
            }
          })
          .filter(Boolean) as { pixelId: string; accessToken: string }[];
      }

      // Fallback para integração legada
      const legacy = await this.prisma.kwaiIntegration.findUnique({ where: { workspaceId } });
      if (!legacy || !legacy.isActive || !(legacy as any)[eventToggle]) return [];
      const pixelId = (legacy as any).pixelId as string;
      try {
        const accessToken = decrypt(legacy.accessToken);
        if (!pixelId || !accessToken) return [];
        return [{ pixelId, accessToken }];
      } catch { return []; }
    } catch {
      return [];
    }
  }

  // ── Resolução de tracking por leadId ──────────────────────────────────────
  private async resolveTracking(leadId: string): Promise<{
    kwaiId?:      string;
    chatId?:      string;
    phone?:       string;
    email?:       string;
    name?:        string;
    utmCampaign?: string;
    utmMedium?:   string;
  } | null> {
    try {
      const lead = await this.prisma.lead.findUnique({
        where:  { id: leadId },
        select: { telegramId: true, phone: true, email: true, name: true },
      });

      let userTracking: any = null;
      if (lead?.telegramId) {
        userTracking = await prismaAny(this.prisma).userTracking.findFirst({
          where:   { chatId: lead.telegramId },
          orderBy: { capturedAt: 'desc' },
        });
      }

      let kwaiClickid: string | null = null;
      if (!userTracking?.kwaiId) {
        const tracking = await this.prisma.tracking.findUnique({ where: { leadId } });
        kwaiClickid = (tracking as any)?.kwaiClickid ?? null;
      }

      return {
        kwaiId:      userTracking?.kwaiId   || kwaiClickid  || undefined,
        chatId:      lead?.telegramId                        || undefined,
        phone:       lead?.phone                             || undefined,
        email:       lead?.email                             || undefined,
        name:        lead?.name                              || undefined,
        utmCampaign: userTracking?.utmCampaign               || undefined,
        utmMedium:   userTracking?.utmMedium                 || undefined,
      };
    } catch {
      return null;
    }
  }

  // ── Envio para AdsNebula ───────────────────────────────────────────────────
  private async sendAdsNebulaEvent(params: {
    pixelId:        string;
    accessToken:    string;
    workspaceId:    string;
    eventName:      string;
    clickId:        string;
    amount?:        number;
    transactionId?: string;
    chatId?:        string;
    phone?:         string;
    email?:         string;
    name?:          string;
    utmCampaign?:   string;
    utmMedium?:     string;
  }): Promise<void> {
    const { pixelId, accessToken, workspaceId, eventName, clickId } = params;

    const userData: Record<string, string> = {};
    if (params.email) userData.email = sha256(params.email);
    if (params.phone) userData.phone = sha256(params.phone.replace(/\D/g, ''));
    if (params.name)  userData.name  = sha256(params.name);

    const payload: Record<string, any> = {
      access_token:    accessToken,
      clickid:         clickId,           // sem underscore — exigido pela API
      event_name:      eventName,
      is_attributed:   1,                 // FIXO: int, não boolean true
      mmpcode:         'PL',              // FIXO
      pixelId,
      pixelSdkVersion: '9.9.9',           // FIXO
      testFlag:        false,             // FIXO: nunca true em produção
      trackFlag:       false,             // FIXO: false em eventos reais
      currency:        'BRL',
    };

    if (params.amount !== undefined)     payload.value      = String(params.amount);
    if (params.transactionId)            payload.order_id   = params.transactionId;
    if (params.utmCampaign)              payload.CampaignID = params.utmCampaign;
    if (params.utmMedium)                payload.adSETID    = params.utmMedium;
    if (Object.keys(userData).length)    payload.user_data  = JSON.stringify(userData);

    this.logger.log(
      `[Kwai] ${eventName} → pixelId=${pixelId} workspace=${workspaceId} clickid=${clickId.slice(0, 10)}...`,
    );

    let status = 'success';
    let responseData: any = null;
    let errorMessage: string | null = null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(ADSNEBULA_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  ctrl.signal,
      });
      responseData = await res.json();
      const ok = typeof responseData === 'object' && responseData?.result === 1;

      if (!ok) {
        status       = 'error';
        errorMessage = responseData?.message || `result=${responseData?.result}`;
        this.logger.error(`[Kwai] ${eventName} → ERRO: ${errorMessage} | response=${JSON.stringify(responseData)}`);
      } else {
        this.logger.log(`[Kwai] ${eventName} → atribuído com sucesso | workspace=${workspaceId}`);
      }
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'Timeout 10s' : err?.message || 'Network error';
      status       = 'error';
      errorMessage = msg;
      this.logger.error(`[Kwai] ${eventName} falha crítica: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    prismaAny(this.prisma).kwaiEventLog.create({
      data: {
        workspaceId,
        eventName,
        pixelId,
        clickId,
        chatId:      params.chatId        ?? null,
        orderId:     params.transactionId ?? null,
        value:       params.amount        ?? null,
        status,
        response:    responseData,
        errorMessage,
      },
    }).catch((e: any) =>
      this.logger.error(`[Kwai] Falha ao salvar log: ${e?.message}`),
    );
  }
}
