import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../common/prisma.service';
import { encrypt, decrypt } from '../../common/utils/encryption';
import { UpdateWebhookSettingsDto } from './dto/update-webhook-settings.dto';
import { WebhookEvent, EVENT_SALE_STATUS, isValidWebhookEvent } from './webhook-events';
import { validateWebhookUrl, sendWebhookHttp } from './webhook-http';

export const OUTBOUND_WEBHOOK_QUEUE = 'outbound-webhooks';
// Retry: tentativa 1 imediata; depois de falhar, aguarda [30s, 2min, 10min] antes das
// próximas. attempts=4 no total. Consumido pelo backoffStrategy do processor.
export const WEBHOOK_BACKOFF_MS = [30_000, 120_000, 600_000];
export const WEBHOOK_MAX_ATTEMPTS = 4;

@Injectable()
export class WebhookDispatchService {
  private readonly logger = new Logger(WebhookDispatchService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(OUTBOUND_WEBHOOK_QUEUE) private queue: Queue,
  ) {}

  // ── Settings ────────────────────────────────────────────────────────────────

  async getSettings(workspaceId: string) {
    const s = await this.prisma.webhookSettings.findUnique({ where: { workspaceId } });
    if (!s) {
      return {
        enabled: false,
        url: '',
        enabledEvents: ['sale_pending', 'sale_approved'],
        hasSecret: false,
      };
    }
    // Nunca devolve o secret em texto claro — só informa se existe.
    return {
      enabled: s.enabled,
      url: s.url ?? '',
      enabledEvents: s.enabledEvents,
      hasSecret: !!s.secret,
    };
  }

