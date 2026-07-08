import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { encrypt, decrypt } from '../../common/utils/encryption';
import { AcquirerRegistryService } from '../acquirers/acquirer-registry.service';
import { PodpayAcquirer } from '../acquirers/providers/podpay/podpay.acquirer';
import { buildCustomerData } from '../acquirers/providers/podpay/pix-customer-data';
import { CreateAcquirerDto } from './dto/create-acquirer.dto';
import { UpdateAcquirerDto } from './dto/update-acquirer.dto';
import * as QRCode from 'qrcode';

// ── BaassPago Cash-out ─────────────────────────────────────────────────────
const CASHOUT_BASE_URL = 'https://pagamentos.basspago.com.br';
const CASHOUT_CLIENT_ID     = process.env.CASHOUT_CLIENT_ID     ?? '';
const CASHOUT_CLIENT_SECRET = process.env.CASHOUT_CLIENT_SECRET ?? '';

interface CashoutTokenCache { token: string; expiresAt: number }
let _cashoutTokenCache: CashoutTokenCache | null = null;

function buildCashoutAgent(): https.Agent {
  const certsDir = path.resolve(process.cwd(), 'certs', 'cashout');
  try {
    return new https.Agent({
      cert: fs.readFileSync(path.join(certsDir, 'BASSPAGO_236.crt')),
      key:  fs.readFileSync(path.join(certsDir, 'BASSPAGO_236.key')),
      rejectUnauthorized: false,
    });
  } catch {
    return new https.Agent({ rejectUnauthorized: false });
  }
}

async function getCashoutToken(): Promise<string> {
  if (_cashoutTokenCache && Date.now() < _cashoutTokenCache.expiresAt - 30_000) {
    return _cashoutTokenCache.token;
  }
  const agent = buildCashoutAgent();
  const body = [
    `client_id=${encodeURIComponent(CASHOUT_CLIENT_ID)}`,
    `client_secret=${encodeURIComponent(CASHOUT_CLIENT_SECRET)}`,
    'grant_type=client_credentials',
  ].join('&');
  const { data } = await axios.post(`${CASHOUT_BASE_URL}/api/v2/oauth/token`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    httpsAgent: agent,
    timeout: 15_000,
  });
  const token = (data.access_token ?? data.accessToken) as string;
  const expiresIn = (data.expires_in ?? data.expiresIn ?? 3600) as number;
  _cashoutTokenCache = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

export type PixKeyType = 'CPF' | 'CNPJ' | 'PHONE' | 'EVP';

