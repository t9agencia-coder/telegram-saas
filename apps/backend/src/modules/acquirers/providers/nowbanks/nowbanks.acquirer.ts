import { Logger } from '@nestjs/common';
import axios from 'axios';
import {
  IAcquirer,
  AcquirerCredentials,
  PixChargeResponse,
  StatusCheckResponse,
} from '../../acquirer.interface';

interface TokenCache {
  token:     string;
  expiresAt: number;
}

const BASE_URL = 'https://api.nowbanks.com.br';

export class NowBanksAcquirer implements IAcquirer {
  readonly slug = 'nowbanks';
  private readonly logger = new Logger(NowBanksAcquirer.name);
  private readonly tokenCache = new Map<string, TokenCache>();

  // URL fixa (não por workspace) — o transactionId já é globalmente único no
  // Payment, então não precisa da rota genérica /pix/:workspaceId. Mesmo padrão
  // de URL fixa usado pelas contas BaassPago (qrcodes/qrcodes2/qrcodes3).
  private buildWebhookUrl(): string {
    const base = (process.env.TELEGRAM_WEBHOOK_URL ?? 'http://localhost:3001/api/webhooks/telegram')
      .replace(/\/telegram$/, '');
    return `${base}/nowbanks`;
  }

  private async getToken(credentials: AcquirerCredentials): Promise<string> {
    const cacheKey = credentials.apiKey;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt - 30_000) {
      return cached.token;
    }

    const { data } = await axios.post(
      `${BASE_URL}/v1/auth/login`,
      {
        client_id:     credentials.apiKey,
        client_secret: credentials.apiSecret ?? '',
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15_000,
      },
    );

    const token     = data.access_token as string;
    const expiresIn = (data.expires_in ?? 3600) as number;

    this.tokenCache.set(cacheKey, { token, expiresAt: Date.now() + expiresIn * 1000 });
    return token;
  }

  async createPix(
    amount: number,
    customer: {
      name?:        string;
      email?:       string;
      document?:    string;
      phone?:       string;
      externalId?:  string;
      productName?: string;
    },
    credentials: AcquirerCredentials,
  ): Promise<PixChargeResponse> {
    const token = await this.getToken(credentials);

    const doc = (customer.document ?? '').replace(/\D/g, '') || '00000000000';
    const body = {
      amount,
      external_id: customer.externalId || `pix-${Date.now()}`,
      payer: {
        name:     customer.name || 'Cliente',
        document: doc,
      },
      clientCallbackUrl: this.buildWebhookUrl(),
    };

    try {
      const { data } = await axios.post(`${BASE_URL}/v1/payments/deposit`, body, {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      });

      return {
        transactionId: data.transaction_id,
        pixCode:       data.pix_copy_paste,
        qrCodeImage:   data.pix_qr_code,
        amount:        data.amount ?? amount,
        status:        'pending',
      };
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.response?.data?.title || error.message;
      this.logger.error(`NowBanks createPix error ${error.response?.status || 'N/A'}: ${JSON.stringify(error.response?.data)}`);
      throw new Error(`NowBanks ${error.response?.status || 'N/A'}: ${detail}`);
    }
  }

  async checkStatus(
    transactionId: string,
    credentials: AcquirerCredentials,
  ): Promise<StatusCheckResponse> {
    const token = await this.getToken(credentials);

    let data: any;
    try {
      const resp = await axios.get(`${BASE_URL}/v1/transactions/${transactionId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15_000,
      });
      data = resp.data;
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message;
      throw new Error(`NowBanks ${error.response?.status || 'N/A'}: ${detail}`);
    }

    // RETIDO (MED/bloqueio) fica como 'pending' de propósito — não é status final,
    // e nunca deve ser tratado como pago automaticamente.
    const statusMap: Record<string, StatusCheckResponse['status']> = {
      WAITING_PAYMENT: 'pending',
      PENDING:         'pending',
      PROCESSING:      'pending',
      RETIDO:          'pending',
      COMPLETED:       'paid',
      FAILED:          'failed',
      REJECTED:        'failed',
      CANCELED:        'cancelled',
      CANCELLED:       'cancelled',
    };

    return {
      transactionId,
      status: statusMap[data.status] ?? 'pending',
    };
  }

  async validateCredentials(credentials: AcquirerCredentials): Promise<boolean> {
    try {
      const token = await this.getToken(credentials);
      // Confirma que o token realmente autentica contra a API, não só que o login respondeu.
      await axios.get(`${BASE_URL}/v1/balance`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      });
      return true;
    } catch (error: any) {
      const status = error.response?.status;
      if (status === 401 || status === 403) return false;
      this.logger.error(`NowBanks validate error: ${error.message}`);
      throw error;
    }
  }
}
