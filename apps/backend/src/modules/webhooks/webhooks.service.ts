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
        await this.executeFlowGraph(activeFlow, token, chatId.toString());
      }
    }

    return { ok: true };
  }

  private async executeFlowGraph(flow: any, botToken: string, chatId: string) {
    const nodes = flow.nodes as any[];
    const edges = flow.edges as any[];

    // Find trigger node (type === 'trigger' or id === 'start')
    const startNode = nodes.find(n => n.type === 'trigger' || n.id === 'start');
    if (!startNode) {
      this.logger.warn(`No trigger node found in flow ${flow.id}`);
      return;
    }

    // Walk the graph: start → next → next ...
    let currentNodeId: string | null = startNode.id;

    while (currentNodeId) {
      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) break;

      // If this is the trigger node, skip execution and follow its edge
      if (node.type === 'trigger') {
        const edge = edges.find(e => e.source === node.id);
        currentNodeId = edge ? edge.target : null;
        continue;
      }

      // Check for wait-before delay
      const waitBefore = node.data?.waitBefore;
      if (waitBefore && waitBefore.value > 0) {
        const delayMs = this.delayToMs(waitBefore);
        await this.queueDelayedExecution(botToken, chatId, node, nodes, edges, delayMs);
        return;
      }

      // Execute the node
      const nextId = await this.executeNode(node, botToken, chatId, nodes, edges);
      if (nextId === 'DELAYED') return;

      currentNodeId = nextId;
    }
  }

  private delayToMs(d: { value: number; unit: string }): number {
    if (d.unit === 'seconds') return d.value * 1000;
    if (d.unit === 'minutes') return d.value * 60 * 1000;
    if (d.unit === 'hours') return d.value * 3600 * 1000;
    return d.value * 1000;
  }

  private async queueDelayedExecution(
    botToken: string, chatId: string,
    node: any, nodes: any[], edges: any[], delayMs: number,
  ) {
    setTimeout(async () => {
      try {
        const nextId = await this.executeNode(node, botToken, chatId, nodes, edges);
        if (nextId && nextId !== 'DELAYED') {
          await this.continueFlow(botToken, chatId, nextId, nodes, edges);
        }
      } catch (err) {
        this.logger.error(`Delayed execution error: ${err.message}`);
      }
    }, delayMs);
  }

  private async continueFlow(
    botToken: string, chatId: string,
    fromNodeId: string, nodes: any[], edges: any[],
  ) {
    let currentNodeId: string | null = fromNodeId;
    while (currentNodeId) {
      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) break;

      const waitBefore = node.data?.waitBefore;
      if (waitBefore && waitBefore.value > 0) {
        const delayMs = this.delayToMs(waitBefore);
        await this.queueDelayedExecution(botToken, chatId, node, nodes, edges, delayMs);
        return;
      }

      const nextId = await this.executeNode(node, botToken, chatId, nodes, edges);
      if (nextId === 'DELAYED') return;
      currentNodeId = nextId;
    }
  }

  private async executeNode(
    node: any, botToken: string, chatId: string,
    nodes: any[], edges: any[],
  ): Promise<string | 'DELAYED' | null> {
    try {
      switch (node.type) {
        case 'text':
          await this.execText(node, botToken, chatId);
          break;
        case 'image':
          await this.execImage(node, botToken, chatId);
          break;
        case 'video':
          await this.execVideo(node, botToken, chatId);
          break;
        case 'buttons':
          await this.execButtons(node, botToken, chatId);
          break;
        case 'delay':
          await this.execDelay(node, botToken, chatId, nodes, edges);
          return 'DELAYED';
        case 'pix_buttons':
          await this.execPixButtons(node, botToken, chatId);
          break;
        default:
          this.logger.warn(`Unknown node type: ${node.type}`);
      }
    } catch (err) {
      this.logger.error(`Failed to execute node ${node.id}: ${err.message}`);
      return null;
    }

    const edge = edges.find(e => e.source === node.id);
    return edge ? edge.target : null;
  }

  private async execText(node: any, token: string, chatId: string) {
    const content = node.data?.content || '';
    if (!content) return;
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: content,
      parse_mode: 'HTML',
    });
  }

  private async execImage(node: any, token: string, chatId: string) {
    const url = node.data?.fileUrl;
    if (!url) return;
    await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, {
      chat_id: chatId,
      photo: url,
      caption: node.data?.caption || '',
      parse_mode: 'HTML',
    });
  }

  private async execVideo(node: any, token: string, chatId: string) {
    const url = node.data?.fileUrl;
    if (!url) return;
    await axios.post(`https://api.telegram.org/bot${token}/sendVideo`, {
      chat_id: chatId,
      video: url,
      caption: node.data?.caption || '',
      parse_mode: 'HTML',
    });
  }

  private async execButtons(node: any, token: string, chatId: string) {
    const content = node.data?.content || '';
    const buttons: { label: string; type: string; url?: string }[] = node.data?.buttons || [];

    if (buttons.length === 0) {
      if (content) {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId, text: content, parse_mode: 'HTML',
        });
      }
      return;
    }

    const rows: any[] = [];
    for (const btn of buttons) {
      if (btn.type === 'url' && btn.url) {
        rows.push([{ text: btn.label, url: btn.url }]);
      } else {
        rows.push([{ text: btn.label, callback_data: `btn_${btn.label}` }]);
      }
    }

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: content || 'Escolha uma opção:',
      reply_markup: { inline_keyboard: rows },
      parse_mode: 'HTML',
    });
  }

  private async execDelay(
    node: any, token: string, chatId: string,
    nodes: any[], edges: any[],
  ) {
    const delay = node.data?.delay;
    if (!delay || !delay.value) return;

    const delayMs = this.delayToMs(delay);
    const edge = edges.find(e => e.source === node.id);
    const nextId = edge ? edge.target : null;

    if (nextId) {
      setTimeout(async () => {
        try {
          await this.continueFlow(token, chatId, nextId, nodes, edges);
        } catch (err) {
          this.logger.error(`Delay continuation error: ${err.message}`);
        }
      }, delayMs);
    }
  }

  private async execPixButtons(node: any, token: string, chatId: string) {
    const content = node.data?.content || '';
    const options: { label: string; value: number }[] = node.data?.pixOptions || [];

    if (options.length === 0) {
      if (content) {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId, text: content, parse_mode: 'HTML',
        });
      }
      return;
    }

    const rows = options.map(opt => ([{
      text: `${opt.label} — R$ ${Number(opt.value || 0).toFixed(2)}`,
      callback_data: `pay_${opt.label}`,
    }]));

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: content || 'Selecione um plano de pagamento:',
      reply_markup: { inline_keyboard: rows },
      parse_mode: 'HTML',
    });
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
