import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

// Singleton — sempre a mesma linha, nunca precisa de findFirst/race condition pra criar.
const PLATFORM_SETTINGS_ID = '00000000-0000-0000-0000-000000000002';

const VALID_TELEGRAM_DOMAINS = ['t.me', 'telegram.me'] as const;
type TelegramLinkDomain = (typeof VALID_TELEGRAM_DOMAINS)[number];

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const cfg = await this.prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
    if (cfg) return cfg;
    // Só acontece se a migration (que já semeia a linha padrão) não tiver rodado ainda
    return this.prisma.platformSettings.upsert({
      where:  { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, telegramLinkDomain: 't.me' },
      update: {},
    });
  }

  async setTelegramLinkDomain(domain: string) {
    if (!VALID_TELEGRAM_DOMAINS.includes(domain as TelegramLinkDomain)) {
      throw new BadRequestException(`Domínio inválido. Use um de: ${VALID_TELEGRAM_DOMAINS.join(', ')}`);
    }
    return this.prisma.platformSettings.upsert({
      where:  { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, telegramLinkDomain: domain },
      update: { telegramLinkDomain: domain },
    });
  }

  // Usado pelo redirector pra montar o link final — nunca lança erro (fallback pro
  // padrão atual 't.me' se a leitura falhar por qualquer motivo).
  async getTelegramLinkDomain(): Promise<string> {
    try {
      const cfg = await this.getSettings();
      return cfg.telegramLinkDomain || 't.me';
    } catch {
      return 't.me';
    }
  }
}
