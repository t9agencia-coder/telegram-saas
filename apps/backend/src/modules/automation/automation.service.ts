import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
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
      include: {
        bot: {
          select: { id: true, username: true, status: true, isActive: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOneFlow(id: string) {
    const flow = await this.prisma.flow.findUnique({
      where: { id },
      include: {
        bot: {
          select: { id: true, username: true, status: true, isActive: true },
        },
      },
    });
    if (!flow) throw new NotFoundException('Flow not found');
    return flow;
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
        config: dto.config || {},
        trigger: dto.trigger || 'start',
      },
    });
  }

  async updateFlow(id: string, dto: UpdateFlowDto) {
    const flow = await this.prisma.flow.findUnique({ where: { id } });
    if (!flow) throw new NotFoundException('Flow not found');

    const data: any = { ...dto, version: { increment: 1 } };
    if (dto.config) {
      data.config = { ...(flow.config as Record<string, any>), ...dto.config };
    }

    const updated = await this.prisma.flow.update({ where: { id }, data });

    // Grava snapshot da versão para histórico/restauração
    await this.prisma.flowVersion.create({
      data: {
        flowId:  id,
        version: updated.version,
        nodes:   updated.nodes as any,
        edges:   updated.edges as any,
        config:  updated.config as any,
      },
    });

    // Mantém apenas as últimas 50 versões por fluxo
    const versions = await this.prisma.flowVersion.findMany({
      where: { flowId: id },
      orderBy: { version: 'desc' },
      skip: 50,
      select: { id: true },
    });
    if (versions.length > 0) {
      await this.prisma.flowVersion.deleteMany({
        where: { id: { in: versions.map(v => v.id) } },
      });
    }

    return updated;
  }

  async deleteFlow(id: string) {
    return this.prisma.flow.delete({ where: { id } });
  }

  async activateFlow(id: string) {
    const flow = await this.prisma.flow.findUnique({
      where: { id },
      include: { bot: true },
    });
    if (!flow) throw new NotFoundException('Flow not found');

    if (!flow.nodes || (flow.nodes as any[]).length === 0) {
      throw new BadRequestException('O fluxo precisa ter pelo menos um bloco para ser ativado');
    }

    if (!flow.botId) {
      throw new BadRequestException('Conecte um bot ao fluxo antes de ativar');
    }

    if (!flow.bot || flow.bot.status !== 'ACTIVE') {
      throw new BadRequestException('O bot conectado precisa estar com status ACTIVE. Verifique se o token do bot é válido.');
    }

    // Verifica se já existe outro fluxo ativo para o mesmo bot
    const conflicting = await this.prisma.flow.findFirst({
      where: { botId: flow.botId, isActive: true, id: { not: id } },
      select: { id: true, name: true },
    });
    if (conflicting) {
      throw new ConflictException('BOT_HAS_ACTIVE_FLOW');
    }

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

  async duplicateFlow(workspaceId: string, id: string, targetBotId?: string) {
    const original = await this.prisma.flow.findUnique({ where: { id } });
    if (!original) throw new NotFoundException('Flow not found');

    return this.prisma.flow.create({
      data: {
        workspaceId,
        botId:       targetBotId ?? original.botId,
        name:        `${original.name} (cópia)`,
        description: original.description,
        trigger:     original.trigger,
        config:      original.config as any,
        nodes:       original.nodes as any,
        edges:       original.edges as any,
        isActive:    false,
      },
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

    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || !lead.telegramId) return;
    if (!flow.bot) return;

    const botId = flow.bot.id;
    await this.executeFlowGraph(nodes, edges, botId, lead.telegramId);
  }

  private async executeFlowGraph(
    nodes: any[], edges: any[], botId: string, chatId: string,
  ) {
    const startNode = nodes.find(n => n.type === 'trigger' || n.id === 'start');
    if (!startNode) {
      this.logger.warn('No trigger node found');
      return;
    }

    let currentNodeId: string | null = startNode.id;

    while (currentNodeId) {
      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) break;

      if (node.type === 'trigger') {
        const edge = edges.find(e => e.source === node.id);
        currentNodeId = edge ? edge.target : null;
        continue;
      }

      const nextId = await this.execNode(node, botId, chatId, nodes, edges);
      if (nextId === 'DELAYED') return;
      currentNodeId = nextId;
    }
  }

  private async execNode(
    node: any, botId: string, chatId: string,
    nodes: any[], edges: any[],
  ): Promise<string | 'DELAYED' | null> {
    try {
      switch (node.type) {
        case 'text':
          await this.execText(node, botId, chatId);
          break;
        case 'image':
          await this.execImage(node, botId, chatId);
          break;
        case 'video':
          await this.execVideo(node, botId, chatId);
          break;
        case 'buttons':
          await this.execButtons(node, botId, chatId);
          break;
        case 'delay':
          await this.execDelay(node, botId, chatId, nodes, edges);
          return 'DELAYED';
        case 'webhook':
          await this.execWebhook(node);
          break;
        default:
          this.logger.warn(`Unknown node type: ${node.type}`);
      }
    } catch (err) {
      this.logger.error(`execNode error for ${node.id}: ${err.message}`);
      return null;
    }

    const edge = edges.find(e => e.source === node.id);
    return edge ? edge.target : null;
  }

  private async execText(node: any, botId: string, chatId: string) {
    const content = node.data?.content || '';
    if (!content) return;
    await this.queueTelegramMessage(botId, chatId, { type: 'text', text: content });
  }

  private async execImage(node: any, botId: string, chatId: string) {
    const url = node.data?.fileUrl;
    if (!url) return;
    await this.queueTelegramMessage(botId, chatId, {
      type: 'photo', url, caption: node.data?.caption || '',
    });
  }

  private async execVideo(node: any, botId: string, chatId: string) {
    const url = node.data?.fileUrl;
    if (!url) return;
    await this.queueTelegramMessage(botId, chatId, {
      type: 'video', url, caption: node.data?.caption || '',
    });
  }

  private async execButtons(node: any, botId: string, chatId: string) {
    const content = node.data?.content || '';
    const buttons: { label: string; type: string; url?: string }[] = node.data?.buttons || [];
    if (buttons.length === 0) {
      if (content) {
        await this.queueTelegramMessage(botId, chatId, { type: 'text', text: content });
      }
      return;
    }
    const rows = buttons.map(b => b.type === 'url' && b.url
      ? [{ text: b.label, url: b.url }]
      : [{ text: b.label, callback_data: `btn_${b.label}` }]
    );
    await this.queueTelegramMessage(botId, chatId, {
      type: 'buttons', text: content, keyboard: rows,
    });
  }

  private async execDelay(
    node: any, botId: string, chatId: string,
    nodes: any[], edges: any[],
  ) {
    const delay = node.data?.delay;
    if (!delay || !delay.value) return;
    const delayMs = this.delayToMs(delay);
    const edge = edges.find(e => e.source === node.id);
    const nextId = edge ? edge.target : null;
    if (nextId) {
      await this.queueScheduledTask('continue-flow', {
        nodes, edges, botId, chatId, fromNodeId: nextId,
      }, delayMs);
    }
  }

  private async execWebhook(node: any) {
    const url = node.data?.url;
    const payload = node.data?.payload || {};
    if (url) {
      await this.queueWebhook(url, payload);
    }
  }

  private delayToMs(d: { value: number; unit: string }): number {
    if (d.unit === 'seconds') return d.value * 1000;
    if (d.unit === 'minutes') return d.value * 60 * 1000;
    if (d.unit === 'hours') return d.value * 3600 * 1000;
    return d.value * 1000;
  }
}
