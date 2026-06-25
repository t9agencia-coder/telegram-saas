import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class PixService {
  private readonly logger = new Logger(PixService.name);

  constructor(private prisma: PrismaService) {}

  async createCharge(workspaceId: string, leadId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new Error('Product not found');

    const config = await this.prisma.blackpayConfig.findUnique({
      where: { workspaceId },
    });

    if (!config || !config.isActive) {
      return this.createFallbackCharge(leadId, product);
    }

    return this.createBlackpayCharge(config, leadId, product);
  }

  private async createBlackpayCharge(config: any, leadId: string, product: any) {
    try {
      const response = await axios.post(
        `${process.env.BLACKPAY_API_URL}/charges`,
        {
          amount: product.price,
          currency: 'BRL',
          description: product.name,
          metadata: { leadId, productId: product.id },
        },
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const charge = response.data;

      return {
        id: charge.id,
        transactionId: charge.id,
        qrCode: charge.qr_code,
        copyPaste: charge.qr_code_text || charge.pix_copy_paste,
        amount: product.price,
        expiresAt: charge.expires_at,
      };
    } catch (error) {
      this.logger.error('BlackPay charge creation failed', error);
      return this.createFallbackCharge(leadId, product);
    }
  }

  private async createFallbackCharge(leadId: string, product: any) {
    const transactionId = `PIX_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const payment = await this.prisma.payment.create({
      data: {
        leadId,
        productId: product.id,
        transactionId,
        gateway: 'simulated',
        amount: product.price,
        status: 'PENDING',
        pixQrCode: 'iVBORw0KGgoAAAANSUhEUg...',
        pixCopyPaste: `00020126580014br.gov.bcb.pix0136${transactionId}5204000053039865404${product.price.toFixed(0).padStart(2, '0')}5802BR5913SimulatedPix6008BRASILIA62070503***6304ABCD`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    return {
      id: payment.id,
      transactionId: payment.transactionId,
      qrCode: payment.pixQrCode,
      copyPaste: payment.pixCopyPaste,
      amount: payment.amount,
      expiresAt: payment.expiresAt,
    };
  }

  async createChargeByAmount(workspaceId: string, leadId: string, amount: number) {
    const transactionId = `PIX_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const payment = await this.prisma.payment.create({
      data: {
        leadId,
        transactionId,
        gateway: 'simulated',
        amount,
        status: 'PENDING',
        pixCopyPaste: `00020126580014br.gov.bcb.pix0136${transactionId}5204000053039865404${amount.toFixed(0).padStart(2, '0')}5802BR5913SimulatedPix6008BRASILIA62070503***6304ABCD`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    return {
      id: payment.id,
      transactionId: payment.transactionId,
      qrCode: payment.pixQrCode,
      copyPaste: payment.pixCopyPaste,
      amount: payment.amount,
      expiresAt: payment.expiresAt,
    };
  }

  async getChargeStatus(chargeId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: chargeId },
    });
    if (!payment) return { status: 'NOT_FOUND' };
    return { status: payment.status };
  }

  async processWebhook(payload: any) {
    const { transaction_id, status } = payload;

    const payment = await this.prisma.payment.findUnique({
      where: { transactionId: transaction_id },
    });

    if (!payment) {
      this.logger.warn(`Payment ${transaction_id} not found`);
      return;
    }

    const newStatus = status === 'paid' || status === 'approved' ? 'APPROVED' : 'CANCELLED';

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        paidAt: newStatus === 'APPROVED' ? new Date() : undefined,
      },
    });

    await this.prisma.event.create({
      data: {
        leadId: payment.leadId,
        eventName: newStatus === 'APPROVED' ? 'PURCHASE' : 'PAYMENT_CANCELLED',
        source: 'blackpay',
        metadata: { transactionId: transaction_id, paymentId: payment.id },
      },
    });

    this.logger.log(`Payment ${transaction_id} updated to ${newStatus}`);
  }
}
