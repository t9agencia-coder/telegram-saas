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

import { localizarIp, baseGeoDisponivel } from '../../common/geo-ip';

const prismaAny = (p: PrismaService) => p as any;

// Valor fixo do botão "Testar" do painel (fbclid=8878 / click_id=8878). O
// clique de teste passa pelas regras igual a um real, mas não dispara evento
// pro Kwai nem conta como pessoa no desligamento automático da revisão.
const TEST_CLICK_ID = '8878';

// Macro do Kwai que chegou sem substituir (__CALLBACK__, __CMPNID__, __ADID__…):
// é prévia do gerenciador ou o robô de revisão — o anúncio real sempre troca.
const KWAI_MACRO = /^__[A-Z0-9_]+__$/i;
const ehMacroKwai = (v?: string) => !!v && KWAI_MACRO.test(v.trim());

// Faixa da JOYO Technology (Singapura, grupo Kuaishou/Kwai): de onde sai o
// robô de revisão dos anúncios (navegador "Java/17…").
const ipDoKwai = (ip?: string) => !!ip && /^103\.167\.(26|27)\./.test(ip);

// Mesmo click id vindo de tantos IPs diferentes = equipe de revisão (um
// clique de anúncio real gera um click id por pessoa).
const REVISAO_IPS_MESMO_CLICK = 3;

// Chave da lista de revisores: IPv4 inteiro; IPv6 só o prefixo /64 (a
// operadora troca o final do endereço sozinha, o começo é a "casa" da pessoa).
function chaveIp(ip?: string | null): string | null {
  if (!ip) return null;
  let v = ip.trim().toLowerCase();
  if (v.startsWith('::ffff:')) v = v.slice(7);
  if (!v.includes(':')) return /^\d{1,3}(\.\d{1,3}){3}$/.test(v) ? v : null;
  const [ini, fim = ''] = v.split('::');
  const a = ini ? ini.split(':') : [];
  const b = v.includes('::') && fim ? fim.split(':') : [];
  const grupos = v.includes('::')
    ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b]
    : a;
  if (grupos.length !== 8) return null;
  return grupos.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

@Injectable()
export class RedirectorsService {
  private readonly logger = new Logger(RedirectorsService.name);

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

