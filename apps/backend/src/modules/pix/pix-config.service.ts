import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { encrypt } from '../../common/utils/encryption';
import { UpdatePixConfigDto } from './dto/update-pix-config.dto';

@Injectable()
export class PixConfigService {
  constructor(private prisma: PrismaService) {}

  async getConfig(workspaceId: string) {
    const config = await this.prisma.blackpayConfig.findUnique({
      where: { workspaceId },
    });
    if (!config) return null;
    return { id: config.id, isActive: config.isActive };
  }

  async updateConfig(workspaceId: string, dto: UpdatePixConfigDto) {
    const data: any = {};
    if (dto.apiKey) data.apiKey = encrypt(dto.apiKey);
    if (dto.webhookSecret) data.webhookSecret = encrypt(dto.webhookSecret);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.blackpayConfig.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        apiKey: dto.apiKey ? encrypt(dto.apiKey) : '',
        webhookSecret: dto.webhookSecret ? encrypt(dto.webhookSecret) : '',
        isActive: dto.isActive || false,
      },
      update: data,
    });
  }
}
