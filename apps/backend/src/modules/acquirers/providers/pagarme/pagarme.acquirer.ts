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

const BASE_URL = 'https://api.pagar.me/core/v5';

// Auth: Basic base64("{secretKey}:") — a secret key como usuário, senha vazia
// (só os dois-pontos, nada depois), conforme documentação oficial.
function buildAuthHeader(secretKey: string): string {
  return 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64');
}

export class PagarmeAcquirer implements IAcquirer {
  readonly slug = 'pagarme';
  private readonly logger = new Logger(PagarmeAcquirer.name);

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
    const amountCents = Math.round(amount * 100);

    // Lead do Telegram nunca tem CPF/e-mail reais — mesmo fallback sintético
    // (mas com checksum válido) já usado por Pixzypay/Podpay/Velana/NowBanks/
    // MercadoPago/Woovi. Diferente da Woovi, a Pagar.me não exige nenhum ID
    // único gerado por nós (o "id" da order é sempre gerado por eles), então não
    // existe aqui o risco de colisão que a correlationID da Woovi tinha.
    const cd = buildCustomerData(customer.externalId || '');
    const doc = (customer.document ?? '').replace(/\D/g, '') || cd.cpf;
    const email = customer.email || cd.email;

    const rawName = customer.name || '';
    const isTelegramHandle = rawName.startsWith('@') || /^User_\d+$/.test(rawName);
    const name = (!isTelegramHandle && rawName) ? rawName : cd.name;

    // Mudança recente da Pagar.me: PIX passou a exigir telefone do cliente
    // ("At least one customer phone is required"), descoberto via teste real
    // (gateway_response 400 nesse exato texto). Lead do Telegram raramente tem
    // telefone real (campo phone existe no schema mas quase nunca é preenchido)
    // — mesmo esquema de fallback sintético do CPF/nome/e-mail, aqui quebrado
    // em area_code/number como a Pagar.me exige.
    let phoneDigits = (customer.phone ?? '').replace(/\D/g, '');
    if (phoneDigits.startsWith('55') && phoneDigits.length > 11) phoneDigits = phoneDigits.slice(2);
    if (phoneDigits.length < 10) phoneDigits = cd.phone;
    const areaCode = phoneDigits.slice(0, 2);
    const phoneNumber = phoneDigits.slice(2);

    const body = {
      // Referência do pedido no nosso sistema (leadId) — mesmo papel do
      // external_id da Pixzypay/NowBanks e do external_reference do Mercado
      // Pago: rastreabilidade no painel do adquirente, não usado como chave
      // de idempotência pela Pagar.me (diferente do correlationID da Woovi).
      code: customer.externalId,
      items: [
        {
          amount: amountCents,
          description: customer.productName || 'Produto',
          quantity: 1,
        },
      ],
      customer: {
        name,
        email,
        type: 'individual',
        document: doc,
        document_type: 'CPF',
        phones: {
          mobile_phone: {
            country_code: '55',
            area_code:    areaCode,
            number:       phoneNumber,
          },
        },
      },
      payments: [
        {
          payment_method: 'pix',
          // Mesma janela de expiração usada em todo o resto da plataforma
          // (pix.service.ts sempre grava expiresAt = +30min).
          pix: { expires_in: 1800 },
        },
      ],
    };

    try {
      const { data } = await axios.post(`${BASE_URL}/orders`, body, {
        headers: {
          Authorization:       buildAuthHeader(credentials.apiKey),
          'Content-Type':      'application/json',
          'Idempotency-Key':   randomUUID(),
        },
        timeout: 15_000,
      });

      const charge = data.charges?.[0];
      if (!charge?.id) {
        // Nunca deveria acontecer numa resposta 2xx, mas se acontecer é bom
        // saber exatamente o que faltou em vez de um TypeError genérico —
        // cai no catch abaixo e vira "Pagarme N/A: ..." (marca UNSTABLE, correto
        // pra um retorno inesperado do provedor).
        throw new Error(`resposta sem cobrança Pix (order ${data.id ?? 'sem id'})`);
      }
      // A Pagar.me devolve o EMV (copia e cola) em "qr_code" — não em
      // "qr_code_emv" nem em base64 — e a imagem só como URL em "qr_code_url"
      // (nunca base64 inline). Confirmado testando uma cobrança real.
      const tx = charge.last_transaction;

      return {
        transactionId: charge.id,
        pixCode:       tx?.qr_code,
        qrCodeImage:   tx?.qr_code_url,
        amount,
        status:        charge.status,
      };
    } catch (error: any) {
      const detail = error.response?.data?.message
        || error.response?.data?.errors
        || error.message;
      this.logger.error(`Pagarme createPix error ${error.response?.status || 'N/A'}: ${JSON.stringify(error.response?.data)}`);
      throw new Error(`Pagarme ${error.response?.status || 'N/A'}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
  }

  // ── Verificar status ──────────────────────────────────────────────────────

  async checkStatus(
    transactionId: string,
    credentials: AcquirerCredentials,
  ): Promise<StatusCheckResponse> {
    let data: any;
    try {
      const resp = await axios.get(`${BASE_URL}/charges/${transactionId}`, {
        headers: { Authorization: buildAuthHeader(credentials.apiKey) },
        timeout: 15_000,
      });
      data = resp.data;
    } catch (error: any) {
      const detail = error.response?.data?.message || error.message;
      throw new Error(`Pagarme ${error.response?.status || 'N/A'}: ${detail}`);
    }

    // Vocabulário de status de charge da Pagar.me:
    // pending|processing|paid|failed|canceled|overpaid|underpaid
    const statusMap: Record<string, StatusCheckResponse['status']> = {
      pending:    'pending',
      processing: 'pending',
      paid:       'paid',
      overpaid:   'paid',
      // underpaid (pagou menos que o cobrado) nunca é tratado como concluído —
      // fica pendente pra revisão, mesmo espírito do RETIDO da NowBanks.
      underpaid:  'pending',
      failed:     'failed',
      canceled:   'cancelled',
    };

    return {
      transactionId,
      status: statusMap[data.status] ?? 'pending',
    };
  }

  // ── Validar credenciais ───────────────────────────────────────────────────

  async validateCredentials(credentials: AcquirerCredentials): Promise<boolean> {
    try {
      // Lista pedidos (1 item) só pra confirmar que a secret key autentica —
      // não cria nenhum recurso.
      await axios.get(`${BASE_URL}/orders?size=1`, {
        headers: { Authorization: buildAuthHeader(credentials.apiKey) },
        timeout: 10_000,
      });
      return true;
    } catch (error: any) {
      const status = (error as AxiosError)?.response?.status;
      if (status === 401 || status === 403) return false;
      this.logger.error(`Pagarme validate error: ${error.message}`);
      throw error;
    }
  }
}
