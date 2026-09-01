import { Logger } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import {
  IAcquirer,
  AcquirerCredentials,
  PixChargeResponse,
  StatusCheckResponse,
} from '../../acquirer.interface';
import { buildCustomerData } from '../podpay/pix-customer-data';

const BASE_URL = 'https://api.mercadopago.com';

export class MercadoPagoAcquirer implements IAcquirer {
  readonly slug = 'mercadopago';
  private readonly logger = new Logger(MercadoPagoAcquirer.name);

  // ── Criar cobrança PIX (Orders API) ──────────────────────────────────────────

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
    // Lead do Telegram nunca tem CPF/e-mail reais — mesmo fallback sintético
    // (mas com checksum válido) já usado por Pixzypay/Podpay/Velana/NowBanks.
    const cd = buildCustomerData(customer.externalId || '');
    const email = customer.email || cd.email;
    const doc = (customer.document ?? '').replace(/\D/g, '') || cd.cpf;
    const usingSyntheticDoc = doc === cd.cpf;
    const totalAmount = amount.toFixed(2);

    // O CPF do payer quase sempre é sintético (Lead do Telegram não tem esse
    // campo hoje), então usar o nome de exibição real do Telegram junto — que
    // costuma vir abreviado, com apelido ou emoji — cria uma identidade
    // nome/CPF incoerente (nome de uma pessoa, documento de outra "pessoa"
    // sintética qualquer). Isso é justamente o tipo de sinal que pesa no
    // antifraude de Pix do Mercado Pago. Por isso, sempre que o CPF é sintético
    // o nome também vem do mesmo buildCustomerData que o gerou — nome e
    // documento nascem juntos do mesmo hash, formando uma identidade sintética
    // internamente consistente. Só usa o nome real se o CPF também for real.
    const rawName = customer.name || '';
    const isTelegramHandle = rawName.startsWith('@') || /^User_\d+$/.test(rawName);
    const fullName = (!usingSyntheticDoc && !isTelegramHandle && rawName) ? rawName : cd.name;
    const [firstName, ...rest] = fullName.trim().split(/\s+/);
    const lastName = rest.join(' ') || firstName;

    // Sem description/items, a order chega pro Mercado Pago como um valor solto
    // sem nenhuma descrição do que está sendo vendido — não aparece nome de
    // produto no painel deles, e pro antifraude parece mais uma transferência
    // anônima do que uma compra de verdade.
    const productName = customer.productName || 'Produto';

    const body = {
      type: 'online',
      total_amount: totalAmount,
      external_reference: customer.externalId || `pix-${Date.now()}`,
      processing_mode: 'automatic',
      description: productName,
      items: [
        {
          title: productName,
          unit_price: totalAmount,
          quantity: 1,
        },
      ],
      transactions: {
        payments: [
          {
            amount: totalAmount,
            payment_method: { id: 'pix', type: 'bank_transfer' },
            // Mesma janela de expiração usada em todo o resto da plataforma
            // (pix.service.ts sempre grava expiresAt = +30min).
            expiration_time: 'PT30M',
          },
        ],
      },
      payer: {
        email,
        first_name: firstName,
        last_name: lastName,
        identification: { type: 'CPF', number: doc },
      },
    };

    try {
      const { data } = await axios.post(`${BASE_URL}/v1/orders`, body, {
        headers: {
          Authorization:      `Bearer ${credentials.apiKey}`,
          // Obrigatório na Orders API — evita duplicar a cobrança em caso de retry.
          'X-Idempotency-Key': randomUUID(),
          'Content-Type':      'application/json',
        },
        timeout: 15_000,
      });

      const payment = data.transactions?.payments?.[0];
      const pm = payment?.payment_method;

      return {
        transactionId: data.id,
        pixCode:       pm?.qr_code,
        qrCodeImage:   pm?.qr_code_base64 ? `data:image/png;base64,${pm.qr_code_base64}` : undefined,
        amount,
        status:        data.status,
      };
    } catch (error: any) {
      const detail = error.response?.data?.message
        || error.response?.data?.error
        || (error.response?.data?.errors ? JSON.stringify(error.response.data.errors) : undefined)
        || error.message;
      this.logger.error(`MercadoPago createPix error ${error.response?.status || 'N/A'}: ${JSON.stringify(error.response?.data)}`);
      throw new Error(`MercadoPago ${error.response?.status || 'N/A'}: ${detail}`);
    }
  }

  // ── Verificar status ──────────────────────────────────────────────────────

  async checkStatus(
    transactionId: string,
    credentials: AcquirerCredentials,
  ): Promise<StatusCheckResponse> {
    let data: any;
    try {
      const resp = await axios.get(`${BASE_URL}/v1/orders/${transactionId}`, {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
        timeout: 15_000,
      });
      data = resp.data;
    } catch (error: any) {
      const detail = error.response?.data?.message || error.message;
      throw new Error(`MercadoPago ${error.response?.status || 'N/A'}: ${detail}`);
    }

    const payment = data.transactions?.payments?.[0];
    const status  = payment?.status ?? data.status;

    // Vocabulário de status da Orders API (nível transação):
    // created|processing|action_required|processed|expired|canceled|failed|charged_back|refunded
    // processed cobre tanto accredited quanto partially_refunded — nos dois o
    // dinheiro já entrou, então conta como pago pra este sistema.
    const statusMap: Record<string, StatusCheckResponse['status']> = {
      created:         'pending',
      processing:      'pending',
      action_required: 'pending',
      processed:       'paid',
      expired:         'expired',
      canceled:        'cancelled',
      cancelled:       'cancelled',
      refunded:        'cancelled',
      charged_back:    'cancelled',
      failed:          'failed',
    };

    return {
      transactionId,
      status: statusMap[status] ?? 'pending',
    };
  }

  // ── Validar credenciais ───────────────────────────────────────────────────

  async validateCredentials(credentials: AcquirerCredentials): Promise<boolean> {
    try {
      // /users/me só confirma que o Access Token autentica — não cria nenhum recurso.
      await axios.get(`${BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
        timeout: 10_000,
      });
      return true;
    } catch (error: any) {
      const status = error.response?.status;
      if (status === 401 || status === 403) return false;
      this.logger.error(`MercadoPago validate error: ${error.message}`);
      throw error;
    }
  }
}
