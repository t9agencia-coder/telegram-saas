import { Logger } from '@nestjs/common';
import axios from 'axios';
import {
  IAcquirer,
  AcquirerCredentials,
  PixChargeResponse,
  StatusCheckResponse,
} from '../../acquirer.interface';

export class BlackpayAcquirer implements IAcquirer {
  readonly slug = 'blackpay';
  private readonly logger = new Logger(BlackpayAcquirer.name);

  private getBaseUrl(): string {
    return process.env.BLACKPAY_API_URL || 'https://api.blackpay.com.br';
  }

  async createPix(
    amount: number,
    customer: { name?: string; email?: string; document?: string; externalId?: string },
    credentials: AcquirerCredentials,
    _webhookUrl?: string,
  ): Promise<PixChargeResponse> {
    const baseUrl = this.getBaseUrl();

    const response = await axios.post(
      `${baseUrl}/charges`,
      {
        amount,
        currency: 'BRL',
        description: 'Pagamento via FireBot',
        metadata: { externalId: customer.externalId },
      },
      {
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );

    const charge = response.data;

    return {
      transactionId: charge.id,
      pixCode: charge.qr_code_text || charge.pix_copy_paste || charge.qr_code || '',
      qrCodeImage: charge.qr_code_image,
      amount,
      expiresAt: charge.expires_at ? new Date(charge.expires_at) : undefined,
      status: charge.status || 'pending',
    };
  }

  async checkStatus(
    transactionId: string,
    credentials: AcquirerCredentials,
  ): Promise<StatusCheckResponse> {
    const baseUrl = this.getBaseUrl();

    const response = await axios.get(`${baseUrl}/charges/${transactionId}`, {
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
      timeout: 10000,
    });

    const charge = response.data;
    const paid = charge.status === 'paid' || charge.status === 'approved';

    return {
      transactionId,
      status: paid ? 'paid' : 'pending',
      paidAt: paid && charge.paid_at ? new Date(charge.paid_at) : undefined,
    };
  }

  async validateCredentials(credentials: AcquirerCredentials): Promise<boolean> {
    try {
      const baseUrl = this.getBaseUrl();
      await axios.get(`${baseUrl}/me`, {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
        timeout: 10000,
      });
      return true;
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        return false;
      }
      this.logger.error(`Blackpay validate error: ${error.message}`);
      throw error;
    }
  }
}
