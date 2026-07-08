import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { FacebookCapiService } from '../facebook-capi/facebook-capi.service';
import {
  CreateRedirectorDto,
  UpdateRedirectorDto,
  ResolveRedirectorDto,
} from './dto/create-redirector.dto';

const prismaAny = (p: PrismaService) => p as any;

@Injectable()
export class RedirectorsService {
  private readonly logger = new Logger(RedirectorsService.name);

  constructor(
    private prisma: PrismaService,
    private facebookCapi: FacebookCapiService,
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
    return prismaAny(this.prisma).redirector.create({
      data: {
        workspaceId,
        name: dto.name,
        slug,
        flowId:        dto.flowId   || null,
        domainId:      dto.domainId || null,
        alternativeUrl: dto.alternativeUrl,
        rules: dto.rules || {},
      },
      include: { flow: { include: { bot: true } }, domain: true },
    });
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
        ...(dto.rules !== undefined && { rules: dto.rules }),
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

    const rules = (redirector.rules as any) || {};
    const devices: string[] = rules.devices || [];
    const deviceFilter: string = (rules.deviceFilter as string) ||
      (devices.includes('mobile') && !devices.includes('desktop') ? 'mobile_only' : 'all');

    const matched = this.evaluateRules(rules, ctx);

    let destination: 'telegram' | 'alternative';
    let url: string;

    if (matched && redirector.flow?.bot?.username) {
      destination = 'telegram';

      const trackingId = await this.saveTracking(ctx);
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

      const base = `https://t.me/${redirector.flow.bot.username}?start=${startParam}`;
      url = utmStr ? `${base}&${utmStr}` : base;

      // Facebook CAPI — fire-and-forget, nunca bloqueia o redirect
      const appBase = (process.env.FRONTEND_URL || 'https://app.firebot.shop')
        .replace('http://localhost:3000', 'https://app.firebot.shop');
      this.facebookCapi.handlePageView(redirector.workspaceId, {
        ip:          ctx.ip,
        userAgent:   ctx.ua,
        fbp:         ctx.fbp,
        fbc:         ctx.fbc,
        sourceUrl:   `${appBase}/r/${redirector.slug}`,
        botId:       redirector.flow?.bot?.id,
        utmSource:   ctx.utmSource,
        utmMedium:   ctx.utmMedium,
        utmCampaign: ctx.utmCampaign,
        utmContent:  ctx.utmContent,
        utmTerm:     ctx.utmTerm,
      }).catch(() => {});
    } else {
      destination = 'alternative';
      url = redirector.alternativeUrl || '/';
      this.saveTracking(ctx).catch(() => {});
    }

    this.logClick(redirector.id, destination, ctx).catch(() => {});

    return { url, deviceFilter, alternativeUrl: redirector.alternativeUrl };
  }

  private async saveTracking(ctx: ResolveRedirectorDto): Promise<string | null> {
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

    const db = prismaAny(this.prisma);
    await Promise.all([
      db.redirectorClick.create({
        data: { redirectorId, destination, source, device, os, language, ip: ctx.ip || null },
      }),
      db.redirector.update({
        where: { id: redirectorId },
        data: {
          totalClicks: { increment: 1 },
          ...(destination === 'telegram'
            ? { telegramClicks: { increment: 1 } }
            : { alternativeClicks: { increment: 1 } }),
        },
      }),
    ]);
  }

  private evaluateRules(rules: any, ctx: ResolveRedirectorDto): boolean {
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
