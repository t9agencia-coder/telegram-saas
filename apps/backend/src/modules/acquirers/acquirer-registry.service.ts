import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { decrypt } from '../../common/utils/encryption';
import { IAcquirer, AcquirerCredentials, PixChargeResponse } from './acquirer.interface';
import { PodpayAcquirer } from './providers/podpay/podpay.acquirer';
import { PixzypayAcquirer } from './providers/pixzypay/pixzypay.acquirer';
import { NexusPagAcquirer } from './providers/nexuspag/nexuspag.acquirer';

@Injectable()
export class AcquirerRegistryService {
  private readonly logger = new Logger(AcquirerRegistryService.name);
  private readonly handlers = new Map<string, IAcquirer>();

  constructor(private readonly prisma: PrismaService) {
    this.register(new PodpayAcquirer());
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
   * Tenta VALID primeiro (por priority), depois UNSTABLE.
   * UNSTABLE que funcionar é promovido de volta para VALID automaticamente.
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
    // Inclui UNSTABLE: falha transitória não deve bloquear o provider para sempre.
    // VALID aparece antes de UNSTABLE; dentro de cada grupo, ordena por priority.
    const all = await this.prisma.acquirer.findMany({
      where: { isActive: true, credentialStatus: { in: ['VALID', 'UNSTABLE'] } },
      orderBy: { priority: 'asc' },
    });
    const acquirers = [
      ...all.filter(a => a.credentialStatus === 'VALID'),
      ...all.filter(a => a.credentialStatus === 'UNSTABLE'),
    ];

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
      const t0 = Date.now();

      try {
        this.logger.log(
          `PIX: tentando ${acquirerRecord.slug} [${acquirerRecord.credentialStatus}] prio=${acquirerRecord.priority}`,
        );
        const payment = await handler.createPix(amount, customer, credentials, webhookUrl);

        this.logger.log(`PIX: ✓ ${acquirerRecord.slug} em ${Date.now() - t0}ms`);

        // UNSTABLE que funcionou → promover para VALID (fire-and-forget)
        if (acquirerRecord.credentialStatus === 'UNSTABLE') {
          this.prisma.acquirer.update({
            where: { id: acquirerRecord.id },
            data: { credentialStatus: 'VALID' },
          }).catch(() => {});
        }

        return { payment, acquirerSlug: acquirerRecord.slug };
      } catch (error) {
        const msg = `${acquirerRecord.slug} falhou em ${Date.now() - t0}ms: ${error.message}`;
        this.logger.error(`PIX: ${msg}`);
        errors.push(msg);

        // Fire-and-forget: não bloqueia a tentativa do próximo provider
        this.prisma.acquirer.update({
          where: { id: acquirerRecord.id },
          data: { credentialStatus: 'UNSTABLE' },
        }).catch(() => {});
      }
    }

    throw new Error(`Todos os adquirentes falharam. Erros: ${errors.join('; ')}`);
  }
}
