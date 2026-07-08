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
import { resolvePrecacheDelay, isFlowPrecacheComplete, resolvePrecacheDelayFromCompleteness } from '../../common/media-precache';

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

  async processTelegramWebhook(id: string, body: any) {
    try {
      // Tenta interpretar `id` como botId primeiro (novo padrão)
      // Se não encontrar, trata como workspaceId (retrocompatível com bots antigos)
      let workspaceId = id;
      let resolvedBotId: string | null = null;

      const bot = await this.prisma.telegramBot.findUnique({
        where: { id },
        select: { workspaceId: true, id: true },
      });
      if (bot) {
        workspaceId   = bot.workspaceId;
        resolvedBotId = bot.id;
      }

      const { message, callback_query } = body;
      if (callback_query) return await this.handleCallbackQuery(workspaceId, callback_query, resolvedBotId);
      if (message)        return await this.handleMessage(workspaceId, message, resolvedBotId);
      return { ok: true };
    } catch (err: any) {
      const detail = err?.response?.data ? JSON.stringify(err.response.data) : '';
      this.logger.error(`[Webhook] Erro não tratado: ${err?.message} ${detail}`);
      return { ok: true }; // Sempre retorna 200 para o Telegram não retentar
    }
  }

  private async handleMessage(workspaceId: string, message: any, botId: string | null = null) {
    const chatId = message.chat.id;
    const text = message.text || '';
    const from = message.from;

    // Busca lead específico deste bot primeiro (novo padrão por botId)
    // Se não existir, fallback ao lead geral do workspace (retrocompatível)
    let lead = botId
      ? await this.prisma.lead.findFirst({
          where: { workspaceId, telegramId: chatId.toString(), botId } as any,
        })
      : null;

    if (!lead) {
      lead = await this.prisma.lead.findFirst({
        where: { workspaceId, telegramId: chatId.toString() },
      });
    }

    // Se o lead encontrado pertence a outro bot, cria um novo lead para este bot
    if (lead && botId && (lead as any).botId && (lead as any).botId !== botId) {
      const existing = await this.prisma.lead.findFirst({
        where: { workspaceId, telegramId: chatId.toString(), botId } as any,
      });
      if (!existing) {
        lead = await this.prisma.lead.create({
          data: {
            workspaceId,
            leadUid: generateLeadUid(),
            telegramId: chatId.toString(),
            name: `${from.first_name || ''} ${from.last_name || ''}`.trim(),
            username: from.username,
            botId,
          } as any,
        });
      } else {
        lead = existing;
      }
    }

    if (!lead) {
      lead = await this.prisma.lead.create({
        data: {
          workspaceId,
          leadUid: generateLeadUid(),
          telegramId: chatId.toString(),
          name: `${from.first_name || ''} ${from.last_name || ''}`.trim(),
          username: from.username,
          ...(botId ? { botId } : {}),
        } as any,
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

    // Deep link especial (QR code na tela de Robôs) — registra esse chat como o
    // "chat de aquecimento" do bot, usado pra pré-cache proativo de mídia. Não
    // entra em nenhum fluxo normal, é um beco sem saída intencional.
    if (startPayload === 'cachewarmup') {
      if (botId) {
        const bot = await this.prisma.telegramBot.findUnique({ where: { id: botId }, select: { botToken: true } });
        if (bot?.botToken) {
          const warmupToken = decrypt(bot.botToken);
          await this.prisma.telegramBot.update({ where: { id: botId }, data: { warmupChatId: chatId.toString() } });
          await axios.post(`https://api.telegram.org/bot${warmupToken}/sendMessage`, {
            chat_id: chatId,
            text: '✅ Chat de aquecimento configurado! A partir de agora, toda mídia nova é testada aqui automaticamente antes de qualquer envio real. Pode fechar esta conversa quando quiser.',
            parse_mode: 'HTML',
            protect_content: true,
          });
        }
      }
      return { ok: true };
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

        // Vincular chat_id e bot_started_at ao registro de tracking, e copiar as UTMs
        // pro Tracking do lead (é o que a tela de Vendas exibe) — fire and forget,
        // não interfere no envio de UTM pro Facebook CAPI/UTMify (que já funciona
        // via outro caminho e não é tocado aqui).
        if (trackingId) {
          (async () => {
            const ut = await (this.prisma as any).userTracking.update({
              where: { id: trackingId },
              data: { chatId: chatId.toString(), botStartedAt: new Date() },
            });
            if (ut.utmSource || ut.utmMedium || ut.utmCampaign || ut.utmContent || ut.utmTerm || ut.fbclid || ut.ttclid || ut.kwaiId) {
              await this.prisma.tracking.upsert({
                where: { leadId: lead.id },
                create: {
                  leadId: lead.id,
                  utmSource: ut.utmSource, utmMedium: ut.utmMedium, utmCampaign: ut.utmCampaign,
                  utmContent: ut.utmContent, utmTerm: ut.utmTerm,
                  fbclid: ut.fbclid, ttclid: ut.ttclid, kwaiClickid: ut.kwaiId,
                },
                update: {
                  utmSource: ut.utmSource, utmMedium: ut.utmMedium, utmCampaign: ut.utmCampaign,
                  utmContent: ut.utmContent, utmTerm: ut.utmTerm,
                  fbclid: ut.fbclid, ttclid: ut.ttclid, kwaiClickid: ut.kwaiId,
                },
              });
            }
          })().catch(() => {});
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
      // Prefere o fluxo do bot específico (quando botId é conhecido)
      if (botId) {
        activeFlow = await this.prisma.flow.findFirst({
          where: { workspaceId, isActive: true, trigger: 'start', botId } as any,
          include: { bot: true },
        });
      }
      // Fallback: qualquer fluxo ativo no workspace (retrocompatível)
      if (!activeFlow) {
        activeFlow = await this.prisma.flow.findFirst({
          where: { workspaceId, isActive: true, trigger: 'start' },
          include: { bot: true },
        });
      }
    }

    if (activeFlow) {
      const botToken = activeFlow.bot?.botToken;
      if (botToken) {
        // Salvar botId no lead na primeira vez (para atribuição de pixel CAPI e upsell)
        if (activeFlow.bot?.id && !(lead as any).botId) {
          this.prisma.lead.update({
            where: { id: lead.id },
            data: { botId: activeFlow.bot.id } as any,
          }).catch((e: any) => this.logger.warn(`[Lead] Falha ao salvar botId no lead ${lead.id}: ${e.message}`));
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

    // Aviso de pré-cache: só no início do funil (não em continuações/esperas), só
    // pra bots novos, e só enquanto ainda faltar mídia pra cachear.
    if (flow.bot?.precacheEnabled && !isFlowPrecacheComplete(flow, (flow as any).botId)) {
      await this.sendPrecacheNotice(botToken, chatId).catch(() => {});
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
    // Prefere lead do bot específico do fluxo
    const flowBotId = (flow as any).botId ?? null;
    let lead = flowBotId
      ? await this.prisma.lead.findFirst({
          where: { telegramId: chatId, workspaceId: flow.workspaceId, botId: flowBotId } as any,
        })
      : null;
    if (!lead) {
      lead = await this.prisma.lead.findFirst({
        where: { telegramId: chatId, workspaceId: flow.workspaceId },
      });
    }
    if (lead) {
      await this.scheduleRemarketing(flow, botToken, chatId, lead.id);
    }
  }

  // Aviso enviado uma vez, antes de qualquer mídia, só quando o funil ainda está no
  // modo de aquecimento de cache (bot novo + mídia ainda não cacheada pro Telegram).
  private async sendPrecacheNotice(token: string, chatId: string): Promise<void> {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: '🔄 Estamos verificando as mídias deste conteúdo junto ao Telegram. Por isso, você vai receber as próximas mensagens em sequência agora.',
      parse_mode: 'HTML',
      protect_content: true,
    });
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
    const effectiveDelayMs = resolvePrecacheDelay(flow, flow.botId, flow.bot?.precacheEnabled, delayMs);
    await this.scheduledQueue.add(
      'continue-flow',
      { flowId: flow.id, chatId, fromNodeId: node.id, skipWaitBefore: true, botIdOverride: flow.botId ?? undefined },
      { delay: effectiveDelayMs, attempts: 2 },
    );
  }

  // Resolve qual bot/token usar para entregar pra esse chatId: o botIdOverride (ex.: bot de
  // origem do lead, num disparo de remarketing) tem prioridade sobre o bot fixo do fluxo.
  // effectiveFlow é um clone raso do flow só com .botId trocado — assim execImage/execVideo
  // (cache de mídia) e o agendamento de remarketing ao fim do fluxo já usam o bot certo
  // automaticamente, sem precisar mudar mais nada.
  private async resolveExecutionBot(
    flow: any, botIdOverride?: string,
  ): Promise<{ botToken: string; effectiveFlow: any } | null> {
    if (botIdOverride && botIdOverride !== flow.botId) {
      const overrideBot = await this.prisma.telegramBot.findUnique({ where: { id: botIdOverride } });
      if (!overrideBot?.botToken) return null;
      // bot também é trocado no effectiveFlow — garante que checagens que dependem
      // do bot (ex.: precacheEnabled) usem o bot que de fato entrega a mensagem.
      return { botToken: decrypt(overrideBot.botToken), effectiveFlow: { ...flow, botId: botIdOverride, bot: overrideBot } };
    }
    if (!flow.bot?.botToken) return null;
    return { botToken: decrypt(flow.bot.botToken), effectiveFlow: flow };
  }

  // Retoma a execução do fluxo a partir de um nodeId específico (usado pelo ScheduledTasksProcessor)
  async continueFlowFrom(flowId: string, chatId: string, fromNodeId: string, botIdOverride?: string): Promise<void> {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId }, include: { bot: true } });
    if (!flow?.isActive) return;
    const resolved = await this.resolveExecutionBot(flow, botIdOverride);
    if (!resolved) return;
    const { botToken, effectiveFlow } = resolved;
    await this.continueFlow(botToken, chatId, fromNodeId, effectiveFlow.nodes as any[], effectiveFlow.edges as any[], effectiveFlow);
  }

  // Executa um nó específico ignorando seu waitBefore (já aguardamos), depois continua.
  // broadcastId, quando presente (disparo do Remarketing Master), faz o primeiro nó
  // propagar erro de envio em vez de engolir, para registrar sent/failed no progresso.
  // botIdOverride entrega pelo bot de origem do lead em vez do bot fixo do fluxo.
  async executeFlowNodeDirect(flowId: string, chatId: string, nodeId: string, broadcastId?: string, botIdOverride?: string): Promise<void> {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId }, include: { bot: true } });
    if (!flow?.isActive) {
      if (broadcastId) await this.recordBroadcastOutcome(broadcastId, false);
      return;
    }
    const resolved = await this.resolveExecutionBot(flow, botIdOverride);
    if (!resolved) {
      if (broadcastId) await this.recordBroadcastOutcome(broadcastId, false);
      return;
    }
    const { botToken, effectiveFlow } = resolved;
    const nodes = effectiveFlow.nodes as any[];
    const edges = effectiveFlow.edges as any[];
    const node = nodes.find((n: any) => n.id === nodeId);
    if (!node) {
      if (broadcastId) await this.recordBroadcastOutcome(broadcastId, false);
      return;
    }

    let nextId: string | 'DELAYED' | null;
    if (broadcastId) {
      try {
        nextId = await this.runNode(node, botToken, chatId, nodes, edges, effectiveFlow);
        await this.recordBroadcastOutcome(broadcastId, true);
      } catch (err) {
        this.logger.error(`[Broadcast] Falha ao entregar chatId=${chatId}: ${err.message}`);
        await this.recordBroadcastOutcome(broadcastId, false);
        return;
      }
    } else {
      nextId = await this.executeNode(node, botToken, chatId, nodes, edges, effectiveFlow);
    }

    if (nextId && nextId !== 'DELAYED') {
      await this.continueFlow(botToken, chatId, nextId, nodes, edges, effectiveFlow);
    }
  }

  private async recordBroadcastOutcome(broadcastId: string, success: boolean) {
    try {
      const field = success ? 'sent' : 'failed';
      const updated = await this.prisma.remarketingBroadcast.update({
        where: { id: broadcastId },
        data:  { [field]: { increment: 1 } },
      });
      if (updated.status === 'RUNNING' && updated.sent + updated.failed >= updated.total) {
        await this.prisma.remarketingBroadcast.update({
          where: { id: broadcastId },
          data:  { status: 'DONE', finishedAt: new Date() },
        });
      }
    } catch (err) {
      this.logger.error(`[Broadcast] Falha ao atualizar contador broadcastId=${broadcastId}: ${err.message}`);
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
      return await this.runNode(node, botToken, chatId, nodes, edges, flow);
    } catch (err) {
      this.logger.error(`Failed to execute node ${node.id}: ${err.message}`);
      return null;
    }
  }

  // Mesma lógica de executeNode, mas propaga o erro em vez de engolir —
  // usado pelo caminho de broadcast, que precisa saber se a entrega falhou.
  private async runNode(
    node: any, botToken: string, chatId: string,
    nodes: any[], edges: any[],
    flow?: any,
  ): Promise<string | 'DELAYED' | null> {
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
      // Merge atômico via jsonb — evita "leitura-modificação-escrita" perdendo update
      // quando duas mídias do mesmo fluxo terminam o upload quase ao mesmo tempo
      // (comum justamente durante o modo de pré-cache, com vários leads em paralelo).
      await this.prisma.$executeRaw`
        UPDATE "Flow"
        SET config = jsonb_set(
          COALESCE(config, '{}'::jsonb),
          '{mediaCache}',
          COALESCE(config->'mediaCache', '{}'::jsonb) || jsonb_build_object(${key}, jsonb_build_object('fileId', ${fileId}, 'botId', ${botId}))
        )
        WHERE id = ${flowId}
      `;
    } catch (e: any) {
      this.logger.warn(`saveMediaCache falhou (key=${key}): ${e.message}`);
    }
  }

  private async execImage(node: any, token: string, chatId: string, flow?: any) {
    const fileUrl  = node.data?.fileUrl  || undefined;
    const fileData = node.data?.fileData || undefined;

    const botId    = flow?.botId as string | undefined;
    // Chave por bot: evita que bots diferentes (ex.: disparo de remarketing roteado
    // por lead) fiquem se sobrescrevendo no mesmo slot de cache do nó.
    const cacheKey = botId ? `${node.id}:${botId}` : node.id;
    const cached   = flow?.config?.mediaCache?.[cacheKey];
    const cachedId = (cached && botId && cached.botId === botId) ? cached.fileId as string : undefined;

    if (!fileUrl && !fileData && !cachedId) return;

    const { messageId, fileId: newId } = await sendTelegramMedia({
      botToken: token, chatId, type: 'photo',
      fileId:   cachedId,
      fileUrl,
      fileData,
      caption:  node.data?.caption || undefined,
    });

    // Atualiza cache se veio um file_id novo (upload ou cache-miss)
    if (newId && flow?.id && botId) this.saveMediaCache(flow.id, cacheKey, newId, botId).catch(() => {});

    await this.scheduleMessageDeletion(token, chatId, messageId);
  }

  private async execVideo(node: any, token: string, chatId: string, flow?: any) {
    const fileUrl  = node.data?.fileUrl  || undefined;
    const fileData = node.data?.fileData || undefined;

    const botId    = flow?.botId as string | undefined;
    const cacheKey = botId ? `${node.id}:${botId}` : node.id;
    const cached   = flow?.config?.mediaCache?.[cacheKey];
    const cachedId = (cached && botId && cached.botId === botId) ? cached.fileId as string : undefined;

    if (!fileUrl && !fileData && !cachedId) return;

    const { messageId, fileId: newId } = await sendTelegramMedia({
      botToken: token, chatId, type: 'video',
      fileId:   cachedId,
      fileUrl,
      fileData,
      caption:  node.data?.caption || undefined,
    });

    if (newId && flow?.id && botId) this.saveMediaCache(flow.id, cacheKey, newId, botId).catch(() => {});

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
      const effectiveDelayMs = resolvePrecacheDelay(flow, flow.botId, flow.bot?.precacheEnabled, delayMs);
      await this.scheduledQueue.add(
        'continue-flow',
        { flowId: flow.id, chatId, fromNodeId: nextId, botIdOverride: flow.botId ?? undefined },
        { delay: effectiveDelayMs, attempts: 2 },
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
      const effectiveDelayMs = resolvePrecacheDelay(flow, flow.botId, flow.bot?.precacheEnabled, delayMs);
      await this.scheduledQueue.add(
        'continue-flow',
        { flowId: flow.id, chatId, fromNodeId: nextId, botIdOverride: flow.botId ?? undefined },
        { delay: effectiveDelayMs, attempts: 2 },
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

    // formato novo: pix_id:<nodeId>:<índice> — permite achar a opção exata
    // (e o entregável configurado nela) no momento da aprovação do pagamento.
    // Botões já enviados antes desse formato existir continuam no formato
    // antigo (pix_VALOR|LABEL) e seguem funcionando via handleCallbackQuery.
    const rows = options.map((opt, idx) => ([{
      text: `${opt.label} — R$ ${Number(opt.value || 0).toFixed(2)}`,
      callback_data: `pix_id:${node.id}:${idx}`,
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
    }, { ...PIX_JOB_OPTS, delay: 5 * 60 * 1000, jobId: `pixr1-${charge.id}` });

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
    }, { ...PIX_JOB_OPTS, delay: 10 * 60 * 1000, jobId: `pixr2-${charge.id}` });

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

  private async scheduleRemarketing(flow: any, _botToken: string, chatId: string, leadId: string) {
    const flowCfg = flow.config as any;

    // ── Novo caminho: array de slots (flow.config.remarketings) ──────────────
    if (Array.isArray(flowCfg?.remarketings)) {
      return this.scheduleRemarketingMulti(flow, chatId, leadId, flowCfg.remarketings);
    }

    // ── Caminho legado: objeto único (flow.config.remarketing) ───────────────
    const cfg = flowCfg?.remarketing as {
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

    const MAX_REMARKETING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

    const firstDelayMs = (cfg.firstDelay || 30) * 60 * 1000;
    const intervalMs   = (cfg.interval   || 5)  * 3600 * 1000;
    const stopAfterMs  = (cfg.stopAfter  || 3)  * 86400 * 1000;

    if (!assertNoClockDrift('scheduleRemarketing', this.logger)) return;

    if (firstDelayMs >= MAX_REMARKETING_WINDOW_MS) {
      this.logger.warn(`Remarketing: firstDelay (${Math.round(firstDelayMs / 3600000)}h) excede janela de 7 dias → abortando lead=${leadId}`);
      return;
    }

    const maxSendsByWindow = Math.floor((MAX_REMARKETING_WINDOW_MS - firstDelayMs) / intervalMs) + 1;
    const maxSends = Math.min(
      Math.floor((stopAfterMs - firstDelayMs) / intervalMs) + 1,
      maxSendsByWindow,
    );
    if (maxSends < 1) return;

    const firstJobId = `rmkt-${flow.id}-${leadId}-0`;
    try {
      const existing = await this.remarketingQueue.getJob(firstJobId);
      if (existing) {
        this.logger.log(`Remarketing já agendado para lead=${leadId} flow=${flow.id} — ignorando duplicata`);
        return;
      }
    } catch { /* se falhar a verificação, agenda normalmente */ }

    this.logger.log(`Agendando remarketing em cadeia (${maxSends} disparos) para lead=${leadId} flow=${flow.id}`);

    // Enquanto a mídia desse remarketing ainda não tiver file_id cacheado (só bots
    // novos, precacheEnabled=true), comprime o primeiro disparo pra aquecer rápido —
    // evita que centenas/milhares de leads acumulem esperando o mesmo upload pesado.
    const hasMedia = cfg.mediaType === 'image' || cfg.mediaType === 'video';
    const isCacheComplete = !hasMedia || ((cfg as any).cachedBotId === flow.botId && !!(cfg as any).cachedFileId);
    const effectiveFirstDelayMs = resolvePrecacheDelayFromCompleteness(flow.bot?.precacheEnabled, isCacheComplete, firstDelayMs);

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
        delay: effectiveFirstDelayMs,
        jobId: firstJobId,
      },
    );
  }

  // ─── Multi-slot: agenda o primeiro slot habilitado ────────────────────────
  private async scheduleRemarketingMulti(
    flow: any, chatId: string, leadId: string, slots: any[],
  ): Promise<void> {
    const firstIdx = slots.findIndex(s => s?.enabled && (s.content || (s.mediaType && s.mediaType !== 'none') || s.buttons?.length));
    if (firstIdx === -1) return;

    const firstSlot    = slots[firstIdx];
    const firstDelayMs = (firstSlot.firstDelay || 30) * 60 * 1000;

    if (!assertNoClockDrift('scheduleRemarketingMulti', this.logger)) return;

    // Deduplicação: inclui flowId para que fluxos duplicados agendem independentemente
    const firstJobId = `rmkt-${flow.id}-${leadId}-s${firstIdx}-0`;
    try {
      const existing = await this.remarketingQueue.getJob(firstJobId);
      if (existing) {
        this.logger.log(`Remarketing multi já agendado para lead=${leadId} flow=${flow.id} — ignorando duplicata`);
        return;
      }
    } catch { /* se falhar a verificação, agenda normalmente */ }

    const totalEnabled = slots.filter(s => s?.enabled && (s.content || (s.mediaType && s.mediaType !== 'none') || s.buttons?.length)).length;
    this.logger.log(`Agendando remarketing multi (${totalEnabled} slot(s)) para lead=${leadId} flow=${flow.id}`);

    // Mesma lógica da cadeia legada: comprime o primeiro disparo enquanto a mídia
    // desse slot ainda não tiver file_id cacheado (só bots novos, precacheEnabled=true).
    const firstHasMedia = firstSlot.mediaType === 'image' || firstSlot.mediaType === 'video';
    const isCacheComplete = !firstHasMedia || (firstSlot.cachedBotId === flow.botId && !!firstSlot.cachedFileId);
    const effectiveFirstDelayMs = resolvePrecacheDelayFromCompleteness(flow.bot?.precacheEnabled, isCacheComplete, firstDelayMs);

    await this.remarketingQueue.add(
      'remarketing-send',
      {
        chatId, leadId, flowId: flow.id,
        slotIndex: firstIdx, slotSendIndex: 0,
        slotTotalSends: 1, slotIntervalMs: 0,
      },
      { delay: effectiveFirstDelayMs, jobId: firstJobId },
    );
  }

  private async handleCallbackQuery(workspaceId: string, callbackQuery: any, botId: string | null = null) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;

    // Identificar o bot correto: usa botId resolvido pelo webhook ou fallback por botTelegramId
    const botTelegramId: string | undefined = callbackQuery.message?.from?.id?.toString();
    const token = botId
      ? await (async () => {
          const b = await this.prisma.telegramBot.findUnique({ where: { id: botId }, select: { botToken: true } });
          try { return b ? decrypt(b.botToken) : null; } catch { return null; }
        })()
      : await this.findBotToken(workspaceId, chatId.toString(), botTelegramId);

    // Responde ao Telegram imediatamente — remove o spinner do botão e impede reenvio automático
    if (token) {
      axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
      }).catch(() => {});
    }

    // Helper: busca o lead correto para este callback (prefere lead do bot específico)
    const resolveLead = async () => {
      if (botId) {
        const botLead = await this.prisma.lead.findFirst({
          where: { workspaceId, telegramId: chatId.toString(), botId } as any,
        });
        if (botLead) return botLead;
      }
      return this.prisma.lead.findFirst({
        where: { workspaceId, telegramId: chatId.toString() },
      });
    };

    if (data.startsWith('pix_')) {
      const raw = data.slice(4);
      let amount: number | undefined;
      let planLabel: string | undefined;
      let deliverable: { enabled: boolean; message: string; delayMinutes: number } | undefined;

      if (raw.startsWith('id:')) {
        // formato novo: pix_id:<nodeId>:<índice da opção> — resolve valor/label/
        // entregável a partir do fluxo atual, em vez de confiar no cliente.
        const rest = raw.slice(3);
        const lastColon = rest.lastIndexOf(':');
        const nodeId = lastColon >= 0 ? rest.slice(0, lastColon) : rest;
        const optIdx = lastColon >= 0 ? parseInt(rest.slice(lastColon + 1), 10) : NaN;

        const leadForFlow = await resolveLead();
        if (leadForFlow?.botId && !isNaN(optIdx)) {
          const flow = await this.prisma.flow.findFirst({
            where: { botId: leadForFlow.botId, isActive: true } as any,
          });
          const node = (flow?.nodes as any[])?.find((n: any) => n.id === nodeId);
          const opt = node?.data?.pixOptions?.[optIdx];
          if (opt) {
            amount = Number(opt.value);
            planLabel = opt.label;
            if (opt.deliverable?.enabled && opt.deliverable?.message) {
              deliverable = opt.deliverable;
            }
          }
        }
      } else {
        // formato antigo: pix_VALOR|LABEL — botões já enviados antes desse
        // recurso existir continuam funcionando, só sem entregável (não tem
        // como saber qual opção era).
        const sep = raw.indexOf('|');
        const amountStr = sep >= 0 ? raw.slice(0, sep) : raw;
        amount = parseFloat(amountStr);
        planLabel = sep >= 0 ? raw.slice(sep + 1) : undefined;
      }

      if (amount !== undefined && !isNaN(amount) && amount > 0 && token) {
        // Lock atômico Redis — sobrevive a restarts, sem race condition
        const locked = await this.redis.set(`pix:lock:pix_${chatId}`, '1', 'EX', 15, 'NX');
        if (!locked) return { ok: true };

        const lead = await resolveLead();
        if (lead) {
          const loadingId = await this.sendLoading(token, chatId);
          try {
            const charge = await this.pixService.createChargeByAmount(workspaceId, lead.id, amount, deliverable);
            await this.deleteMsg(token, chatId, loadingId);
            await this.sendPixMessage(token, chatId.toString(), charge, amount, planLabel);
          } catch (err: any) {
            await this.deleteMsg(token, chatId, loadingId);
            this.logger.error(`PIX: erro ao criar cobrança para lead ${lead.id}: ${err?.message}`);
          }
        }
      }
    } else if (data.startsWith('pay_')) {
      const lead = await resolveLead();
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
      if (charge.status === 'APPROVED') {
        // Tenta disparar upsells (deduplicado por Redis — só roda uma vez por pagamento)
        const lockKey = `upsell:done:${paymentId}`;
        const isFirst = await this.redis.set(lockKey, '1', 'EX', 7 * 24 * 3600, 'NX');
        if (isFirst) {
          // Webhook falhou ou não chegou — dispara agora via botão manual
          const payment = await this.prisma.payment.findUnique({
            where:   { id: paymentId },
            include: { lead: { select: { workspaceId: true } } },
          });
          if (payment) {
            this.sendUpsells((payment as any).lead.workspaceId, payment.leadId).catch(async () => {
              await this.redis.del(lockKey).catch(() => {});
            });
          }
        } else {
          // Upsells já enviados via webhook — apenas confirma para o usuário
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text: '✅ *Pagamento confirmado!* Obrigado pela sua compra.', parse_mode: 'Markdown', protect_content: true,
          });
        }
        this.dispatchDeliverable(paymentId).catch(() => {});
      } else {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId, text: '⏳ *Pagamento ainda não identificado.* Aguarde alguns segundos e tente novamente.', parse_mode: 'Markdown', protect_content: true,
        });
      }
    } else if (data.startsWith('upsell_acc_')) {
      if (!token) return { ok: true };
      const idx = parseInt(data.slice(11));
      const upsells = await this.getEnabledUpsells(workspaceId);
      const upsell = upsells.find(u => u.idx === idx);
      if (upsell && upsell.price) {
        const amount = parseFloat(String(upsell.price).replace(',', '.'));
        if (amount > 0) {
          const lead = await resolveLead();
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
        let upsellCtx: { flowId: string; botId: string; precacheEnabled: boolean } | undefined;
        if (next.flowId && botId) {
          const sendingBot = await this.prisma.telegramBot.findUnique({
            where: { id: botId }, select: { precacheEnabled: true },
          });
          upsellCtx = { flowId: next.flowId, botId, precacheEnabled: !!sendingBot?.precacheEnabled };
        }
        await this.sendUpsellMessage(token, chatId.toString(), next, upsellCtx);
      }
    } else if (data.startsWith('rmkt:')) {
      if (!token) return { ok: true };
      const parts = data.split(':');
      const btnType = parts[1];
      const btnValue = parts.slice(2).join(':');

      if (btnType === 'pix' && btnValue) {
        const lead = await resolveLead();
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

  private async getEnabledUpsells(workspaceId: string, preferBotId?: string | null): Promise<Array<any & { idx: number }>> {
    const flows = await this.prisma.flow.findMany({
      where: { workspaceId, isActive: true },
      include: { bot: true },
    });

    // Tenta primeiro o flow do bot preferido (bot com que o usuário interagiu)
    if (preferBotId) {
      for (const flow of flows) {
        if ((flow as any).botId !== preferBotId) continue;
        const stored = ((flow.config as any)?.upsells as any[]) || [];
        const enabled = stored
          .map((u, i) => ({ ...u, idx: i, flowId: flow.id, _botToken: flow.bot?.botToken }))
          .filter(u => u.enabled && u.title);
        if (enabled.length > 0) return enabled;
      }
    }

    // Fallback: qualquer flow com upsells habilitados
    for (const flow of flows) {
      const stored = ((flow.config as any)?.upsells as any[]) || [];
      const enabled = stored
        .map((u, i) => ({ ...u, idx: i, flowId: flow.id, _botToken: flow.bot?.botToken }))
        .filter(u => u.enabled && u.title);
      if (enabled.length > 0) return enabled;
    }
    return [];
  }

  // Dispara o entregável configurado (se houver) na opção de PIX que gerou esse
  // pagamento — independente de upsell/remarketing, não altera nada deles.
  // Sem entregável configurado, sai no primeiro if sem nenhum efeito.
  private async dispatchDeliverable(paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { lead: { include: { bot: true } } },
    });
    const deliverable = (payment?.metadata as any)?.deliverable;
    if (!deliverable?.enabled || !deliverable.message || !(payment as any)?.lead?.bot) return;
    if (!assertNoClockDrift('dispatchDeliverable', this.logger)) return;

    const token = decrypt((payment as any).lead.bot.botToken);
    await this.msgQueue.add('send-deliverable', {
      token,
      chatId: (payment as any).lead.telegramId,
      paymentId,
      message: deliverable.message,
    }, { ...PIX_JOB_OPTS, delay: (deliverable.delayMinutes || 0) * 60_000, jobId: `deliv-${paymentId}` });
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

    // botId não está no schema Prisma — busca via raw para identificar o bot que o usuário iniciou
    const [leadExtra] = await this.prisma.$queryRaw<Array<{ botId: string | null }>>`
      SELECT "botId" FROM "Lead" WHERE id = ${leadId} LIMIT 1
    `;
    const leadBotId = leadExtra?.botId ?? null;

    // Upsells priorizados do bot que o usuário iniciou
    const upsells = await this.getEnabledUpsells(workspaceId, leadBotId);

    // Token: usa o bot do lead (mais seguro — usuário já o iniciou), depois qualquer bot ativo
    let botToken: string | null = null;
    if (leadBotId) {
      const leadBot = await this.prisma.telegramBot.findUnique({
        where: { id: leadBotId },
        select: { botToken: true },
      });
      botToken = leadBot?.botToken ?? null;
    }
    if (!botToken) {
      botToken = upsells[0]?._botToken ?? await this.getAnyBotToken(workspaceId);
    }

    if (!botToken) {
      this.logger.warn(`[Upsell] Nenhum bot encontrado para workspace=${workspaceId} lead=${leadId}`);
      return;
    }
    const token = decrypt(botToken);

    this.logger.log(`[Upsell] Enviando confirmação → chatId=${chatId} botId=${leadBotId ?? 'fallback'}`);

    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: '✅ <b>Pagamento confirmado!</b>\n\nSeu pagamento foi recebido com sucesso. Obrigado!',
        parse_mode: 'HTML',
        protect_content: true,
      });
    } catch (e: any) {
      const detail = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
      this.logger.error(`[Upsell] Falha na confirmação chatId=${chatId}: ${detail}`);
      throw e; // propaga para o .catch() do caller
    }

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

    // Cache de mídia do upsell é gateado pelo bot que de fato entrega a mensagem
    // (leadBotId), não pelo bot "dono" do flow de onde veio a config do upsell —
    // podem divergir no fallback pra "qualquer flow com upsell habilitado".
    let upsellCtx: { flowId: string; botId: string; precacheEnabled: boolean } | undefined;
    if (toSend.flowId && leadBotId) {
      const sendingBot = await this.prisma.telegramBot.findUnique({
        where: { id: leadBotId }, select: { precacheEnabled: true },
      });
      upsellCtx = { flowId: toSend.flowId, botId: leadBotId, precacheEnabled: !!sendingBot?.precacheEnabled };
    }

    await this.sendUpsellMessage(token, chatId, toSend, upsellCtx);
    this.logger.log(`[Upsell] Enviado upsell #${toSend.idx + 1} → chatId=${chatId}`);
  }

  private async getAnyBotToken(workspaceId: string): Promise<string | null> {
    const bot = await this.prisma.telegramBot.findFirst({
      where: { workspaceId, isActive: true, status: 'ACTIVE' },
      select: { botToken: true },
    });
    return bot?.botToken ?? null;
  }

  private async sendUpsellMessage(
    token: string, chatId: string, upsell: any,
    ctx?: { flowId: string; botId: string; precacheEnabled: boolean },
  ): Promise<void> {
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

      // Telegram limita caption a 1024 chars.
      // Se o texto completo cabe → usa como caption.
      // Se não cabe → usa caption curta (título+preço) + envia descrição separada com os botões.
      const CAPTION_LIMIT = 1024;
      const textFitsInCaption = text.length <= CAPTION_LIMIT;

      const shortCaption = (() => {
        const p: string[] = [];
        if (upsell.title) p.push(`<b>🎯 ${upsell.title}</b>`);
        if (upsell.price) p.push(`💰 <b>R$ ${upsell.price}</b>`);
        return p.join('\n') || '🎯 Oferta especial!';
      })();

      const caption = textFitsInCaption ? text : shortCaption;

      // Cache de file_id do upsell — só pra bots novos (precacheEnabled). Reaproveita
      // o mesmo dicionário mediaCache do fluxo principal, com prefixo pra não colidir
      // com chaves de nó do fluxo.
      const cacheKey = ctx ? `upsell:${upsell.idx}:${ctx.botId}` : undefined;
      let cachedId: string | undefined;
      if (cacheKey && ctx?.precacheEnabled) {
        const flowRow = await this.prisma.flow.findUnique({ where: { id: ctx.flowId }, select: { config: true } });
        const cached = (flowRow?.config as any)?.mediaCache?.[cacheKey];
        if (cached?.botId === ctx.botId) cachedId = cached.fileId;
      }

      try {
        const { fileId: newId } = await sendTelegramMedia({
          botToken: token, chatId,
          type:     upsell.mediaType === 'image' ? 'photo' : 'video',
          fileId:   cachedId,
          fileUrl:  !isBase64 ? media   : undefined,
          fileData:  isBase64 ? media   : undefined,
          caption,
          // Quando texto não cabe na caption, os botões vão na mensagem de texto separada
          replyMarkup: textFitsInCaption ? { inline_keyboard: keyboard } : undefined,
        });

        if (newId && cacheKey && ctx) this.saveMediaCache(ctx.flowId, cacheKey, newId, ctx.botId).catch(() => {});

        // Descrição não coube na caption → envia texto completo com botões
        if (!textFitsInCaption) {
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
            protect_content: true,
          }, { timeout: 15_000 });
        }
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
    if (result?.newStatus === 'APPROVED' && result.paymentId) {
      const lockKey = `upsell:done:${result.paymentId}`;
      const isFirst = await this.redis.set(lockKey, '1', 'EX', 7 * 24 * 3600, 'NX');
      if (isFirst) {
        this.sendUpsells(result.workspaceId, result.leadId).catch(async (err) => {
          this.logger.error(`[Upsell] Falha ao disparar upsell: ${err?.message}`);
          await this.redis.del(lockKey).catch(() => {});
        });
      }
      this.dispatchDeliverable(result.paymentId).catch(() => {});
    }
    return { received: true };
  }

  async processUtmifyWebhook(workspaceId: string, body: any) {
    // Loga só os campos presentes, nunca os valores (podem conter dado de cliente)
    this.logger.log(`UTMify webhook received — campos: ${JSON.stringify(Object.keys(body || {}))}`);
    return { received: true };
  }

  // Suporta múltiplos formatos: BCB array, BCB objeto, ONZ, raiz direta
  async processQRCodesWebhook(body: any, logPrefix: string = '[QRCodes]') {
    const txids: string[] = [];

    if (body?.type === 'RECEIVE' && body?.data) {
      // Formato ONZ/BaassPago com type
      const txid = body.data.txId ?? body.data.txid ?? body.data.idempotencyKey;
      if (txid) txids.push(String(txid));
    } else if (Array.isArray(body?.pix)) {
      // Formato BCB padrão — pix como array
      for (const entry of body.pix) {
        if (entry?.txid) txids.push(String(entry.txid));
      }
    } else if (body?.pix && typeof body.pix === 'object') {
      // Formato BCB alternativo — pix como objeto único
      const p = body.pix;
      const txid = p.txid ?? p.txId;
      if (txid) txids.push(String(txid));
    } else if (body?.txid ?? body?.txId) {
      // txid na raiz do body
      txids.push(String(body.txid ?? body.txId));
    } else if (body?.data?.txId ?? body?.data?.txid) {
      // Formato ONZ sem campo type
      txids.push(String(body.data.txId ?? body.data.txid));
    }

    if (txids.length === 0) {
      // Loga só os campos presentes, nunca os valores (podem conter dado de cliente)
      this.logger.warn(`${logPrefix} Webhook sem txid reconhecível — campos: ${JSON.stringify(Object.keys(body || {}))}`);
      return { received: true };
    }

    for (const txid of txids) {
      const result = await this.pixService.processWebhook({ id: txid, status: 'PAID' });
      if (result?.newStatus === 'APPROVED' && result.paymentId) {
        const lockKey = `upsell:done:${result.paymentId}`;
        const isFirst = await this.redis.set(lockKey, '1', 'EX', 7 * 24 * 3600, 'NX');
        if (isFirst) {
          this.sendUpsells(result.workspaceId, result.leadId).catch(async (err) => {
            this.logger.error(`[QRCodes Upsell] Falha ao disparar upsell: ${err?.message}`);
            await this.redis.del(lockKey).catch(() => {});
          });
        }
        this.dispatchDeliverable(result.paymentId).catch(() => {});
      }
    }

    return { received: true };
  }
}
