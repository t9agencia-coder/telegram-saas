import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { UpdateFacebookConfigDto, TestFacebookConnectionDto } from './dto/update-facebook-config.dto';
import { SendFacebookEventDto } from './dto/send-facebook-event.dto';
import { encrypt, decrypt } from '../../common/utils/encryption';
import { randomUUID } from 'crypto';

const prismaAny = (p: PrismaService) => p as any;

@Injectable()
export class FacebookAdsService {
  private readonly logger = new Logger(FacebookAdsService.name);

  constructor(private prisma: PrismaService) {}

  // ── Legacy single-pixel endpoints (mantidos para compatibilidade) ──────────

  async getConfig(workspaceId: string) {
    const config = await this.prisma.facebookIntegration.findUnique({
      where: { workspaceId },
    });
    if (!config) return null;

    let tokenSuffix: string | null = null;
    try {
      const raw = decrypt(config.accessToken);
      if (raw && raw.length >= 6) tokenSuffix = raw.slice(-6);
    } catch { /* token corrompido */ }

    return {
      pixelId:        config.pixelId,
      isActive:       config.isActive,
      tokenSuffix,
      eventPageView:  (config as any).eventPageView  ?? true,
      eventAddToCart: (config as any).eventAddToCart ?? true,
      eventPurchase:  (config as any).eventPurchase  ?? true,
    };
  }

