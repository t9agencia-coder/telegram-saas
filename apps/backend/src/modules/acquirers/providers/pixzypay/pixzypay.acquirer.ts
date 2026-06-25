import { Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import {
  IAcquirer,
  AcquirerCredentials,
  PixChargeResponse,
  StatusCheckResponse,
} from '../../acquirer.interface';
import { buildCustomerData } from '../podpay/pix-customer-data';

const BASE_URL = 'https://app.pixzypay.com/api';

const STATUS_MAP: Record<string, StatusCheckResponse['status']> = {
  pending:    'pending',
  paid:       'paid',
  expired:    'expired',
  refunded:   'cancelled',
  chargeback: 'cancelled',
};

export class PixzypayAcquirer implements IAcquirer {
  readonly slug = 'pixzypay';
  private readonly logger = new Logger(PixzypayAcquirer.name);

  private authHeader(apiKey: string) {
    return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  }

  private extractErrorMsg(error: any): string {
    const data = error.response?.data;
    if (data == null) return error.message;
    // Resposta em texto puro
    if (typeof data === 'string') return data.length < 400 ? data : data.substring(0, 400);
    if (typeof data !== 'object') return String(data);
    // Formato padrão { message, errors }
    if (data.message && typeof data.message === 'string') return data.message;
    if (data.error && typeof data.error === 'string') return data.error;
    if (data.errors) {
      if (typeof data.errors === 'string') return data.errors;
      const first = Object.values(data.errors)[0];
      return Array.isArray(first) ? (first as string[])[0] : JSON.stringify(data.errors);
    }
    // Fallback: dump completo do body para diagnóstico
    return JSON.stringify(data).substring(0, 400);
  }

  async createPix(
    amount: number,
    customer: {
      name?: string;
      email?: string;
      document?: string;
      phone?: string;
      externalId?: string;
      productName?: string;
    },
    credentials: AcquirerCredentials,
    webhookUrl?: string,
  ): Promise<PixChargeResponse> {
    const amountCents = Math.round(amount * 100);
    const cd = buildCustomerData(customer.externalId || '');

    const rawName = customer.name || '';
    const isTelegramHandle = rawName.startsWith('@') || /^User_\d+$/.test(rawName);
    const clientName = (!isTelegramHandle && rawName) ? rawName : cd.name;

    const body: any = {
      amount:      amountCents,
      client_name: clientName,
      client_email: customer.email || cd.email,
      client_doc:   customer.document || cd.cpf,
    };
    if (customer.externalId) body.external_id = customer.externalId;
    if (webhookUrl) body.webhook_url = webhookUrl;

    try {
      const r = await axios.post(`${BASE_URL}/transactions`, body, {
        headers: this.authHeader(credentials.apiKey),
        timeout: 8_000,
      });
      // PixzyPay envolve a resposta em { status, data: { id, pix_copy_paste, ... } }
      const wrapper = r.data;
      const d = wrapper?.data ?? wrapper;
      this.logger.log(`PixzyPay response: ${JSON.stringify(d)}`);

      const pixCode = d.br_code || d.pix_copy_paste || d.pix_qr_code || '';
      const rawImg  = d.qr_code_image || d.pix_qr_code_image
                   || d.metadata?.qr_code_image || d.metadata?.pix_qr_code_image
                   || undefined;
      const qrCodeImage = rawImg
        ? (rawImg.startsWith('data:') ? rawImg : `data:image/png;base64,${rawImg}`)
        : undefined;

      return {
        transactionId: d.transaction_id || d.id,
        pixCode,
        qrCodeImage,
        amount,
        expiresAt: d.expires_at ? new Date(d.expires_at) : undefined,
        status:    d.status ?? 'pending',
      };
    } catch (error: any) {
      const status = error.response?.status || 'N/A';
      this.logger.error(`PixzyPay createPix error ${status}: ${JSON.stringify(error.response?.data)}`);
      throw new Error(`PixzyPay ${status}: ${this.extractErrorMsg(error)}`);
    }
  }

  async checkStatus(transactionId: string, credentials: AcquirerCredentials): Promise<StatusCheckResponse> {
    try {
      const r = await axios.get(`${BASE_URL}/transactions/${transactionId}`, {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
        timeout: 10_000,
      });
      const wrapper = r.data;
      const d = wrapper?.data ?? wrapper;
      return {
        transactionId,
        status: STATUS_MAP[d.status] ?? 'pending',
        paidAt: d.paid_at ? new Date(d.paid_at) : undefined,
      };
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message;
      throw new Error(`PixzyPay ${error.response?.status || 'N/A'}: ${msg}`);
    }
  }

  async validateCredentials(credentials: AcquirerCredentials): Promise<boolean> {
    try {
      const r = await axios.get(`${BASE_URL}/account`, {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
        timeout: 10_000,
      });
      return r.status === 200;
    } catch (error: any) {
      const status = (error as AxiosError)?.response?.status;
      if (status === 401 || status === 403) return false;
      this.logger.error(`PixzyPay validate error: ${error.message}`);
      throw error;
    }
  }
}
