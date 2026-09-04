import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { FacebookCapiService } from '../facebook-capi/facebook-capi.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { KwaiAdsService } from '../kwai-ads/kwai-ads.service';
import { IpBlacklistService } from '../ip-blacklist/ip-blacklist.service';
import {
  CreateRedirectorDto,
  UpdateRedirectorDto,
  ResolveRedirectorDto,
} from './dto/create-redirector.dto';

const prismaAny = (p: PrismaService) => p as any;

@Injectable()
export class RedirectorsService {
  private readonly logger = new Logger(RedirectorsService.name);

  // Cache do redirector por slug (só no caminho do resolve). O cliente tem um
  // punhado de slugs ativos; 15s de defasagem ao editar/desativar é aceitável.
  // Com cache hit o resolve não lê o Postgres — imune a carga do banco.
  private readonly slugCache = new Map<string, { at: number; row: any }>();
  private static readonly SLUG_TTL_MS = 15_000;

  constructor(
    private prisma: PrismaService,
    private facebookCapi: FacebookCapiService,
    private platformSettings: PlatformSettingsService,
    private kwaiAds: KwaiAdsService,
    private ipBlacklist: IpBlacklistService,
  ) {}

  // Domínio só pode ser usado se for global (sem dono) ou pertencer a esse
  // mesmo workspace — evita um workspace usar o domínio próprio de outro.
  private async assertDomainUsable(workspaceId: string, domainId: string) {
    const d = await prismaAny(this.prisma).domain.findUnique({ where: { id: domainId } });
    if (!d) throw new NotFoundException('Domínio não encontrado');
    if (d.workspaceId && d.workspaceId !== workspaceId) {
      throw new BadRequestException('Esse domínio pertence a outra conta');
    }
  }

  async create(workspaceId: string, dto: CreateRedirectorDto) {
    if (dto.domainId) await this.assertDomainUsable(workspaceId, dto.domainId);
    const slug = randomBytes(4).toString('hex');
    const verificationCode = this.generateVerificationCode();
    return prismaAny(this.prisma).redirector.create({
      data: {
        workspaceId,
        name: dto.name,
        slug,
        verificationCode,
        flowId:        dto.flowId   || null,
        domainId:      dto.domainId || null,
        alternativeUrl: dto.alternativeUrl,
        destinationType: dto.destinationType || 'telegram',
        externalUrl:     dto.externalUrl || null,
        rules: dto.rules || {},
      },
      include: { flow: { include: { bot: true } }, domain: true },
    });
  }

  private generateVerificationCode(): string {
    return String(Math.floor(10000 + Math.random() * 90000));
  }

  async findAll(workspaceId: string) {
    const [rows, counts] = await Promise.all([
      prismaAny(this.prisma).redirector.findMany({
        where:   { workspaceId },
        include: { flow: { include: { bot: true } }, domain: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.clickCounts({ redirector: { workspaceId } }),
    ]);
    const zero = { totalClicks: 0, telegramClicks: 0, alternativeClicks: 0 };
    return rows.map((r: any) => ({ ...r, ...(counts.get(r.id) ?? zero) }));
  }

  async findOne(workspaceId: string, id: string) {
    const r = await prismaAny(this.prisma).redirector.findFirst({
      where: { id, workspaceId },
      include: {
        flow:   { include: { bot: true } },
        domain: true,
        clicks: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!r) throw new NotFoundException('Redirector not found');
    const counts = await this.clickCounts({ redirectorId: id });
    return { ...r, ...(counts.get(id) ?? { totalClicks: 0, telegramClicks: 0, alternativeClicks: 0 }) };
  }

  async update(workspaceId: string, id: string, dto: UpdateRedirectorDto) {
    const existing = await prismaAny(this.prisma).redirector.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Redirector not found');
    if (dto.domainId) await this.assertDomainUsable(workspaceId, dto.domainId);
    const updated = await prismaAny(this.prisma).redirector.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.flowId !== undefined && {
          flow: dto.flowId ? { connect: { id: dto.flowId } } : { disconnect: true },
        }),
        ...(dto.domainId !== undefined && {
          domain: dto.domainId ? { connect: { id: dto.domainId } } : { disconnect: true },
        }),
        ...(dto.alternativeUrl !== undefined && { alternativeUrl: dto.alternativeUrl }),
        ...(dto.destinationType !== undefined && { destinationType: dto.destinationType }),
        ...(dto.externalUrl !== undefined && { externalUrl: dto.externalUrl || null }),
        ...(dto.rules !== undefined && { rules: dto.rules }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { flow: { include: { bot: true } }, domain: true },
    });
    // contadores ao vivo (o front faz merge do retorno na linha existente)
    const counts = await this.clickCounts({ redirectorId: id });
    return { ...updated, ...(counts.get(id) ?? { totalClicks: 0, telegramClicks: 0, alternativeClicks: 0 }) };
  }

  async remove(workspaceId: string, id: string) {
    const existing = await prismaAny(this.prisma).redirector.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Redirector not found');
    return prismaAny(this.prisma).redirector.delete({ where: { id } });
  }

  /**
   * Carrega o redirector do resolve — `select` enxuto (NÃO traz flow.nodes/edges/
   * config nem campos do bot que não usamos; o `include` puxava a linha inteira
   * do Flow, que tem JSON grande) + cache de 15s por slug.
   */
  private async loadRedirector(slug: string): Promise<any> {
    const now = Date.now();
    const hit = this.slugCache.get(slug);
    if (hit && now - hit.at < RedirectorsService.SLUG_TTL_MS) return hit.row;

    const row = await prismaAny(this.prisma).redirector.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        isActive: true,
        alternativeUrl: true,
        rules: true,
        verificationCode: true,
        workspaceId: true,
        destinationType: true,
        externalUrl: true,
        flow: { select: { bot: { select: { id: true, username: true } } } },
      },
    });
    if (row) {
      if (this.slugCache.size >= 500) this.slugCache.clear();
      this.slugCache.set(slug, { at: now, row });
    }
    return row;
  }

