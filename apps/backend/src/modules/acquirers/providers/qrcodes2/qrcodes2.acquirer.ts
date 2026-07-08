import axios from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
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

// Segunda conta BaassPago (Sulcredi/Cliconbr) — mesma API, credenciais e
// certificado mTLS diferentes da integração original (qrcodes.acquirer.ts,
// que não é tocada por este arquivo).
const CASH_IN_URL = 'https://api.pix.basspago.com.br';

// Carrega o certificado mTLS uma vez em memória, de uma pasta separada da
// primeira conta — rejectUnauthorized:false necessário porque o servidor usa
// CA privada da ONZ. A segurança mTLS vem do certificado CLIENT apresentado.
function loadMtlsAgent(): https.Agent {
  const certsDir = path.resolve(process.cwd(), 'certs', 'basspago2');
  try {
    return new https.Agent({
      cert: fs.readFileSync(path.join(certsDir, 'BASSPAGO_230.crt')),
      key:  fs.readFileSync(path.join(certsDir, 'BASSPAGO_230.key')),
      rejectUnauthorized: false,
    });
  } catch {
    return new https.Agent({ rejectUnauthorized: false });
  }
}

const mtlsAgent = loadMtlsAgent();

export class QRCodes2Acquirer implements IAcquirer {
  readonly slug = 'qrcodes2';
  private readonly tokenCache = new Map<string, TokenCache>();

  private async getToken(credentials: AcquirerCredentials): Promise<string> {
    const cacheKey = credentials.apiKey;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt - 30_000) {
      return cached.token;
    }

    // BaassPago: client_id/client_secret no body form-urlencoded (sem Basic Auth)
    const body = [
      `client_id=${encodeURIComponent(credentials.apiKey)}`,
      `client_secret=${encodeURIComponent(credentials.apiSecret ?? '')}`,
      'grant_type=client_credentials',
    ].join('&');

    const { data } = await axios.post(
      `${CASH_IN_URL}/oauth/token`,
      body,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent: mtlsAgent,
        timeout:    15_000,
      },
    );

    // Spec retorna access_token (snake_case) + expires_in (segundos)
    const token     = (data.access_token ?? data.accessToken) as string;
    const expiresIn = (data.expires_in   ?? data.expiresIn ?? 3600) as number;

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
    if (!credentials.pixKey) {
      throw new Error('Chave PIX não configurada para BaassPago (QRCodes2)');
    }

    const token = await this.getToken(credentials);

    const body: any = {
      calendario: { expiracao: 3600 },
      valor:      { original: amount.toFixed(2) },
      chave:      credentials.pixKey,
    };

    // BCB spec: devedor só pode ser enviado se acompanhado de CPF ou CNPJ
    const doc = customer.document?.replace(/\D/g, '') ?? '';
    if (doc.length === 11 || doc.length === 14) {
      const safeName = (customer.name ?? 'Cliente')
        .replace(/^@/, '')
        .replace(/[^a-zA-ZÀ-úà-ú0-9 \-\/\.]/g, '')
        .trim()
        .substring(0, 200) || 'Cliente';
      body.devedor = { nome: safeName };
      if (doc.length === 11) body.devedor.cpf  = doc;
      if (doc.length === 14) body.devedor.cnpj = doc;
    }

    if (customer.externalId || customer.productName) {
      body.infoAdicionais = [{
        nome:  'Pedido',
        valor: customer.externalId ?? customer.productName ?? 'compra',
      }];
    }

    // POST /cob — o txid é gerado pelo PSP
    let data: any;
    try {
      const resp = await axios.post(`${CASH_IN_URL}/cob`, body, {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        httpsAgent: mtlsAgent,
        timeout:    20_000,
      });
      data = resp.data;
    } catch (e: any) {
      const detail = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
      throw new Error(`BaassPago2 /cob falhou: ${detail}`);
    }

    // Busca pixCopiaECola: BaassPago pode retorná-lo diretamente ou só via location
    let pixCode: string = data.pixCopiaECola ?? '';
    if (!pixCode && data.location) {
      try {
        const locationUrl = data.location.startsWith('http')
          ? data.location
          : `https://${data.location}`;
        const loc = await axios.get(locationUrl, { timeout: 10_000 });
        pixCode = loc.data?.pixCopiaECola ?? '';
      } catch {
        // ignorado — polling via webhook ainda funcionará
      }
    }

    return {
      transactionId: data.txid,
      pixCode,
      amount,
      status:    'pending',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
  }

  async checkStatus(
    transactionId: string,
    credentials: AcquirerCredentials,
  ): Promise<StatusCheckResponse> {
    const token = await this.getToken(credentials);

    const { data } = await axios.get(`${CASH_IN_URL}/cob/${transactionId}`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: mtlsAgent,
      timeout:    15_000,
    });

    let status: StatusCheckResponse['status'] = 'pending';
    let paidAt: Date | undefined;

    switch (data.status) {
      case 'CONCLUIDA':
        status = 'paid';
        if (data.pix?.[0]?.horario) paidAt = new Date(data.pix[0].horario);
        break;
      case 'REMOVIDA_PELO_USUARIO_RECEBEDOR':
      case 'REMOVIDA_PELO_PSP':
        status = 'cancelled';
        break;
      default: {
        const criacao   = data.calendario?.criacao;
        const expiracao = data.calendario?.expiracao;
        if (criacao && expiracao) {
          const exp = new Date(criacao).getTime() + expiracao * 1000;
          if (Date.now() > exp) status = 'expired';
        }
      }
    }

    return { transactionId, status, paidAt };
  }

  async validateCredentials(credentials: AcquirerCredentials): Promise<boolean> {
    try {
      const token = await this.getToken(credentials);

      // Registra webhook: BaassPago adiciona /pix ao final automaticamente.
      // Então registramos ${base}/qrcodes2 e eles chamam ${base}/qrcodes2/pix
      if (credentials.pixKey) {
        const base = (process.env.TELEGRAM_WEBHOOK_URL ?? 'http://localhost:3001/api/webhooks/telegram')
          .replace(/\/telegram$/, '');
        const webhookUrl = `${base}/qrcodes2/pix`;

        await axios.put(
          `${CASH_IN_URL}/webhook/${encodeURIComponent(credentials.pixKey)}`,
          { webhookUrl },
          {
            headers: {
              Authorization:  `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            httpsAgent: mtlsAgent,
            timeout:    10_000,
          },
        ).catch(() => {});
      }

      return true;
    } catch {
      return false;
    }
  }
}
