import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { UpdateFacebookConfigDto } from './dto/update-facebook-config.dto';
import { SendFacebookEventDto } from './dto/send-facebook-event.dto';
import { encrypt, decrypt } from '../../common/utils/encryption';

@Injectable()
export class FacebookAdsService {
  private readonly logger = new Logger(FacebookAdsService.name);

  constructor(private prisma: PrismaService) {}

  async getConfig(workspaceId: string) {
    const config = await this.prisma.facebookIntegration.findUnique({
      where: { workspaceId },
    });
    if (!config) return null;
    return {
      id: config.id,
      pixelId: config.pixelId,
      isActive: config.isActive,
    };
  }

  async updateConfig(workspaceId: string, dto: UpdateFacebookConfigDto) {
    const data: any = {};
    if (dto.pixelId) data.pixelId = dto.pixelId;
    if (dto.accessToken) data.accessToken = encrypt(dto.accessToken);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.facebookIntegration.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        pixelId: dto.pixelId || '',
        accessToken: dto.accessToken ? encrypt(dto.accessToken) : '',
        isActive: dto.isActive || false,
      },
      update: data,
    });
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
      event_name: eventData.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      user_data: {
        em: eventData.email ? [crypto.createHash('sha256').update(eventData.email.toLowerCase()).digest('hex')] : undefined,
        ph: eventData.phone ? [crypto.createHash('sha256').update(eventData.phone).digest('hex')] : undefined,
        client_ip_address: eventData.ip,
        client_user_agent: eventData.userAgent,
        fbc: eventData.fbclid,
        external_id: eventData.externalId ? [crypto.createHash('sha256').update(eventData.externalId).digest('hex')] : undefined,
      },
      custom_data: {
        currency: eventData.currency || 'BRL',
        value: eventData.value,
        content_ids: eventData.contentIds,
        content_type: eventData.contentType,
      },
    };

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${pixelId}/events`,
        {
          data: [event],
          access_token: accessToken,
          test_event_code: process.env.NODE_ENV === 'development' ? 'TEST' : undefined,
        },
      );

      this.logger.log(`Facebook event ${eventData.eventName} sent: ${response.data.events_received}`);

      return {
        sent: true,
        eventId,
        eventsReceived: response.data.events_received,
      };
    } catch (error) {
      this.logger.error('Failed to send Facebook event', error);
      return { sent: false, error: error.message };
    }
  }

  async testConnection(workspaceId: string) {
    const config = await this.prisma.facebookIntegration.findUnique({
      where: { workspaceId },
    });
    if (!config) return { connected: false, message: 'Not configured' };

    return { connected: true, pixelId: config.pixelId, isActive: config.isActive };
  }
}
