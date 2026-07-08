import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../common/prisma.service';
import { FacebookCapiService } from '../facebook-capi/facebook-capi.service';
import { UtmifyService } from '../utmify/utmify.service';
import { AcquirerRegistryService } from '../acquirers/acquirer-registry.service';
import { KwaiAdsService } from '../kwai-ads/kwai-ads.service';
import { BalanceService } from '../balance/balance.service';

@Injectable()
export class PixService {
  private readonly logger = new Logger(PixService.name);

  constructor(
    private prisma: PrismaService,
    private facebookCapi: FacebookCapiService,
    private utmifyService: UtmifyService,
    private acquirerRegistry: AcquirerRegistryService,
    private kwaiAds: KwaiAdsService,
    private balanceService: BalanceService,
    @InjectQueue('telegram-messages') private msgQueue: Queue,
  ) {}

  async createCharge(workspaceId: string, leadId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error('Product not found');

    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    const amount = Number(product.price);
    const amountInCents = Math.round(amount * 100);

    const webhookUrl = this.buildPixWebhookUrl(workspaceId);

    try {
      const { payment, acquirerSlug } = await this.acquirerRegistry.createPixWithFallback(
        amount,
        {
          name:        lead?.name
                         || (lead?.username   ? `@${lead.username}`          : null)
                         || (lead?.telegramId ? `User_${lead.telegramId}`    : 'Cliente'),
          email:       lead?.email || undefined,
          phone:       lead?.phone || undefined,
          externalId:  leadId,
          productName: product.name,
        },
        webhookUrl,
        workspaceId,
      );

      const txId = payment.transactionId;
      const pixCode = payment.pixCode;
      let localQr = payment.qrCodeImage || null;
      const gtw = acquirerSlug;

      if (!localQr && pixCode) {
        localQr = await QRCode.toDataURL(pixCode, { width: 300, margin: 2 }).catch(() => null);
      }

      this.logger.log(`PIX criado via ${acquirerSlug} | transactionId=${txId}`);

      const savedPayment = await this.prisma.payment.create({
        data: {
          leadId,
          productId: product.id,
          transactionId: txId,
          gateway: gtw,
          amount: product.price,
          status: 'PENDING',
          pixQrCode: localQr,
          pixCopyPaste: pixCode,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      this.facebookCapi.handlePixCreated({
        workspaceId, leadId, amount, productId: product.id, transactionId: txId,
      }).catch(() => {});

      this.kwaiAds.handleAddToCart({ workspaceId, leadId, amount, transactionId: txId }).catch(() => {});

      this.utmifyService.handlePixCreated({
        workspaceId, leadId, transactionId: txId, amountInCents,
        productId: product.id, productName: product.name, createdAt: new Date(),
      }).catch(() => {});

      if (gtw === 'pixzypay') {
        this.msgQueue.add(
          'check-pixzypay-status',
          { paymentId: savedPayment.id, transactionId: txId, attempt: 0 },
          { delay: 60_000, removeOnComplete: { count: 100, age: 3600 } },
        ).catch(() => {});
      }

      if (gtw === 'qrcodes') {
        this.msgQueue.add(
          'check-qrcodes-status',
          { paymentId: savedPayment.id, transactionId: txId, attempt: 0 },
          { delay: 60_000, removeOnComplete: { count: 100, age: 3600 } },
        ).catch(() => {});
      }

      return {
        id: savedPayment.id, transactionId: txId,
        qrCode: localQr, copyPaste: pixCode,
        amount: savedPayment.amount, expiresAt: savedPayment.expiresAt,
      };
    } catch (err: any) {
      this.logger.warn(`Adquirentes falharam, usando fallback simulado: ${err?.message}`);
      return this.createFallbackCharge(leadId, product);
    }
  }

  async createChargeByAmount(
    workspaceId: string,
    leadId: string,
    amount: number,
    deliverable?: { enabled: boolean; message: string; delayMinutes: number },
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    const amountInCents = Math.round(amount * 100);
    const webhookUrl = this.buildPixWebhookUrl(workspaceId);

    try {
      const { payment, acquirerSlug } = await this.acquirerRegistry.createPixWithFallback(
        amount,
        {
          name:       lead?.name
                        || (lead?.username   ? `@${lead.username}`        : null)
                        || (lead?.telegramId ? `User_${lead.telegramId}`  : 'Cliente'),
          email:      lead?.email || undefined,
          phone:      lead?.phone || undefined,
          externalId: leadId,
        },
        webhookUrl,
        workspaceId,
      );

      const txId = payment.transactionId;
      const pixCode = payment.pixCode;
      let localQr = payment.qrCodeImage || null;
      const gtw = acquirerSlug;

      if (!localQr && pixCode) {
        localQr = await QRCode.toDataURL(pixCode, { width: 300, margin: 2 }).catch(() => null);
      }

      this.logger.log(`PIX (valor livre) criado via ${acquirerSlug} | transactionId=${txId}`);

      const savedPayment = await this.prisma.payment.create({
        data: {
          leadId, transactionId: txId, gateway: gtw, amount,
          status: 'PENDING', pixQrCode: localQr, pixCopyPaste: pixCode,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          ...(deliverable ? { metadata: { deliverable } } : {}),
        },
      });

      this.facebookCapi.handlePixCreated({
        workspaceId, leadId, amount, transactionId: txId,
      }).catch(() => {});

      this.kwaiAds.handleAddToCart({ workspaceId, leadId, amount, transactionId: txId }).catch(() => {});

      this.utmifyService.handlePixCreated({
        workspaceId, leadId, transactionId: txId, amountInCents, createdAt: new Date(),
      }).catch(() => {});

      if (gtw === 'pixzypay') {
        this.msgQueue.add(
          'check-pixzypay-status',
          { paymentId: savedPayment.id, transactionId: txId, attempt: 0 },
          { delay: 60_000, removeOnComplete: { count: 100, age: 3600 } },
        ).catch(() => {});
      }

      return {
        id: savedPayment.id, transactionId: txId,
        qrCode: localQr, copyPaste: pixCode,
        amount: savedPayment.amount, expiresAt: savedPayment.expiresAt,
      };
    } catch (err: any) {
      this.logger.warn(`Adquirentes falharam, usando fallback simulado: ${err?.message}`);
      return this.createFallbackCharge(leadId, null, amount, deliverable);
    }
  }

  async getChargeStatus(chargeId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: chargeId } });
    if (!payment) return { status: 'NOT_FOUND' };
    return { status: payment.status };
  }

