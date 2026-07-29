import { Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import {
  IAcquirer,
  AcquirerCredentials,
  PixChargeResponse,
  StatusCheckResponse,
} from '../../acquirer.interface';
import { buildCustomerData } from '../podpay/pix-customer-data';

const BASE_URL = 'https://api.velana.com.br/v1';

// Auth: Basic base64("{secretKey}:x") — uma única chave secreta como usuário,
// senha vazia (literalmente "x"), conforme documentação (velana.readme.io/reference/introducao).
function buildAuthHeader(apiKey: string): string {
  return 'Basic ' + Buffer.from(`${apiKey}:x`).toString('base64');
}

export class VelanaAcquirer implements IAcquirer {
  readonly slug = 'velana';
  private readonly logger = new Logger(VelanaAcquirer.name);

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
    const amountCents = Math.round(amount * 100);

    const extId = customer.externalId || '';
    const customerData = buildCustomerData(extId);

    const body: any = {
      amount: amountCents,
      paymentMethod: 'pix',
      customer: {
        name:  customerData.name,
        email: customerData.email,
        phone: customerData.phone,
        document: {
          type:   'cpf',
          number: customerData.cpf,
        },
      },
      // items é obrigatório na Velana pra qualquer método de pagamento, não só cartão
      items: [
        {
          title:     customer.productName || 'Produto 1',
          unitPrice: amountCents,
          quantity:  1,
          tangible:  false,
        },
      ],
      pix: {
        expiresInDays: 1,
      },
    };

    // O formato de postback da Velana é diferente do parser genérico de
    // pix.service.ts::processWebhook (ver webhooks.service.ts::processVelanaWebhook),
    // então reaproveita a mesma URL base recebida (que já embute o workspaceId) trocando
    // /pix/ pela rota dedicada — sem precisar de um builder novo em pix.service.ts.
    if (webhookUrl) body.postbackUrl = webhookUrl.replace('/pix/', '/velana/');

    try {
      const response = await axios.post(`${BASE_URL}/transactions`, body, {
        headers: {
          authorization: buildAuthHeader(credentials.apiKey),
          'content-type': 'application/json',
        },
        timeout: 8_000,
      });

      const data = response.data;
      return {
        transactionId: String(data.id),
        pixCode:       data.pix?.qrcode,
        qrCodeImage:   data.pix?.url,
        amount,
        status:        data.status,
      };
    } catch (error: any) {
      const velanaMsg = error.response?.data?.message
        || error.response?.data?.error
        || error.message;
      const status = error.response?.status || 'N/A';
      this.logger.error(`Velana createPix error ${status}: ${JSON.stringify(error.response?.data)}`);
      throw new Error(`Velana ${status}: ${velanaMsg}`);
    }
  }

  // ── Verificar status ──────────────────────────────────────────────────────

  async checkStatus(
    transactionId: string,
    credentials: AcquirerCredentials,
  ): Promise<StatusCheckResponse> {
    let response: any;
    try {
      response = await axios.get(`${BASE_URL}/transactions/${transactionId}`, {
        headers: { authorization: buildAuthHeader(credentials.apiKey) },
        timeout: 10000,
      });
    } catch (error: any) {
      const velanaMsg = error.response?.data?.message || error.message;
      throw new Error(`Velana ${error.response?.status || 'N/A'}: ${velanaMsg}`);
    }

    const data = response.data;

    // Vocabulário de status da Velana (objeto transaction):
    // waiting_payment|processing|authorized|paid|refused|canceled|refunded|chargedback|in_protest|partially_paid
    const statusMap: Record<string, StatusCheckResponse['status']> = {
      paid:            'paid',
      waiting_payment: 'pending',
      processing:      'pending',
      authorized:      'pending',
      refused:         'failed',
      canceled:        'cancelled',
      cancelled:       'cancelled',
      refunded:        'cancelled',
      chargedback:     'cancelled',
      in_protest:      'pending',
      partially_paid:  'pending',
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
      const response = await axios.get(`${BASE_URL}/transactions`, {
        headers: { authorization: buildAuthHeader(credentials.apiKey) },
        timeout: 10000,
      });
      return response.status === 200;
    } catch (error: any) {
      const status = (error as AxiosError)?.response?.status;
      if (status === 401 || status === 403) return false;
      this.logger.error(`Velana validate error: ${error.message}`);
      throw error;
    }
  }
}
