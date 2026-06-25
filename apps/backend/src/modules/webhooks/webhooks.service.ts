import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { PixService } from '../pix/pix.service';
import { FacebookAdsService } from '../facebook-ads/facebook-ads.service';
import { KwaiAdsService } from '../kwai-ads/kwai-ads.service';
import { UtmifyService } from '../utmify/utmify.service';
import { decrypt } from '../../common/utils/encryption';
import { generateLeadUid } from '../../common/utils/lead-uid';
import axios from 'axios';
import * as FormData from 'form-data';
import {
  PIX_PARSE_MODE,
  PIX_QR_CAPTION,
  renderPixMessage,
  renderPixReminder,
  renderPixKeyboard,
  pixQrCodeUrl,
} from './pix-template';
import { sendTelegramMedia } from '../../common/send-telegram-media';

// Tempo padrão de exclusão automática para mensagens sem temporizador configurado
const DEFAULT_DELETION_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

// Limite máximo razoável para Date.now(): ano 2035 = 2.051.222.400.000 ms
// Se ultrapassar, o relógio do container está driftado e não devemos criar jobs
const CLOCK_DRIFT_THRESHOLD_MS = 2_051_222_400_000;

function assertNoClockDrift(label: string, logger: import('@nestjs/common').Logger): boolean {
  const now = Date.now();
  if (now > CLOCK_DRIFT_THRESHOLD_MS) {
    logger.error(
      `[ClockDrift] ${label}: Date.now()=${now} (${new Date(now).toISOString()}) indica drift! Job não agendado.`,
    );
    return false;
  }
  return true;
}

// Opções padrão para jobs de mensagem (override dos defaults globais onde necessário)
const PIX_JOB_OPTS = {
  attempts:         2,                                     // PIX reminder não precisa de 3 tentativas
  removeOnComplete: { count: 200, age: 26 * 3600 },       // 26h — cobre todo o ciclo PIX (25 min + margem)
  removeOnFail:     { count: 50,  age: 7 * 24 * 3600 },
} as const;