  async resolve(slug: string, ctx: ResolveRedirectorDto) {
    // redirector (com cache) + checagem de IP em paralelo — são independentes.
    const [redirector, blockCheck] = await Promise.all([
      this.loadRedirector(slug),
      this.ipBlacklist.checkBlocked(ctx.ip),
    ]);

    if (!redirector || !redirector.isActive) {
      return { url: redirector?.alternativeUrl || '/', deviceFilter: 'all' };
    }

    // IP bloqueado (camada complementar à blacklist por Telegram ID — único
    // ponto do sistema que vê o IP real do visitante, antes de gerar o
    // deep link do Telegram). Pro visitante, trata igual a um redirecionador
    // inativo: cai no alternativeUrl, sem revelar que o IP está banido. Mas
    // registra o clique bloqueado (aba Filtro do admin) — diferente dos
    // outros destinos, não passa por logClick() porque não deve contar em
    // totalClicks/alternativeClicks (métricas de conversão existentes).
    if (blockCheck.blocked) {
      this.logBlockedClick(redirector.id, ctx, blockCheck.telegramId).catch(() => {});
      return { url: redirector.alternativeUrl || '/', deviceFilter: 'all' };
    }

    const rules = (redirector.rules as any) || {};
    const devices: string[] = rules.devices || [];
    const deviceFilter: string = (rules.deviceFilter as string) ||
      (devices.includes('mobile') && !devices.includes('desktop') ? 'mobile_only' : 'all');

    const matched = this.evaluateRules(rules, ctx, redirector.verificationCode);

    let destination: 'telegram' | 'external' | 'alternative';
    let url: string;

    // Usado pelo Facebook CAPI nos dois ramos de destino "casou" (Telegram e externo).
    // sourceUrl também é persistida em UserTracking (via saveTracking) pra ser
    // reaproveitada como event_source_url do AddToCart/Purchase, que disparam
    // bem depois, sem contexto de página disponível.
    const appBase = (process.env.FRONTEND_URL || 'https://app.firebot.shop')
      .replace('http://localhost:3000', 'https://app.firebot.shop');
    const sourceUrl = `${appBase}/r/${redirector.slug}`;

    if (matched && redirector.destinationType === 'external' && redirector.externalUrl) {
      destination = 'external';

      this.saveTracking(ctx, sourceUrl).catch(() => {});

      // Mesmo append de UTM que o ramo Telegram já faz, só que direto na
      // querystring do link externo — sem trackingId embutido (não há bot
      // pra resolver o lead depois, então não faz sentido montar rt_/rf_).
      const utmParams = new URLSearchParams();
      if (ctx.utmSource)   utmParams.set('utm_source',   ctx.utmSource);
      if (ctx.utmMedium)   utmParams.set('utm_medium',   ctx.utmMedium);
      if (ctx.utmCampaign) utmParams.set('utm_campaign', ctx.utmCampaign);
      if (ctx.utmContent)  utmParams.set('utm_content',  ctx.utmContent);
      if (ctx.utmTerm)     utmParams.set('utm_term',     ctx.utmTerm);
      const utmStr = utmParams.toString();

      const sep = redirector.externalUrl.includes('?') ? '&' : '?';
      url = utmStr ? `${redirector.externalUrl}${sep}${utmStr}` : redirector.externalUrl;

      // Mesmos disparos de tracking que o ramo Telegram já faz — só sem botId,
      // já que aqui não há bot/fluxo envolvido. Enfileirado (worker) pra não
      // pesar o event loop do backend a ~100 resolves/min.
      this.facebookCapi.enqueuePageView(redirector.workspaceId, {
        ip:          ctx.ip,
        userAgent:   ctx.ua,
        fbp:         ctx.fbp,
        fbc:         ctx.fbc,
        sourceUrl,
        utmSource:   ctx.utmSource,
        utmMedium:   ctx.utmMedium,
        utmCampaign: ctx.utmCampaign,
        utmContent:  ctx.utmContent,
        utmTerm:     ctx.utmTerm,
      });

      this.kwaiAds.handleContentView(redirector.workspaceId, {
        kwaiId:      ctx.kwaiId,
        utmCampaign: ctx.utmCampaign,
        utmMedium:   ctx.utmMedium,
      }).catch(() => {});
    } else if (matched && redirector.flow?.bot?.username) {
      destination = 'telegram';

      // trackingId gerado no app → o link sai na hora; o INSERT do UserTracking
      // vai em segundo plano (o /start só resolve esse id segundos depois, quando
      // o visitante abre o Telegram — o INSERT já commitou muito antes). Se o
      // INSERT falhar, o /start trata o id inexistente igual ao caso de hoje
      // (perde só a atribuição de UTM daquele lead, o bot funciona).
      const trackingId = randomUUID();
      this.saveTracking(ctx, sourceUrl, trackingId).catch(() => {});
      const telegramDomain = await this.platformSettings.getTelegramLinkDomain();
      const startParam = `rt_${Buffer.from(`${redirector.slug}:${trackingId}`).toString('base64url')}`;

      const utmParams = new URLSearchParams();
      if (ctx.utmSource)   utmParams.set('utm_source',   ctx.utmSource);
      if (ctx.utmMedium)   utmParams.set('utm_medium',   ctx.utmMedium);
      if (ctx.utmCampaign) utmParams.set('utm_campaign', ctx.utmCampaign);
      if (ctx.utmContent)  utmParams.set('utm_content',  ctx.utmContent);
      if (ctx.utmTerm)     utmParams.set('utm_term',     ctx.utmTerm);
      const utmStr = utmParams.toString();

      const base = `https://${telegramDomain}/${redirector.flow.bot.username}?start=${startParam}`;
      url = utmStr ? `${base}&${utmStr}` : base;

      // Facebook CAPI — enfileirado (worker), nunca bloqueia o redirect
      this.facebookCapi.enqueuePageView(redirector.workspaceId, {
        ip:          ctx.ip,
        userAgent:   ctx.ua,
        fbp:         ctx.fbp,
        fbc:         ctx.fbc,
        sourceUrl,
        botId:       redirector.flow?.bot?.id,
        utmSource:   ctx.utmSource,
        utmMedium:   ctx.utmMedium,
        utmCampaign: ctx.utmCampaign,
        utmContent:  ctx.utmContent,
        utmTerm:     ctx.utmTerm,
      });

      // Kwai AdsNebula — fire-and-forget, nunca bloqueia o redirect
      this.kwaiAds.handleContentView(redirector.workspaceId, {
        kwaiId:      ctx.kwaiId,
        botId:       redirector.flow?.bot?.id,
        utmCampaign: ctx.utmCampaign,
        utmMedium:   ctx.utmMedium,
      }).catch(() => {});
    } else {
      destination = 'alternative';
      url = redirector.alternativeUrl || '/';
      this.saveTracking(ctx, sourceUrl).catch(() => {});
    }

    this.logClick(redirector.id, destination, ctx).catch(() => {});

    return { url, deviceFilter, alternativeUrl: redirector.alternativeUrl };
  }

