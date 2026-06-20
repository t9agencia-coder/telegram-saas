import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { UpdateKwaiConfigDto } from './dto/update-kwai-config.dto';
import { encrypt, decrypt } from '../../common/utils/encryption';

@Injectable()
export class KwaiAdsService {
  private readonly logger = new Logger(KwaiAdsService.name);

  constructor(private prisma: PrismaService) {}

  async getConfig(workspaceId: string) {
    const config = await this.prisma.kwaiIntegration.findUnique({
      where: { workspaceId },
    });
    if (!config) return null;
    return { id: config.id, advertiserId: config.advertiserId, isActive: config.isActive };
  }

  async updateConfig(workspaceId: string, dto: UpdateKwaiConfigDto) {
    const data: any = {};
    if (dto.advertiserId) data.advertiserId = dto.advertiserId;
    if (dto.accessToken) data.accessToken = encrypt(dto.accessToken);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.kwaiIntegration.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        advertiserId: dto.advertiserId || '',
        accessToken: dto.accessToken ? encrypt(dto.accessToken) : '',
        isActive: dto.isActive || false,
      },
      update: data,
    });
  }

  async sendEvent(workspaceId: string, eventName: string, clickId: string, value?: number) {
    const config = await this.prisma.kwaiIntegration.findUnique({
      where: { workspaceId },
    });
    if (!config || !config.isActive) return null;

    const accessToken = decrypt(config.accessToken);

    try {
      const response = await axios.post(
        'https://ad.kwaipd.com/api/v1/conversion',
        {
          advertiser_id: config.advertiserId,
          click_id: clickId,
          event_type: eventName.toUpperCase(),
          value: value || 0,
          currency: 'BRL',
          timestamp: Math.floor(Date.now() / 1000),
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Kwai event ${eventName} sent`);
      return { sent: true };
    } catch (error) {
      this.logger.error('Failed to send Kwai event', error);
      return { sent: false, error: error.message };
    }
  }

  async testConnection(workspaceId: string) {
    const config = await this.prisma.kwaiIntegration.findUnique({
      where: { workspaceId },
    });
    if (!config) return { connected: false, message: 'Not configured' };
    return { connected: true, advertiserId: config.advertiserId, isActive: config.isActive };
  }
}