  async updateSettings(workspaceId: string, dto: UpdateWebhookSettingsDto) {
    // Valida URL/SSRF quando enviada (obrigatória se for ativar).
    const trimmedUrl = dto.url?.trim();
    if (trimmedUrl) {
      const v = validateWebhookUrl(trimmedUrl);
      if (!v.ok) throw new BadRequestException(v.reason);
    }
    if (dto.enabled && !trimmedUrl) {
      // Se não veio URL no payload, checa a que já está salva.
      const existing = await this.prisma.webhookSettings.findUnique({ where: { workspaceId } });
      if (!existing?.url) throw new BadRequestException('Informe uma URL de webhook antes de ativar');
    }

    // Secret: omitido = mantém; string vazia = remove; não-vazio = define (cifrado).
    const secretUpdate: { secret?: string | null } = {};
    if (dto.secret !== undefined) {
      secretUpdate.secret = dto.secret === '' ? null : encrypt(dto.secret);
    }

    const data: any = { ...secretUpdate };
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (trimmedUrl !== undefined) data.url = trimmedUrl;
    if (dto.enabledEvents !== undefined) data.enabledEvents = dto.enabledEvents;

    await this.prisma.webhookSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        enabled: dto.enabled ?? false,
        url: trimmedUrl ?? null,
        secret: secretUpdate.secret ?? null,
        enabledEvents: dto.enabledEvents ?? ['sale_pending', 'sale_approved'],
      },
      update: data,
    });

    return this.getSettings(workspaceId);
  }

  // ── Logs ────────────────────────────────────────────────────────────────────

  async listLogs(workspaceId: string, page = 1, limit = 20) {
    const [items, total] = await Promise.all([
      this.prisma.webhookLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, event: true, url: true, responseStatus: true, executionMs: true,
          attempts: true, success: true, errorMessage: true, isTest: true, createdAt: true,
        },
      }),
      this.prisma.webhookLog.count({ where: { workspaceId } }),
    ]);
    return { items, total, page, limit };
  }

  // ── Dispatch (API pública chamada pelo resto da plataforma) ───────────────────

  // Ponto único de entrada. Fire-and-forget do lado de quem chama — nunca lança
  // pra fora nem bloqueia o processamento da venda.
  async dispatch(event: WebhookEvent, paymentId: string): Promise<void> {
    try {
      const payment = await this.loadPaymentForPayload(paymentId);
      if (!payment) return;
      const workspaceId = payment.lead.workspaceId;

      const settings = await this.prisma.webhookSettings.findUnique({ where: { workspaceId } });
      if (!settings?.enabled || !settings.url) return;
      if (!settings.enabledEvents.includes(event)) return;

      const eventId = uuidv4();
      const payload = this.buildPayload(event, payment, workspaceId);

      // Cria o log já (estado "enviando") — o processor atualiza pelo id.
      const log = await this.prisma.webhookLog.create({
        data: {
          workspaceId, paymentId, eventId, event,
          url: settings.url, payload: payload as any,
          attempts: 0, success: false,
        },
      });

      // jobId = eventId (único por envio): cada evento é um job só (sem duplicata
      // simultânea do mesmo envio) e o "Reenviar" gera um envio novo de verdade.
      // O disparo já é natural-mente uma vez por evento/venda (sale_pending no PIX,
      // sale_approved no gate atômico de aprovação).
      await this.queue.add(
        'deliver',
        { logId: log.id },
        {
          jobId: eventId,
          attempts: WEBHOOK_MAX_ATTEMPTS,
          backoff: { type: 'webhookSchedule' },
          removeOnComplete: { count: 500, age: 24 * 3600 },
          removeOnFail: { count: 200, age: 7 * 24 * 3600 },
        },
      );
    } catch (err: any) {
      this.logger.error(`dispatch(${event}, ${paymentId}) falhou ao enfileirar: ${err?.message}`);
    }
  }

  // ── Teste manual (síncrono — usuário espera o ✅/❌) ───────────────────────────

  async testWebhook(workspaceId: string) {
    const settings = await this.prisma.webhookSettings.findUnique({ where: { workspaceId } });
    if (!settings?.url) throw new BadRequestException('Configure e salve uma URL antes de testar');
    const v = validateWebhookUrl(settings.url);
    if (!v.ok) throw new BadRequestException(v.reason);

    const eventId = uuidv4();
    const event: WebhookEvent = 'sale_approved';
    const payload = this.buildTestPayload(event, workspaceId);
    const secret = settings.secret ? this.safeDecrypt(settings.secret) : undefined;

    const result = await sendWebhookHttp({ url: settings.url, secret, event, eventId, payload });

    await this.prisma.webhookLog.create({
      data: {
        workspaceId, eventId, event, url: settings.url, payload: payload as any,
        responseStatus: result.responseStatus, responseBody: result.responseBody,
        executionMs: result.executionMs, attempts: 1, success: result.success,
        errorMessage: result.errorMessage, isTest: true,
      },
    });

    return {
      success: result.success,
      responseStatus: result.responseStatus,
      executionMs: result.executionMs,
      message: result.success ? 'Webhook entregue com sucesso' : (result.errorMessage || 'Falha no envio'),
    };
  }

  // ── Reenvio de um evento já registrado ───────────────────────────────────────

  async resendLog(workspaceId: string, logId: string) {
    const log = await this.prisma.webhookLog.findFirst({ where: { id: logId, workspaceId } });
    if (!log) throw new NotFoundException('Log não encontrado');
    if (log.isTest || !log.paymentId) {
      throw new BadRequestException('Este envio não pode ser reenviado');
    }
    if (!isValidWebhookEvent(log.event)) {
      throw new BadRequestException('Evento inválido');
    }
    await this.dispatch(log.event, log.paymentId);
    return { ok: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private safeDecrypt(v: string): string | undefined {
    try { return decrypt(v); } catch { return undefined; }
  }

  private async loadPaymentForPayload(paymentId: string) {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true, transactionId: true, amount: true, currency: true,
        product: { select: { id: true, name: true } },
        lead: { select: { workspaceId: true, name: true, email: true, phone: true } },
      },
    });
  }

  private buildPayload(event: WebhookEvent, payment: any, workspaceId: string) {
    return {
      event,
      timestamp: new Date().toISOString(),
      account_id: workspaceId,
      sale: {
        id: payment.id,
        transaction_id: payment.transactionId,
        status: EVENT_SALE_STATUS[event],
        amount: Number(payment.amount),
        currency: payment.currency ?? 'BRL',
        payment_method: 'pix',
        product_id: payment.product?.id ?? null,
        product_name: payment.product?.name ?? null,
        buyer: {
          name: payment.lead?.name ?? null,
          email: payment.lead?.email ?? null,
          phone: payment.lead?.phone ?? null,
        },
      },
    };
  }

  private buildTestPayload(event: WebhookEvent, workspaceId: string) {
    return {
      event,
      timestamp: new Date().toISOString(),
      account_id: workspaceId,
      test: true,
      sale: {
        id: 'test_' + uuidv4().slice(0, 8),
        transaction_id: 'TEST-' + Date.now(),
        status: EVENT_SALE_STATUS[event],
        amount: 97.9,
        currency: 'BRL',
        payment_method: 'pix',
        product_id: 'test_product',
        product_name: 'Produto de Teste',
        buyer: { name: 'Comprador Teste', email: 'teste@exemplo.com', phone: '11999999999' },
      },
    };
  }
}