export interface WithdrawDto {
  pixKeyType: PixKeyType;
  pixKey:     string;
  amount:     number;
  description?: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private acquirerRegistry: AcquirerRegistryService,
    @InjectQueue('telegram-messages')   private qMessages:    Queue,
    @InjectQueue('telegram-remarketing') private qRemarketing: Queue,
    @InjectQueue('webhook-events')      private qWebhooks:    Queue,
    @InjectQueue('scheduled-tasks')     private qScheduled:   Queue,
  ) {}

  // ── Users ───────────────────────────────────────────────────────────────────

  async listUsers(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, role: true,
          isActive: true, createdAt: true,
          _count: { select: { workspaces: true } },
        },
      }),
      this.prisma.user.count(),
    ]);
    return { users, total, page, limit };
  }

  async toggleUserActive(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
      select: { id: true, isActive: true },
    });
  }

  async setUserRole(id: string, role: 'USER' | 'ADMIN') {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, role: true },
    });
  }

  // ── Bots ────────────────────────────────────────────────────────────────────

  async listBots(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const where: any = status ? { status } : {};
    const [bots, total] = await Promise.all([
      this.prisma.telegramBot.findMany({
        skip,
        take: limit,
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, username: true, status: true, isActive: true,
          createdAt: true,
          workspace: {
            select: {
              id: true, name: true,
              owner: { select: { id: true, name: true, email: true } },
            },
          },
          _count: { select: { flows: true } },
        },
      }),
      this.prisma.telegramBot.count({ where }),
    ]);
    return { bots, total, page, limit };
  }

  async setBotStatus(id: string, status: 'ACTIVE' | 'PENDING_REVIEW' | 'BLOCKED') {
    const bot = await this.prisma.telegramBot.findUnique({ where: { id } });
    if (!bot) throw new NotFoundException('Bot not found');
    return this.prisma.telegramBot.update({
      where: { id },
      data: { status },
      select: { id: true, username: true, status: true },
    });
  }

  // ── Platform stats ──────────────────────────────────────────────────────────

  async getStats() {
    const [totalUsers, totalBots, totalFlows, totalWorkspaces, botsByStatus] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.telegramBot.count(),
      this.prisma.flow.count(),
      this.prisma.workspace.count(),
      this.prisma.telegramBot.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
    return {
      totalUsers,
      totalBots,
      totalFlows,
      totalWorkspaces,
      botsByStatus: botsByStatus.reduce((acc: any, r: any) => {
        acc[r.status] = r._count._all;
        return acc;
      }, {}),
    };
  }

  // ── Dashboard analytics (platform-wide) ────────────────────────────────────

  private parseDateRange(startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end   = endDate   ? new Date(endDate)   : new Date();
    return { start, end };
  }

  async getDashboardOverview(startDate?: string, endDate?: string) {
    const { start, end } = this.parseDateRange(startDate, endDate);

    const [totalLeads, approvedCount, revenueAgg, pixGenerated] = await Promise.all([
      this.prisma.lead.count({ where: { createdAt: { gte: start, lte: end } } }),
      this.prisma.payment.count({
        where: { status: 'APPROVED' as any, createdAt: { gte: start, lte: end } },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'APPROVED' as any, createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      this.prisma.payment.count({ where: { createdAt: { gte: start, lte: end } } }),
    ]);

    const revenue       = Math.round(Number(revenueAgg._sum.amount || 0) * 100) / 100;
    const conversionRate = totalLeads > 0 ? Math.round((approvedCount / totalLeads) * 10000) / 100 : 0;
    const averageTicket  = approvedCount > 0 ? Math.round((revenue / approvedCount) * 100) / 100 : 0;

    return { revenue, salesCount: approvedCount, conversionRate, averageTicket, pixGenerated, pixPaid: approvedCount, newLeads: totalLeads };
  }

  async getDashboardSales(startDate?: string, endDate?: string) {
    const { start, end } = this.parseDateRange(startDate, endDate);

    const sales = await this.prisma.payment.findMany({
      where: { status: 'APPROVED' as any, createdAt: { gte: start, lte: end } },
      select: { createdAt: true, amount: true },
      orderBy: { createdAt: 'asc' },
    });

    const grouped = new Map<string, { count: number; revenue: number }>();
    for (const sale of sales) {
      const day     = sale.createdAt.toISOString().split('T')[0];
      const current = grouped.get(day) || { count: 0, revenue: 0 };
      current.count   += 1;
      current.revenue += Number(sale.amount);
      grouped.set(day, current);
    }

    return Array.from(grouped, ([date, d]) => ({ date, sales: d.count, revenue: Math.round(d.revenue * 100) / 100 }));
  }

  async getDashboardLeads(startDate?: string, endDate?: string) {
    const { start, end } = this.parseDateRange(startDate, endDate);

    const leads = await this.prisma.lead.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const grouped = new Map<string, number>();
    for (const l of leads) {
      const day = l.createdAt.toISOString().split('T')[0];
      grouped.set(day, (grouped.get(day) || 0) + 1);
    }

    return Array.from(grouped, ([date, count]) => ({ date, count }));
  }

  async getDashboardTransactions(startDate?: string, endDate?: string) {
    const { start, end } = this.parseDateRange(startDate, endDate);

    return this.prisma.payment.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, transactionId: true, amount: true, status: true,
        createdAt: true, paidAt: true,
        lead: {
          select: {
            id: true, name: true, leadUid: true, telegramId: true,
            workspace: { select: { id: true, name: true, owner: { select: { name: true, email: true } } } },
          },
        },
        product: { select: { id: true, name: true } },
      },
    });
  }

  async getDashboardActivity(startDate?: string, endDate?: string) {
    const { start, end } = this.parseDateRange(startDate, endDate);

    return this.prisma.event.findMany({
      where: { eventName: 'MESSAGE_SENT', createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, eventName: true, source: true, createdAt: true, metadata: true,
        lead: {
          select: {
            id: true, name: true, leadUid: true, telegramId: true,
            workspace: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  // ── Acquirers ───────────────────────────────────────────────────────────────

  async listAcquirers() {
    const list = await this.prisma.acquirer.findMany({
      orderBy: { priority: 'asc' },
    });
    // Mascara campos sensíveis
    return list.map(a => ({
      ...a,
      apiKey: '***',
      apiSecret: a.apiSecret ? '***' : null,
      webhookSecret: a.webhookSecret ? '***' : null,
    }));
  }

  async getAcquirer(id: string) {
    const a = await this.prisma.acquirer.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Acquirer not found');
    return {
      ...a,
      apiKey: decrypt(a.apiKey),
      apiSecret: a.apiSecret ? decrypt(a.apiSecret) : null,
      webhookSecret: a.webhookSecret ? decrypt(a.webhookSecret) : null,
    };
  }

  async createAcquirer(dto: CreateAcquirerDto) {
    const created = await this.prisma.acquirer.create({
      data: {
        name:              dto.name,
        slug:              dto.slug,
        apiKey:            encrypt(dto.apiKey),
        apiSecret:         dto.apiSecret         ? encrypt(dto.apiSecret)        : null,
        endpointCreatePix: dto.endpointCreatePix ?? null,
        endpointCheckPix:  dto.endpointCheckPix  ?? null,
        webhookSecret:     dto.webhookSecret     ? encrypt(dto.webhookSecret)    : null,
        environment:       dto.environment       ?? 'production',
        logoUrl:           dto.logoUrl           ?? null,
        priority:          dto.priority          ?? 0,
        isActive:          dto.isActive          ?? false, // desativado até validar
        credentialStatus:  'UNCONFIGURED',
      },
    });
    // Mascara campos sensíveis, igual listAcquirers — não há motivo pra devolver o blob cifrado
    return {
      ...created,
      apiKey: '***',
      apiSecret: created.apiSecret ? '***' : null,
      webhookSecret: created.webhookSecret ? '***' : null,
    };
  }

  async updateAcquirer(id: string, dto: UpdateAcquirerDto) {
    const existing = await this.prisma.acquirer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Acquirer not found');

    const data: any = { ...dto };
    if (dto.apiKey)        data.apiKey        = encrypt(dto.apiKey);
    if (dto.apiSecret)     data.apiSecret     = encrypt(dto.apiSecret);
    if (dto.webhookSecret) data.webhookSecret = encrypt(dto.webhookSecret);

    // Se as credenciais mudarem, reseta o status
    if (dto.apiKey || dto.apiSecret) {
      data.credentialStatus = 'UNCONFIGURED';
      data.lastValidatedAt  = null;
    }

    const updated = await this.prisma.acquirer.update({ where: { id }, data });
    return {
      ...updated,
      apiKey: '***',
      apiSecret: updated.apiSecret ? '***' : null,
      webhookSecret: updated.webhookSecret ? '***' : null,
    };
  }

  async deleteAcquirer(id: string) {
    const existing = await this.prisma.acquirer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Acquirer not found');
    return this.prisma.acquirer.delete({ where: { id } });
  }

  async reorderAcquirers(ids: string[]) {
    await Promise.all(
      ids.map((id, idx) =>
        this.prisma.acquirer.update({ where: { id }, data: { priority: idx } }),
      ),
    );
    return this.listAcquirers();
  }

  // ── Adquirente customizado por workspace ────────────────────────────────────

  async listUserWorkspaces(userId: string) {
    return this.prisma.workspace.findMany({
      where:  { ownerId: userId },
      select: { id: true, name: true, isActive: true },
    });
  }

  async getWorkspaceAcquirerOrder(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { id: true, name: true, acquirerOrder: true, disabledAcquirerIds: true },
    });
    if (!ws) throw new NotFoundException('Workspace não encontrado');

    const activeAcquirers = await this.prisma.acquirer.findMany({
      where:   { isActive: true },
      orderBy: { priority: 'asc' },
      select:  { id: true, name: true, slug: true, credentialStatus: true },
    });

    return {
      workspaceId:         ws.id,
      workspaceName:       ws.name,
      acquirerOrder:       ws.acquirerOrder,
      disabledAcquirerIds: ws.disabledAcquirerIds,
      activeAcquirers,
    };
  }

  async setWorkspaceAcquirerOrder(workspaceId: string, ids: string[], disabledIds?: string[]) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException('Workspace não encontrado');

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data:  { acquirerOrder: ids ?? [], disabledAcquirerIds: disabledIds ?? [] },
    });

    return this.getWorkspaceAcquirerOrder(workspaceId);
  }

  /**
   * Valida as credenciais de um adquirente contra a API real.
   * Atualiza credentialStatus e lastValidatedAt no banco.
   */
  async validateAcquirerCredentials(id: string): Promise<{
    success: boolean;
    credentialStatus: string;
    message: string;
  }> {
    const a = await this.prisma.acquirer.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Acquirer not found');

    const handler = this.acquirerRegistry.getHandler(a.slug);
    if (!handler) {
      throw new BadRequestException(
        `Adquirente com slug "${a.slug}" não possui handler registrado`,
      );
    }

    const credentials = this.acquirerRegistry.getCredentials(a);

    try {
      const valid = await handler.validateCredentials(credentials);
      const credentialStatus = valid ? 'VALID' : 'INVALID';

      await this.prisma.acquirer.update({
        where: { id },
        data: {
          credentialStatus,
          lastValidatedAt: new Date(),
          isActive: valid, // ativa automaticamente se válido
        },
      });

      return {
        success: valid,
        credentialStatus,
        message: valid
          ? 'Credenciais válidas. Adquirente ativado.'
          : 'Credenciais inválidas. Verifique a API Key.',
      };
    } catch (error) {
      await this.prisma.acquirer.update({
        where: { id },
        data: { credentialStatus: 'INVALID', lastValidatedAt: new Date(), isActive: false },
      });

      return {
        success: false,
        credentialStatus: 'INVALID',
        message: `Erro ao validar: ${error.message}`,
      };
    }
  }

  /**
   * Gera uma cobrança PIX de R$10 para testar o adquirente em ambiente real.
   */
  async testAcquirerPix(id: string): Promise<{
    success: boolean;
    transactionId?: string;
    pixCode?: string;
    qrCodeImage?: string;
    credentialStatus: string;
    message: string;
  }> {
    const a = await this.prisma.acquirer.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Acquirer not found');

    if (a.credentialStatus !== 'VALID' && a.credentialStatus !== 'UNSTABLE') {
      throw new BadRequestException(
        'Valide as credenciais antes de testar o PIX.',
      );
    }

    const handler = this.acquirerRegistry.getHandler(a.slug);
    if (!handler) {
      throw new BadRequestException(
        `Adquirente com slug "${a.slug}" não possui handler registrado`,
      );
    }

    const credentials = this.acquirerRegistry.getCredentials(a);

    try {
      const seed = `test_admin_${a.slug}_${Date.now()}`;
      const cd = buildCustomerData(seed);
      const customer = {
        name:        cd.name,
        email:       cd.email,
        document:    cd.cpf,
        phone:       cd.phone,
        externalId:  `test_${Date.now()}`,
        productName: 'Produto 1',
      };
      // Dado de teste sintético (buildCustomerData), mas evita logar documento mesmo assim
      this.logger.log(`[testAcquirerPix] ${a.slug} customer=${JSON.stringify({ name: customer.name, email: customer.email })}`);
      const result = await handler.createPix(10.00, customer, credentials);
      this.logger.log(`[testAcquirerPix] ${a.slug} result=${JSON.stringify({ transactionId: result.transactionId, pixCode: result.pixCode?.substring(0, 40), hasQr: !!result.qrCodeImage })}`);

      let qrCodeImage = result.qrCodeImage;
      if (!qrCodeImage && result.pixCode) {
        qrCodeImage = await QRCode.toDataURL(result.pixCode, {
          width:  300,
          margin: 2,
          color:  { dark: '#000000', light: '#ffffff' },
        });
      }

      await this.prisma.acquirer.update({
        where: { id },
        data: { credentialStatus: 'VALID', lastTestedAt: new Date() },
      });

      return {
        success:          true,
        transactionId:    result.transactionId,
        pixCode:          result.pixCode,
        qrCodeImage,
        credentialStatus: 'VALID',
        message:          'Cobrança de R$10 gerada com sucesso. Adquirente operacional.',
      };
    } catch (error) {
      await this.prisma.acquirer.update({
        where: { id },
        data: { credentialStatus: 'UNSTABLE' },
      });

      return {
        success:          false,
        credentialStatus: 'UNSTABLE',
        message:          `Falha no teste PIX: ${error.message}`,
      };
    }
  }

  // ── Podpay dedicado ──────────────────────────────────────────────────────────

  /** Retorna o adquirente Podpay configurado (sem a chave) ou null */
  async getPodpayStatus() {
    const a = await this.prisma.acquirer.findUnique({ where: { slug: 'podpay' } });
    if (!a) return { configured: false };
    return {
      configured:       true,
      id:               a.id,
      name:             a.name,
      environment:      a.environment,
      credentialStatus: a.credentialStatus,
      isActive:         a.isActive,
      lastValidatedAt:  a.lastValidatedAt,
      lastTestedAt:     a.lastTestedAt,
      // Indica se a chave começa com sk_test (sandbox) ou sk_live (produção)
      keyMasked:        '***',
    };
  }

  /**
   * Configura a Podpay em um único passo:
   * salva a API Key → auto-detecta ambiente → valida → ativa se válido.
   */
  async setupPodpay(apiKey: string, environment?: string): Promise<{
    success: boolean;
    id: string;
    credentialStatus: string;
    environment: string;
    message: string;
  }> {
    if (!apiKey?.trim()) throw new BadRequestException('API Key é obrigatória');

    // Auto-detecta ambiente pela chave
    const detectedEnv = apiKey.startsWith('sk_test') ? 'sandbox' : 'production';
    const env = environment ?? detectedEnv;

    // Valida antes de salvar
    const handler = new PodpayAcquirer();
    let valid = false;
    try {
      valid = await handler.validateCredentials({ apiKey, environment: env });
    } catch (_) {
      valid = false;
    }

    const credentialStatus = valid ? 'VALID' : 'INVALID';

    // Upsert pelo slug 'podpay'
    const existing = await this.prisma.acquirer.findUnique({ where: { slug: 'podpay' } });

    let record: any;
    const data: any = {
      name:             'Podpay',
      apiKey:           encrypt(apiKey),
      environment:      env,
      credentialStatus,
      lastValidatedAt:  new Date(),
      isActive:         valid,
      priority:         existing?.priority ?? 0,
    };

    if (existing) {
      record = await this.prisma.acquirer.update({ where: { id: existing.id }, data });
    } else {
      record = await this.prisma.acquirer.create({
        data: { ...data, slug: 'podpay' },
      });
    }

    return {
      success:          valid,
      id:               record.id,
      credentialStatus,
      environment:      env,
      message: valid
        ? `Podpay conectada com sucesso no ambiente ${env === 'sandbox' ? 'sandbox' : 'produção'}.`
        : 'API Key inválida. Verifique a chave no dashboard Podpay.',
    };
  }

  /** Consulta o saldo disponível na Podpay */
  async getPodpayBalance(): Promise<{
    amount: number;
    waitingFunds: number;
    maxAntecipable: number;
    reserve: number;
  }> {
    const a = await this.prisma.acquirer.findUnique({ where: { slug: 'podpay' } });
    if (!a || a.credentialStatus !== 'VALID') {
      throw new BadRequestException('Podpay não configurada ou credenciais inválidas.');
    }

    const handler     = new PodpayAcquirer();
    const credentials = this.acquirerRegistry.getCredentials(a);
    return handler.getBalance(credentials);
  }

  /** Lista as transações recentes da Podpay */
  async getPodpayTransactions(page = 1, pageSize = 20) {
    const a = await this.prisma.acquirer.findUnique({ where: { slug: 'podpay' } });
    if (!a || a.credentialStatus !== 'VALID') {
      throw new BadRequestException('Podpay não configurada ou credenciais inválidas.');
    }

    const handler     = new PodpayAcquirer();
    const credentials = this.acquirerRegistry.getCredentials(a);
    return handler.listTransactions(credentials, page, pageSize);
  }

  // ── Metrics (on-demand, read-only) ───────────────────────────────────────────

  async getMetrics() {
    const startedAt = Date.now();

    // ── Sistema ─────────────────────────────────────────────────────────────────
    const totalMem   = os.totalmem();
    const freeMem    = os.freemem();
    const usedMem    = totalMem - freeMem;
    const loadAvg    = os.loadavg();   // [1min, 5min, 15min]
    const cpuCount   = os.cpus().length;
    const procMem    = process.memoryUsage();

    const system = {
      platform:       os.platform(),
      nodeVersion:    process.version,
      processUptime:  Math.floor(process.uptime()),
      systemUptime:   Math.floor(os.uptime()),
      cpuCores:       cpuCount,
      loadAvg1m:      parseFloat(loadAvg[0].toFixed(2)),
      loadAvg5m:      parseFloat(loadAvg[1].toFixed(2)),
      loadAvg15m:     parseFloat(loadAvg[2].toFixed(2)),
      memTotalMb:     Math.round(totalMem  / 1024 / 1024),
      memUsedMb:      Math.round(usedMem   / 1024 / 1024),
      memFreeMb:      Math.round(freeMem   / 1024 / 1024),
      memUsedPercent: parseFloat(((usedMem / totalMem) * 100).toFixed(1)),
      heapUsedMb:     Math.round(procMem.heapUsed  / 1024 / 1024),
      heapTotalMb:    Math.round(procMem.heapTotal  / 1024 / 1024),
      rssMb:          Math.round(procMem.rss        / 1024 / 1024),
    };

    // ── Redis ────────────────────────────────────────────────────────────────────
    let redis: any = { status: 'error', latencyMs: null };
    try {
      const t0 = Date.now();
      await this.redis.ping();
      const latencyMs = Date.now() - t0;

      // Uma única chamada INFO traz todos os campos necessários
      const info = await this.redis.info();

      const parseNum = (key: string) => { const m = info.match(new RegExp(`${key}:(\\d+)`)); return m ? parseInt(m[1]) : null; };
      const parseStr = (key: string) => { const m = info.match(new RegExp(`${key}:([^\\r\\n]+)`)); return m ? m[1].trim() : null; };

      const usedMemoryBytes = parseNum('used_memory');
      const maxMemoryBytes  = parseNum('maxmemory');

      redis = {
        status:                   'ok',
        latencyMs,
        version:                  parseStr('redis_version'),
        uptimeSecs:               parseNum('uptime_in_seconds'),
        usedMemoryMb:             usedMemoryBytes != null ? Math.round(usedMemoryBytes / 1024 / 1024) : null,
        maxMemoryMb:              maxMemoryBytes  ? Math.round(maxMemoryBytes / 1024 / 1024) : 0,
        connectedClients:         parseNum('connected_clients'),
        blockedClients:           parseNum('blocked_clients'),
        maxClients:               parseNum('maxclients'),
        totalCommandsProcessed:   parseNum('total_commands_processed'),
        totalConnectionsReceived: parseNum('total_connections_received'),
        opsPerSec:                parseNum('instantaneous_ops_per_sec'),
        keyspaceHits:             parseNum('keyspace_hits'),
        keyspaceMisses:           parseNum('keyspace_misses'),
      };
    } catch (e: any) {
      redis = { status: 'error', latencyMs: null, error: e.message };
    }

    // ── Database ─────────────────────────────────────────────────────────────────
    let database: any = { status: 'error', latencyMs: null };
    try {
      const t0 = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      database = { status: 'ok', latencyMs: Date.now() - t0 };
    } catch (e: any) {
      database = { status: 'error', latencyMs: null, error: e.message };
    }

    // ── Flows & Bots & Payments (queries leves) ───────────────────────────────
    const [
      flowCounts,
      botCounts,
      paymentPending,
      paymentToday,
      userCount,
      leadCount,
    ] = await Promise.all([
      this.prisma.flow.groupBy({ by: ['isActive'], _count: true }),
      this.prisma.telegramBot.groupBy({ by: ['status'], _count: true }),
      // Conta apenas pagamentos que ainda estão dentro do prazo de validade (não expirados)
      this.prisma.payment.count({
        where: {
          status:    'PENDING',
          expiresAt: { gt: new Date() },
          gateway:   { not: 'simulated' },
        },
      }),
      this.prisma.payment.count({
        where: {
          status:    'APPROVED',
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.prisma.user.count(),
      this.prisma.lead.count(),
    ]);

    const flows = {
      active:   flowCounts.find(r => r.isActive === true)?._count  ?? 0,
      inactive: flowCounts.find(r => r.isActive === false)?._count ?? 0,
    };
    flows['total'] = flows.active + flows.inactive;

    const botStatusMap: Record<string, number> = {};
    for (const r of botCounts) botStatusMap[r.status] = r._count;
    const bots = {
      total:         Object.values(botStatusMap).reduce((a, b) => a + b, 0),
      active:        botStatusMap['ACTIVE']         ?? 0,
      pendingReview: botStatusMap['PENDING_REVIEW'] ?? 0,
      blocked:       botStatusMap['BLOCKED']        ?? 0,
      error:         botStatusMap['ERROR']          ?? 0,
    };

    // ── Filas BullMQ ─────────────────────────────────────────────────────────────
    const [qMsg, qRem, qWeb, qSch] = await Promise.all([
      this.qMessages.getJobCounts('waiting', 'active', 'failed', 'delayed'),
      this.qRemarketing.getJobCounts('waiting', 'active', 'failed', 'delayed'),
      this.qWebhooks.getJobCounts('waiting', 'active', 'failed', 'delayed'),
      this.qScheduled.getJobCounts('waiting', 'active', 'failed', 'delayed'),
    ]);

    const queues = {
      'telegram-messages':    qMsg,
      'telegram-remarketing': qRem,
      'webhook-events':       qWeb,
      'scheduled-tasks':      qSch,
    };

    return {
      collectedAt:   new Date().toISOString(),
      collectionMs:  Date.now() - startedAt,
      system,
      redis,
      database,
      flows,
      bots,
      payments: { pending: paymentPending, approvedToday: paymentToday },
      users:    { total: userCount },
      leads:    { total: leadCount },
      queues,
    };
  }

  async clearQueueFailed(name: string): Promise<{ cleared: number }> {
    const queueMap: Record<string, Queue> = {
      'telegram-messages':    this.qMessages,
      'telegram-remarketing': this.qRemarketing,
      'webhook-events':       this.qWebhooks,
      'scheduled-tasks':      this.qScheduled,
    };
    const queue = queueMap[name];
    if (!queue) throw new BadRequestException(`Fila desconhecida: ${name}`);

    const jobs = await queue.getFailed();
    await Promise.all(jobs.map(j => j.remove()));
    return { cleared: jobs.length };
  }

  // ── Impersonation ──────────────────────────────────────────────────────────

  async generateImpersonationToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, name: true, email: true, isActive: true },
    });
    if (!user)          throw new NotFoundException('Usuário não encontrado');
    if (!user.isActive) throw new BadRequestException('Conta desativada — ative-a antes de impersonar');

    const token     = uuidv4();
    const TTL_SECS  = 24 * 60 * 60; // 24h
    const expiresAt = new Date(Date.now() + TTL_SECS * 1000);

    await this.redis.set(`impersonate:${token}`, userId, 'EX', TTL_SECS);

    this.logger.warn(`[Impersonate] Token gerado para user=${userId} (${user.email})`);
    return { token, expiresAt, userName: user.name, userEmail: user.email };
  }

  // ── Remarketing Master ──────────────────────────────────────────────────────

  async listRemarketingLeads(
    page = 1,
    limit = 50,
    search?: string,
    botId?: string,
    workspaceId?: string,
    hasPurchase?: boolean,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { telegramId: { not: null } };

    if (search?.trim()) {
      where.OR = [
        { name:       { contains: search.trim(), mode: 'insensitive' } },
        { username:   { contains: search.trim(), mode: 'insensitive' } },
        { telegramId: { contains: search.trim() } },
      ];
    }
    if (botId)       where.botId       = botId;
    if (workspaceId) where.workspaceId = workspaceId;
    if (hasPurchase === true)  where.payments = { some: { status: 'APPROVED' as any } };
    if (hasPurchase === false) where.payments = { none: { status: 'APPROVED' as any } };

    const [leadsRaw, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          telegramId: true,
          name: true,
          username: true,
          createdAt: true,
          workspaceId: true,
          botId: true,
          bot:       { select: { id: true, username: true } },
          workspace: { select: { name: true } },
          _count:    { select: { payments: true } },
          payments:  { where: { status: 'APPROVED' as any }, select: { id: true }, take: 1 },
        },
      }) as unknown as any[],
      this.prisma.lead.count({ where }),
    ]);

    return {
      leads: leadsRaw.map((l: any) => ({
        id:            l.id,
        telegramId:    l.telegramId,
        name:          l.name || 'Sem nome',
        username:      l.username,
        createdAt:     l.createdAt,
        workspaceId:   l.workspaceId,
        workspaceName: l.workspace?.name ?? null,
        botId:         l.botId,
        botUsername:   l.bot?.username ?? null,
        hasPurchase:   l.payments?.length > 0,
        paymentCount:  l._count?.payments ?? 0,
      })),
      total,
      page,
      limit,
    };
  }

  async listRemarketingFlows() {
    const flows = await this.prisma.flow.findMany({
      where: { isActive: true, botId: { not: null } },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        workspace: { select: { name: true } },
        bot:       { select: { id: true, username: true } },
        nodes: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return flows.map(f => ({
      id:            f.id,
      name:          f.name,
      workspaceId:   f.workspaceId,
      workspaceName: (f.workspace as any)?.name ?? null,
      botId:         (f.bot as any)?.id ?? null,
      botUsername:   (f.bot as any)?.username ?? null,
      nodeCount:     Array.isArray(f.nodes)
        ? (f.nodes as any[]).filter((n: any) => n.type !== 'trigger').length
        : 0,
    }));
  }

  async dispatchBroadcast(
    flowId: string,
    leadIds?: string[],
    selectAllFilter?: { search?: string; workspaceId?: string; hasPurchase?: boolean },
  ) {
    const MAX_LEADS = 60_000;

    const flow = await this.prisma.flow.findUnique({
      where:  { id: flowId },
      select: {
        id: true, name: true, isActive: true, botId: true,
        nodes: true, edges: true,
        bot: { select: { username: true } },
      },
    });

    if (!flow)         throw new NotFoundException('Fluxo não encontrado');
    if (!flow.isActive) throw new BadRequestException('Fluxo não está ativo');

    const nodes = flow.nodes as any[];
    const edges = flow.edges as any[];

    const triggerNode = nodes.find((n: any) => n.type === 'trigger' || n.id === 'start');
    if (!triggerNode) throw new BadRequestException('Fluxo sem nó de início');

    const firstEdge = edges.find((e: any) => e.source === triggerNode.id);
    if (!firstEdge)   throw new BadRequestException('Fluxo sem nós de conteúdo conectados ao trigger');

    const firstContentNodeId = firstEdge.target;

    let leads: { id: string; telegramId: string | null; botId: string | null }[];
    let skipped = 0;

    if (selectAllFilter) {
      // Disparo para todos os leads que casam com o filtro atual (não só a página visível)
      const where: any = { telegramId: { not: null } };
      if (selectAllFilter.search?.trim()) {
        const s = selectAllFilter.search.trim();
        where.OR = [
          { name:       { contains: s, mode: 'insensitive' } },
          { username:   { contains: s, mode: 'insensitive' } },
          { telegramId: { contains: s } },
        ];
      }
      if (selectAllFilter.workspaceId) where.workspaceId = selectAllFilter.workspaceId;
      if (selectAllFilter.hasPurchase === true)  where.payments = { some: { status: 'APPROVED' as any } };
      if (selectAllFilter.hasPurchase === false) where.payments = { none: { status: 'APPROVED' as any } };

      leads = await this.prisma.lead.findMany({
        where,
        take:   MAX_LEADS + 1,
        select: { id: true, telegramId: true, botId: true },
      });

      if (leads.length > MAX_LEADS) {
        throw new BadRequestException(`Máximo ${MAX_LEADS.toLocaleString('pt-BR')} leads por broadcast`);
      }
    } else {
      if (!leadIds?.length) throw new BadRequestException('Nenhum lead selecionado');
      if (leadIds.length > MAX_LEADS) {
        throw new BadRequestException(`Máximo ${MAX_LEADS.toLocaleString('pt-BR')} leads por broadcast`);
      }

      leads = await this.prisma.lead.findMany({
        where:  { id: { in: leadIds }, telegramId: { not: null } },
        select: { id: true, telegramId: true, botId: true },
      });
      skipped = leadIds.length - leads.length;
    }

    // Telegram só entrega pra quem já interagiu com o bot que está enviando — por isso cada
    // job carrega o botId de origem do PRÓPRIO lead (botIdOverride), não o bot fixo do fluxo.
    // Sem bot de origem salvo, cai no bot do fluxo como melhor tentativa disponível.
    const noBotInfo = leads.filter(l => !l.botId).length;

    const broadcast = await this.prisma.remarketingBroadcast.create({
      data: {
        flowId,
        flowName:    flow.name,
        botUsername: (flow.bot as any)?.username ?? null,
        workspaceId: selectAllFilter?.workspaceId ?? null,
        total:       leads.length,
        ...(leads.length === 0 ? { status: 'DONE', finishedAt: new Date() } : {}),
      },
    });

    const STAGGER = 300; // ms entre cada disparo
    const batchTs = Date.now(); // garante jobId único mesmo se o mesmo lead for disparado de novo depois

    const jobs = leads.map((lead, i) => ({
      name: 'continue-flow',
      data: {
        flowId, chatId: lead.telegramId, fromNodeId: firstContentNodeId, skipWaitBefore: true,
        broadcastId: broadcast.id, botIdOverride: lead.botId ?? undefined,
      },
      opts: {
        delay:             i * STAGGER,
        jobId:             `broadcast-${flowId}-${lead.id}-${batchTs}`, // BullMQ rejeita ':' em jobId customizado (addBulk)
        removeOnComplete:  { count: 200, age: 3600 },
        removeOnFail:      { count: 100, age: 86400 },
      },
    }));

    if (jobs.length) await this.qScheduled.addBulk(jobs);
    const queued = jobs.length;

    this.logger.log(`[Broadcast] flow=${flowId} queued=${queued} skipped=${skipped} noBotInfo=${noBotInfo} broadcastId=${broadcast.id}`);
    return { broadcastId: broadcast.id, queued, skipped, noBotInfo, flowName: flow.name, botUsername: (flow.bot as any)?.username ?? null };
  }

  async getBroadcastStatus(id: string) {
    const b = await this.prisma.remarketingBroadcast.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Broadcast não encontrado');

    const done    = b.sent + b.failed;
    const pending = Math.max(b.total - done, 0);
    const percent = b.total > 0 ? Math.round((done / b.total) * 100) : 100;

    return {
      id:                     b.id,
      flowName:               b.flowName,
      botUsername:            b.botUsername,
      total:                  b.total,
      sent:                   b.sent,
      failed:                 b.failed,
      pending,
      percent,
      status:                 b.status,
      estimatedRemainingSecs: Math.ceil((pending * 300) / 1000), // mesmo STAGGER de 300ms do dispatchBroadcast
      createdAt:              b.createdAt,
      finishedAt:             b.finishedAt,
    };
  }

  async cancelBroadcast(id: string) {
    const b = await this.prisma.remarketingBroadcast.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Broadcast não encontrado');
    if (b.status !== 'RUNNING') return { cancelled: 0, status: b.status };

    // Remove só os jobs ainda pendentes (delayed/waiting) deste broadcast específico —
    // identificados pelo broadcastId nos dados do job, não por padrão de jobId.
    const pendingJobs = await this.qScheduled.getJobs(['delayed', 'waiting'], 0, -1);
    let cancelled = 0;
    for (const job of pendingJobs) {
      if (job.data?.broadcastId === id) {
        await job.remove();
        cancelled++;
      }
    }

    await this.prisma.remarketingBroadcast.update({
      where: { id },
      data:  { status: 'CANCELLED', finishedAt: new Date() },
    });

    this.logger.log(`[Broadcast] cancelado broadcastId=${id} jobsRemovidos=${cancelled}`);
    return { cancelled, status: 'CANCELLED' };
  }

  async listBroadcasts(limit = 20) {
    return this.prisma.remarketingBroadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take:    limit,
    });
  }

  // Cancela jobs de remarketing legado (formato antigo, sem slotIndex) ainda pendentes
  // pra um fluxo — usado quando um fluxo foi migrado pro sistema de 3 slots mas ainda
  // tinha leads presos na cadeia antiga (agendados antes da migração).
  async cancelLegacyRemarketing(flowId: string) {
    const jobs = await this.qRemarketing.getJobs(['delayed', 'waiting'], 0, 10000);
    let cancelled = 0;
    let skipped   = 0;
    for (const job of jobs) {
      if (job.data?.flowId === flowId && job.data?.slotIndex === undefined) {
        try {
          await job.remove();
          cancelled++;
        } catch {
          // Job travado (sendo processado no exato momento por um worker) — o próprio
          // envio já vai se auto-encerrar graças à trava de migração, sem risco.
          skipped++;
        }
      }
    }
    this.logger.log(`[Remarketing] Cadeia legada cancelada flow=${flowId} jobsRemovidos=${cancelled} travados=${skipped}`);
    return { cancelled, skipped };
  }

  // ── BaassPago Cash-out ─────────────────────────────────────────────────────

  async getCashoutBalance() {
    const token = await getCashoutToken();
    const agent = buildCashoutAgent();

    const { data } = await axios.get(`${CASHOUT_BASE_URL}/api/v2/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent,
      timeout: 15_000,
    });

    // Resposta pode ter estrutura variada; tenta os campos mais comuns
    const account = Array.isArray(data) ? data[0] : data;
    const balance =
      account?.balance ?? account?.available ?? account?.availableBalance ??
      account?.saldo   ?? account?.saldoDisponivel ?? account?.valor ?? 0;
    return { balance: Number(balance) };
  }

  async requestWithdraw(dto: WithdrawDto) {
    if (dto.amount <= 0) throw new BadRequestException('Valor deve ser maior que zero');
    if (!dto.pixKey?.trim()) throw new BadRequestException('Chave PIX obrigatória');

    const token = await getCashoutToken();
    const agent = buildCashoutAgent();

    const payload: any = {
      value:      dto.amount,
      pixKeyType: dto.pixKeyType,
      pixKey:     dto.pixKey.trim(),
    };
    if (dto.description) payload.description = dto.description;

    try {
      const { data } = await axios.post(`${CASHOUT_BASE_URL}/api/v2/ted/transfer`, payload, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        httpsAgent: agent,
        timeout: 20_000,
      });

      // Mascara a chave PIX no log — só os 4 últimos caracteres, o resto é dado financeiro sensível
      const maskedKey = dto.pixKey.length > 4 ? `***${dto.pixKey.slice(-4)}` : '***';
      this.logger.log(`[Cashout] Saque solicitado: R$ ${dto.amount} → ${dto.pixKeyType}:${maskedKey}`);
      return { success: true, id: data?.id ?? data?.transactionId ?? null, data };
    } catch (e: any) {
      const detail = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
      this.logger.warn(`[Cashout] Falha no saque: ${detail}`);
      throw new BadRequestException(`Erro ao processar saque: ${detail}`);
    }
  }
}
