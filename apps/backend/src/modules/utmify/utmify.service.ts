import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { UpdateUtmifyConfigDto } from './dto/update-utmify-config.dto';
import { encrypt, decrypt } from '../../common/utils/encryption';

@Injectable()
export class UtmifyService {
  private readonly logger = new Logger(UtmifyService.name);

  constructor(private prisma: PrismaService) {}

  async getConfig(workspaceId: string) {
    const config = await this.prisma.utmifyIntegration.findUnique({
      where: { workspaceId },
    });
    if (!config) return null;
    return { id: config.id, webhookUrl: config.webhookUrl, isActive: config.isActive };
  }

  async updateConfig(workspaceId: string, dto: UpdateUtmifyConfigDto) {
    const data: any = {};
    if (dto.apiKey) data.apiKey = encrypt(dto.apiKey);
    if (dto.webhookUrl) data.webhookUrl = dto.webhookUrl;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.utmifyIntegration.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        apiKey: dto.apiKey ? encrypt(dto.apiKey) : '',
        webhookUrl: dto.webhookUrl,
        isActive: dto.isActive || false,
      },
      update: data,
    });
  }

  async sendEvent(
    workspaceId: string,
    eventData: {
      event: string;
      leadUid: string;
      value?: number;
      product?: string;
      transactionId?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
    },
  ) {
    const config = await this.prisma.utmifyIntegration.findUnique({
      where: { workspaceId },
    });
    if (!config || !config.isActive) return null;

    const apiKey = decrypt(config.apiKey);

    try {
      const response = await axios.post(
        'https://api.utmify.com.br/v1/events',
        {
          api_key: apiKey,
          event: eventData.event,
          lead_uid: eventData.leadUid,
          value: eventData.value,
          product: eventData.product,
          transaction_id: eventData.transactionId,
          utm_source: eventData.utmSource,
          utm_medium: eventData.utmMedium,
          utm_campaign: eventData.utmCampaign,
        },
        { timeout: 5000 },
      );

      this.logger.log(`UTMify event ${eventData.event} sent for lead ${eventData.leadUid}`);
      return { sent: true };
    } catch (error) {
      this.logger.error('Failed to send UTMify event', error);
      return { sent: false, error: error.message };
    }
  }

  async testConnection(workspaceId: string) {
    const config = await this.prisma.utmifyIntegration.findUnique({
      where: { workspaceId },
    });
    if (!config) return { connected: false, message: 'Not configured' };
    return { connected: true, webhookUrl: config.webhookUrl, isActive: config.isActive };
  }
}