  private async saveTracking(ctx: ResolveRedirectorDto, sourceUrl?: string, id?: string): Promise<string | null> {
    try {
      const platform = ctx.fbclid ? 'facebook'
        : ctx.ttclid ? 'tiktok'
        : ctx.kwaiId ? 'kwai'
        : ctx.utmSource || 'organic';

      const record = await prismaAny(this.prisma).userTracking.create({
        data: {
          ...(id ? { id } : {}),
          platform,
          utmSource:   ctx.utmSource   || null,
          utmMedium:   ctx.utmMedium   || null,
          utmCampaign: ctx.utmCampaign || null,
          utmContent:  ctx.utmContent  || null,
          utmTerm:     ctx.utmTerm     || null,
          fbclid:      ctx.fbclid      || null,
          fbp:         ctx.fbp         || null,
          fbc:         ctx.fbc         || null,
          ttclid:      ctx.ttclid      || null,
          ttp:         ctx.ttp         || null,
          kwaiId:      ctx.kwaiId      || null,
          kwaiPixel:   ctx.kwaiPixel   || null,
          ip:          ctx.ip          || null,
          userAgent:   ctx.ua          || null,
          sourceUrl:   sourceUrl       || null,
        },
      });
      return record.id as string;
    } catch {
      return null;
    }
  }

