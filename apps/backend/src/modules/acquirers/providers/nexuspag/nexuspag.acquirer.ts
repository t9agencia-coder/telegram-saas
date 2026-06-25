import { Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import {
  IAcquirer,
  AcquirerCredentials,
  PixChargeResponse,
  StatusCheckResponse,
} from '../../acquirer.interface';

const BASE_URL = 'https://nexuspag.com/api';

const STATUS_MAP: Record<string, StatusCheckResponse['status']> = {
  pending:   'pending',
  paid:      'paid',
  expired:   'expired',
  cancelled: 'cancelled',
};

export class NexusPagAcquirer implements IAcquirer {
  readonly slug = 'nexuspag';
  private readonly logger = new Logger(NexusPagAcquirer.name);

  private authHeaders(apiKey: string) {
    return { 'x-api-key': apiKey, 'Content-Type': 'application/json' };
  }

  private extractErrorMsg(error: any): string {
    const data = error.response?.data;
    if (data == null) return error.message;
    if (typeof data === 'string') return data.length < 400 ? data : data.substring(0, 400);
    if (data.message && typeof data.message === 'string') return data.message;
    if (data.error   && typeof data.error   === 'string') return data.error;
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
    // NexusPag recebe valor em reais com 2 casas decimais (não centavos)
    const body: any = {
      amount:      parseFloat(amount.toFixed(2)),
      description: customer.productName || 'Produto',
      expiration:  1800, // 30 min em segundos (padrão PIX)
    };
    if (customer.externalId) body.external_id = `${customer.externalId}_${Date.now()}`;
    if (webhookUrl)          body.webhook_url  = webhookUrl;

    try {
      const r = await axios.post(`${BASE_URL}/pix/create`, body, {
        headers: this.authHeaders(credentials.apiKey),
        timeout: 8_000,
      });
      // Resposta: { success, transaction: { id, pix_copia_cola, qr_code_base64, ... } }
      const d = r.data?.transaction ?? r.data;
      this.logger.log(`NexusPag createPix: id=${d.id} status=${d.status}`);

      const pixCode = d.pix_copia_cola || '';
      if (!pixCode) {
        throw new Error('NexusPag retornou cobrança sem pix_copia_cola');
      }

      const rawQr = d.qr_code_base64;
      const qrCodeImage = rawQr
        ? (rawQr.startsWith('data:') ? rawQr : `data:image/png;base64,${rawQr}`)
        : undefined;

      return {
        transactionId: d.id,
        pixCode,
        qrCodeImage,
        amount,
        expiresAt: d.expires_at ? new Date(d.expires_at) : undefined,
        status:    d.status ?? 'pending',
      };
    } catch (error: any) {
      const status = error.response?.status || 'N/A';
      this.logger.error(`NexusPag createPix error ${status}: ${JSON.stringify(error.response?.data)}`);
      throw new Error(`NexusPag ${status}: ${this.extractErrorMsg(error)}`);
    }
  }

  async checkStatus(transactionId: string, credentials: AcquirerCredentials): Promise<StatusCheckResponse> {
    try {
      const r = await axios.get(`${BASE_URL}/pix/${transactionId}`, {
        headers: { 'x-api-key': credentials.apiKey },
        timeout: 10_000,
      });
      const d = r.data;
      return {
        transactionId,
        status: STATUS_MAP[d.status] ?? 'pending',
        paidAt: d.paid_at ? new Date(d.paid_at) : undefined,
      };
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message;
      throw new Error(`NexusPag ${error.response?.status || 'N/A'}: ${msg}`);
    }
  }

  async validateCredentials(credentials: AcquirerCredentials): Promise<boolean> {
    // GET em ID inexistente: 401 = chave inválida, 404 = chave válida (transação não encontrada)
    try {
      await axios.get(`${BASE_URL}/pix/__credential_check__`, {
        headers: { 'x-api-key': credentials.apiKey },
        timeout: 10_000,
      });
      return true;
    } catch (error: any) {
      const status = (error as AxiosError)?.response?.status;
      if (status === 401 || status === 403) return false;
      if (status === 404) return true;
      this.logger.error(`NexusPag validate error: ${error.message}`);
      throw error;
    }
  }
}
