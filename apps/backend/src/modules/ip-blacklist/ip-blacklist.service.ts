import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';

interface ClassifyResult {
  safe: boolean;
  reason?: string;
}

@Injectable()
export class IpBlacklistService {
  private readonly logger = new Logger(IpBlacklistService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Checado a cada clique em redirecionador (não a cada mensagem do
  // Telegram como o TelegramBlacklistService) — volume bem menor, então um
  // lookup indexado direto no Postgres (via @unique em `ip`) já é rápido o
  // suficiente, sem precisar de cache em Redis.
  async isBlocked(ip: string | undefined | null): Promise<boolean> {
    const value = (ip ?? '').trim();
    if (!value) return false;

    const found = await this.prisma.ipBlacklist.findUnique({
      where: { ip: value },
      select: { id: true },
    });
    return !!found;
  }

  // Mesma checagem de isBlocked(), mas também devolve qual Telegram ID
  // causou o bloqueio desse IP (quando veio do auto-vínculo) — usado pra
  // registrar isso no clique bloqueado (aba Filtro do admin).
  async checkBlocked(ip: string | undefined | null): Promise<{ blocked: boolean; telegramId: string | null }> {
    const value = (ip ?? '').trim();
    if (!value) return { blocked: false, telegramId: null };

    const found = await this.prisma.ipBlacklist.findUnique({
      where: { ip: value },
      select: { telegramId: true },
    });
    return { blocked: !!found, telegramId: found?.telegramId ?? null };
  }

  // IPv4 de operadora móvel (Vivo/Claro/TIM/Oi etc.) passa por CGNAT — o
  // mesmo IP público é compartilhado ao vivo por milhares de clientes não
  // relacionados. Bloquear esse IP não bloqueia "a pessoa", bloqueia um
  // pedaço da operadora inteira. IPv6, por outro lado, já é granular por
  // natureza (endereço praticamente exclusivo de uma casa/aparelho — sem
  // CGNAT), então não passa por essa checagem.
  //
  // ip-api.com (grátis, sem chave, só HTTP no plano free) retorna o campo
  // `mobile` — sinal confiável pra esse caso específico. Não existe um sinal
  // gratuito equivalente pra "provedor residencial que também usa CGNAT em
  // escala" (isso exigiria uma base de ASN paga) — então essa checagem cobre
  // o caso de maior risco (operadora móvel), não todo caso possível.
  // Falha ou resposta inconclusiva => não bloqueia (mais seguro pecar por
  // NÃO bloquear um IP do que bloquear uma operadora inteira por engano).
  private async classifyIp(ip: string): Promise<ClassifyResult> {
    if (ip.includes(':')) return { safe: true }; // IPv6 — já granular

    try {
      const { data } = await axios.get(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
        params: { fields: 'status,mobile,proxy,hosting' },
        timeout: 3000,
      });

      if (data?.status !== 'success') {
        return { safe: false, reason: 'Não foi possível confirmar o tipo de conexão desse IP' };
      }
      if (data.mobile) {
        return {
          safe: false,
          reason: 'IP de operadora de internet móvel — compartilhado (CGNAT) por muitos clientes não relacionados',
        };
      }
      return { safe: true };
    } catch (e: any) {
      this.logger.warn(`Falha ao classificar IP ${ip}, bloqueio pulado por segurança: ${e.message}`);
      return { safe: false, reason: 'Falha ao consultar classificação do IP' };
    }
  }

  async block(ip: string, reason?: string, createdBy?: string, telegramId?: string) {
    const value = ip.trim();
    if (!value) throw new Error('IP inválido');

    const classification = await this.classifyIp(value);
    if (!classification.safe) {
      return { entry: null, alreadyBlocked: false, skipped: classification.reason };
    }

    try {
      const entry = await this.prisma.ipBlacklist.create({
        data: { ip: value, reason: reason?.trim() || undefined, createdBy, telegramId },
      });
      return { entry, alreadyBlocked: false, skipped: undefined as string | undefined };
    } catch (e: any) {
      // P2002 = já bloqueado — idempotente, não duplica nem gera erro.
      if (e.code === 'P2002') {
        const entry = await this.prisma.ipBlacklist.findUniqueOrThrow({ where: { ip: value } });
        return { entry, alreadyBlocked: true, skipped: undefined as string | undefined };
      }
      throw e;
    }
  }

  async unblock(ip: string): Promise<boolean> {
    const deleted = await this.prisma.ipBlacklist.deleteMany({ where: { ip: ip.trim() } });
    return deleted.count > 0;
  }

  async list(page = 1, limit = 20, search?: string) {
    const where = search?.trim() ? { ip: { contains: search.trim() } } : {};
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.ipBlacklist.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.ipBlacklist.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}
