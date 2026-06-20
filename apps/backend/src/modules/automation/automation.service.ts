import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('telegram-messages') private messageQueue: Queue,
    @InjectQueue('webhook-events') private webhookQueue: Queue,
    @InjectQueue('scheduled-tasks') private scheduledQueue: Queue,
  ) {}

  async findAllFlows(workspaceId: string) {
    return this.prisma.flow.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createFlow(workspaceId: string, dto: CreateFlowDto) {
    return this.prisma.flow.create({
      data: {
        workspaceId,
        botId: dto.botId,
        name: dto.name,
        description: dto.description,
        nodes: dto.nodes || [],
        edges: dto.edges || [],
        trigger: dto.trigger || 'start',
      },
    });
  }

  async updateFlow(id: string, dto: UpdateFlowDto) {
    const flow = await this.prisma.flow.findUnique({ where: { id } });
    if (!flow) throw new NotFoundException('Flow not found');

    return this.prisma.flow.update({
      where: { id },
      data: dto,
    });
  }

  async deleteFlow(id: string) {
    return this.prisma.flow.delete({ where: { id } });
  }

  async activateFlow(id: string) {
    const flow = await this.prisma.flow.findUnique({ where: { id } });
    if (!flow) throw new NotFoundException('Flow not found');

    await this.prisma.flow.updateMany({
      where: { workspaceId: flow.workspaceId },
      data: { isActive: false },
    });

    return this.prisma.flow.update({
      where: { id },
      data: { isActive: true },
    });
  }

  async deactivateFlow(id: string) {
    return this.prisma.flow.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async queueTelegramMessage(botId: string, chatId: string, message: any) {
    await this.messageQueue.add('send-message', {
      botId,
      chatId,
      message,
    });
  }

  async queueWebhook(url: string, payload: any) {
    await this.webhookQueue.add('process-webhook', {
      url,
      payload,
    });
  }

  async queueScheduledTask(task: string, data: any, delayMs: number) {
    await this.scheduledQueue.add(
      task,
      data,
      { delay: delayMs },
    );
  }

  async processFlow(flowId: string, leadId: string) {
    const flow = await this.prisma.flow.findUnique({
      where: { id: flowId },
      include: { bot: true },
    });

    if (!flow || !flow.isActive) {
      this.logger.warn(`Flow ${flowId} not found or inactive`);
      return;
    }

    const nodes = flow.nodes as any[];
    const edges = flow.edges as any[];
    const startNode = nodes.find(n => n.type === 'start');

    if (!startNode) return;

    const edge = edges.find(e => e.source === startNode.id);
    if (!edge) return;

    const nextNode = nodes.find(n => n.id === edge.target);
    if (!nextNode) return;

    await this.executeNode(nextNode, flow, leadId);
  }

  private async executeNode(node: any, flow: any, leadId: string) {
    switch (node.type) {
      case 'message':
        await this.executeMessageNode(node, flow, leadId);
        break;
      case 'delay':
        await this.executeDelayNode(node, flow, leadId);
        break;
      case 'payment':
        await this.executePaymentNode(node, flow, leadId);
        break;
      case 'webhook':
        await this.executeWebhookNode(node, leadId);
        break;
      default:
        this.logger.warn(`Unknown node type: ${node.type}`);
    }
  }

  private async executeMessageNode(node: any, flow: any, leadId: string) {
    if (!flow.bot) return;

    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || !lead.telegramId) return;

    const token = flow.bot.botToken;
    const text = node.data?.text || 'Hello!';

    await this.queueTelegramMessage(flow.bot.id, lead.telegramId, {
      type: 'text',
      text,
    });
  }

  private async executeDelayNode(node: any, _flow: any, leadId: string) {
    const delayMs = node.data?.duration || 5000;
    await this.queueScheduledTask('continue-flow', { nodeId: node.id, leadId }, delayMs);
  }

  private async executePaymentNode(node: any, flow: any, leadId: string) {
    const productId = node.data?.productId;
    if (!productId || !flow.bot) return;

    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || !lead.telegramId) return;

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) return;

    await this.queueTelegramMessage(flow.bot.id, lead.telegramId, {
      type: 'payment',
      productName: product.name,
      amount: product.price,
    });
  }

  private async executeWebhookNode(node: any, _leadId: string) {
    const url = node.data?.url;
    const payload = node.data?.payload || {};
    if (url) {
      await this.queueWebhook(url, payload);
    }
  }
}