// Insere no Map e descarta a entrada mais antiga quando ultrapassa o limite.
// Maps JS preservam ordem de inserção, então o primeiro key é o mais antigo.
function boundedSet<V>(map: Map<string, V>, key: string, value: V, maxSize = 8_000): void {
  map.set(key, value);
  if (map.size > maxSize) {
    map.delete(map.keys().next().value!);
  }
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  // Último texto enviado por chatId — necessário para condições do fluxo
  private userLastMessage = new Map<string, string>();

  // Temporizador ativo por chatId — atualizado pelo nó 'timer' no fluxo
  private flowDeletionTimers = new Map<string, number>();

  // Progresso de upsell por chatId — idx do próximo upsell a mostrar após pagamento
  private readonly upsellProgress = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private readonly redis: RedisService,
    private pixService: PixService,
    private facebookService: FacebookAdsService,
    private kwaiService: KwaiAdsService,
    private utmifyService: UtmifyService,
    @InjectQueue('telegram-messages')    private readonly msgQueue:          Queue,
    @InjectQueue('telegram-remarketing') private readonly remarketingQueue:  Queue,
    @InjectQueue('scheduled-tasks')      private readonly scheduledQueue:    Queue,
  ) {}

  async processTelegramWebhook(workspaceId: string, body: any) {
    try {
      const { message, callback_query } = body;
      if (callback_query) return await this.handleCallbackQuery(workspaceId, callback_query);
      if (message) return await this.handleMessage(workspaceId, message);
      return { ok: true };
    } catch (err: any) {
      const detail = err?.response?.data ? JSON.stringify(err.response.data) : '';
      this.logger.error(`[Webhook] Erro não tratado: ${err?.message} ${detail}`);
      return { ok: true }; // Sempre retorna 200 para o Telegram não retentar
    }
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

    // Store last user message for condition nodes
    boundedSet(this.userLastMessage, chatId.toString(), text);

    // Detect /start payload (deep link)
    let startPayload: string | null = null;
    if (text.startsWith('/start ')) {
      startPayload = text.slice(7).trim() || null;
    }

    // Resolve active flow — redirector deep links take priority
    let activeFlow: any = null;

    if (startPayload?.startsWith('rt_')) {
      // Formato novo: rt_ + base64url("slug:trackingId")
      try {
        const decoded = Buffer.from(startPayload.slice(3), 'base64url').toString('utf8');
        const sep = decoded.indexOf(':');
        const redirectorSlug = decoded.substring(0, sep);
        const trackingId = decoded.substring(sep + 1);

        // Vincular chat_id e bot_started_at ao registro de tracking (fire and forget)
        if (trackingId) {
          (this.prisma as any).userTracking
            .update({
              where: { id: trackingId },
              data: { chatId: chatId.toString(), botStartedAt: new Date() },
            })
            .catch(() => {});
        }

        const redirectorRecord = await (this.prisma as any).redirector.findUnique({
          where: { slug: redirectorSlug },
          include: { flow: { include: { bot: true } } },
        });
        if (redirectorRecord?.flow?.bot) {
          activeFlow = redirectorRecord.flow;
        }
      } catch {
        // payload inválido — cai no fluxo padrão abaixo
      }
    } else if (startPayload?.startsWith('rf_')) {
      // Formato legado: rf_ + slug (sem tracking)
      const redirectorSlug = startPayload.slice(3);
      const redirectorRecord = await (this.prisma as any).redirector.findUnique({
        where: { slug: redirectorSlug },
        include: { flow: { include: { bot: true } } },
      });
      if (redirectorRecord?.flow?.bot) {
        activeFlow = redirectorRecord.flow;
      }
    }

    if (!activeFlow) {
      activeFlow = await this.prisma.flow.findFirst({
        where: { workspaceId, isActive: true, trigger: 'start' },
        include: { bot: true },
      });
    }

    if (activeFlow) {
      const botToken = activeFlow.bot?.botToken;
      if (botToken) {
        // Salvar botId no lead na primeira vez (para atribuição de pixel CAPI)
        if (activeFlow.bot?.id && !(lead as any).botId) {
          this.prisma.lead.update({
            where: { id: lead.id },
            data: { botId: activeFlow.bot.id } as any,
          }).catch(() => {});
        }
        const token = decrypt(botToken);
        await this.executeFlowGraph(activeFlow, token, chatId.toString());
      }
    }

    return { ok: true };
  }

  private async executeFlowGraph(flow: any, botToken: string, chatId: string) {
    const nodes = flow.nodes as any[];
    const edges = flow.edges as any[];

    // Inicializa temporizador com o valor configurado no painel do fluxo (default: 7 dias)
    const configuredDelayMs: number = (flow.config as any)?.timerDelayMs ?? DEFAULT_DELETION_MS;
    boundedSet(this.flowDeletionTimers, chatId, configuredDelayMs);

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
        await this.queueDelayedExecution(botToken, chatId, node, nodes, edges, delayMs, flow);
        return;
      }

      // Execute the node — passa `flow` para que execImage/execVideo possam usar o cache de file_id
      const nextId = await this.executeNode(node, botToken, chatId, nodes, edges, flow);
      if (nextId === 'DELAYED') return;

      currentNodeId = nextId;
    }

    // After flow completes, schedule remarketing if configured
    const lead = await this.prisma.lead.findFirst({
      where: { telegramId: chatId, workspaceId: flow.workspaceId },
    });
    if (lead) {
      await this.scheduleRemarketing(flow, botToken, chatId, lead.id);
    }
  }

  private delayToMs(d: { value: number; unit: string }): number {
    if (d.unit === 'seconds') return d.value * 1000;
    if (d.unit === 'minutes') return d.value * 60 * 1000;
    if (d.unit === 'hours') return d.value * 3600 * 1000;
    return d.value * 1000;
  }

  private async queueDelayedExecution(
    _botToken: string, chatId: string,
    node: any, _nodes: any[], _edges: any[], delayMs: number,
    flow?: any,
  ) {
    if (!flow?.id) {
      this.logger.error(`queueDelayedExecution: flow.id ausente para chatId=${chatId} — delay ignorado`);
      return;
    }
    await this.scheduledQueue.add(
      'continue-flow',
      { flowId: flow.id, chatId, fromNodeId: node.id, skipWaitBefore: true },
      { delay: delayMs, attempts: 2 },
    );
  }

  // Retoma a execução do fluxo a partir de um nodeId específico (usado pelo ScheduledTasksProcessor)
  async continueFlowFrom(flowId: string, chatId: string, fromNodeId: string): Promise<void> {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId }, include: { bot: true } });
    if (!flow?.bot?.botToken || !flow.isActive) return;
    const botToken = decrypt(flow.bot.botToken);
    await this.continueFlow(botToken, chatId, fromNodeId, flow.nodes as any[], flow.edges as any[], flow);
  }

  // Executa um nó específico ignorando seu waitBefore (já aguardamos), depois continua
  async executeFlowNodeDirect(flowId: string, chatId: string, nodeId: string): Promise<void> {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId }, include: { bot: true } });
    if (!flow?.bot?.botToken || !flow.isActive) return;
    const botToken = decrypt(flow.bot.botToken);
    const nodes = flow.nodes as any[];
    const edges = flow.edges as any[];
    const node = nodes.find((n: any) => n.id === nodeId);
    if (!node) return;
    const nextId = await this.executeNode(node, botToken, chatId, nodes, edges, flow);
    if (nextId && nextId !== 'DELAYED') {
      await this.continueFlow(botToken, chatId, nextId, nodes, edges, flow);
    }
  }

  async continueFlow(
    botToken: string, chatId: string,
    fromNodeId: string, nodes: any[], edges: any[],
    flow?: any,
  ) {
    let currentNodeId: string | null = fromNodeId;
    while (currentNodeId) {
      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) break;

      const waitBefore = node.data?.waitBefore;
      if (waitBefore && waitBefore.value > 0) {
        const delayMs = this.delayToMs(waitBefore);
        await this.queueDelayedExecution(botToken, chatId, node, nodes, edges, delayMs, flow);
        return;
      }

      const nextId = await this.executeNode(node, botToken, chatId, nodes, edges, flow);
      if (nextId === 'DELAYED') return;
      currentNodeId = nextId;
    }
  }

  private async executeNode(
    node: any, botToken: string, chatId: string,
    nodes: any[], edges: any[],
    flow?: any,
  ): Promise<string | 'DELAYED' | null> {
    try {
      switch (node.type) {
        case 'text':
          await this.execText(node, botToken, chatId);
          break;
        case 'image':
          await this.execImage(node, botToken, chatId, flow);
          break;
        case 'video':
          await this.execVideo(node, botToken, chatId, flow);
          break;
        case 'buttons':
          await this.execButtons(node, botToken, chatId);
          break;
        case 'delay':
          await this.execDelay(node, botToken, chatId, nodes, edges, flow);
          return 'DELAYED';
        case 'pix_buttons':
          await this.execPixButtons(node, botToken, chatId);
          break;
        case 'condition':
          return this.execCondition(node, botToken, chatId, nodes, edges);
        case 'schedule':
          await this.execSchedule(node, botToken, chatId, nodes, edges, flow);
          return 'DELAYED';
        case 'timer':
          this.execTimer(node, chatId);
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
    const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: content,
      parse_mode: 'HTML',
      protect_content: true,
    });
    await this.scheduleMessageDeletion(token, chatId, res.data?.result?.message_id);
  }

  // ─── Cache de file_id — evita re-upload de base64 a cada mensagem ─────────────
  //
  //  Após o primeiro upload bem-sucedido, o Telegram retorna um file_id permanente.
  //  Salvamos em flow.config.mediaCache[nodeId] associado ao botId.
  //  Envios seguintes usam só o file_id (string pequena) — Telegram serve do próprio CDN.
  //  Se o bot mudar, a validação por botId falha e o upload é refeito.

  private async saveMediaCache(flowId: string, key: string, fileId: string, botId: string) {
    try {
      const flow = await this.prisma.flow.findUnique({ where: { id: flowId }, select: { config: true } });
      const cfg  = (flow?.config as any) || {};
      await this.prisma.flow.update({
        where: { id: flowId },
        data:  { config: { ...cfg, mediaCache: { ...(cfg.mediaCache || {}), [key]: { fileId, botId } } } },
      });
    } catch (e: any) {
      this.logger.warn(`saveMediaCache falhou (key=${key}): ${e.message}`);
    }
  }

  private async execImage(node: any, token: string, chatId: string, flow?: any) {
    const fileUrl  = node.data?.fileUrl  || undefined;
    const fileData = node.data?.fileData || undefined;
    if (!fileUrl && !fileData) return;

    const botId    = flow?.botId as string | undefined;
    const cached   = flow?.config?.mediaCache?.[node.id];
    const cachedId = (cached && botId && cached.botId === botId) ? cached.fileId as string : undefined;

    const { messageId, fileId: newId } = await sendTelegramMedia({
      botToken: token, chatId, type: 'photo',
      fileId:   cachedId,
      fileUrl,
      fileData,
      caption:  node.data?.caption || undefined,
    });

    // Atualiza cache se veio um file_id novo (upload ou cache-miss)
    if (newId && flow?.id && botId) this.saveMediaCache(flow.id, node.id, newId, botId).catch(() => {});

    await this.scheduleMessageDeletion(token, chatId, messageId);
  }

  private async execVideo(node: any, token: string, chatId: string, flow?: any) {
    const fileUrl  = node.data?.fileUrl  || undefined;
    const fileData = node.data?.fileData || undefined;
    if (!fileUrl && !fileData) return;

    const botId    = flow?.botId as string | undefined;
    const cached   = flow?.config?.mediaCache?.[node.id];
    const cachedId = (cached && botId && cached.botId === botId) ? cached.fileId as string : undefined;

    const { messageId, fileId: newId } = await sendTelegramMedia({
      botToken: token, chatId, type: 'video',
      fileId:   cachedId,
      fileUrl,
      fileData,
      caption:  node.data?.caption || undefined,
    });

    if (newId && flow?.id && botId) this.saveMediaCache(flow.id, node.id, newId, botId).catch(() => {});

    await this.scheduleMessageDeletion(token, chatId, messageId);
  }

  private async execButtons(node: any, token: string, chatId: string) {
    const content = node.data?.content || '';
    const buttons: { label: string; type: string; url?: string }[] = node.data?.buttons || [];

    if (buttons.length === 0) {
      if (content) {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId, text: content, parse_mode: 'HTML', protect_content: true,
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

    const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: content || 'Escolha uma opção:',
      reply_markup: { inline_keyboard: rows },
      parse_mode: 'HTML',
      protect_content: true,
    });
    await this.scheduleMessageDeletion(token, chatId, res.data?.result?.message_id);
  }

  // ─── Nó Temporizador: atualiza o delay de exclusão para mensagens subsequentes ─
  private execTimer(node: any, chatId: string): void {
    const delayMs = node.data?.timerConfig?.delayMs ?? DEFAULT_DELETION_MS;
    boundedSet(this.flowDeletionTimers, chatId, delayMs);
    this.logger.log(`[Timer] chatId=${chatId} → exclusão em ${Math.round(delayMs / 60000)}min`);
  }

  // ─── Agenda exclusão da mensagem via BullMQ (persiste em Redis) ──────────────
  private async scheduleMessageDeletion(token: string, chatId: string, messageId?: number | null): Promise<void> {
    if (!messageId) return;
    const MAX_DELETE_DELAY_MS = 10 * 24 * 60 * 60 * 1000; // teto de 10 dias contra clock drift
    const rawDelay = this.flowDeletionTimers.get(chatId) ?? DEFAULT_DELETION_MS;
    const delayMs  = Math.min(rawDelay, MAX_DELETE_DELAY_MS);
    try {
      await this.msgQueue.add(
        'delete-message',
        { token, chatId, messageId },
        { delay: delayMs, attempts: 1 },
      );
    } catch (err: any) {
      this.logger.warn(`[Timer] Falha ao agendar exclusão msgId=${messageId}: ${err?.message}`);
    }
  }

  private async execDelay(
    node: any, token: string, chatId: string,
    nodes: any[], edges: any[],
    flow?: any,
  ) {
    const delay = node.data?.delay;
    const randomDelay = node.data?.randomDelay;

    let delayMs: number;

    if (randomDelay && randomDelay.minValue && randomDelay.maxValue) {
      const minMs = this.delayToMs({ value: randomDelay.minValue, unit: randomDelay.unit });
      const maxMs = this.delayToMs({ value: randomDelay.maxValue, unit: randomDelay.unit });
      delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    } else if (delay && delay.value) {
      delayMs = this.delayToMs(delay);
    } else {
      return;
    }

    const edge = edges.find(e => e.source === node.id);
    const nextId = edge ? edge.target : null;

    if (nextId && flow?.id) {
      await this.scheduledQueue.add(
        'continue-flow',
        { flowId: flow.id, chatId, fromNodeId: nextId },
        { delay: delayMs, attempts: 2 },
      );
    } else if (nextId && !flow?.id) {
      this.logger.error(`execDelay: flow.id ausente para chatId=${chatId} — delay ignorado`);
    }
  }

  private async execCondition(
    node: any, _token: string, chatId: string,
    _nodes: any[], edges: any[],
  ): Promise<string | null> {
    const condition = node.data?.condition;
    if (!condition || !condition.value) {
      // No condition defined, follow 'no' branch or fallback
      const noEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'no');
      return noEdge ? noEdge.target : null;
    }

    const userText = this.userLastMessage.get(chatId) || '';
    let matched = false;

    switch (condition.operator) {
      case 'contains':
        matched = userText.toLowerCase().includes(condition.value.toLowerCase());
        break;
      case 'equals':
        matched = userText.toLowerCase() === condition.value.toLowerCase();
        break;
      case 'starts_with':
        matched = userText.toLowerCase().startsWith(condition.value.toLowerCase());
        break;
    }

    const handleId = matched ? 'yes' : 'no';
    const edge = edges.find(e => e.source === node.id && e.sourceHandle === handleId);
    return edge ? edge.target : null;
  }

  private async execSchedule(
    node: any, token: string, chatId: string,
    nodes: any[], edges: any[],
    flow?: any,
  ) {
    const schedule = node.data?.schedule;
    if (!schedule || !schedule.time) return;

    const [hours, minutes] = schedule.time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return;

    const now = new Date();
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);

    let delayMs = target.getTime() - now.getTime();

    // If time has passed today, schedule for next day
    if (delayMs <= 0) {
      delayMs += 24 * 60 * 60 * 1000;
    }

    // If specific days are selected, find next matching day
    const days = schedule.days;
    if (days && days.length > 0) {
      let targetDay = target.getDay();
      let daysToAdd = 0;
      let found = false;

      for (let i = 0; i < 8; i++) {
        const checkDay = (targetDay + i) % 7;
        if (days.includes(checkDay)) {
          if (i === 0 && delayMs > 0) {
            found = true;
            break;
          }
          daysToAdd = i;
          found = true;
          break;
        }
      }

      if (found && daysToAdd > 0) {
        delayMs += daysToAdd * 24 * 60 * 60 * 1000;
      }
    }

    const edge = edges.find(e => e.source === node.id);
    const nextId = edge ? edge.target : null;

    if (nextId && flow?.id) {
      await this.scheduledQueue.add(
        'continue-flow',
        { flowId: flow.id, chatId, fromNodeId: nextId },
        { delay: delayMs, attempts: 2 },
      );
    } else if (nextId && !flow?.id) {
      this.logger.error(`execSchedule: flow.id ausente para chatId=${chatId} — agendamento ignorado`);
    }
  }

  private async execPixButtons(node: any, token: string, chatId: string) {
    const content = node.data?.content || '';
    const options: { label: string; value: number }[] = node.data?.pixOptions || [];

    if (options.length === 0) {
      if (content) {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId, text: content, parse_mode: 'HTML', protect_content: true,
        });
      }
      return;
    }

    const rows = options.map(opt => ([{
      text: `${opt.label} — R$ ${Number(opt.value || 0).toFixed(2)}`,
      // formato: pix_VALOR|LABEL  (label para exibir no template)
      callback_data: `pix_${opt.value}|${opt.label}`,
    }]));

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: content || 'Selecione um plano de pagamento:',
      reply_markup: { inline_keyboard: rows },
      parse_mode: 'HTML',
      protect_content: true,
    });
  }

  // ─── Apaga mensagem silenciosamente ─────────────────────────────────────────
  private async deleteMsgSilent(token: string, chatId: string, msgId: number | null) {
    if (!msgId) return;
    try {
      await axios.post(`https://api.telegram.org/bot${token}/deleteMessage`, {
        chat_id: chatId, message_id: msgId,
      });
    } catch { /* já apagada ou expirada */ }
  }

  // ─── Envia PIX completo + lembretes automáticos ──────────────────────────────
  //
  //   Layout e textos definidos em pix-template.ts (componente protegido).
  //   Altere apenas a lógica abaixo — nunca o template visual.
  //
  //   Cronograma:
  //     0 min  → QR Code (foto) + mensagem principal
  //     5 min  → Lembrete 1 (15 min restantes)
  //    10 min  → Lembrete 2 (10 min restantes)
  //    20 min  → Apaga foto QR
  //    25 min  → Apaga mensagem principal + lembretes
  private async sendPixMessage(
    token: string,
    chatId: string,
    charge: { id: string; copyPaste: string | null; qrCode?: string | null },
    amount: number,
    planLabel?: string,
  ) {
    if (!charge.copyPaste) return;

    const pixCode = charge.copyPaste;
    const valorBr = `R$ ${amount.toFixed(2).replace('.', ',')}`;

    // 1. QR Code (foto) — caption definido no template protegido
    let qrMsgId: number | null = null;
    try {
      const qrRes = await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, {
        chat_id: chatId,
        photo: pixQrCodeUrl(pixCode),
        caption: PIX_QR_CAPTION,
        protect_content: true,
      });
      qrMsgId = qrRes.data?.result?.message_id ?? null;
    } catch { /* continua sem foto se falhar */ }

    // 2. Mensagem principal — texto e teclado do template protegido
    const mainRes = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: renderPixMessage({ pixCode, valorBr, planLabel, chargeId: charge.id }),
      parse_mode: PIX_PARSE_MODE,
      reply_markup: { inline_keyboard: renderPixKeyboard(charge.id, pixCode) },
      protect_content: true,
    });
    const mainMsgId: number | null = mainRes.data?.result?.message_id ?? null;

    // 3–6. Lembretes e exclusões via BullMQ — sobrevivem a restarts do processo
    // Guard: se relógio driftado, pula agendamento para não corromper a fila
    if (!assertNoClockDrift('sendPixMessage', this.logger)) return;

    // Lembrete 1 — 5 min (15 min restantes). Handler verifica PENDING e agenda deleção da mensagem.
    await this.msgQueue.add('pix-reminder', {
      token,
      chatId,
      paymentId:  charge.id,
      copyPaste:  pixCode,
      amount,
      label:      planLabel ?? '',
      text:       renderPixReminder({ pixCode, minutesLeft: 15, chargeId: charge.id }),
      deleteInMs: 20 * 60 * 1000, // apaga o lembrete 20 min após enviá-lo (= 25 min totais)
    }, { ...PIX_JOB_OPTS, delay: 5 * 60 * 1000, jobId: `pix:r1:${charge.id}` });

    // Lembrete 2 — 10 min (10 min restantes)
    await this.msgQueue.add('pix-reminder', {
      token,
      chatId,
      paymentId:  charge.id,
      copyPaste:  pixCode,
      amount,
      label:      planLabel ?? '',
      text:       renderPixReminder({ pixCode, minutesLeft: 10, chargeId: charge.id }),
      deleteInMs: 15 * 60 * 1000, // apaga 15 min após enviar (= 25 min totais)
    }, { ...PIX_JOB_OPTS, delay: 10 * 60 * 1000, jobId: `pix:r2:${charge.id}` });

    // Apaga foto QR — 20 min
    if (qrMsgId) {
      await this.msgQueue.add('delete-message',
        { token, chatId, messageId: qrMsgId },
        { ...PIX_JOB_OPTS, delay: 20 * 60 * 1000 },
      );
    }

    // Apaga mensagem principal — 25 min
    if (mainMsgId) {
      await this.msgQueue.add('delete-message',
        { token, chatId, messageId: mainMsgId },
        { ...PIX_JOB_OPTS, delay: 25 * 60 * 1000 },
      );
    }
  }

  private async findBotForChat(workspaceId: string, chatId: string): Promise<string | null> {
    const bots = await this.prisma.telegramBot.findMany({
      where: { workspaceId, isActive: true },
    });
    for (const bot of bots) {
      try {
        const token = decrypt(bot.botToken);
        await axios.get(`https://api.telegram.org/bot${token}/getChat`, {
          params: { chat_id: chatId },
        });
        return token;
      } catch {
        continue;
      }
    }
    return null;
  }

  private async scheduleRemarketing(flow: any, botToken: string, chatId: string, leadId: string) {
    const cfg = (flow.config as any)?.remarketing as {
      enabled?: boolean;
      firstDelay?: number;
      interval?: number;
      stopAfter?: number;
      content?: string;
      mediaType?: string;
      mediaData?: string;
      mediaUrl?: string;
      mediaName?: string;
      buttons?: Array<{ label: string; type: string; value: string }>;
    } | undefined;

    if (!cfg?.enabled) return;
    if (!cfg.content && cfg.mediaType === 'none' && !cfg.buttons?.length) return;

    const MAX_REMARKETING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // janela máxima de 7 dias

    const firstDelayMs = (cfg.firstDelay || 30) * 60 * 1000;
    const intervalMs   = (cfg.interval   || 5)  * 3600 * 1000;
    const stopAfterMs  = (cfg.stopAfter  || 3)  * 86400 * 1000;

    // Guard: relógio do container driftado → não cria jobs com timestamps corrompidos
    if (!assertNoClockDrift('scheduleRemarketing', this.logger)) return;

    // Rejeita se o primeiro disparo já ultrapassa a janela de 7 dias
    if (firstDelayMs >= MAX_REMARKETING_WINDOW_MS) {
      this.logger.warn(`Remarketing: firstDelay (${Math.round(firstDelayMs / 3600000)}h) excede janela de 7 dias → abortando lead=${leadId}`);
      return;
    }

    // Limita os disparos para que todos caibam dentro dos 7 dias a partir de agora
    const maxSendsByWindow = Math.floor((MAX_REMARKETING_WINDOW_MS - firstDelayMs) / intervalMs) + 1;
    const maxSends = Math.min(
      Math.floor((stopAfterMs - firstDelayMs) / intervalMs) + 1,
      maxSendsByWindow,
    );
    if (maxSends < 1) return;

    // Deduplicação: não agenda se já existe job pendente para este lead
    const firstJobId = `rmkt:${leadId}:0`;
    try {
      const existing = await this.remarketingQueue.getJob(firstJobId);
      if (existing) {
        this.logger.log(`Remarketing já agendado para lead=${leadId} — ignorando duplicata`);
        return;
      }
    } catch { /* se falhar a verificação, agenda normalmente */ }

    this.logger.log(`Agendando remarketing em cadeia (${maxSends} disparos) para lead=${leadId}`);

    // Agenda apenas o 1º job. Cada disparo agenda o próximo (chain pattern).
    // botToken e mídia ficam no banco — zero dados sensíveis/pesados no Redis.
    await this.remarketingQueue.add(
      'remarketing-send',
      {
        chatId,
        leadId,
        flowId:      flow.id,
        sendIndex:   0,
        totalSends:  maxSends,
        nextDelayMs: intervalMs,
      },
      {
        delay: firstDelayMs,
        jobId: firstJobId,
      },
    );
  }

  private async handleCallbackQuery(workspaceId: string, callbackQuery: any) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;

    // Identificar o bot correto pelo Telegram user ID do remetente da mensagem original
    const botTelegramId: string | undefined = callbackQuery.message?.from?.id?.toString();
    const token = await this.findBotToken(workspaceId, chatId.toString(), botTelegramId);

    // Responde ao Telegram imediatamente — remove o spinner do botão e impede reenvio automático
    if (token) {
      axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
      }).catch(() => {});
    }

    if (data.startsWith('pix_')) {
      // formato callback_data: pix_VALOR|LABEL
      const raw = data.slice(4);
      const sep = raw.indexOf('|');
      const amountStr = sep >= 0 ? raw.slice(0, sep) : raw;
      const planLabel = sep >= 0 ? raw.slice(sep + 1) : undefined;
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0 && token) {
        // Lock atômico Redis — sobrevive a restarts, sem race condition
        const locked = await this.redis.set(`pix:lock:pix_${chatId}`, '1', 'EX', 15, 'NX');
        if (!locked) return { ok: true };

        const lead = await this.prisma.lead.findFirst({
          where: { workspaceId, telegramId: chatId.toString() },
        });
        if (lead) {
          const loadingId = await this.sendLoading(token, chatId);
          try {
            const charge = await this.pixService.createChargeByAmount(workspaceId, lead.id, amount);
            await this.deleteMsg(token, chatId, loadingId);
            await this.sendPixMessage(token, chatId.toString(), charge, amount, planLabel);
          } catch (err: any) {
            await this.deleteMsg(token, chatId, loadingId);
            this.logger.error(`PIX: erro ao criar cobrança para lead ${lead.id}: ${err?.message}`);
          }
        }
      }
    } else if (data.startsWith('pay_')) {
      const lead = await this.prisma.lead.findFirst({
        where: { workspaceId, telegramId: chatId.toString() },
      });
      if (lead && token) {
        // Lock atômico Redis — sobrevive a restarts, sem race condition
        const locked = await this.redis.set(`pix:lock:pay_${chatId}`, '1', 'EX', 15, 'NX');
        if (!locked) return { ok: true };

        const productId = data.replace('pay_', '');
        const product = productId !== 'checkout'
          ? await this.prisma.product.findUnique({ where: { id: productId } })
          : null;
        if (product) {
          const loadingId = await this.sendLoading(token, chatId);
          const charge = await this.pixService.createCharge(workspaceId, lead.id, product.id);
          await this.deleteMsg(token, chatId, loadingId);
          await this.sendPixMessage(token, chatId.toString(), charge, Number(product.price), product.name);
        }
      }
    } else if (data.startsWith('check_')) {
      if (!token) return { ok: true };
      const paymentId = data.slice(6);
      const charge = await this.pixService.getChargeStatus(paymentId);
      const msg = charge.status === 'APPROVED'
        ? '✅ *Pagamento confirmado!* Obrigado pela sua compra.'
        : '⏳ *Pagamento ainda não identificado.* Aguarde alguns segundos e tente novamente.';
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId, text: msg, parse_mode: 'Markdown', protect_content: true,
      });
    } else if (data.startsWith('upsell_acc_')) {
      if (!token) return { ok: true };
      const idx = parseInt(data.slice(11));
      const upsells = await this.getEnabledUpsells(workspaceId);
      const upsell = upsells.find(u => u.idx === idx);
      if (upsell && upsell.price) {
        const amount = parseFloat(String(upsell.price).replace(',', '.'));
        if (amount > 0) {
          const lead = await this.prisma.lead.findFirst({
            where: { workspaceId, telegramId: chatId.toString() },
          });
          if (lead) {
            // Registra o próximo upsell a mostrar quando esse pagamento for aprovado
            // -1 = sentinel "sequência encerrada, silêncio"
            const next = upsells.find(u => u.idx > idx);
            boundedSet(this.upsellProgress, chatId.toString(), next ? next.idx : -1);
            const loadingId = await this.sendLoading(token, chatId);
            const charge = await this.pixService.createChargeByAmount(workspaceId, lead.id, amount);
            await this.deleteMsg(token, chatId, loadingId);
            await this.sendPixMessage(token, chatId.toString(), charge, amount, upsell.title);
          }
        } else {
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text: '✅ Ótima escolha! Em breve entraremos em contato.',
            parse_mode: 'HTML',
            protect_content: true,
          });
        }
      }
    } else if (data.startsWith('upsell_dec_')) {
      if (!token) return { ok: true };
      const idx = parseInt(data.slice(11));
      const upsells = await this.getEnabledUpsells(workspaceId);
      const next = upsells.find(u => u.idx > idx);
      if (next) {
        await this.sendUpsellMessage(token, chatId.toString(), next);
      }
    } else if (data.startsWith('rmkt:')) {
      if (!token) return { ok: true };
      const parts = data.split(':');
      const btnType = parts[1];
      const btnValue = parts.slice(2).join(':');

      if (btnType === 'pix' && btnValue) {
        const lead = await this.prisma.lead.findFirst({
          where: { workspaceId, telegramId: chatId.toString() },
        });
        if (!lead) return { ok: true };
        const loadingId = await this.sendLoading(token, chatId);
        const charge = await this.pixService.createChargeByAmount(workspaceId, lead.id, parseFloat(btnValue));
        await this.deleteMsg(token, chatId, loadingId);
        await this.sendPixMessage(token, chatId.toString(), charge, parseFloat(btnValue));
      } else if (btnType === 'check') {
        const charge = await this.pixService.getChargeStatus(btnValue);
        const msg = charge.status === 'APPROVED'
          ? '✅ *Pagamento confirmado!* Obrigado.'
          : '⏳ *Pagamento ainda não confirmado.* Tente novamente mais tarde.';
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId, text: msg, parse_mode: 'Markdown', protect_content: true,
        });
      }
    }

    return { ok: true };
  }

  // Envia "Gerando PIX..." e retorna o message_id para apagar depois
  private async sendLoading(token: string, chatId: number): Promise<number | null> {
    try {
      const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: '⏳ *Gerando o seu PIX...*',
        parse_mode: 'Markdown',
        protect_content: true,
      });
      return res.data?.result?.message_id ?? null;
    } catch { return null; }
  }

  // Apaga uma mensagem pelo ID
  private async deleteMsg(token: string, chatId: number, msgId: number | null) {
    if (!msgId) return;
    try {
      await axios.post(`https://api.telegram.org/bot${token}/deleteMessage`, {
        chat_id: chatId, message_id: msgId,
      });
    } catch { /* já apagada ou expirada */ }
  }

  // Identifica o bot correto pelo Telegram user ID do bot (campo message.from.id no callback),
  // com fallback para getChat caso o ID do bot não esteja disponível.
  private async findBotToken(
    workspaceId: string,
    chatId: string,
    botTelegramId?: string,
  ): Promise<string | null> {
    const bots = await this.prisma.telegramBot.findMany({
      where: { workspaceId, isActive: true, status: 'ACTIVE' },
    });
    if (!bots.length) return null;

    // Se só houver um bot, usa direto (evita chamada à API do Telegram)
    if (bots.length === 1) {
      try { return decrypt(bots[0].botToken); } catch { return null; }
    }

    // Tenta identificar pelo Telegram user ID do bot (sem chamada de rede)
    if (botTelegramId) {
      for (const bot of bots) {
        try {
          const token = decrypt(bot.botToken);
          // Chama getMe uma vez para saber o ID do bot e comparar
          const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
          if (res.data?.result?.id?.toString() === botTelegramId) return token;
        } catch { }
      }
    }

    // Fallback: descobre qual bot tem acesso ao chat
    for (const bot of bots) {
      try {
        const token = decrypt(bot.botToken);
        const res = await axios.get(`https://api.telegram.org/bot${token}/getChat`, {
          params: { chat_id: chatId },
        });
        if (res.data?.ok) return token;
      } catch { }
    }
    return null;
  }

  // ─── Upsell ──────────────────────────────────────────────────────────────────

  private async getEnabledUpsells(workspaceId: string): Promise<Array<any & { idx: number }>> {
    const flows = await this.prisma.flow.findMany({
      where: { workspaceId, isActive: true },
      include: { bot: true },
    });
    for (const flow of flows) {
      const stored = ((flow.config as any)?.upsells as any[]) || [];
      const enabled = stored
        .map((u, i) => ({ ...u, idx: i, _botToken: flow.bot?.botToken }))
        .filter(u => u.enabled && u.title);
      if (enabled.length > 0) return enabled;
    }
    return [];
  }

  private async sendUpsells(workspaceId: string, leadId: string): Promise<void> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { telegramId: true },
    });
    if (!lead?.telegramId) {
      this.logger.warn(`[Upsell] Lead ${leadId} sem telegramId`);
      return;
    }

    const chatId = lead.telegramId;
    const upsells = await this.getEnabledUpsells(workspaceId);

    // Mensagem de confirmação automática de pagamento
    const botToken = upsells[0]?._botToken ?? await this.getAnyBotToken(workspaceId);
    if (!botToken) {
      this.logger.warn(`[Upsell] Nenhum bot encontrado para workspace=${workspaceId}`);
      return;
    }
    const token = decrypt(botToken);

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: '✅ <b>Pagamento confirmado!</b>\n\nSeu pagamento foi recebido com sucesso. Obrigado!',
      parse_mode: 'HTML',
      protect_content: true,
    });

    if (upsells.length === 0) {
      this.logger.log(`[Upsell] Nenhum upsell configurado para workspace=${workspaceId}`);
      return;
    }

    // Verifica se há um próximo upsell registrado (pagamento de upsell anterior)
    // undefined = primeira compra (nunca aceitou upsell)
    // -1        = último upsell aceito e pago — silêncio
    // N ≥ 0    = mostrar upsell com esse idx
    const pendingNextIdx = this.upsellProgress.get(chatId);
    this.upsellProgress.delete(chatId); // consome o registro

    if (pendingNextIdx === -1) {
      this.logger.log(`[Upsell] Sequência completa → chatId=${chatId}`);
      return;
    }

    let toSend: any;
    if (pendingNextIdx !== undefined) {
      toSend = upsells.find(u => u.idx === pendingNextIdx);
      if (!toSend) {
        this.logger.log(`[Upsell] Sem próximo upsell idx=${pendingNextIdx} → chatId=${chatId}`);
        return;
      }
    } else {
      toSend = upsells[0]; // primeira compra — começa do início
    }

    await this.sendUpsellMessage(token, chatId, toSend);
    this.logger.log(`[Upsell] Enviado upsell #${toSend.idx + 1} → chatId=${chatId}`);
  }

  private async getAnyBotToken(workspaceId: string): Promise<string | null> {
    const bot = await this.prisma.telegramBot.findFirst({
      where: { workspaceId, isActive: true, status: 'ACTIVE' },
      select: { botToken: true },
    });
    return bot?.botToken ?? null;
  }

  private async sendUpsellMessage(token: string, chatId: string, upsell: any): Promise<void> {
    const parts: string[] = [];
    if (upsell.title)       parts.push(`<b>🎯 ${upsell.title}</b>`);
    if (upsell.description) parts.push(upsell.description);
    if (upsell.price)       parts.push(`\n💰 <b>Por apenas R$ ${upsell.price}</b>`);
    const text = parts.join('\n\n') || '🎯 Oferta especial para você!';

    const keyboard = [[
      { text: upsell.acceptText  || '✅ Sim, quero!',   callback_data: `upsell_acc_${upsell.idx}` },
      { text: upsell.declineText || '❌ Não, obrigado', callback_data: `upsell_dec_${upsell.idx}` },
    ]];

    const hasMedia = upsell.mediaType === 'image' || upsell.mediaType === 'video';
    const media    = upsell.mediaUrl || upsell.mediaData;

    if (hasMedia && media) {
      const isBase64 = media.startsWith('data:');
      try {
        await sendTelegramMedia({
          botToken: token, chatId,
          type:     upsell.mediaType === 'image' ? 'photo' : 'video',
          fileUrl:  !isBase64 ? media   : undefined,
          fileData:  isBase64 ? media   : undefined,
          caption:  text,
          replyMarkup: { inline_keyboard: keyboard },
        });
        return;
      } catch (e: any) {
        this.logger.warn(`[Upsell] Mídia falhou — enviando texto puro. Detalhe: ${e.message}`);
        // Fallthrough → envia texto
      }
    }

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId, text, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
      protect_content: true,
    }, { timeout: 15_000 });
  }

  async processPixWebhook(workspaceId: string, body: any, _signature: string) {
    const result = await this.pixService.processWebhook(body);
    if (result?.newStatus === 'APPROVED') {
      this.sendUpsells(result.workspaceId, result.leadId).catch((err) => {
        this.logger.error(`[Upsell] Falha ao disparar upsell: ${err?.message}`);
      });
    }
    return { received: true };
  }

  async processUtmifyWebhook(workspaceId: string, body: any) {
    this.logger.log(`UTMify webhook received: ${JSON.stringify(body)}`);
    return { received: true };
  }
}
