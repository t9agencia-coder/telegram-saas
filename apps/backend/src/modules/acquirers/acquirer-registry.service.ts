import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { decrypt } from '../../common/utils/encryption';
import { IAcquirer, AcquirerCredentials, PixChargeResponse } from './acquirer.interface';
import { PodpayAcquirer } from './providers/podpay/podpay.acquirer';
import { BlackpayAcquirer } from './providers/blackpay/blackpay.acquirer';
import { PixzypayAcquirer } from './providers/pixzypay/pixzypay.acquirer';
import { NexusPagAcquirer } from './providers/nexuspag/nexuspag.acquirer';

@Injectable()
export class AcquirerRegistryService {
  private readonly logger = new Logger(AcquirerRegistryService.name);
  private readonly handlers = new Map<string, IAcquirer>();

  constructor(private readonly prisma: PrismaService) {
    // Registra todos os adquirentes conhecidos
    this.register(new PodpayAcquirer());
    this.register(new BlackpayAcquirer());
    this.register(new PixzypayAcquirer());
    this.register(new NexusPagAcquirer());
  }

  private register(acquirer: IAcquirer): void {
    this.handlers.set(acquirer.slug, acquirer);
  }

  getHandler(slug: string): IAcquirer | undefined {
    return this.handlers.get(slug);
  }

  getCredentials(acquirer: any): AcquirerCredentials {
    return {
      apiKey: decrypt(acquirer.apiKey),
      apiSecret: acquirer.apiSecret ? decrypt(acquirer.apiSecret) : undefined,
      environment: acquirer.environment || 'production',
      webhookSecret: acquirer.webhookSecret ? decrypt(acquirer.webhookSecret) : undefined,
    };
  }

  /**
   * Cria cobrança PIX com fallback automático entre adquirentes.
   * Tenta cada adquirente ativo (por prioridade) até um ter sucesso.
   */
  async createPixWithFallback(
    amount: number,
    customer: {
      name?: string;
      email?: string;
      document?: string;
      phone?: string;
      externalId?: string;
      productName?: string;
    },
    webhookUrl?: string,
  ): Promise<{ payment: PixChargeResponse; acquirerSlug: string }> {
    const acquirers = await this.prisma.acquirer.findMany({
      where: { isActive: true, credentialStatus: 'VALID' },
      orderBy: { priority: 'asc' },
    });

    if (acquirers.length === 0) {
      throw new Error('Nenhum adquirente ativo configurado com credenciais válidas');
    }

    const errors: string[] = [];

    for (const acquirerRecord of acquirers) {
      const handler = this.handlers.get(acquirerRecord.slug);

      if (!handler) {
        this.logger.warn(`Handler não encontrado para slug: ${acquirerRecord.slug}`);
        continue;
      }

      const credentials = this.getCredentials(acquirerRecord);

      try {
        this.logger.log(
          `Tentando adquirente: ${acquirerRecord.slug} (prioridade: ${acquirerRecord.priority})`,
        );
        const payment = await handler.createPix(amount, customer, credentials, webhookUrl);

        this.logger.log(`Cobrança criada com sucesso via ${acquirerRecord.slug}`);
        return { payment, acquirerSlug: acquirerRecord.slug };
      } catch (error) {
        const msg = `Adquirente ${acquirerRecord.slug} falhou: ${error.message}`;
        this.logger.error(msg);
        errors.push(msg);

        // Marca como instável se estava válido
        await this.prisma.acquirer.update({
          where: { id: acquirerRecord.id },
          data: { credentialStatus: 'UNSTABLE' },
        }).catch(() => {});
      }
    }

    throw new Error(`Todos os adquirentes falharam. Erros: ${errors.join('; ')}`);
  }
}
