import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { encrypt, decrypt } from '../../common/utils/encryption';
import { UpdateUtmifyConfigDto, TestUtmifyDto } from './dto/update-utmify-config.dto';

const prismaAny = (p: PrismaService) => p as any;

function formatUTC(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

@Injectable()
export class UtmifyService {
  private readonly logger = new Logger(UtmifyService.name);

  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════
  // Legacy single-account endpoints (mantidos para compat)
  // ═══════════════════════════════════════════════════════

  async getConfig(workspaceId: string) {
    const config = await this.prisma.utmifyIntegration.findUnique({
      where: { workspaceId },
    });
    if (!config) return null;

    let tokenSuffix: string | null = null;
    try {
      const raw = decrypt(config.apiKey);
      if (raw?.length >= 6) tokenSuffix = raw.slice(-6);
    } catch { /* corrompido */ }

    return {
      isActive: config.isActive,
      tokenSuffix,
      eventPixGerado: (config as any).eventPixGerado ?? true,
      eventPixPago:   (config as any).eventPixPago   ?? true,
    };
  }

  async updateConfig(workspaceId: string, dto: UpdateUtmifyConfigDto) {
    if (!workspaceId || workspaceId === 'null' || workspaceId === 'undefined') {
      throw new BadRequestException('workspaceId inválido — faça login novamente');
    }

    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!ws) throw new NotFoundException(`Workspace '${workspaceId}' não encontrado`);

    const data: any = {};
    if (dto.apiToken)                     data.apiKey         = encrypt(dto.apiToken);
    if (dto.isActive   !== undefined)     data.isActive       = dto.isActive;
    if (dto.eventPixGerado !== undefined) data.eventPixGerado = dto.eventPixGerado;
    if (dto.eventPixPago   !== undefined) data.eventPixPago   = dto.eventPixPago;

    try {
      await this.prisma.utmifyIntegration.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          apiKey:        dto.apiToken ? encrypt(dto.apiToken) : '',
          isActive:      dto.isActive ?? false,
          ...(dto.eventPixGerado !== undefined && { eventPixGerado: dto.eventPixGerado }),
          ...(dto.eventPixPago   !== undefined && { eventPixPago:   dto.eventPixPago }),
        } as any,
        update: data,
      });
    } catch (err: any) {
      this.logger.error(`[UTMify] updateConfig error: ${err?.message}`);
      const msg = err?.message || '';
      if (msg.includes('Foreign key constraint')) {
        throw new BadRequestException('Workspace não encontrado — faça logout e login novamente');
      }
      throw new BadRequestException(`Erro ao salvar: ${msg}`);
    }

    return this.getConfig(workspaceId);
  }

  async testConnection(workspaceId: string, dto?: TestUtmifyDto) {
    let rawToken: string | null = null;

    if (dto?.apiToken) {
      rawToken = dto.apiToken;
    } else {
      const config = await this.prisma.utmifyIntegration.findUnique({ where: { workspaceId } });
      if (config?.apiKey) {
        try { rawToken = decrypt(config.apiKey); } catch { /* corrompido */ }
      }
    }

    if (!rawToken) {
      return { connected: false, message: 'API Token não configurado' };
    }

    return this.callTestApi(rawToken);
  }

  // ═══════════════════════════════════════════════════════
  // Multi-account CRUD
  // ═══════════════════════════════════════════════════════

  async listAccounts(workspaceId: string) {
    const accounts = await prismaAny(this.prisma).utmifyAccount.findMany({
      where: { workspaceId },
      include: { bot: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Auto-migração silenciosa: aparece na lista como "Conta Principal"
    // mas o formulário de CRIAÇÃO de nova conta sempre começa vazio
    if (accounts.length === 0) {
      const legacy = await this.prisma.utmifyIntegration.findUnique({ where: { workspaceId } });
      if (legacy?.apiKey) {
        try {
          const created = await prismaAny(this.prisma).utmifyAccount.create({
            data: {
              workspaceId,
              name:           'Conta Principal',
              apiKey:         legacy.apiKey,
              isActive:       legacy.isActive,
              eventPixGerado: (legacy as any).eventPixGerado ?? true,
              eventPixPago:   (legacy as any).eventPixPago   ?? true,
            },
            include: { bot: { select: { id: true, username: true } } },
          });
          return [this.formatAccount(created)];
        } catch { /* ignora race condition — segundo request retorna lista vazia temporariamente */ }
      }
      return [];
    }

    return accounts.map((a: any) => this.formatAccount(a));
  }

  async createAccount(workspaceId: string, dto: {
    name?: string;
    apiToken: string;
    botId?: string;
    isActive?: boolean;
    eventPixGerado?: boolean;
    eventPixPago?: boolean;
  }) {
    const count = await prismaAny(this.prisma).utmifyAccount.count({ where: { workspaceId } });
    if (count >= 5) {
      throw new BadRequestException('Limite máximo de 5 contas UTMify por workspace atingido');
    }

    if (!dto.apiToken || dto.apiToken.trim().length < 20) {
      throw new BadRequestException('API Token inválido (mínimo 20 caracteres)');
    }

    const data: any = {
      workspaceId,
      apiKey:         encrypt(dto.apiToken.trim()),
      name:           dto.name?.trim() || null,
      isActive:       dto.isActive  ?? true,
      eventPixGerado: dto.eventPixGerado ?? true,
      eventPixPago:   dto.eventPixPago   ?? true,
    };

    if (dto.botId) {
      const bot = await this.prisma.telegramBot.findFirst({ where: { id: dto.botId, workspaceId } });
      if (!bot) throw new BadRequestException('Bot não encontrado neste workspace');
      data.botId = dto.botId;
    }

    const created = await prismaAny(this.prisma).utmifyAccount.create({
      data,
      include: { bot: { select: { id: true, username: true } } },
    });

    return this.formatAccount(created);
  }

  async updateAccount(workspaceId: string, accountId: string, dto: {
    name?: string;
    apiToken?: string;
    botId?: string | null;
    isActive?: boolean;
    eventPixGerado?: boolean;
    eventPixPago?: boolean;
  }) {
    const account = await prismaAny(this.prisma).utmifyAccount.findFirst({
      where: { id: accountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Conta UTMify não encontrada');

    const data: any = {};
    if (dto.name        !== undefined) data.name           = dto.name?.trim() || null;
    if (dto.apiToken)                  data.apiKey         = encrypt(dto.apiToken.trim());
    if (dto.isActive    !== undefined) data.isActive       = dto.isActive;
    if (dto.eventPixGerado !== undefined) data.eventPixGerado = dto.eventPixGerado;
    if (dto.eventPixPago   !== undefined) data.eventPixPago   = dto.eventPixPago;

    if (dto.botId !== undefined) {
      if (dto.botId === null) {
        data.botId = null;
      } else {
        const bot = await this.prisma.telegramBot.findFirst({ where: { id: dto.botId, workspaceId } });
        if (!bot) throw new BadRequestException('Bot não encontrado neste workspace');
        data.botId = dto.botId;
      }
    }

    const updated = await prismaAny(this.prisma).utmifyAccount.update({
      where: { id: accountId },
      data,
      include: { bot: { select: { id: true, username: true } } },
    });

    return this.formatAccount(updated);
  }

  async deleteAccount(workspaceId: string, accountId: string) {
    const account = await prismaAny(this.prisma).utmifyAccount.findFirst({
      where: { id: accountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Conta UTMify não encontrada');

    await prismaAny(this.prisma).utmifyAccount.delete({ where: { id: accountId } });
    return { deleted: true };
  }

  async testAccountById(workspaceId: string, accountId: string) {
    const account = await prismaAny(this.prisma).utmifyAccount.findFirst({
      where: { id: accountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Conta UTMify não encontrada');

    let rawToken: string | null = null;
    try { rawToken = decrypt(account.apiKey); } catch { /* corrompido */ }
    if (!rawToken) return { connected: false, message: 'API Token não configurado' };

    return this.callTestApi(rawToken);
  }

  private formatAccount(a: any) {
    let tokenSuffix: string | null = null;
    try {
      const raw = decrypt(a.apiKey);
      if (raw?.length >= 6) tokenSuffix = raw.slice(-6);
    } catch { /* corrompido */ }

    return {
      id:             a.id,
      name:           a.name,
      botId:          a.botId,
      botUsername:    a.bot?.username || null,
      isActive:       a.isActive,
      eventPixGerado: a.eventPixGerado,
      eventPixPago:   a.eventPixPago,
      tokenSuffix,
      createdAt:      a.createdAt,
    };
  }

  // ═══════════════════════════════════════════════════════
  // Pontos de entrada: PIX gerado / aprovado
  // ═══════════════════════════════════════════════════════

  async handlePixCreated(params: {
    workspaceId: string;
    leadId: string;
    transactionId: string;
    amountInCents: number;
    productId?: string;
    productName?: string;
    createdAt: Date;
  }): Promise<void> {
    await this.dispatchToAllAccounts({
      workspaceId:   params.workspaceId,
      leadId:        params.leadId,
      toggle:        'eventPixGerado',
      orderId:       params.transactionId,
      amountInCents: params.amountInCents,
      productId:     params.productId,
      productName:   params.productName,
      pixStatus:     'waiting_payment',
      createdAt:     params.createdAt,
      approvedDate:  null,
    });
  }

  async handlePixApproved(params: {
    workspaceId: string;
    leadId: string;
    transactionId: string;
    amountInCents: number;
    productId?: string;
    productName?: string;
    approvedAt: Date;
  }): Promise<void> {
    await this.dispatchToAllAccounts({
      workspaceId:   params.workspaceId,
      leadId:        params.leadId,
      toggle:        'eventPixPago',
      orderId:       params.transactionId,
      amountInCents: params.amountInCents,
      productId:     params.productId,
      productName:   params.productName,
      pixStatus:     'paid',
      createdAt:     params.approvedAt,
      approvedDate:  params.approvedAt,
    });
  }

  private async dispatchToAllAccounts(p: {
    workspaceId:   string;
    leadId:        string;
    toggle:        'eventPixGerado' | 'eventPixPago';
    orderId:       string;
    amountInCents: number;
    productId?:    string;
    productName?:  string;
    pixStatus:     string;
    createdAt:     Date;
    approvedDate:  Date | null;
  }): Promise<void> {
    const credsList = await this.resolveAllCredentials(p.workspaceId, p.toggle);
    if (credsList.length === 0) return;

    const lead = await this.resolveLeadData(p.leadId);

    const payload = {
      orderId:       p.orderId,
      platform:      'FireBOT',
      paymentMethod: 'pix',
      status:        p.pixStatus,
      createdAt:     formatUTC(p.createdAt),
      approvedDate:  p.approvedDate ? formatUTC(p.approvedDate) : null,
      refundedAt:    null,
      customer:      lead?.customer ?? { name: null, email: null, phone: null, document: null, country: 'BR', ip: null },
      products: [{
        id:           p.productId || 'generic',
        name:         p.productName || 'Produto',
        planId:       null,
        planName:     null,
        quantity:     1,
        priceInCents: p.amountInCents,
      }],
      trackingParameters: lead?.tracking ?? { src: null, sck: null, utm_source: null, utm_campaign: null, utm_medium: null, utm_content: null, utm_term: null },
      commission: {
        totalPriceInCents:    p.amountInCents,
        gatewayFeeInCents:    0,
        userCommissionInCents: p.amountInCents,
        currency:             'BRL',
      },
      isTest: false,
    };

    const meta = {
      workspaceId:  p.workspaceId,
      chatId:       lead?.chatId ?? null,
      orderId:      p.orderId,
      status:       p.pixStatus,
      valueInCents: p.amountInCents,
    };

    await Promise.allSettled(
      credsList.map(creds => this.sendOrder(creds.apiToken, payload, meta)),
    );
  }

  // ═══════════════════════════════════════════════════════
  // Internos
  // ═══════════════════════════════════════════════════════

  private async resolveAllCredentials(
    workspaceId: string,
    toggle: 'eventPixGerado' | 'eventPixPago',
  ): Promise<{ apiToken: string }[]> {
    try {
      // Tenta multi-account primeiro
      const accounts = await prismaAny(this.prisma).utmifyAccount.findMany({
        where: { workspaceId, isActive: true, [toggle]: true },
      });

      if (accounts.length > 0) {
        return accounts
          .map((a: any) => {
            try { return { apiToken: decrypt(a.apiKey) }; } catch { return null; }
          })
          .filter(Boolean) as { apiToken: string }[];
      }

      // Fallback: integração legada
      const legacy = await this.prisma.utmifyIntegration.findUnique({ where: { workspaceId } });
      if (!legacy || !legacy.isActive) return [];
      if (!(legacy as any)[toggle]) return [];
      if (!legacy.apiKey) return [];
      const apiToken = decrypt(legacy.apiKey);
      return [{ apiToken }];
    } catch {
      return [];
    }
  }

  private async resolveLeadData(leadId: string): Promise<{
    chatId: string | null;
    customer: { name: string | null; email: string | null; phone: string | null; document: null; country: string; ip: string | null };
    tracking: { src: null; sck: null; utm_source: string | null; utm_campaign: string | null; utm_medium: string | null; utm_content: string | null; utm_term: string | null };
  } | null> {
    try {
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { telegramId: true, name: true, email: true, phone: true },
      });

      let userTracking: any = null;
      if (lead?.telegramId) {
        userTracking = await prismaAny(this.prisma).userTracking.findFirst({
          where: { chatId: lead.telegramId },
          orderBy: { capturedAt: 'desc' },
        });
      }

      return {
        chatId: lead?.telegramId ?? null,
        customer: {
          name:     lead?.name  || 'Cliente',
          email:    lead?.email || 'cliente@firebot.app',
          phone:    lead?.phone || null,
          document: null,
          country: 'BR',
          ip: userTracking?.ip || '127.0.0.1',
        },
        tracking: {
          src:          null,
          sck:          null,
          utm_source:   userTracking?.utmSource   || null,
          utm_campaign: userTracking?.utmCampaign || null,
          utm_medium:   userTracking?.utmMedium   || null,
          utm_content:  userTracking?.utmContent  || null,
          utm_term:     userTracking?.utmTerm     || null,
        },
      };
    } catch {
      return null;
    }
  }

  private async callTestApi(rawToken: string) {
    const testPayload = {
      orderId: `FIREBOT_TEST_${Date.now()}`,
      platform: 'FireBOT',
      paymentMethod: 'pix',
      status: 'waiting_payment',
      createdAt: formatUTC(new Date()),
      approvedDate: null,
      refundedAt: null,
      customer: { name: 'Teste FireBOT', email: 'teste@firebot.app', phone: null, document: null, country: 'BR', ip: '127.0.0.1' },
      products: [{ id: 'FIREBOT_TEST', name: 'Teste de Conexão FireBOT', planId: null, planName: null, quantity: 1, priceInCents: 100 }],
      trackingParameters: { src: null, sck: null, utm_source: null, utm_campaign: null, utm_medium: null, utm_content: null, utm_term: null },
      commission: { totalPriceInCents: 100, gatewayFeeInCents: 0, userCommissionInCents: 100, currency: 'BRL' },
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch('https://api.utmify.com.br/api-credentials/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-token': rawToken },
        body: JSON.stringify(testPayload),
        signal: ctrl.signal,
      });
      const data = await res.json();
      this.logger.log(`[UTMify] test HTTP ${res.status} → ${JSON.stringify(data)}`);
      if (!res.ok) {
        return { connected: false, message: data?.message || data?.error || `Erro ${res.status}` };
      }
      return { connected: true, message: 'Conexão bem-sucedida com a UTMify' };
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'Timeout: UTMify não respondeu em 10s' : (err?.message || 'Erro de rede');
      return { connected: false, message: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  private async sendOrder(
    apiToken: string,
    payload: Record<string, any>,
    meta: { workspaceId: string; chatId: string | null; orderId: string; status: string; valueInCents: number },
  ): Promise<void> {
    let responseData: any = null;
    let errorMessage: string | null = null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch('https://api.utmify.com.br/api-credentials/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-token': apiToken },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      responseData = await res.json();

      if (!res.ok) {
        errorMessage = responseData?.message || responseData?.error || `HTTP ${res.status}`;
        this.logger.error(`[UTMify] ${meta.status} → ${errorMessage}`);
      } else {
        this.logger.log(`[UTMify] ${meta.status} enviado | orderId=${meta.orderId}`);
      }
    } catch (err: any) {
      errorMessage = err?.name === 'AbortError' ? 'Timeout 10s' : (err?.message || 'Erro de rede');
      this.logger.error(`[UTMify] Falha: ${errorMessage} | orderId=${meta.orderId}`);
    } finally {
      clearTimeout(timer);
    }

    prismaAny(this.prisma).utmifyEventLog.create({
      data: {
        workspaceId:  meta.workspaceId,
        chatId:       meta.chatId,
        orderId:      meta.orderId,
        status:       meta.status,   // 'waiting_payment' ou 'paid'
        valueInCents: meta.valueInCents,
        response:     responseData,
        errorMessage,
        sentAt:       new Date(),
      },
    }).catch((e: any) =>
      this.logger.error(`[UTMify] Falha ao salvar log: ${e?.message}`),
    );
  }
}