  async processWebhook(payload: any) {
    // Suporta: Podpay/genérico ({ id, status }), PixzyPay ({ event, data.id }),
    //          NexusPag ({ transaction: { id, status } }), legado ({ transaction_id })
    const transactionId: string =
      payload?.id ||
      payload?.data?.id ||
      payload?.transaction_id ||
      payload?.transaction?.id;

    // PixzyPay envia o status no event name: 'transaction.paid' → 'paid'
    const eventStatus = typeof payload?.event === 'string'
      ? payload.event.split('.').pop()
      : '';
    const rawStatus: string =
      payload?.status ||
      payload?.data?.status ||
      payload?.transaction?.status ||
      eventStatus || '';

    if (!transactionId) {
      // Loga só os campos presentes, nunca os valores (podem conter dado de cliente)
      this.logger.warn(`[Webhook PIX] transactionId não encontrado — campos: ${JSON.stringify(Object.keys(payload || {}))}`);
      return;
    }

    const statusMap: Record<string, string> = {
      PAID:       'paid', paid:       'paid',
      APPROVED:   'paid', approved:   'paid',
      PENDING:    'pending',
      FAILED:     'failed',
      CANCELLED:  'cancelled', CANCELED:  'cancelled',
      EXPIRED:    'expired',
      REFUNDED:   'cancelled', refunded:   'cancelled',
      CHARGEBACK: 'cancelled', chargeback: 'cancelled',
    };
    const normalizedStatus = statusMap[rawStatus.toUpperCase()] || rawStatus.toLowerCase();

    // Status intermediário (pending) não representa mudança de estado final — ignorar
    if (normalizedStatus === 'pending') {
      this.logger.log(`Webhook PIX: status intermediário ignorado (${rawStatus}) para ${transactionId}`);
      return;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { transactionId },
      include: {
        lead:    { select: { workspaceId: true } },
        product: { select: { id: true, name: true, price: true } },
      },
    });

    if (!payment) {
      this.logger.warn(`Webhook PIX: payment não encontrado para transactionId=${transactionId}`);
      return;
    }

    // Idempotência: webhook duplicado não reprocessa pagamento já finalizado
    if (payment.status !== 'PENDING' && payment.status !== 'PROCESSING') {
      this.logger.warn(`Webhook duplicado ignorado: ${transactionId} já ${payment.status}`);
      return { leadId: payment.leadId, workspaceId: (payment as any).lead.workspaceId, newStatus: payment.status, paymentId: payment.id };
    }

