import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { encrypt, decrypt } from '../../common/utils/encryption';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import axios from 'axios';

@Injectable()
export class TelegramBotsService {
  private readonly logger = new Logger(TelegramBotsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(workspaceId: string) {
    return this.prisma.telegramBot.findMany({
      where: { workspaceId, isActive: true },
      select: {
        id: true,
        username: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const bot = await this.prisma.telegramBot.findUnique({
      where: { id },
      include: { flows: true },
    });
    if (!bot) throw new NotFoundException('Bot not found');
    return { ...bot, botToken: undefined };
  }

  async create(workspaceId: string, dto: CreateBotDto) {
    const botToken = dto.botToken;

    const botInfo = await this.getBotInfo(botToken);

    const existing = await this.prisma.telegramBot.findFirst({
      where: { workspaceId, username: botInfo.username },
    });
    if (existing) {
      throw new BadRequestException('This bot is already registered in this workspace');
    }

    const webhookUrl = `${process.env.TELEGRAM_WEBHOOK_URL || 'http://localhost:3001/api/webhooks/telegram'}/${workspaceId}`;

    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query', 'inline_query'],
      });
    } catch (error) {
      throw new BadRequestException('Failed to set webhook. Check bot token.');
    }

    const bot = await this.prisma.telegramBot.create({
      data: {
        workspaceId,
        botToken: encrypt(botToken),
        username: botInfo.username || botInfo.id.toString(),
        webhookUrl,
      },
    });

    this.logger.log(`Bot @${bot.username} registered in workspace ${workspaceId}`);

    return {
      id: bot.id,
      username: bot.username,
      webhookUrl: bot.webhookUrl,
      isActive: bot.isActive,
      createdAt: bot.createdAt,
    };
  }

  async update(id: string, dto: UpdateBotDto) {
    const bot = await this.findById(id);
    const data: any = {};

    if (dto.botToken) {
      data.botToken = encrypt(dto.botToken);
    }

    return this.prisma.telegramBot.update({
      where: { id },
      data,
      select: { id: true, username: true, isActive: true, updatedAt: true },
    });
  }

  async testConnection(id: string) {
    const bot = await this.prisma.telegramBot.findUnique({ where: { id } });
    if (!bot) throw new NotFoundException('Bot not found');

    const decryptedToken = decrypt(bot.botToken);
    const botInfo = await this.getBotInfo(decryptedToken);

    return {
      connected: true,
      username: botInfo.username,
      id: botInfo.id,
    };
  }

  async remove(id: string) {
    const bot = await this.prisma.telegramBot.findUnique({ where: { id } });
    if (!bot) throw new NotFoundException('Bot not found');

    const decryptedToken = decrypt(bot.botToken);
    try {
      await axios.post(`https://api.telegram.org/bot${decryptedToken}/deleteWebhook`);
    } catch (error) {
      this.logger.warn(`Failed to delete webhook for bot ${id}`);
    }

    return this.prisma.telegramBot.delete({ where: { id } });
  }

  async getRawToken(id: string): Promise<string> {
    const bot = await this.prisma.telegramBot.findUnique({ where: { id } });
    if (!bot) throw new NotFoundException('Bot not found');
    return decrypt(bot.botToken);
  }

  private async getBotInfo(token: string) {
    try {
      const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
      return response.data.result;
    } catch (error) {
      throw new BadRequestException('Invalid Telegram bot token');
    }
  }
}
