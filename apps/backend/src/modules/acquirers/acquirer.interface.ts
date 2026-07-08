export interface PixChargeResponse {
  transactionId: string;
  pixCode: string;       // copia e cola
  qrCodeImage?: string;  // URL ou base64
  amount: number;        // BRL decimal
  expiresAt?: Date;
  status: string;
}

export interface StatusCheckResponse {
  transactionId: string;
  status: 'pending' | 'paid' | 'expired' | 'failed' | 'cancelled';
  paidAt?: Date;
}

export interface AcquirerCredentials {
  apiKey: string;
  apiSecret?: string;
  environment: string; // 'production' | 'sandbox'
  webhookSecret?: string;
  pixKey?: string;      // Chave PIX do recebedor (QRCodes/Sulcredi)
}

export interface IAcquirer {
  readonly slug: string;
  createPix(
    amount: number,
    customer: {
      name?: string;
      email?: string;
      document?: string;   // CPF (somente dígitos)
      phone?: string;      // Telefone com DDD
      externalId?: string;
      productName?: string; // Nome do produto que aparece na cobrança
    },
    credentials: AcquirerCredentials,
    webhookUrl?: string,
  ): Promise<PixChargeResponse>;
  checkStatus(
    transactionId: string,
    credentials: AcquirerCredentials,
  ): Promise<StatusCheckResponse>;
  validateCredentials(credentials: AcquirerCredentials): Promise<boolean>;
}