  /**
   * Carimba (ou limpa) o instante em que a revisão foi ligada.
   *
   * Esse instante é o marco zero da contagem que decide o desligamento
   * automático, então quem manda nele é o servidor, nunca o painel. E ele
   * sobrevive a uma edição do link: sem isso, mexer em qualquer campo com a
   * revisão ligada zeraria a contagem e o link ficaria preso na alternativa.
   */
  private carimbarRevisao(novas: any, antigas?: any) {
    if (!novas) return novas;
    const r = { ...novas };
    if (r.reviewMode) {
      r.reviewStartedAt = antigas?.reviewMode
        ? antigas.reviewStartedAt || new Date().toISOString()
        : new Date().toISOString();
    } else {
      delete r.reviewStartedAt;
    }
    return r;
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
        rules: this.carimbarRevisao(dto.rules || {}),
      },
      include: { flow: { include: { bot: true } }, domain: true },
    });
  }

  private generateVerificationCode(): string {
    return String(Math.floor(10000 + Math.random() * 90000));
  }

  async findAll(workspaceId: string) {
    return prismaAny(this.prisma).redirector.findMany({
      where:   { workspaceId },
      include: { flow: { include: { bot: true } }, domain: true },
      orderBy: { createdAt: 'desc' },
    });
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
    return r;
  }

  async update(workspaceId: string, id: string, dto: UpdateRedirectorDto) {
    const existing = await prismaAny(this.prisma).redirector.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Redirector not found');
    if (dto.domainId) await this.assertDomainUsable(workspaceId, dto.domainId);
    return prismaAny(this.prisma).redirector.update({
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
        ...(dto.rules !== undefined && {
          rules: this.carimbarRevisao(dto.rules, existing.rules as any),
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { flow: { include: { bot: true } }, domain: true },
    });
  }

  async remove(workspaceId: string, id: string) {
    const existing = await prismaAny(this.prisma).redirector.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Redirector not found');
    return prismaAny(this.prisma).redirector.delete({ where: { id } });
  }

  async resolve(slug: string, ctx: ResolveRedirectorDto) {
    const redirector = await prismaAny(this.prisma).redirector.findUnique({
      where: { slug },
      include: { flow: { include: { bot: true } } },
    });

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
    const blockCheck = await this.ipBlacklist.checkBlocked(ctx.ip);
    if (blockCheck.blocked) {
      this.logBlockedClick(redirector.id, ctx, blockCheck.telegramId).catch(() => {});
      return { url: redirector.alternativeUrl || '/', deviceFilter: 'all' };
    }

    const rules = (redirector.rules as any) || {};
    const devices: string[] = rules.devices || [];
    const deviceFilter: string = (rules.deviceFilter as string) ||
      (devices.includes('mobile') && !devices.includes('desktop') ? 'mobile_only' : 'all');

    // ── Modo revisão ────────────────────────────────────────────────────────
    // Enquanto o anúncio está em análise, TODO mundo vê a página alternativa —
    // inclusive quem passaria nos filtros. Sai antes do evaluateRules de
    // propósito: não é mais um filtro, é a chave que desliga todos eles. As
    // regras continuam salvas e voltam a valer no clique seguinte ao desligar.
    //
    // Restrito a link de Kwai SEM Facebook marcado: para qualquer link que
    // receba tráfego do Facebook, este bloco é inerte e o caminho executado é
    // byte a byte o de antes. Foi assim que combinamos para não pôr em risco a
    // análise do App do Facebook.
    //
    // `deviceFilter: 'all'` forçado é a parte que mais importa: com
    // 'mobile_only' a rota /r/ devolve uma página que decide no navegador, e o
    // que o revisor precisa encontrar é um destino direto, sem truque.
    const fontes = rules.sources || {};
    const soKwai = fontes.kwai === true && fontes.facebook !== true;

    // ── Revisor do Kwai ─────────────────────────────────────────────────────
    // Mesmo escopo do modo revisão (link só de Kwai — o Facebook não passa
    // por aqui). Prévia, robô e equipe de revisão vão sempre pra alternativa,
    // com ou sem revisão ligada, e ficam marcados como device 'revisao'.
    if (soKwai) {
      const revisor = await this.detectarRevisorKwai(redirector.id, ctx);
      if (revisor) {
        this.logClick(redirector.id, 'alternative', ctx, revisor, undefined, 'revisao').catch(() => {});
        return {
          url: redirector.alternativeUrl || '/',
          deviceFilter: 'all',
          alternativeUrl: redirector.alternativeUrl,
        };
      }
    }

    if (rules.reviewMode === true && soKwai) {
      // Antes de mandar pra alternativa, checa se a revisão já pode se
      // desligar sozinha. Se puder, este clique já segue o fluxo normal — o
      // anúncio está no ar e não faz sentido queimar mais um visitante.
      const desligou = await this.desligarRevisaoSePreciso(redirector, rules, ctx);
      if (!desligou) {
        this.logClick(redirector.id, 'alternative', ctx, 'Modo revisão ligado').catch(() => {});
        return {
          url: redirector.alternativeUrl || '/',
          deviceFilter: 'all',
          alternativeUrl: redirector.alternativeUrl,
        };
      }
    }

    // null = passou em todas as regras; texto = por que caiu na alternativa.
    const motivo = this.evaluateRules(rules, ctx, redirector.verificationCode)
      ?? await this.filtroPais(rules, ctx.ip);
    const matched = motivo === null;

    let destination: 'telegram' | 'external' | 'alternative';
    let url: string;
    let reason: string | null = null;

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
      // já que aqui não há bot/fluxo envolvido.
      this.facebookCapi.handlePageView(redirector.workspaceId, {
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
      }).catch(() => {});

      this.kwaiAds.handleContentView(redirector.workspaceId, {
        kwaiId:      ctx.kwaiId === TEST_CLICK_ID ? undefined : ctx.kwaiId,
        utmCampaign: ctx.utmCampaign,
        utmMedium:   ctx.utmMedium,
      }).catch(() => {});
    } else if (matched && redirector.flow?.bot?.username) {
      destination = 'telegram';

      const trackingId = await this.saveTracking(ctx, sourceUrl);
      const startParam = trackingId
        ? `rt_${Buffer.from(`${redirector.slug}:${trackingId}`).toString('base64url')}`
        : `rf_${redirector.slug}`;

      const utmParams = new URLSearchParams();
      if (ctx.utmSource)   utmParams.set('utm_source',   ctx.utmSource);
      if (ctx.utmMedium)   utmParams.set('utm_medium',   ctx.utmMedium);
      if (ctx.utmCampaign) utmParams.set('utm_campaign', ctx.utmCampaign);
      if (ctx.utmContent)  utmParams.set('utm_content',  ctx.utmContent);
      if (ctx.utmTerm)     utmParams.set('utm_term',     ctx.utmTerm);
      const utmStr = utmParams.toString();

      const telegramDomain = await this.platformSettings.getTelegramLinkDomain();
      const base = `https://${telegramDomain}/${redirector.flow.bot.username}?start=${startParam}`;
      url = utmStr ? `${base}&${utmStr}` : base;

      // Facebook CAPI — fire-and-forget, nunca bloqueia o redirect
      this.facebookCapi.handlePageView(redirector.workspaceId, {
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
      }).catch(() => {});

      // Kwai AdsNebula — fire-and-forget, nunca bloqueia o redirect
      this.kwaiAds.handleContentView(redirector.workspaceId, {
        kwaiId:      ctx.kwaiId === TEST_CLICK_ID ? undefined : ctx.kwaiId,
        botId:       redirector.flow?.bot?.id,
        utmCampaign: ctx.utmCampaign,
        utmMedium:   ctx.utmMedium,
      }).catch(() => {});
    } else {
      destination = 'alternative';
      url = redirector.alternativeUrl || '/';
      reason = motivo ?? (redirector.destinationType === 'external'
        ? 'Link sem URL de destino configurada'
        : 'Link sem fluxo/bot configurado');
      this.saveTracking(ctx, sourceUrl).catch(() => {});
    }

    // O id vai junto na resposta quando o clique "entrou": com deviceFilter
    // 'mobile_only' a palavra final é do navegador (checagem de DevTools/
    // emulador no route.ts), que usa esse id pra corrigir o registro se barrar.
    const clickId = randomUUID();
    this.logClick(redirector.id, destination, ctx, reason, clickId).catch(() => {});

    return {
      url, deviceFilter, alternativeUrl: redirector.alternativeUrl,
      ...(destination !== 'alternative' && { clickId }),
    };
  }

  /**
   * O navegador barrou um clique que o servidor tinha deixado entrar (página
   * de checagem do 'mobile_only': DevTools, emulador, computador). Corrige o
   * registro pra "alternativa" com o motivo e acerta os contadores do link.
   *
   * Rota pública, então só aceita: id existente (UUID, não dá pra adivinhar),
   * clique ainda marcado como "entrou", gravado há no máximo 10 minutos, e um
   * motivo da lista fechada abaixo. Só consegue rebaixar, nunca promover.
   */
  async marcarBarradoNoNavegador(clickId: string, codigo: string) {
    const MOTIVOS: Record<string, string> = {
      emulador: 'Emulador / modo dispositivo do navegador (DevTools)',
      devtools: 'DevTools aberto no navegador',
      tela:     'Tela simulada (emulador)',
      desktop:  'Computador (não é celular)',
    };
    const reason = MOTIVOS[codigo];
    if (!reason || !/^[0-9a-f-]{36}$/i.test(clickId || '')) return { ok: false };

    const db = prismaAny(this.prisma);
    const click = await db.redirectorClick.findUnique({
      where: { id: clickId },
      select: { id: true, redirectorId: true, destination: true, createdAt: true },
    });
    if (!click) return { ok: false };
    if (click.destination !== 'telegram' && click.destination !== 'external') return { ok: false };
    if (Date.now() - new Date(click.createdAt).getTime() > 10 * 60_000) return { ok: false };

    // O UA dizia celular, mas o navegador provou que é computador: 'dev' =
    // computador simulando celular (DevTools/emulador); 'desktop' = computador.
    const device = codigo === 'desktop' ? 'desktop' : 'dev';

    const { count } = await db.redirectorClick.updateMany({
      where: { id: clickId, destination: { in: ['telegram', 'external'] } },
      data: { destination: 'alternative', reason, device },
    });
    if (count === 1) {
      await db.redirector.update({
        where: { id: click.redirectorId },
        data: { telegramClicks: { decrement: 1 }, alternativeClicks: { increment: 1 } },
      }).catch(() => {});
    }
    return { ok: count === 1 };
  }

  /**
   * Desliga a revisão sozinha quando o anúncio entra no ar.
   *
   * O sinal contado é PESSOA, não clique: enquanto o anúncio está em análise
   * quem abre o link é o revisor, e um revisor recarregando vinte vezes
   * continua sendo uma pessoa. Por isso conta IPs distintos, e só os que
   * chegam com `click_id` do Kwai — quem veio do anúncio de verdade.
   *
   * A consulta só roda enquanto a revisão está ligada, ou seja, sobre um
   * punhado de cliques. Assim que desliga, some junto — o caminho quente do
   * /r/ volta ao que era.
   *
   * Devolve true quando desligou; aí o clique que fechou a conta já passa
   * pelas regras normais.
   */
  /**
   * Reconhece quem não é público do anúncio num link só de Kwai. Devolve o
   * motivo (vai pro "Últimos acessos") ou null quando é visitante comum.
   */
  private async detectarRevisorKwai(
    redirectorId: string,
    ctx: ResolveRedirectorDto,
  ): Promise<string | null> {
    const db = prismaAny(this.prisma);
    const chave = chaveIp(ctx.ip);

    // 0. Link de teste do painel (8878): é o dono — passa sempre pelas regras
    // normais, e se o IP dele tiver caído na lista, sai dela.
    if (ctx.kwaiId === TEST_CLICK_ID) {
      if (chave) db.kwaiReviewerIp.deleteMany({ where: { ipKey: chave } }).catch(() => {});
      return null;
    }

    // 1. Já foi visto revisando antes (qualquer campanha, qualquer link).
    if (chave) {
      try {
        const conhecido = await db.kwaiReviewerIp.findUnique({ where: { ipKey: chave } });
        if (conhecido) {
          db.kwaiReviewerIp.update({
            where: { id: conhecido.id },
            data: { hits: { increment: 1 }, lastSeenAt: new Date(), lastIp: ctx.ip },
          }).catch(() => {});
          return 'Revisor do Kwai (já visto revisando antes)';
        }
      } catch { /* tabela indisponível: segue as outras checagens */ }
    }

    // 2. Robô de revisão: grava pra próxima.
    if (ipDoKwai(ctx.ip)) {
      this.gravarRevisores([ctx.ip!], 'Servidor de revisão do Kwai').catch(() => {});
      return 'Revisor do Kwai (servidor de revisão do Kwai)';
    }
    if (/^java\//i.test(ctx.ua || '')) {
      this.gravarRevisores([ctx.ip!], 'Robô de verificação (navegador Java)').catch(() => {});
      return 'Revisor do Kwai (robô de verificação)';
    }

    // 3. Macro sem substituir (__CALLBACK__ etc.): é prévia/revisão do Kwai.
    // Barra e grava o IP. O dono testa sempre pelo link do painel (8878),
    // que nunca cai aqui — e quem já usou o 8878 não entra na lista.
    if (ehMacroKwai(ctx.kwaiId) || ehMacroKwai(ctx.utmCampaign) || ehMacroKwai(ctx.utmContent)) {
      if (ctx.ip) this.gravarRevisores([ctx.ip], 'Prévia/revisão do Kwai (__CALLBACK__)').catch(() => {});
      return 'Prévia/revisão do Kwai (anúncio sem os dados preenchidos)';
    }

    // 4. Equipe de revisão: o mesmo click id em vários IPs. Grava todos os
    // IPs desse click id — inclusive os primeiros, que entraram antes de
    // dar pra perceber.
    if (!ctx.kwaiId || ctx.kwaiId === TEST_CLICK_ID || !ctx.ip) return null;
    try {
      const outros = await db.redirectorClick.groupBy({
        by: ['ip'],
        where: {
          redirectorId,
          kwaiId: ctx.kwaiId,
          ip: { not: ctx.ip },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (outros.length + 1 >= REVISAO_IPS_MESMO_CLICK) {
        const ips = [ctx.ip, ...outros.map((o: any) => o.ip).filter(Boolean)];
        this.gravarRevisores(ips, `Equipe de revisão (mesmo click id em ${ips.length} IPs)`).catch(() => {});
        return `Revisor do Kwai (mesmo click id em ${ips.length} IPs)`;
      }
    } catch { /* na dúvida, segue como visitante comum */ }
    return null;
  }

  /**
   * Põe IPs na lista de revisores do Kwai. Pula IP que já usou o link de
   * teste do painel (8878) — é o dono testando, não pode se bloquear.
   */
  private async gravarRevisores(ips: string[], reason: string) {
    const db = prismaAny(this.prisma);
    const unicos = [...new Set(ips.filter(Boolean))];
    if (!unicos.length) return;

    const donos = await db.redirectorClick.findMany({
      where: { ip: { in: unicos }, OR: [{ kwaiId: TEST_CLICK_ID }, { fbclid: TEST_CLICK_ID }] },
      select: { ip: true },
      distinct: ['ip'],
    });
    const ipsDono = new Set(donos.map((d: any) => d.ip));

    for (const ip of unicos) {
      if (ipsDono.has(ip)) continue;
      const ipKey = chaveIp(ip);
      if (!ipKey) continue;
      await db.kwaiReviewerIp.upsert({
        where: { ipKey },
        create: { ipKey, lastIp: ip, reason },
        update: { lastSeenAt: new Date(), lastIp: ip },
      }).catch(() => {});
    }
  }

  private async desligarRevisaoSePreciso(
    redirector: any,
    rules: any,
    ctx: ResolveRedirectorDto,
  ): Promise<boolean> {
    // A tela mostra a opção ligada quando ela nunca foi salva — o servidor
    // segue a tela: só desliga com `false` explícito.
    if (rules.reviewAutoOff === false) return false;

    // Sem click_id não veio do anúncio; sem IP não dá pra dizer se é gente
    // nova ou a mesma pessoa de novo.
    if (!ctx.kwaiId || !ctx.ip || ctx.kwaiId === TEST_CLICK_ID || ehMacroKwai(ctx.kwaiId)) return false;

    const limite: number = rules.reviewAutoOffHits || 10;
    const desde = rules.reviewStartedAt ? new Date(rules.reviewStartedAt) : undefined;

    try {
      const grupos = await prismaAny(this.prisma).redirectorClick.groupBy({
        by: ['ip', 'kwaiId'],
        where: {
          redirectorId: redirector.id,
          ...(desde && { createdAt: { gte: desde } }),
          ip: { not: null },
          AND: [
            { kwaiId: { not: null } },
            { kwaiId: { not: TEST_CLICK_ID } },
            { NOT: { kwaiId: { startsWith: '__' } } },
            { OR: [{ device: null }, { device: { notIn: ['revisao', 'dev'] } }] },
          ],
        },
      });

      // Pessoa = IP novo E click id novo. Gente de verdade chega cada uma com
      // seu click id; a equipe de revisão reaproveita o mesmo click id em
      // vários IPs, e uma pessoa recarregando repete o IP — nenhum dos dois
      // pode empurrar a contagem. Este clique ainda não foi gravado, então
      // entra na conta à mão.
      const ips = new Set<string>(grupos.map((g: any) => g.ip));
      const ids = new Set<string>(grupos.map((g: any) => g.kwaiId));
      ips.add(ctx.ip);
      ids.add(ctx.kwaiId);
      const pessoas = Math.min(ips.size, ids.size);
      if (pessoas < limite) return false;

      const novas = { ...rules };
      delete novas.reviewMode;
      delete novas.reviewStartedAt;

      await prismaAny(this.prisma).redirector.update({
        where: { id: redirector.id },
        data: { rules: novas },
      });

      // Reflete no objeto em memória para o resto deste mesmo clique.
      delete rules.reviewMode;
      delete rules.reviewStartedAt;

      this.logger.log(
        `Revisão desligada sozinha em "${redirector.name}" (${redirector.slug}): ` +
        `${pessoas} pessoas chegaram pelo anúncio.`,
      );
      return true;
    } catch (e: any) {
      // Falhar aqui não pode liberar o destino real por acidente: no erro, o
      // link continua em revisão e todo mundo segue indo pra alternativa.
      this.logger.warn(`Falha ao avaliar o fim da revisão: ${e?.message}`);
      return false;
    }
  }

  private async saveTracking(ctx: ResolveRedirectorDto, sourceUrl?: string): Promise<string | null> {
    try {
      const platform = ctx.fbclid ? 'facebook'
        : ctx.ttclid ? 'tiktok'
        : ctx.kwaiId ? 'kwai'
        : ctx.utmSource || 'organic';

      const record = await prismaAny(this.prisma).userTracking.create({
        data: {
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
    reason: string | null = null,
    id?: string,
    deviceOverride?: string,
  ) {
    const device = deviceOverride || this.parseDevice(ctx.ua);
    const os = this.parseOS(ctx.ua);
    const language = this.parseLanguage(ctx.acceptLanguage);
    const source = ctx.fbclid ? 'facebook' : ctx.kwaiId ? 'kwai' : null;
    const geo = await localizarIp(ctx.ip);

    const db = prismaAny(this.prisma);
    await Promise.all([
      db.redirectorClick.create({
        data: {
          ...(id && { id }),
          redirectorId, destination, source, device, os, language, ip: ctx.ip || null,
          country: geo.country, region: geo.region, city: geo.city,
          reason,
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
      }),
      db.redirector.update({
        where: { id: redirectorId },
        data: {
          totalClicks: { increment: 1 },
          // 'external' conta junto de 'telegram' aqui — os dois representam
          // "casou com as regras", só mudando o destino final. Mantém a coluna
          // "Conv." do dashboard (telegramClicks/totalClicks) correta pros dois
          // tipos sem precisar de contador novo nem mudança no frontend.
          ...(destination === 'telegram' || destination === 'external'
            ? { telegramClicks: { increment: 1 } }
            : { alternativeClicks: { increment: 1 } }),
        },
      }),
    ]);
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
    const geo = await localizarIp(ctx.ip);
    await prismaAny(this.prisma).redirectorClick.create({
      data: {
        redirectorId,
        destination: 'blocked',
        country: geo.country, region: geo.region, city: geo.city,
        reason: blockedTelegramId
          ? `IP bloqueado (Telegram ID ${blockedTelegramId})`
          : 'IP bloqueado',
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

  /**
   * Devolve null quando o clique passa em todas as regras, ou o motivo (texto
   * curto, mostrado no painel do usuário e na aba Filtro do admin) da primeira
   * regra que barrou.
   */
  /**
   * Filtro de país (opcional, por link): com países marcados, só passa quem
   * tem IP desses países. Lista vazia = qualquer país. Sem a base de
   * localização (build sem o arquivo) o filtro não barra ninguém — melhor do
   * que derrubar todo o tráfego; com a base, IP que não se acha é barrado.
   */
  private async filtroPais(rules: any, ip?: string): Promise<string | null> {
    const permitidos: string[] = (Array.isArray(rules.countries) ? rules.countries : [])
      .map((c: string) => String(c).toUpperCase());
    if (permitidos.length === 0) return null;
    if (!(await baseGeoDisponivel())) return null;
    const { country } = await localizarIp(ip);
    if (!country) return 'País não identificado pelo IP';
    if (!permitidos.includes(country)) return `Fora do país permitido (${country})`;
    return null;
  }

  private evaluateRules(rules: any, ctx: ResolveRedirectorDto, verificationCode: string): string | null {
    // Camada extra: código de 5 dígitos por link, exigido em ?app= — checado
    // ANTES de qualquer outra regra (falha rápida) e em conjunto (E lógico)
    // com a verificação por plataforma logo abaixo.
    if (rules.verificationCodeEnabled) {
      if (!ctx.verificationCode) return 'Sem código de verificação (?app=)';
      if (ctx.verificationCode !== verificationCode) return 'Código de verificação errado';
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
      if (!matchesSrc) {
        const nomes: Record<string, string> = {
          facebook: 'Facebook (sem fbclid)',
          kwai:     'Kwai (sem click_id)',
        };
        const esperado = activeSources.map((s) => nomes[s] || s).join(' nem do ');
        return `Não veio do anúncio do ${esperado}`;
      }
    }

    const devices: string[] = rules.devices || [];
    if (devices.length > 0) {
      const d = this.parseDevice(ctx.ua);
      if (!devices.includes(d)) return `Dispositivo não permitido (${d === 'mobile' ? 'celular' : 'computador'})`;
    }

    const os: string[] = rules.os || [];
    if (os.length > 0) {
      const o = this.parseOS(ctx.ua);
      if (!os.includes(o)) return `Sistema não permitido (${o})`;
    }

    const schedule = rules.schedule;
    if (schedule?.enabled && schedule.start && schedule.end) {
      const now = new Date();
      const [sh, sm] = schedule.start.split(':').map(Number);
      const [eh, em] = schedule.end.split(':').map(Number);
      const cur = now.getHours() * 60 + now.getMinutes();
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      if (cur < start || cur > end) return `Fora do horário (${schedule.start}–${schedule.end})`;
    }

    return null;
  }

  /**
   * Últimos acessos dos links do workspace — quem entrou e quem caiu na
   * página alternativa (com o motivo). Para o próprio dono ver, no painel.
   */
  async listClicks(workspaceId: string, opts: { redirectorId?: string; result?: string; limit?: number }) {
    const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
    const where: any = { redirector: { workspaceId } };
    if (opts.redirectorId) where.redirectorId = opts.redirectorId;
    if (opts.result === 'entrou') where.destination = { in: ['telegram', 'external'] };
    if (opts.result === 'barrado') where.destination = { in: ['alternative', 'blocked'] };

    return prismaAny(this.prisma).redirectorClick.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, createdAt: true, destination: true, reason: true,
        device: true, os: true, ip: true, trafficSource: true,
        utmSource: true, utmCampaign: true, fbclid: true, kwaiId: true,
        country: true, region: true, city: true,
        redirector: { select: { id: true, name: true, slug: true } },
      },
    });
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