    // Reverifica na API do próprio adquirente antes de aprovar — nenhum adquirente
    // configurado hoje tem webhookSecret pra validar assinatura, então o corpo do
    // webhook sozinho não é confiável (poderia ser forjado por quem descobrisse a
    // URL). Só se aplica à aprovação (o risco real é um "pago" falso liberar
    // conteúdo de graça); cancelamento não precisa desse reforço. Qualquer falha
    // na reverificação (rede instável, etc.) deixa passar como hoje — nunca trava
    // um pagamento legítimo por causa de uma reconsulta que não funcionou.
    if (normalizedStatus === 'paid' && payment.gateway !== 'simulated') {
      const acquirerRecord = await this.prisma.acquirer.findUnique({ where: { slug: payment.gateway } });
      const handler = acquirerRecord ? this.acquirerRegistry.getHandler(acquirerRecord.slug) : undefined;
      if (acquirerRecord && handler) {
        try {
          const credentials = this.acquirerRegistry.getCredentials(acquirerRecord);
          const realStatus = await handler.checkStatus(transactionId, credentials);
          if (realStatus.status !== 'paid') {
            this.logger.warn(
              `Webhook PIX: status 'paid' recebido mas a API do adquirente diz '${realStatus.status}' — ignorando (possível forjamento) → transactionId=${transactionId}`,
            );
            return { leadId: payment.leadId, workspaceId: (payment as any).lead.workspaceId, newStatus: payment.status, paymentId: payment.id };
          }
        } catch (e: any) {
          this.logger.warn(`Webhook PIX: falha ao reverificar status na API do adquirente (${e.message}) — prosseguindo com o status do webhook → transactionId=${transactionId}`);
        }
      }
    }

    const newStatus = normalizedStatus === 'paid' ? 'APPROVED' : 'CANCELLED';

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        paidAt: newStatus === 'APPROVED' ? new Date() : undefined,
      },
    });

    await this.prisma.event.create({
      data: {
        leadId:    payment.leadId,
        eventName: newStatus === 'APPROVED' ? 'PURCHASE' : 'PAYMENT_CANCELLED',
        source:    'pix',
        metadata:  { transactionId, paymentId: payment.id },
      },
    });

    if (newStatus === 'APPROVED') {
      const workspaceId   = (payment as any).lead.workspaceId;
      const amountInCents = Math.round(Number(payment.amount) * 100);
      const product       = (payment as any).product;

      this.facebookCapi.handlePixApproved({
        workspaceId,
        leadId:        payment.leadId,
        amount:        Number(payment.amount),
        transactionId: payment.transactionId,
        productId:     product?.id   ?? undefined,
        productName:   product?.name ?? undefined,
      }).catch(() => {});

      // Kwai Purchase — fire-and-forget
      this.kwaiAds.handlePurchase({
        workspaceId,
        leadId:        payment.leadId,
        amount:        Number(payment.amount),
        transactionId: payment.transactionId,
      }).catch(() => {});

      this.utmifyService.handlePixApproved({
        workspaceId,
        leadId:      payment.leadId,
        transactionId: payment.transactionId,
        amountInCents,
        productId:   product?.id   ?? undefined,
        productName: product?.name ?? undefined,
        approvedAt:  new Date(),
      }).catch(() => {});

      // Sistema de saldo — credita o valor líquido (venda menos taxa) pro workspace.
      // Idempotente internamente, nunca credita duas vezes o mesmo pagamento.
      this.balanceService.creditForPayment(payment.id).catch(e =>
        this.logger.error(`Balance: falha ao creditar saldo pagamento=${payment.id}: ${e.message}`),
      );
    }

    this.logger.log(`Webhook PIX: ${transactionId} → ${newStatus}`);

    return { leadId: payment.leadId, workspaceId: (payment as any).lead.workspaceId, newStatus, paymentId: payment.id };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildPixWebhookUrl(workspaceId: string): string {
    const base = (process.env.TELEGRAM_WEBHOOK_URL || 'http://localhost:3001/api/webhooks/telegram')
      .replace(/\/telegram$/, '');
    return `${base}/pix/${workspaceId}`;
  }

  private async createFallbackCharge(
    leadId: string,
    product: any | null,
    amount?: number,
    deliverable?: { enabled: boolean; message: string; delayMinutes: number },
  ) {
    const finalAmount = amount ?? Number(product?.price ?? 0);
    const transactionId = `PIX_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const data: any = {
      leadId,
      transactionId,
      gateway:     'simulated',
      amount:      finalAmount,
      status:      'PENDING',
      pixCopyPaste: `00020126580014br.gov.bcb.pix0136${transactionId}5204000053039865404${finalAmount.toFixed(0).padStart(2, '0')}5802BR5913SimulatedPix6008BRASILIA62070503***6304ABCD`,
      expiresAt:   new Date(Date.now() + 30 * 60 * 1000),
    };
    if (product?.id) data.productId = product.id;
    if (deliverable) data.metadata = { deliverable };

    const payment = await this.prisma.payment.create({ data });

    return {
      id:            payment.id,
      transactionId: payment.transactionId,
      qrCode:        null,
      copyPaste:     payment.pixCopyPaste,
      amount:        payment.amount,
      expiresAt:     payment.expiresAt,
    };
  }
}
