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
        status: true,
        webhookUrl: true,
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

    let webhookConfigured = false;
    try {
      const webhookRes = await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query', 'inline_query'],
      });
      webhookConfigured = webhookRes.data?.ok === true;
      if (!webhookConfigured) {
        this.logger.warn(`Webhook not set for bot @${botInfo.username}: ${webhookRes.data?.description}`);
      }
    } catch (error) {
      this.logger.warn(`Could not set webhook for bot @${botInfo.username}: ${error?.message}`);
    }

    const bot = await this.prisma.telegramBot.create({
      data: {
        workspaceId,
        botToken: encrypt(botToken),
        username: botInfo.username || botInfo.id.toString(),
        webhookUrl: webhookConfigured ? webhookUrl : null,
        status: 'ACTIVE',
      },
    });

    this.logger.log(`Bot @${bot.username} registered in workspace ${workspaceId} (webhook: ${webhookConfigured})`);

    return {
      id: bot.id,
      username: bot.username,
      webhookUrl: bot.webhookUrl,
      webhookConfigured,
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

    if (bot.status !== 'ACTIVE') {
      await this.prisma.telegramBot.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });
      this.logger.log(`Bot @${bot.username} auto-activated via testConnection`);
    }

    return {
      connected: true,
      username: botInfo.username,
      id: botInfo.id,
    };
  }

  async reregisterWebhook(id: string) {
    const bot = await this.prisma.telegramBot.findUnique({ where: { id } });
    if (!bot) throw new NotFoundException('Bot not found');

    const decryptedToken = decrypt(bot.botToken);
    const webhookUrl = `${process.env.TELEGRAM_WEBHOOK_URL || 'http://localhost:3001/api/webhooks/telegram'}/${bot.workspaceId}`;

    try {
      const res = await axios.post(`https://api.telegram.org/bot${decryptedToken}/setWebhook`, {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query', 'inline_query'],
      });

      const ok = res.data?.ok === true;

      if (ok) {
        await this.prisma.telegramBot.update({
          where: { id },
          data: { webhookUrl },
        });
        this.logger.log(`Webhook re-registered for bot @${bot.username}: ${webhookUrl}`);
      } else {
        this.logger.warn(`Failed to re-register webhook: ${res.data?.description}`);
      }

      return {
        ok,
        webhookUrl,
        description: res.data?.description,
      };
    } catch (error) {
      const telegramDesc = error?.response?.data?.description;
      const msg = telegramDesc || error?.message || 'Erro desconhecido';
      this.logger.error(`reregisterWebhook error for bot ${id}: ${msg}`);
      throw new BadRequestException(`Falha ao registrar webhook: ${msg}`);
    }
  }

  async getWebhookInfo(id: string) {
    const bot = await this.prisma.telegramBot.findUnique({ where: { id } });
    if (!bot) throw new NotFoundException('Bot not found');

    const decryptedToken = decrypt(bot.botToken);

    try {
      const res = await axios.get(`https://api.telegram.org/bot${decryptedToken}/getWebhookInfo`);
      return res.data?.result;
    } catch (error) {
      throw new BadRequestException(`Falha ao obter info do webhook: ${error?.message}`);
    }
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

  async setupBotMenuAndCommands(token: string) {
    const base = `https://api.telegram.org/bot${token}`;
    try {
      await axios.post(`${base}/setMyCommands`, {
        commands: [{ command: 'start', description: 'Iniciar' }],
      });
      await axios.post(`${base}/setChatMenuButton`, {
        menu_button: { type: 'commands' },
      });
    } catch (e) {
      this.logger.warn(`setupBotMenuAndCommands: ${e.message}`);
    }
  }
}
