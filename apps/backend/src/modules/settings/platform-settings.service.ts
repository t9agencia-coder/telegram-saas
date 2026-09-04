import { Injectable, BadRequestException } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../../common/prisma.service';
import { encrypt, decrypt } from '../../common/utils/encryption';

// Singleton — sempre a mesma linha, nunca precisa de findFirst/race condition pra criar.
const PLATFORM_SETTINGS_ID = '00000000-0000-0000-0000-000000000002';

const VALID_TELEGRAM_DOMAINS = ['t.me', 'telegram.me'] as const;
type TelegramLinkDomain = (typeof VALID_TELEGRAM_DOMAINS)[number];

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Cache do domínio do Telegram — lido a cada clique de redirect (caminho
  // quente). É um singleton da plataforma que muda ~nunca; `t.me`/`telegram.me`
  // ambos funcionam, então 60s de defasagem no pior caso é inofensivo.
  private tgDomainCache: { value: string; at: number } | null = null;
  private static readonly TG_DOMAIN_TTL_MS = 60_000;

  async getSettings() {
    const cfg = await this.prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
    if (cfg) return cfg;
    // Só acontece se a migration (que já semeia a linha padrão) não tiver rodado ainda
    return this.prisma.platformSettings.upsert({
      where:  { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, telegramLinkDomain: 't.me', pixDefaultProductName: 'Produto 1' },
      update: {},
    });
  }

  async setTelegramLinkDomain(domain: string) {
    if (!VALID_TELEGRAM_DOMAINS.includes(domain as TelegramLinkDomain)) {
      throw new BadRequestException(`Domínio inválido. Use um de: ${VALID_TELEGRAM_DOMAINS.join(', ')}`);
    }
    const res = await this.prisma.platformSettings.upsert({
      where:  { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, telegramLinkDomain: domain },
      update: { telegramLinkDomain: domain },
    });
    this.tgDomainCache = { value: domain, at: Date.now() }; // mantém o cache fresco após troca manual
    return res;
  }

  // Usado pelo redirector pra montar o link final — nunca lança erro (fallback pro
  // padrão atual 't.me' se a leitura falhar por qualquer motivo). Cache de 60s
  // pra não bater no banco a cada clique.
  async getTelegramLinkDomain(): Promise<string> {
    const c = this.tgDomainCache;
    if (c && Date.now() - c.at < PlatformSettingsService.TG_DOMAIN_TTL_MS) return c.value;
    try {
      const cfg = await this.getSettings();
      const value = cfg.telegramLinkDomain || 't.me';
      this.tgDomainCache = { value, at: Date.now() };
      return value;
    } catch {
      return this.tgDomainCache?.value || 't.me';
    }
  }

  async setPixDefaultProductName(name: string) {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new BadRequestException('Nome não pode ser vazio');
    if (trimmed.length > 100) throw new BadRequestException('Nome muito longo (máximo 100 caracteres)');
    return this.prisma.platformSettings.upsert({
      where:  { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, pixDefaultProductName: trimmed },
      update: { pixDefaultProductName: trimmed },
    });
  }

  // Usado pelo pix.service.ts na criação de cobranças de valor livre (sem produto
  // de catálogo vinculado) — nunca lança erro (fallback pro padrão atual "Produto 1"
  // se a leitura falhar por qualquer motivo, igual o padrão já usado acima).
  async getPixDefaultProductName(): Promise<string> {
    try {
      const cfg = await this.getSettings();
      return cfg.pixDefaultProductName || 'Produto 1';
    } catch {
      return 'Produto 1';
    }
  }

  // Chave VAPID é por ambiente (identifica ESTE servidor pros serviços de push dos
  // navegadores), não por workspace — por isso vive aqui, não numa tabela por
  // workspace. Gerada sozinha no primeiro uso: zero passo manual de admin, e cada
  // ambiente (produção, staging, ou uma cópia inteira da plataforma como o XBot)
  // acaba com seu próprio par sem nenhuma configuração extra. A corrida entre duas
  // requisições simultâneas no exato primeiro acesso é inofensiva — o upsert final
  // sempre converge pra um único par salvo no banco.
  async getOrCreateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
    const cfg = await this.getSettings();
    if (cfg.vapidPublicKey && cfg.vapidPrivateKey) {
      return { publicKey: cfg.vapidPublicKey, privateKey: decrypt(cfg.vapidPrivateKey) };
    }

    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    await this.prisma.platformSettings.upsert({
      where:  { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, vapidPublicKey: publicKey, vapidPrivateKey: encrypt(privateKey) },
      update: { vapidPublicKey: publicKey, vapidPrivateKey: encrypt(privateKey) },
    });
    return { publicKey, privateKey };
  }
}
