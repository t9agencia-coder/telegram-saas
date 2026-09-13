import { Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import {
  IAcquirer,
  AcquirerCredentials,
  PixChargeResponse,
  StatusCheckResponse,
} from '../../acquirer.interface';

const BASE_URL = 'https://api.reachpayments.com.br';

// Auth: HTTP Basic com a chave pública como username e a secreta como password
// (pk_live_.../sk_live_...), conforme doc oficial (llms-full.txt).
function buildAuthHeader(publicKey: string, secretKey: string): string {
  return 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
}

export class ReachAcquirer implements IAcquirer {
  readonly slug = 'reach';
  private readonly logger = new Logger(ReachAcquirer.name);

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
    const amountCents = Math.round(amount * 100);

    // Confirmado pelo usuário: a conta ReachPay deste projeto tem a BaasPago
    // como adquirente por trás (PIX "aberto" — mesma infra do qrcodes4), que
    // não exige NENHUM dado do cliente pra emitir o PIX. Diferente de
    // Pagar.me/Podpay/etc., aqui não mandamos `customer` de jeito nenhum —
    // nem nome sintético, nem telefone/e-mail — só o essencial (valor,
    // método, descrição, idempotencyKey). Isso também elimina o 500 genérico
    // que a API deles devolvia quando um `customer.phone` fora do formato
    // E.164 esperado (+55...) chegava até a BaasPago por trás.
    //
    // Webhook: doc nova (llms-full.txt) — `webhookUrl` inline no corpo faz a
    // API criar (1ª venda) ou reaproveitar (vendas seguintes) um endpoint de
    // webhook automaticamente pra essa URL, sem precisar cadastrar nada antes
    // no painel. O `webhook.secret` só vem na resposta da 1ª venda com essa
    // URL exata — logado abaixo pra copiar pro campo "Webhook Secret" do
    // admin (Adquirentes → ReachPay) na primeira vez que aparecer.
    const base = (process.env.TELEGRAM_WEBHOOK_URL ?? 'http://localhost:3001/api/webhooks/telegram')
      .replace(/\/telegram$/, '');
    const webhookUrl = `${base}/reach`;

    const body = {
      amount:   amountCents,
      currency: 'BRL',
      method:   'pix',
      description: customer.productName || 'Produto',
      webhookUrl,
      idempotencyKey: randomUUID(),
    };

    try {
      const { data } = await axios.post(`${BASE_URL}/api/v1/transactions`, body, {
        headers: {
          Authorization:  buildAuthHeader(credentials.apiKey, credentials.apiSecret ?? ''),
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      });

      if (!data?.pixCopyPaste) {
        throw new Error(`resposta sem pixCopyPaste (transaction ${data?.id ?? 'sem id'})`);
      }

      if (data.webhook?.secret) {
        this.logger.warn(
          `Reach: webhook endpoint criado com secret novo (só aparece 1x) — copie pro admin em ` +
          `Adquirentes → ReachPay → Webhook Secret: ${data.webhook.secret}`,
        );
      }

      return {
        transactionId: data.id,
        pixCode:       data.pixCopyPaste,
        qrCodeImage:   data.pixQrCode,
        amount,
        status:        data.status,
        expiresAt:     data.pixExpiresAt ? new Date(data.pixExpiresAt) : undefined,
      };
    } catch (error: any) {
      const detail = error.response?.data?.message
        || error.response?.data?.error
        || error.message;
      this.logger.error(`Reach createPix error ${error.response?.status || 'N/A'}: ${JSON.stringify(error.response?.data)}`);
      throw new Error(`Reach ${error.response?.status || 'N/A'}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
  }

  // ── Verificar status ──────────────────────────────────────────────────────

  async checkStatus(
    transactionId: string,
    credentials: AcquirerCredentials,
  ): Promise<StatusCheckResponse> {
    let data: any;
    try {
      const resp = await axios.get(`${BASE_URL}/api/v1/transactions/${transactionId}`, {
        headers: { Authorization: buildAuthHeader(credentials.apiKey, credentials.apiSecret ?? '') },
        timeout: 15_000,
      });
      data = resp.data;
    } catch (error: any) {
      const detail = error.response?.data?.message || error.response?.data?.error || error.message;
      throw new Error(`Reach ${error.response?.status || 'N/A'}: ${detail}`);
    }

    // Vocabulário de status da ReachPay: pending|processing|paid|failed|refunded|cancelled
    const statusMap: Record<string, StatusCheckResponse['status']> = {
      pending:    'pending',
      processing: 'pending',
      paid:       'paid',
      failed:     'failed',
      cancelled:  'cancelled',
      // Estorno de venda já paga — mesmo tratamento de "não conta mais como
      // aprovada" usado pra canceled/refunded em Pagar.me/Velana.
      refunded:   'cancelled',
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
      // GET /balance só confirma que o par pk/sk autentica — não cria nenhum recurso.
      await axios.get(`${BASE_URL}/api/v1/balance`, {
        headers: { Authorization: buildAuthHeader(credentials.apiKey, credentials.apiSecret ?? '') },
        timeout: 10_000,
      });
      return true;
    } catch (error: any) {
      const status = (error as AxiosError)?.response?.status;
      if (status === 401 || status === 403) return false;
      this.logger.error(`Reach validate error: ${error.message}`);
      throw error;
    }
  }
}
