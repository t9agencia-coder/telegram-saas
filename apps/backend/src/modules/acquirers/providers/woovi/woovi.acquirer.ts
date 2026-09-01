import { Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import {
  IAcquirer,
  AcquirerCredentials,
  PixChargeResponse,
  StatusCheckResponse,
} from '../../acquirer.interface';
import { buildCustomerData } from '../podpay/pix-customer-data';

const BASE_URL = 'https://api.openpix.com.br'; // Woovi é o rebranding da OpenPix — mesma API

export class WooviAcquirer implements IAcquirer {
  readonly slug = 'woovi';
  private readonly logger = new Logger(WooviAcquirer.name);

  // ── Criar cobrança PIX ────────────────────────────────────────────────────

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
    const valueCents = Math.round(amount * 100);

    // A Woovi consulta cobrança por correlationID (GET /charge/:correlationID),
    // não pelo transactionID interno dela — por isso é o correlationID que vira
    // o transactionId salvo no nosso Payment (mesma id usada pra criar, consultar
    // e reconhecer no webhook, sem tradução entre os dois lados).
    //
    // NUNCA usar só customer.externalId (= leadId) aqui: a doc da Woovi é
    // explícita que correlationID precisa ser único por PEDIDO, não por cliente.
    // Um mesmo lead compra mais de uma vez (produto diferente, upsell, retry de
    // PIX expirado) — reusar o leadId faria a segunda cobrança colidir com a
    // primeira (a Woovi trata correlationID como chave de idempotência: devolve
    // a cobrança antiga em vez de criar uma nova). O sufixo garante unicidade por
    // chamada; o prefixo mantém o leadId rastreável no painel da Woovi.
    const correlationID = `${customer.externalId || 'lead'}_${randomUUID()}`;

    // Lead do Telegram nunca tem CPF/e-mail reais — mesmo fallback sintético
    // (mas com checksum válido) já usado por Pixzypay/Podpay/Velana/NowBanks/MercadoPago.
    const cd = buildCustomerData(customer.externalId || '');
    const email = customer.email || cd.email;
    const doc = (customer.document ?? '').replace(/\D/g, '') || cd.cpf;

    // Mesmo filtro usado por Pixzypay/NowBanks/MercadoPago/Pagarme: sem isso,
    // um lead sem nome de exibição chega aqui como "@handle" ou "User_123" e
    // esse literal ia direto pro antifraude da Woovi como nome do cliente.
    const rawName = customer.name || '';
    const isTelegramHandle = rawName.startsWith('@') || /^User_\d+$/.test(rawName);
    const name = (!isTelegramHandle && rawName) ? rawName : cd.name;

    const body = {
      correlationID,
      value: valueCents,
      comment: customer.productName || 'Produto',
      customer: {
        name,
        email,
        taxID: doc,
      },
    };

    try {
      const { data } = await axios.post(`${BASE_URL}/api/v1/charge`, body, {
        headers: {
          Authorization:  credentials.apiKey, // Woovi usa o AppID cru, sem "Bearer"
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      });

      const charge = data.charge;
      return {
        transactionId: charge.correlationID,
        pixCode:       charge.brCode,
        qrCodeImage:   charge.qrCodeImage,
        amount,
        status:        charge.status,
      };
    } catch (error: any) {
      const detail = error.response?.data?.error
        || error.response?.data?.message
        || error.message;
      this.logger.error(`Woovi createPix error ${error.response?.status || 'N/A'}: ${JSON.stringify(error.response?.data)}`);
      throw new Error(`Woovi ${error.response?.status || 'N/A'}: ${detail}`);
    }
  }

  // ── Verificar status ──────────────────────────────────────────────────────

  async checkStatus(
    transactionId: string,
    credentials: AcquirerCredentials,
  ): Promise<StatusCheckResponse> {
    let data: any;
    try {
      const resp = await axios.get(`${BASE_URL}/api/v1/charge/${transactionId}`, {
        headers: { Authorization: credentials.apiKey },
        timeout: 15_000,
      });
      data = resp.data;
    } catch (error: any) {
      const detail = error.response?.data?.error || error.message;
      throw new Error(`Woovi ${error.response?.status || 'N/A'}: ${detail}`);
    }

    const status = data.charge?.status;

    // Vocabulário de status da Woovi/OpenPix: ACTIVE|COMPLETED|EXPIRED
    const statusMap: Record<string, StatusCheckResponse['status']> = {
      ACTIVE:    'pending',
      COMPLETED: 'paid',
      EXPIRED:   'expired',
    };

    return {
      transactionId,
      status: statusMap[status] ?? 'pending',
    };
  }

  // ── Validar credenciais ───────────────────────────────────────────────────

  async validateCredentials(credentials: AcquirerCredentials): Promise<boolean> {
    try {
      // /api/v1/account só confirma que o AppID autentica — não cria nenhum recurso.
      await axios.get(`${BASE_URL}/api/v1/account`, {
        headers: { Authorization: credentials.apiKey },
        timeout: 10_000,
      });
      return true;
    } catch (error: any) {
      const status = (error as AxiosError)?.response?.status;
      if (status === 401 || status === 403) return false;
      this.logger.error(`Woovi validate error: ${error.message}`);
      throw error;
    }
  }
}