  private async logClick(
    redirectorId: string,
    destination: string,
    ctx: ResolveRedirectorDto,
  ) {
    const device = this.parseDevice(ctx.ua);
    const os = this.parseOS(ctx.ua);
    const language = this.parseLanguage(ctx.acceptLanguage);
    const source = ctx.fbclid ? 'facebook' : ctx.kwaiId ? 'kwai' : null;

    // Só o INSERT do clique. Os contadores totalClicks/telegramClicks/
    // alternativeClicks NÃO são mais incrementados aqui (era um UPDATE na mesma
    // linha do Redirector a cada clique → row lock serializava sob carga alta) —
    // agora são calculados na leitura (findAll/findOne) por COUNT(RedirectorClick).
    await prismaAny(this.prisma).redirectorClick.create({
      data: {
        redirectorId, destination, source, device, os, language, ip: ctx.ip || null,
        utmSource:   ctx.utmSource   || null,
        utmMedium:   ctx.utmMedium   || null,
        utmCampaign: ctx.utmCampaign || null,
        utmContent:  ctx.utmContent  || null,
        utmTerm:     ctx.utmTerm     || null,
        fbclid:      ctx.fbclid      || null,
        ttclid:      ctx.ttclid      || null,
        kwaiId:      ctx.kwaiId      || null,
        referer:       ctx.referer?.slice(0, 500) || null,
        trafficSource: this.classifyTrafficSource(ctx),
      },
    });
  }

  /**
   * Contadores de clique por redirector, calculados de RedirectorClick.
   * `total` = telegram + external + alternative (exclui 'blocked', igual ao
   * comportamento antigo do contador denormalizado). Devolve um Map por id.
   */
  private async clickCounts(where: any): Promise<Map<string, { totalClicks: number; telegramClicks: number; alternativeClicks: number }>> {
    const rows: Array<{ redirectorId: string; destination: string; _count: { _all: number } }> =
      await prismaAny(this.prisma).redirectorClick.groupBy({
        by: ['redirectorId', 'destination'],
        where,
        _count: { _all: true },
      });
    const m = new Map<string, { totalClicks: number; telegramClicks: number; alternativeClicks: number }>();
    for (const r of rows) {
      const e = m.get(r.redirectorId) ?? { totalClicks: 0, telegramClicks: 0, alternativeClicks: 0 };
      const n = r._count._all;
      if (r.destination === 'telegram' || r.destination === 'external') { e.telegramClicks += n; e.totalClicks += n; }
      else if (r.destination === 'alternative') { e.alternativeClicks += n; e.totalClicks += n; }
      // 'blocked' e qualquer outro não contam
      m.set(r.redirectorId, e);
    }
    return m;
  }

  // Clique barrado pela blacklist de IP — registrado à parte de logClick()
  // porque não deve contar em totalClicks/alternativeClicks (métricas de
  // conversão já existentes, que representam tentativa real de acesso, não
  // bloqueio do próprio sistema). blockedTelegramId é o Telegram ID que
  // causou o bloqueio desse IP (auto-vínculo), quando existir.
  private async logBlockedClick(
    redirectorId: string,
    ctx: ResolveRedirectorDto,
    blockedTelegramId: string | null,
  ): Promise<void> {
    await prismaAny(this.prisma).redirectorClick.create({
      data: {
        redirectorId,
        destination: 'blocked',
        source:   ctx.fbclid ? 'facebook' : ctx.kwaiId ? 'kwai' : null,
        device:   this.parseDevice(ctx.ua),
        os:       this.parseOS(ctx.ua),
        language: this.parseLanguage(ctx.acceptLanguage),
        ip: ctx.ip || null,
        utmSource:   ctx.utmSource   || null,
        utmMedium:   ctx.utmMedium   || null,
        utmCampaign: ctx.utmCampaign || null,
        utmContent:  ctx.utmContent  || null,
        utmTerm:     ctx.utmTerm     || null,
        fbclid:      ctx.fbclid      || null,
        ttclid:      ctx.ttclid      || null,
        kwaiId:      ctx.kwaiId      || null,
        referer:       ctx.referer?.slice(0, 500) || null,
        trafficSource: this.classifyTrafficSource(ctx),
        blockedTelegramId,
      },
    });
  }

