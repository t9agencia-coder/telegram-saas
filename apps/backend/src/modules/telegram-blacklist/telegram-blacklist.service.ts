import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { IpBlacklistService } from '../ip-blacklist/ip-blacklist.service';

const SET_KEY      = 'telegram:blacklist:set';
const HYDRATED_KEY = 'telegram:blacklist:hydrated';

// Telegram user IDs são sempre inteiros positivos — nunca username (que
// pode mudar). Validar o formato aqui evita depender de dado digitado
// à mão no admin (ex: colar "@fulano" por engano) e é defesa a mais além
// da validação do DTO na borda HTTP.
const TELEGRAM_ID_RE = /^\d+$/;

@Injectable()
export class TelegramBlacklistService {
  private readonly logger = new Logger(TelegramBlacklistService.name);

  // Evita "thundering herd": se várias mensagens chegarem ao mesmo tempo
  // logo após o boot (cache ainda não hidratado), só a primeira dispara a
  // leitura no Postgres — as demais aguardam a mesma promise em vez de
  // cada uma bater no banco.
  private hydrating: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis:  RedisService,
    private readonly ipBlacklist: IpBlacklistService,
  ) {}

  // ── Checagem no hot path (uma vez por mensagem/callback do Telegram) ──────
  // Depois da primeira hidratação, isso é um SISMEMBER puro — sem ida ao
  // Postgres a cada interação.
  async isBlocked(telegramId: string | number | undefined | null): Promise<boolean> {
    const id = String(telegramId ?? '').trim();
    if (!id) return false;

    await this.ensureHydrated();
    const result = await this.redis.sismember(SET_KEY, id);
    return result === 1;
  }

  // Checagem em lote — usada pra enriquecer listas (ex: aba Atividades) com
  // "esse lead já está bloqueado?" sem fazer N chamadas separadas. Mesmo
  // cache Redis do isBlocked(), só que num pipeline só.
  async isBlockedBulk(telegramIds: Array<string | undefined | null>): Promise<Set<string>> {
    const ids = [...new Set(telegramIds.filter((id): id is string => !!id))];
    if (!ids.length) return new Set();

    await this.ensureHydrated();
    const pipeline = this.redis.pipeline();
    ids.forEach(id => pipeline.sismember(SET_KEY, id));
    const results = await pipeline.exec();

    const blocked = new Set<string>();
    results?.forEach((entry, idx) => {
      const [err, val] = entry ?? [];
      if (!err && val === 1) blocked.add(ids[idx]);
    });
    return blocked;
  }

  private async ensureHydrated(): Promise<void> {
    const marker = await this.redis.get(HYDRATED_KEY);
    if (marker) return;

    if (!this.hydrating) {
      this.hydrating = this.hydrate().finally(() => { this.hydrating = null; });
    }
    await this.hydrating;
  }

  private async hydrate(): Promise<void> {
    const rows = await this.prisma.telegramBlacklist.findMany({ select: { telegramId: true } });
    const pipeline = this.redis.pipeline();
    pipeline.del(SET_KEY);
    if (rows.length) pipeline.sadd(SET_KEY, ...rows.map(r => r.telegramId));
    pipeline.set(HYDRATED_KEY, '1');
    await pipeline.exec();
    this.logger.log(`Cache de blacklist hidratado (${rows.length} usuários)`);
  }

  // ── Escrita (ação rara de admin) ────────────────────────────────────────

  async block(telegramId: string, reason?: string, createdBy?: string) {
    const id = telegramId.trim();
    if (!TELEGRAM_ID_RE.test(id)) {
      throw new Error('telegramId inválido — deve ser o ID numérico do Telegram, não o username');
    }

    let result: { entry: any; alreadyBlocked: boolean };
    try {
      const entry = await this.prisma.telegramBlacklist.create({
        data: { telegramId: id, reason: reason?.trim() || undefined, createdBy },
      });
      await this.redis.sadd(SET_KEY, id);
      // Garante que o marker exista mesmo se esse for o primeiríssimo bloqueio
      // (hidratação nunca rodou ainda porque a tabela estava vazia).
      await this.redis.set(HYDRATED_KEY, '1');
      result = { entry, alreadyBlocked: false };
    } catch (e: any) {
      // P2002 = violação de constraint única (telegramId já bloqueado).
      // Idempotente: não é erro, retorna o registro existente sem duplicar.
      if (e.code === 'P2002') {
        const entry = await this.prisma.telegramBlacklist.findUniqueOrThrow({ where: { telegramId: id } });
        await this.redis.sadd(SET_KEY, id); // realinha o cache se por algum motivo estivesse fora de sync
        result = { entry, alreadyBlocked: true };
      } else {
        throw e;
      }
    }

    // Auto-vínculo: busca em UserTracking (capturado no clique do
    // Redirecionador, ver comentário no schema) os IPs que esse telegramId
    // já usou, e bloqueia também — camada complementar que só pega tráfego
    // via redirecionador (Telegram não revela IP no webhook). Roda sempre,
    // mesmo se já estava bloqueado antes, pra pegar tracking novo desde o
    // último bloqueio. Falha aqui nunca derruba o bloqueio do Telegram ID.
    // IPs de operadora móvel (CGNAT) são pulados automaticamente dentro de
    // IpBlacklistService.block() — ver skippedIps.
    const { linked: linkedIps, skipped: skippedIps } = await this.linkKnownIps(id, createdBy).catch((err: any) => {
      this.logger.warn(`Falha ao vincular IPs conhecidos do telegramId=${id}: ${err.message}`);
      return { linked: [] as string[], skipped: [] as string[] };
    });

    return { ...result, linkedIps, skippedIps };
  }

  private async linkKnownIps(telegramId: string, createdBy?: string): Promise<{ linked: string[]; skipped: string[] }> {
    const rows = await this.prisma.userTracking.findMany({
      where: { chatId: telegramId, ip: { not: null } },
      select: { ip: true },
      distinct: ['ip'],
    });

    const linked: string[] = [];
    const skipped: string[] = [];
    for (const row of rows) {
      if (!row.ip) continue;
      const result = await this.ipBlacklist.block(
        row.ip,
        `Auto-vinculado ao bloqueio do Telegram ID ${telegramId}`,
        createdBy,
        telegramId,
      );
      if (result.skipped) {
        skipped.push(row.ip);
      } else if (!result.alreadyBlocked) {
        linked.push(row.ip);
      }
    }
    return { linked, skipped };
  }

  async unblock(telegramId: string): Promise<boolean> {
    const id = telegramId.trim();
    const deleted = await this.prisma.telegramBlacklist.deleteMany({ where: { telegramId: id } });
    await this.redis.srem(SET_KEY, id);
    return deleted.count > 0;
  }

  async list(page = 1, limit = 20, search?: string) {
    const where = search?.trim()
      ? { telegramId: { contains: search.trim() } }
      : {};
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.telegramBlacklist.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.telegramBlacklist.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}