  async updateConfig(workspaceId: string, dto: UpdateFacebookConfigDto) {
    const data: any = {};
    if (dto.pixelId     !== undefined) data.pixelId     = dto.pixelId;
    if (dto.accessToken)               data.accessToken = encrypt(dto.accessToken);
    if (dto.isActive    !== undefined) data.isActive    = dto.isActive;
    if (dto.eventPageView  !== undefined) data.eventPageView  = dto.eventPageView;
    if (dto.eventAddToCart !== undefined) data.eventAddToCart = dto.eventAddToCart;
    if (dto.eventPurchase  !== undefined) data.eventPurchase  = dto.eventPurchase;

    await this.prisma.facebookIntegration.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        pixelId:     dto.pixelId     || '',
        accessToken: dto.accessToken ? encrypt(dto.accessToken) : '',
        isActive:    dto.isActive    ?? false,
        ...(data.eventPageView  !== undefined && { eventPageView:  data.eventPageView }),
        ...(data.eventAddToCart !== undefined && { eventAddToCart: data.eventAddToCart }),
        ...(data.eventPurchase  !== undefined && { eventPurchase:  data.eventPurchase }),
      } as any,
      update: data,
    });

    return this.getConfig(workspaceId);
  }

  async testConnection(workspaceId: string, dto?: TestFacebookConnectionDto) {
    const config = await this.prisma.facebookIntegration.findUnique({
      where: { workspaceId },
    });

    const pixelId = dto?.pixelId || config?.pixelId;
    let rawToken: string | null = null;
    if (dto?.accessToken) {
      rawToken = dto.accessToken;
    } else if (config?.accessToken) {
      try { rawToken = decrypt(config.accessToken); } catch { /* corrompido */ }
    }

    if (!pixelId || !rawToken) {
      return { connected: false, message: 'Pixel ID e Access Token são obrigatórios para testar' };
    }

    return this.sendTestEvent(pixelId, rawToken);
  }

  async sendEvent(workspaceId: string, eventData: SendFacebookEventDto) {
    const config = await this.prisma.facebookIntegration.findUnique({
      where: { workspaceId },
    });
    if (!config || !config.isActive) return null;

    const accessToken = decrypt(config.accessToken);
    const pixelId = config.pixelId;
    const eventId = crypto.randomUUID();

    const event = {
      event_name:    eventData.eventName,
      event_time:    Math.floor(Date.now() / 1000),
      event_id:      eventId,
      action_source: 'website',
      user_data: {
        em: eventData.email
          ? [crypto.createHash('sha256').update(eventData.email.toLowerCase()).digest('hex')]
          : undefined,
        ph: eventData.phone
          ? [crypto.createHash('sha256').update(eventData.phone).digest('hex')]
          : undefined,
        client_ip_address: eventData.ip,
        client_user_agent: eventData.userAgent,
        fbc:               eventData.fbclid,
        external_id:       eventData.externalId
          ? [crypto.createHash('sha256').update(eventData.externalId).digest('hex')]
          : undefined,
      },
      custom_data: {
        currency:     eventData.currency || 'BRL',
        value:        eventData.value,
        content_ids:  eventData.contentIds,
        content_type: eventData.contentType,
      },
    };

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${pixelId}/events`,
        { data: [event], access_token: accessToken },
      );
      this.logger.log(`Facebook event ${eventData.eventName} sent: ${response.data.events_received}`);
      return { sent: true, eventId, eventsReceived: response.data.events_received };
    } catch (error: any) {
      this.logger.error('Failed to send Facebook event', error);
      return { sent: false, error: error.message };
    }
  }

  // ── Multi-pixel endpoints (novo sistema) ──────────────────────────────────

  async listPixels(workspaceId: string) {
    let pixels = await prismaAny(this.prisma).facebookPixel.findMany({
      where: { workspaceId },
      include: { bot: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Auto-migração: se não há pixels novos mas existe integração legada, migra automaticamente
    if (pixels.length === 0) {
      const legacy = await this.prisma.facebookIntegration.findUnique({ where: { workspaceId } });
      if (legacy?.pixelId && legacy?.accessToken) {
        const migrated = await prismaAny(this.prisma).facebookPixel.create({
          data: {
            workspaceId,
            botId:          null,
            name:           'Pixel principal',
            pixelId:        legacy.pixelId,
            accessToken:    legacy.accessToken,   // já criptografado
            isActive:       legacy.isActive,
            eventPageView:  (legacy as any).eventPageView  ?? true,
            eventAddToCart: (legacy as any).eventAddToCart ?? true,
            eventPurchase:  (legacy as any).eventPurchase  ?? true,
          },
          include: { bot: { select: { id: true, username: true } } },
        });
        pixels = [migrated];
      }
    }

    return pixels.map((p: any) => this.formatPixel(p));
  }

  async createPixel(workspaceId: string, dto: {
    name?: string;
    pixelId: string;
    accessToken: string;
    botId: string;
    isActive?: boolean;
    eventPageView?: boolean;
    eventAddToCart?: boolean;
    eventPurchase?: boolean;
  }) {
    // Limite de 5 pixels ativos por conta
    const count = await prismaAny(this.prisma).facebookPixel.count({ where: { workspaceId } });
    if (count >= 5) {
      throw new BadRequestException('Limite máximo de 5 Pixels por conta atingido.');
    }

    const pixel = await prismaAny(this.prisma).facebookPixel.create({
      data: {
        workspaceId,
        botId:          dto.botId,
        name:           dto.name || null,
        pixelId:        dto.pixelId.trim(),
        accessToken:    encrypt(dto.accessToken.trim()),
        isActive:       dto.isActive ?? true,
        eventPageView:  dto.eventPageView  ?? true,
        eventAddToCart: dto.eventAddToCart ?? true,
        eventPurchase:  dto.eventPurchase  ?? true,
      },
      include: { bot: { select: { id: true, username: true } } },
    });

    return this.formatPixel(pixel);
  }

  async updatePixel(workspaceId: string, pixelId: string, dto: {
    name?: string;
    pixelId?: string;
    accessToken?: string;
    botId?: string;
    isActive?: boolean;
    eventPageView?: boolean;
    eventAddToCart?: boolean;
    eventPurchase?: boolean;
  }) {
    const existing = await prismaAny(this.prisma).facebookPixel.findFirst({
      where: { id: pixelId, workspaceId },
    });
    if (!existing) throw new NotFoundException('Pixel não encontrado.');

    const data: any = {};
    if (dto.name        !== undefined) data.name           = dto.name || null;
    if (dto.pixelId     !== undefined) data.pixelId        = dto.pixelId.trim();
    if (dto.accessToken)               data.accessToken    = encrypt(dto.accessToken.trim());
    if (dto.botId       !== undefined) data.botId          = dto.botId || null;
    if (dto.isActive    !== undefined) data.isActive       = dto.isActive;
    if (dto.eventPageView  !== undefined) data.eventPageView  = dto.eventPageView;
    if (dto.eventAddToCart !== undefined) data.eventAddToCart = dto.eventAddToCart;
    if (dto.eventPurchase  !== undefined) data.eventPurchase  = dto.eventPurchase;

    const updated = await prismaAny(this.prisma).facebookPixel.update({
      where: { id: pixelId },
      data,
      include: { bot: { select: { id: true, username: true } } },
    });

    return this.formatPixel(updated);
  }

  async deletePixel(workspaceId: string, pixelId: string) {
    const existing = await prismaAny(this.prisma).facebookPixel.findFirst({
      where: { id: pixelId, workspaceId },
    });
    if (!existing) throw new NotFoundException('Pixel não encontrado.');

    await prismaAny(this.prisma).facebookPixel.delete({ where: { id: pixelId } });
    return { deleted: true };
  }

  async testPixelById(workspaceId: string, pixelId: string, dto?: { pixelId?: string; accessToken?: string }) {
    const pixel = await prismaAny(this.prisma).facebookPixel.findFirst({
      where: { id: pixelId, workspaceId },
    });
    if (!pixel) throw new NotFoundException('Pixel não encontrado.');

    const pid    = dto?.pixelId     || pixel.pixelId;
    const rawToken = dto?.accessToken
      ? dto.accessToken
      : (() => { try { return decrypt(pixel.accessToken); } catch { return null; } })();

    if (!pid || !rawToken) {
      return { connected: false, message: 'Pixel ID e Access Token são obrigatórios para testar' };
    }

    return this.sendTestEvent(pid, rawToken);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private formatPixel(p: any) {
    let tokenSuffix: string | null = null;
    try {
      const raw = decrypt(p.accessToken);
      if (raw && raw.length >= 6) tokenSuffix = raw.slice(-6);
    } catch { /* corrompido */ }

    return {
      id:             p.id,
      name:           p.name,
      pixelId:        p.pixelId,
      botId:          p.botId,
      botUsername:    p.bot?.username ?? null,
      isActive:       p.isActive,
      eventPageView:  p.eventPageView,
      eventAddToCart: p.eventAddToCart,
      eventPurchase:  p.eventPurchase,
      tokenSuffix,
      needsBotAssignment: !p.botId,
      createdAt:      p.createdAt,
    };
  }

  private async sendTestEvent(pixelId: string, rawToken: string) {
    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${pixelId}/events`,
        {
          data: [{
            event_name:    'PageView',
            event_time:    Math.floor(Date.now() / 1000),
            event_id:      randomUUID(),
            action_source: 'website',
            user_data: {
              client_user_agent: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Mobile Safari/537.36',
              client_ip_address: '127.0.0.1',
            },
          }],
          access_token: rawToken,
        },
      );
      const received = response.data?.events_received ?? 1;
      return { connected: true, message: `Conexão bem-sucedida — ${received} evento(s) recebido(s)` };
    } catch (error: any) {
      const fbError = error.response?.data?.error;
      this.logger.error(`[FB Test] pixelId=${pixelId} status=${error.response?.status} error=${JSON.stringify(fbError)}`);
      const fbMsg = fbError?.error_user_msg || fbError?.message || error.message || 'Erro desconhecido';
      return { connected: false, message: fbMsg };
    }
  }
}
