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
import { WebhookDispatchService } from '../webhook-dispatch/webhook-dispatch.service';

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
    private webhookDispatch: WebhookDispatchService,
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

      // Webhook de saída sale_pending (PIX gerado) — fire-and-forget, nunca bloqueia.
      this.webhookDispatch.dispatch('sale_pending', savedPayment.id).catch(() => {});

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

      // Webhook de saída sale_pending (PIX gerado) — fire-and-forget, nunca bloqueia.
      this.webhookDispatch.dispatch('sale_pending', savedPayment.id).catch(() => {});

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

  async processWebhook(payload: any, expectedWorkspaceId?: string) {
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

    // Sinal a mais contra forjamento (não é a defesa principal): o workspaceId do
    // path do webhook deveria bater com o dono do pagamento.
    if (expectedWorkspaceId && expectedWorkspaceId !== (payment as any).lead.workspaceId) {
      this.logger.warn(
        `[SEGURANÇA] Webhook PIX: workspaceId do path (${expectedWorkspaceId}) não bate com o do pagamento (${(payment as any).lead.workspaceId}) — transactionId=${transactionId}`,
      );
    }

    // Reverifica na API do próprio adquirente antes de aprovar — nenhum adquirente
    // configurado hoje valida assinatura de webhook de forma confiável, então o
    // corpo do webhook sozinho não é prova de pagamento (poderia ser forjado por
    // quem descobrisse a URL e o transactionId — que aliás aparece em texto claro
    // no próprio Pix Copia-e-Cola entregue ao cliente). Só se aplica à aprovação;
    // cancelamento não precisa desse reforço.
    if (normalizedStatus === 'paid') {
      // Gateway 'simulated' (fallback quando todos os adquirentes reais falham,
      // ver createFallbackCharge) nunca tem confirmação real por trás — não existe
      // adquirente que vá mandar um webhook de verdade pra ele. Qualquer 'paid'
      // aqui é forjamento garantido.
      if (payment.gateway === 'simulated') {
        this.logger.error(
          `[SEGURANÇA] Webhook 'paid' rejeitado para gateway simulado (forjamento) — transactionId=${transactionId} paymentId=${payment.id}`,
        );
        return { leadId: payment.leadId, workspaceId: (payment as any).lead.workspaceId, newStatus: payment.status, paymentId: payment.id };
      }

      const acquirerRecord = await this.prisma.acquirer.findUnique({ where: { slug: payment.gateway } });
      const handler = acquirerRecord ? this.acquirerRegistry.getHandler(acquirerRecord.slug) : undefined;

      if (acquirerRecord && handler) {
        const credentials = this.acquirerRegistry.getCredentials(acquirerRecord);
        const confirmed = await this.confirmPaidWithRetry(handler, transactionId, credentials);

        if (confirmed === false) {
          this.logger.warn(
            `Webhook PIX: status 'paid' recebido mas a API do adquirente não confirma — ignorando (possível forjamento) → transactionId=${transactionId}`,
          );
          return { leadId: payment.leadId, workspaceId: (payment as any).lead.workspaceId, newStatus: payment.status, paymentId: payment.id };
        }

        if (confirmed === null) {
          // Reconsulta falhou em todas as tentativas (instabilidade do adquirente,
          // não forjamento) — nunca aprova nem cancela sem confirmação real; fica
          // PROCESSING pra revisão manual no admin. Evita tanto liberar produto de
          // graça quanto cancelar um cliente que pagou de verdade.
          await this.prisma.payment.updateMany({
            where: { id: payment.id, status: { in: ['PENDING', 'PROCESSING'] } },
            data:  { status: 'PROCESSING' },
          });
          this.logger.error(
            `[SEGURANÇA] Reverificação do adquirente falhou repetidamente — pagamento ${payment.id} (${transactionId}) marcado PROCESSING para revisão manual`,
          );
          return { leadId: payment.leadId, workspaceId: (payment as any).lead.workspaceId, newStatus: 'PROCESSING', paymentId: payment.id };
        }
        // confirmed === true → segue normalmente pra aprovação abaixo
      }
    }

    const newStatus = normalizedStatus === 'paid' ? 'APPROVED' : 'CANCELLED';

    // Update atômico condicional (mesmo padrão do saque em balance.service.ts):
    // fecha a corrida entre a checagem de idempotência lá em cima e esta escrita
    // (nesse meio tempo rolou uma chamada de rede pra reverificar o adquirente,
    // então duas entregas quase simultâneas do mesmo webhook podiam passar pela
    // checagem antes de qualquer uma delas gravar — e ambas disparavam de novo
    // pra UTMify/Facebook/Kwai/saldo). Só a requisição que efetivamente mudar o
    // status segue adiante; a outra é descartada aqui, sem duplicar nada.
    const updateResult = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'PROCESSING'] } },
      data: {
        status: newStatus,
        paidAt: newStatus === 'APPROVED' ? new Date() : undefined,
      },
    });
    if (updateResult.count === 0) {
      this.logger.warn(`Webhook PIX: corrida detectada — ${transactionId} já foi processado por uma requisição concorrente, ignorando pra não duplicar disparo`);
      return { leadId: payment.leadId, workspaceId: (payment as any).lead.workspaceId, newStatus: payment.status, paymentId: payment.id };
    }

    await this.prisma.event.create({
      data: {
        leadId:    payment.leadId,
        eventName: newStatus === 'APPROVED' ? 'PURCHASE' : 'PAYMENT_CANCELLED',
        source:    'pix',
        metadata:  { transactionId, paymentId: payment.id },
      },
    });

    if (newStatus === 'APPROVED') {
      const workspaceId = (payment as any).lead.workspaceId;

      // Controle de Aprovação de Vendas (painel admin): decide se esta venda já
      // dispara os webhooks/pixels agora (Facebook, Kwai, UTMify) e credita saldo,
      // ou se fica retida (approvalStatus=PENDING) até um admin aprovar manualmente
      // pelo painel — nesse caso os disparos abaixo só acontecem lá na frente,
      // em approvePaymentManually. Nunca bloqueia o pagamento em si. Se a checagem
      // falhar por qualquer motivo, assume aprovado (fail-open) pra nunca perder um
      // disparo por instabilidade dessa camada nova.
      const approvalStatus = await this.applyApprovalControl(payment.id, workspaceId).catch((e) => {
        this.logger.error(`Controle de Aprovação: falha ao processar pagamento=${payment.id}: ${e.message}`);
        return 'APPROVED' as const;
      });

      if (approvalStatus === 'APPROVED') {
        await this.dispatchApprovedSideEffects(payment.id).catch(e =>
          this.logger.error(`Falha ao disparar side-effects da venda aprovada pagamento=${payment.id}: ${e.message}`),
        );
      } else {
        this.logger.log(`Controle de Aprovação: venda ${payment.id} retida — aguardando aprovação manual (Facebook/Kwai/UTMify/saldo ainda não disparados)`);
      }
    }

    this.logger.log(`Webhook PIX: ${transactionId} → ${newStatus}`);

    return { leadId: payment.leadId, workspaceId: (payment as any).lead.workspaceId, newStatus, paymentId: payment.id };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Controle de Aprovação de Vendas (painel admin): decide approvalStatus de forma
  // incremental e determinística (nunca aleatória), mantendo a proporção configurada
  // ao longo de todo o histórico do workspace. Contadores atualizados em uma única
  // query atômica (FOR UPDATE trava a linha do Workspace), evitando corrida quando
  // dois webhooks do mesmo workspace chegam em paralelo. Se o controle estiver
  // desativado, aprova direto sem tocar nos contadores — comportamento idêntico ao
  // atual pra todo workspace que nunca ativar essa feature.
  private async applyApprovalControl(paymentId: string, workspaceId: string): Promise<'APPROVED' | 'PENDING'> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { approvalControlEnabled: true, approvalPercentage: true },
    });

    if (!workspace?.approvalControlEnabled) {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { approvalStatus: 'APPROVED' },
      });
      return 'APPROVED';
    }

    const rows = await this.prisma.$queryRaw<{ approved: boolean }[]>`
      UPDATE "Workspace" AS w
      SET
        "approvalTotalCount"    = old."approvalTotalCount" + 1,
        "approvalApprovedCount" = old."approvalApprovedCount" +
          CASE WHEN old."approvalApprovedCount" < ROUND((old."approvalTotalCount" + 1)::numeric * ${workspace.approvalPercentage} / 100.0)
               THEN 1 ELSE 0 END
      FROM (SELECT "approvalApprovedCount", "approvalTotalCount" FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE) AS old
      WHERE w.id = ${workspaceId}
      RETURNING (old."approvalApprovedCount" < ROUND((old."approvalTotalCount" + 1)::numeric * ${workspace.approvalPercentage} / 100.0)) AS approved
    `;

    const approved = rows[0]?.approved ?? true;

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { approvalStatus: approved ? 'APPROVED' : 'PENDING' },
    });

    return approved ? 'APPROVED' : 'PENDING';
  }

  // Dispara os efeitos colaterais de uma venda aprovada (Facebook CAPI, Kwai,
  // UTMify, crédito de saldo) — chamado tanto na aprovação automática acima quanto
  // na aprovação manual feita pelo admin (AdminService.approvePaymentManually).
  // Isso garante que uma venda retida pelo Controle de Aprovação dispare exatamente
  // os mesmos eventos de uma venda aprovada na hora, só que no momento em que
  // finalmente é aprovada — "exatamente como se tivesse sido aprovada originalmente".
  async dispatchApprovedSideEffects(paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        lead:    { select: { workspaceId: true } },
        product: { select: { id: true, name: true } },
      },
    });
    if (!payment) return;

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

    // Webhook de saída sale_approved — como este método é o ponto canônico de
    // "venda aprovada" (auto ou aprovação manual do admin), o webhook respeita
    // automaticamente o Controle de Aprovação. Fire-and-forget.
    this.webhookDispatch.dispatch('sale_approved', payment.id).catch(() => {});
  }

  // Reconsulta o status real na API do adquirente antes de aprovar um webhook —
  // única defesa contra webhook forjado hoje (nenhum adquirente valida assinatura
  // de forma confiável). Tenta algumas vezes com backoff curto pra não confundir
  // uma instabilidade passageira de rede com forjamento; se todas falharem,
  // retorna null (nem aprova nem rejeita — quem chama decide o que fazer).
  private async confirmPaidWithRetry(handler: any, transactionId: string, credentials: any): Promise<boolean | null> {
    const DELAYS_MS = [1500, 3000, 5000];
    for (let attempt = 0; attempt <= DELAYS_MS.length; attempt++) {
      try {
        const realStatus = await handler.checkStatus(transactionId, credentials);
        return realStatus.status === 'paid';
      } catch (e: any) {
        const isLast = attempt === DELAYS_MS.length;
        this.logger.warn(
          `Reverificação do adquirente falhou (tentativa ${attempt + 1}/${DELAYS_MS.length + 1}) transactionId=${transactionId}: ${e.message}`,
        );
        if (isLast) return null;
        await new Promise((resolve) => setTimeout(resolve, DELAYS_MS[attempt]));
      }
    }
    return null;
  }

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
