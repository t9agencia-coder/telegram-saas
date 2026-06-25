import { Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  IAcquirer,
  AcquirerCredentials,
  PixChargeResponse,
  StatusCheckResponse,
} from '../../acquirer.interface';
import { buildCustomerData } from './pix-customer-data';

export interface PodpayBalance {
  amount: number;        // saldo disponível (centavos)
  waitingFunds: number;  // aguardando liberação
  maxAntecipable: number;
  reserve: number;       // reserva/bloqueado
}

export interface PodpayTransaction {
  id: string;
  status: string;
  amount: number;
  paymentMethod: string;
  customer: {
    name?: string;
    email?: string;
    document?: { type: string; number: string };
  };
  pixQrCode?: string;
  pixQrCodeImage?: string;
  createdAt: string;
  paidAt?: string;
}

export class PodpayAcquirer implements IAcquirer {
  readonly slug = 'podpay';
  private readonly logger = new Logger(PodpayAcquirer.name);

  getBaseUrl(environment: string): string {
    return environment === 'sandbox'
      ? 'https://sandbox.podpay.app'
      : 'https://api.podpay.app';
  }

  // ── Criar cobrança PIX ────────────────────────────────────────────────────

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
    const baseUrl  = this.getBaseUrl(credentials.environment);
    const amountCents = Math.round(amount * 100);

    const extId = customer.externalId || '';
    const customerData = buildCustomerData(extId);

    const body: any = {
      paymentMethod: 'pix',
      amount: amountCents,
      customer: {
        name:  customerData.name,
        email: customerData.email,
        phone: customerData.phone,
        document: {
          type:   'cpf',
          number: customerData.cpf,
        },
      },
      items: [
        {
          title:     customer.productName || 'Produto 1',
          unitPrice: amountCents,
          quantity:  1,
          tangible:  false,
        },
      ],
    };

    if (webhookUrl) body.postbackUrl = webhookUrl;

    try {
      const response = await axios.post(`${baseUrl}/v1/transactions`, body, {
        headers: {
          'x-api-key': credentials.apiKey,
          'X-Idempotency-Key': uuidv4(),
          'Content-Type': 'application/json',
        },
        timeout: 8_000,
      });

      const data = response.data?.data;
      return {
        transactionId: data.id,
        pixCode:       data.pixQrCode,
        qrCodeImage:   data.pixQrCodeImage,
        amount,
        status:        data.status,
      };
    } catch (error: any) {
      // Extrai a mensagem real da resposta do Podpay
      const podpayMsg = error.response?.data?.error?.message
        || error.response?.data?.message
        || error.message;
      const status = error.response?.status || 'N/A';
      this.logger.error(`Podpay createPix error ${status}: ${JSON.stringify(error.response?.data)}`);
      throw new Error(`Podpay ${status}: ${podpayMsg}`);
    }
  }

  // ── Verificar status ──────────────────────────────────────────────────────

  async checkStatus(
    transactionId: string,
    credentials: AcquirerCredentials,
  ): Promise<StatusCheckResponse> {
    const baseUrl = this.getBaseUrl(credentials.environment);

    let response: any;
    try {
      response = await axios.get(`${baseUrl}/v1/transactions/${transactionId}`, {
        headers: { 'x-api-key': credentials.apiKey },
        timeout: 10000,
      });
    } catch (error: any) {
      const podpayMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`Podpay ${error.response?.status || 'N/A'}: ${podpayMsg}`);
    }

    const data = response.data?.data;

    const statusMap: Record<string, StatusCheckResponse['status']> = {
      PAID:         'paid',     paid:         'paid',
      PENDING:      'pending',  pending:      'pending',
      PROCESSING:   'pending',  processing:   'pending',
      FAILED:       'failed',   failed:       'failed',
      CANCELLED:    'cancelled',cancelled:    'cancelled',
      CANCELED:     'cancelled',canceled:     'cancelled',
      EXPIRED:      'expired',  expired:      'expired',
      BLOCKED:      'failed',   blocked:      'failed',
      REFUNDED:     'cancelled',refunded:     'cancelled',
    };

    return {
      transactionId,
      status: statusMap[data.status] ?? 'pending',
      paidAt: data.paidAt ? new Date(data.paidAt) : undefined,
    };
  }

  // ── Validar credenciais ───────────────────────────────────────────────────

  async validateCredentials(credentials: AcquirerCredentials): Promise<boolean> {
    try {
      const baseUrl  = this.getBaseUrl(credentials.environment);
      const response = await axios.get(`${baseUrl}/v1/transactions?page=1&pageSize=1`, {
        headers: { 'x-api-key': credentials.apiKey },
        timeout: 10000,
      });
      return response.data?.success === true || response.status === 200;
    } catch (error: any) {
      const status = (error as AxiosError)?.response?.status;
      if (status === 401 || status === 403) return false;
      this.logger.error(`Podpay validate error: ${error.message}`);
      throw error;
    }
  }

  // ── Consultar saldo ───────────────────────────────────────────────────────

  async getBalance(credentials: AcquirerCredentials): Promise<PodpayBalance> {
    const baseUrl  = this.getBaseUrl(credentials.environment);
    const response = await axios.get(`${baseUrl}/v1/balance/available`, {
      headers: { 'x-api-key': credentials.apiKey },
      timeout: 10000,
    });
    const d = response.data?.data;
    return {
      amount:          d.amount          ?? 0,
      waitingFunds:    d.waitingFunds     ?? 0,
      maxAntecipable:  d.maxAntecipable  ?? 0,
      reserve:         d.reserve         ?? 0,
    };
  }

  // ── Listar transações ─────────────────────────────────────────────────────

  async listTransactions(
    credentials: AcquirerCredentials,
    page = 1,
    pageSize = 20,
  ): Promise<{ transactions: PodpayTransaction[]; total: number }> {
    const baseUrl  = this.getBaseUrl(credentials.environment);
    const response = await axios.get(
      `${baseUrl}/v1/transactions?page=${page}&pageSize=${pageSize}`,
      {
        headers: { 'x-api-key': credentials.apiKey },
        timeout: 10000,
      },
    );

    const d = response.data?.data;
    return {
      transactions: d?.transactions ?? [],
      total:        d?.pagination?.total ?? 0,
    };
  }
}
