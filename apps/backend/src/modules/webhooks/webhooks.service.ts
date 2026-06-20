import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PixService } from '../pix/pix.service';
import { FacebookAdsService } from '../facebook-ads/facebook-ads.service';
import { KwaiAdsService } from '../kwai-ads/kwai-ads.service';
import { UtmifyService } from '../utmify/utmify.service';
import { decrypt } from '../../common/utils/encryption';
import { generateLeadUid } from '../../common/utils/lead-uid';
import axios from 'axios';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    private pixService: PixService,
    private facebookService: FacebookAdsService,
    private kwaiService: KwaiAdsService,
    private utmifyService: UtmifyService,
  ) {}

  async processTelegramWebhook(workspaceId: string, body: any) {
    const { message, callback_query } = body;

    if (callback_query) {
      return this.handleCallbackQuery(workspaceId, callback_query);
    }

    if (message) {
      return this.handleMessage(workspaceId, message);
    }

    return { ok: true };
  }

  private async handleMessage(workspaceId: string, message: any) {
    const chatId = message.chat.id;
    const text = message.text || '';
    const from = message.from;

    let lead = await this.prisma.lead.findFirst({
      where: { workspaceId, telegramId: chatId.toString() },
    });

    if (!lead) {
      lead = await this.prisma.lead.create({
        data: {
          workspaceId,
          leadUid: generateLeadUid(),
          telegramId: chatId.toString(),
          name: `${from.first_name || ''} ${from.last_name || ''}`.trim(),
          username: from.username,
        },
      });

      await this.prisma.event.create({
        data: {
          leadId: lead.id,
          eventName: 'START',
          source: 'telegram',
        },
      });
    }

    await this.prisma.event.create({
      data: {
        leadId: lead.id,
        eventName: 'MESSAGE_SENT',
        source: 'telegram',
        metadata: { text, chatId },
      },
    });

    const activeFlow = await this.prisma.flow.findFirst({
      where: { workspaceId, isActive: true, trigger: 'start' },
      include: { bot: true },
    });

    if (activeFlow) {
      const botToken = activeFlow.bot?.botToken;
      if (botToken) {
        const token = decrypt(botToken);

        const nodes = activeFlow.nodes as any[];
        const edges = activeFlow.edges as any[];
        const startNode = nodes.find(n => n.type === 'start');

        if (startNode) {
          const edge = edges.find(e => e.source === startNode.id);
          if (edge) {
            const nextNode = nodes.find(n => n.id === edge.target);
            if (nextNode && nextNode.type === 'message') {
              await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId,
                text: nextNode.data?.text || 'Welcome!',
                parse_mode: 'HTML',
              });
            }
          }
        }
      }
    }

    return { ok: true };
  }

  private async handleCallbackQuery(workspaceId: string, callbackQuery: any) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const from = callbackQuery.from;

    if (data.startsWith('pay_')) {
      const lead = await this.prisma.lead.findFirst({
        where: { workspaceId, telegramId: chatId.toString() },
      });

      if (lead) {
        const productId = data.replace('pay_', '');
        const product = productId !== 'checkout'
          ? await this.prisma.product.findUnique({ where: { id: productId } })
          : null;

        if (product) {
          const charge = await this.pixService.createCharge(workspaceId, lead.id, product.id);

          const bot = await this.prisma.telegramBot.findFirst({
            where: { workspaceId, isActive: true },
          });

          if (bot) {
            const token = decrypt(bot.botToken);

            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
              chat_id: chatId,
              text: `✅ *Pagamento PIX*\n\n📦 *Produto:* ${product.name}\n💰 *Valor:* R$ ${product.price}\n\n📱 *PIX Copia e Cola:*\n\`${charge.copyPaste}\`\n\n🔄 Após o pagamento, seu acesso será liberado automaticamente.`,
              parse_mode: 'Markdown',
            });
          }
        }
      }
    }

    return { ok: true };
  }

  async processPixWebhook(workspaceId: string, body: any, _signature: string) {
    await this.pixService.processWebhook(body);
    return { received: true };
  }

  async processUtmifyWebhook(workspaceId: string, body: any) {
    this.logger.log(`UTMify webhook received: ${JSON.stringify(body)}`);
    return { received: true };
  }
}