  // Classifica de onde veio o clique — informação complementar pra aba
  // Filtro do admin. Prioriza sinais explícitos (click id/utm_source, que o
  // próprio anunciante/link já marca) sobre o Referer (que é opcional,
  // inconsistente entre apps e às vezes ausente mesmo vindo de rede social).
  private classifyTrafficSource(ctx: ResolveRedirectorDto): string {
    if (ctx.fbclid) return 'Facebook/Instagram';
    if (ctx.ttclid) return 'TikTok';
    if (ctx.kwaiId) return 'Kwai';

    const src = (ctx.utmSource || '').trim().toLowerCase();
    if (src) {
      if (['fb', 'facebook'].includes(src))        return 'Facebook';
      if (['ig', 'instagram'].includes(src))       return 'Instagram';
      if (['whatsapp', 'wpp', 'wa'].includes(src)) return 'WhatsApp';
      if (['tiktok', 'tt'].includes(src))          return 'TikTok';
      if (src === 'kwai')                          return 'Kwai';
      if (['google', 'adwords', 'gads'].includes(src)) return 'Google';
      if (src === 'organic')                       return 'Direto';
      return ctx.utmSource!.trim(); // valor cru desconhecido é mais útil que um genérico
    }

    const ref = (ctx.referer || '').trim().toLowerCase();
    if (!ref) return 'Direto';
    if (ref.includes('whatsapp') || ref.includes('wa.me'))        return 'WhatsApp';
    if (ref.includes('facebook.com') || ref.includes('fb.com'))   return 'Facebook';
    if (ref.includes('instagram.com'))                            return 'Instagram';
    if (ref.includes('tiktok.com'))                               return 'TikTok';
    if (ref.includes('t.co') || ref.includes('twitter.com') || ref.includes('x.com')) return 'Twitter/X';
    if (ref.includes('youtube.com') || ref.includes('youtu.be'))  return 'YouTube';
    if (ref.includes('google.'))                                  return 'Google';
    if (ref.includes('t.me') || ref.includes('telegram.org'))     return 'Telegram';

    try {
      const host = new URL(ctx.referer!).hostname.replace(/^www\./, '');
      return host || 'Rede social';
    } catch {
      return 'Rede social';
    }
  }

  private evaluateRules(rules: any, ctx: ResolveRedirectorDto, verificationCode: string): boolean {
    // Camada extra: código de 5 dígitos por link, exigido em ?app= — checado
    // ANTES de qualquer outra regra (falha rápida) e em conjunto (E lógico)
    // com a verificação por plataforma logo abaixo.
    if (rules.verificationCodeEnabled) {
      if (!ctx.verificationCode || ctx.verificationCode !== verificationCode) return false;
    }

    const sources = rules.sources || {};
    const activeSources = Object.entries(sources)
      .filter(([, enabled]) => enabled)
      .map(([src]) => src);

    if (activeSources.length > 0) {
      const matchesSrc = activeSources.some((src) => {
        if (src === 'facebook') return !!ctx.fbclid;
        if (src === 'kwai')    return !!ctx.kwaiId;
        return false;
      });
      if (!matchesSrc) return false;
    }

    const devices: string[] = rules.devices || [];
    if (devices.length > 0) {
      if (!devices.includes(this.parseDevice(ctx.ua))) return false;
    }

    const os: string[] = rules.os || [];
    if (os.length > 0) {
      if (!os.includes(this.parseOS(ctx.ua))) return false;
    }

    const schedule = rules.schedule;
    if (schedule?.enabled && schedule.start && schedule.end) {
      const now = new Date();
      const [sh, sm] = schedule.start.split(':').map(Number);
      const [eh, em] = schedule.end.split(':').map(Number);
      const cur = now.getHours() * 60 + now.getMinutes();
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      if (cur < start || cur > end) return false;
    }

    return true;
  }

  private parseDevice(ua: string): 'mobile' | 'desktop' {
    return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
      ? 'mobile'
      : 'desktop';
  }

  private parseOS(ua: string): string {
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Windows/i.test(ua)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
    return 'other';
  }

  private parseLanguage(acceptLanguage: string): string | null {
    if (!acceptLanguage) return null;
    return acceptLanguage.split(',')[0].split(';')[0].trim() || null;
  }
}
