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
import * as crypto from 'crypto';
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
import { DEFAULT_DELETION_MS, resolveFlowDeletionDelay } from '../../common/message-deletion';
import { REMARKETING_FIRST_DELAY_MS } from '../../common/remarketing-schedule';
import { TelegramBlacklistService } from '../telegram-blacklist/telegram-blacklist.service';

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
    private readonly telegramBlacklist: TelegramBlacklistService,
    @InjectQueue('telegram-messages')    private readonly msgQueue:          Queue,
    @InjectQueue('telegram-remarketing') private readonly remarketingQueue:  Queue,
    @InjectQueue('scheduled-tasks')      private readonly scheduledQueue:    Queue,
    @InjectQueue('telegram-updates')     private readonly updatesQueue:      Queue,
  ) {}

  // Entrada do webhook do Telegram (chamada pelo controller). Só ENFILEIRA o
  // update e responde 200 na hora — o processamento real (que envia as mensagens
  // do fluxo, uma a uma) roda no TelegramUpdatesProcessor, fora do ciclo da
  // request HTTP.
  //
  // Motivo: o Telegram entrega os updates e espera o 200; enquanto o handler não
  // responde, ele reentrega o mesmo update (fluxo duplicado) e limita o
  // throughput do bot. Processar o funil inteiro dentro da request fazia cada
  // /start esperar o processamento do /start anterior sob carga — exatamente a
  // lentidão relatada ao iniciar o fluxo.
  //
  // jobId = update_id: retentativa do Telegram para o mesmo update colapsa no
  // mesmo job (dedupe) em vez de executar o fluxo 2×.
  async processTelegramWebhook(id: string, body: any) {
    try {
      const updateId = body?.update_id;
      await this.updatesQueue.add(
        'telegram-update',
        { id, body },
        {
          jobId: updateId != null ? `tg:${id}:${updateId}` : undefined,
          attempts: 1,
          removeOnComplete: { count: 500, age: 3600 },
          removeOnFail:     { count: 100, age: 24 * 3600 },
        },
      );
    } catch (err: any) {
      // Falha ao enfileirar (ex.: Redis indisponível) — processa inline como
      // fallback para nunca perder o update.
      this.logger.error(`[Webhook] Falha ao enfileirar update, processando inline: ${err?.message}`);
      await this.handleTelegramUpdate(id, body);
    }
    return { ok: true };
  }

  // Processamento real do update — chamado pelo TelegramUpdatesProcessor (ou
  // inline, no fallback de processTelegramWebhook).
  async handleTelegramUpdate(id: string, body: any) {
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

    // Blacklist global: identidade real é o from.id do Telegram (coincide com
    // chat.id em DM 1:1, que é o que o resto do método usa, mas from.id é o
    // campo correto por definição). Checado antes de QUALQUER busca/criação
    // de Lead — um usuário bloqueado não gera Lead novo nem avança em nada.
    // Ignora silenciosamente: sem resposta, sem revelar que foi bloqueado.
    if (await this.telegramBlacklist.isBlocked(from?.id ?? chatId)) {
      return { ok: true };
    }

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

      // Evento de analytics — fire-and-forget, não atrasa a 1ª mensagem do /start
      const newLeadId = lead.id;
      this.prisma.event.create({
        data: { leadId: newLeadId, eventName: 'START', source: 'telegram' },
      }).catch((e: any) => this.logger.warn(`[Event] START falhou lead=${newLeadId}: ${e.message}`));
    }

    // Idem — analytics, não bloqueia o caminho do /start
    const leadIdForEvent = lead.id;
    this.prisma.event.create({
      data: {
        leadId: leadIdForEvent,
        eventName: 'MESSAGE_SENT',
        source: 'telegram',
        metadata: { text, chatId },
      },
    }).catch((e: any) => this.logger.warn(`[Event] MESSAGE_SENT falhou lead=${leadIdForEvent}: ${e.message}`));

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

    // "digitando…" imediato — feedback visual em ~200ms enquanto o 1º nó carrega
    // e sobe pro Telegram (fire-and-forget, nunca bloqueia o fluxo).
    axios.post(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      chat_id: chatId, action: 'typing',
    }, { timeout: 5_000 }).catch(() => {});

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
    await this.scheduleRemarketingForCompletedFlow(flow, botToken, chatId);
  }

  // Agenda o remarketing ao fim do fluxo: resolve o lead pelo chat (preferindo o
  // bot específico do fluxo) e delega pra scheduleRemarketing. Idempotente — a
  // dedup por jobId em scheduleRemarketing(Multi) cobre chamadas repetidas, então
  // é seguro chamar tanto no fim síncrono (executeFlowGraph) quanto na retomada
  // após um nó de delay/wait/schedule (continueFlow).
  private async scheduleRemarketingForCompletedFlow(flow: any, botToken: string, chatId: string) {
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
    // Retomada de fluxo agendada via BullMQ (nó com delay/wait) — não passa
    // por processTelegramWebhook, então precisa da mesma checagem: um usuário
    // bloqueado DEPOIS de já ter uma continuação na fila não deve recebê-la.
    if (await this.telegramBlacklist.isBlocked(chatId)) return;

    const flow = await this.prisma.flow.findUnique({ where: { id: flowId }, include: { bot: true } });
    if (!flow?.isActive) return;
    const resolved = await this.resolveExecutionBot(flow, botIdOverride);
    if (!resolved) return;
    const { botToken, effectiveFlow } = resolved;
    // Retomada real do lead após delay/wait/schedule: quando o fluxo terminar aqui,
    // precisa agendar o remarketing (o executeFlowGraph já retornou antes do fim).
    await this.continueFlow(
      botToken, chatId, fromNodeId,
      effectiveFlow.nodes as any[], effectiveFlow.edges as any[], effectiveFlow,
      { scheduleRemarketingOnComplete: true },
    );
  }

  // Executa um nó específico ignorando seu waitBefore (já aguardamos), depois continua.
  // broadcastId, quando presente (disparo do Remarketing Master), faz o primeiro nó
  // propagar erro de envio em vez de engolir, para registrar sent/failed no progresso.
  // botIdOverride entrega pelo bot de origem do lead em vez do bot fixo do fluxo.
  async executeFlowNodeDirect(flowId: string, chatId: string, nodeId: string, broadcastId?: string, botIdOverride?: string): Promise<void> {
    // Mesma checagem de continueFlowFrom — este método também é chamado fora
    // do webhook (remarketing/broadcast), então precisa bloquear por conta
    // própria. Conta como falha de envio pro progresso do broadcast, igual
    // aos outros early-returns abaixo (flow inativo, bot não resolvido).
    if (await this.telegramBlacklist.isBlocked(chatId)) {
      if (broadcastId) await this.recordBroadcastOutcome(broadcastId, false);
      return;
    }

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

    // Broadcast (Remarketing Master) nunca agenda novo remarketing — evitaria loop.
    // Continuação de nó com waitBefore (skipWaitBefore, sem broadcastId) é retomada
    // real do lead: agenda o remarketing quando o fluxo terminar.
    const scheduleRemarketingOnComplete = !broadcastId;
    if (nextId && nextId !== 'DELAYED') {
      await this.continueFlow(botToken, chatId, nextId, nodes, edges, effectiveFlow, { scheduleRemarketingOnComplete });
    } else if (!nextId && scheduleRemarketingOnComplete && effectiveFlow) {
      // Nó com waitBefore era terminal (sem aresta de saída) — fluxo acabou aqui.
      await this.scheduleRemarketingForCompletedFlow(effectiveFlow, botToken, chatId);
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
    opts: { scheduleRemarketingOnComplete?: boolean } = {},
  ) {
    let currentNodeId: string | null = fromNodeId;
    while (currentNodeId) {
      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) break;

      const waitBefore = node.data?.waitBefore;
      if (waitBefore && waitBefore.value > 0) {
        const delayMs = this.delayToMs(waitBefore);
        await this.queueDelayedExecution(botToken, chatId, node, nodes, edges, delayMs, flow);
        return; // continuação (com a mesma flag) reagenda o remarketing ao terminar
      }

      const nextId = await this.executeNode(node, botToken, chatId, nodes, edges, flow);
      if (nextId === 'DELAYED') return; // idem: execDelay/execSchedule enfileiram a retomada
      currentNodeId = nextId;
    }

    // Fluxo terminou de fato (nó sem aresta de saída). Só a retomada real do lead
    // (delay/wait/schedule) passa scheduleRemarketingOnComplete — o caminho de
    // broadcast nunca, pra não criar loop de remarketing.
    if (opts.scheduleRemarketingOnComplete && flow) {
      await this.scheduleRemarketingForCompletedFlow(flow, botToken, chatId);
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
  // overrideDelayMs: usado por upsell (dispara bem depois da execução do fluxo,
  // quando o mapa em memória flowDeletionTimers já não é confiável) — quando
  // omitido, mantém o comportamento de sempre (mapa em memória do chat atual).
  private async scheduleMessageDeletion(
    token: string, chatId: string, messageId?: number | null, overrideDelayMs?: number,
  ): Promise<void> {
    if (!messageId) return;
    const MAX_DELETE_DELAY_MS = 10 * 24 * 60 * 60 * 1000; // teto de 10 dias contra clock drift
    const rawDelay = overrideDelayMs ?? this.flowDeletionTimers.get(chatId) ?? DEFAULT_DELETION_MS;
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
        const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId, text: content, parse_mode: 'HTML', protect_content: true,
        });
        await this.scheduleMessageDeletion(token, chatId, res.data?.result?.message_id);
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

    const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: content || 'Selecione um plano de pagamento:',
      reply_markup: { inline_keyboard: rows },
      parse_mode: 'HTML',
      protect_content: true,
    });
    await this.scheduleMessageDeletion(token, chatId, res.data?.result?.message_id);
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

  // ─── Modelo cíclico: agenda a cadeia de remarketing do lead ───────────────
  // 1º disparo em 30 min, depois o RemarketingProcessor (handleRemarketingCycle)
  // toca 1 a cada 2 h, ciclando pelos slots habilitados, até fechar 5 dias ou o
  // lead bloquear o bot. Sem config de tempo por slot — os campos antigos
  // (firstDelay/interval/stopAfter) são ignorados.
  private async scheduleRemarketingMulti(
    flow: any, chatId: string, leadId: string, slots: any[],
  ): Promise<void> {
    const hasSlot = (s: any) => s?.enabled && (s.content || (s.mediaType && s.mediaType !== 'none') || s.buttons?.length);
    const firstIdx = slots.findIndex(hasSlot);
    if (firstIdx === -1) return;

    if (!assertNoClockDrift('scheduleRemarketingCycle', this.logger)) return;

    // O job de ciclo se re-enfileira sozinho — não pode reusar o mesmo id (BullMQ
    // ignora um add cujo id ainda existe, inclusive no job ATIVO que está rodando).
    // Alterna entre 2 ids fixos por disparo (seq par → -a, ímpar → -b) + cada job
    // com removeOnComplete/Fail:true, então o id do próximo disparo já está livre.
    // Deduplicação: se QUALQUER um dos 2 existir, o lead já tem cadeia rodando.
    const jobIdA = `rmkt-${flow.id}-${leadId}-a`;
    const jobIdB = `rmkt-${flow.id}-${leadId}-b`;
    try {
      const [a, b] = await Promise.all([
        this.remarketingQueue.getJob(jobIdA),
        this.remarketingQueue.getJob(jobIdB),
      ]);
      if (a || b) {
        this.logger.log(`Remarketing já agendado para lead=${leadId} flow=${flow.id} — ignorando duplicata`);
        return;
      }
    } catch { /* se falhar a verificação, agenda normalmente */ }

    const totalEnabled = slots.filter(hasSlot).length;
    this.logger.log(`Agendando remarketing cíclico (${totalEnabled} slot(s), 1 a cada 2h por 5 dias) para lead=${leadId} flow=${flow.id}`);

    await this.remarketingQueue.add(
      'remarketing-send',
      {
        chatId, leadId,
        flowId: flow.id,
        botId:  flow.botId ?? null,
        slotIndex:      firstIdx,
        chainStartedAt: Date.now(),
        seq:            0,
      },
      { delay: REMARKETING_FIRST_DELAY_MS, jobId: jobIdA, removeOnComplete: true, removeOnFail: true },
    );
  }

  // Resolve o fluxo que contém o nó de PIX/bump clicado, a partir do botId.
  // Pro chat de aquecimento (warmupChatId), busca em QUALQUER fluxo do bot,
  // ativo ou não — sem isso, o pré-cache de mídia de upsell nunca completa,
  // porque upsell só dispara depois de um pagamento de verdade, e pagamento
  // depende de resolver o botão de PIX clicado, que antes exigia o fluxo já
  // estar ativo (deadlock: não ativa sem cache completo, não cacheia upsell
  // sem ativar). Pra qualquer outro chat, mantém a regra original — só o
  // fluxo ATIVO conta, nunca resolve preço/entregável a partir de rascunho.
  private async resolveFlowForPixNode(botId: string, chatId: string, nodeId: string): Promise<any> {
    const bot = await this.prisma.telegramBot.findUnique({
      where: { id: botId },
      select: { warmupChatId: true },
    });
    const isWarmupChat = !!bot?.warmupChatId && bot.warmupChatId === chatId;

    if (!isWarmupChat) {
      return this.prisma.flow.findFirst({ where: { botId, isActive: true } as any });
    }

    const flows = await this.prisma.flow.findMany({ where: { botId } as any });
    return flows.find((f: any) => (f.nodes as any[])?.some((n: any) => n.id === nodeId)) ?? null;
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

    // Blacklist global: checado depois do answerCallbackQuery (spinner some
    // normalmente, não fica travado) e antes de qualquer lógica de negócio
    // (PIX, upsell, remarketing etc). from.id é a identidade real do usuário;
    // chat.id é usado como fallback só se from vier ausente por algum motivo.
    if (await this.telegramBlacklist.isBlocked(callbackQuery.from?.id ?? chatId)) {
      return;
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
      let planFlowId: string | undefined;
      let deliverable: { enabled: boolean; message: string; delayMinutes: number } | undefined;
      let bumpOffer: { bump: any; nodeId: string; optIdx: number; flowId: string; botId: string } | undefined;

      if (raw.startsWith('id:')) {
        // formato novo: pix_id:<nodeId>:<índice da opção> — resolve valor/label/
        // entregável a partir do fluxo atual, em vez de confiar no cliente.
        const rest = raw.slice(3);
        const lastColon = rest.lastIndexOf(':');
        const nodeId = lastColon >= 0 ? rest.slice(0, lastColon) : rest;
        const optIdx = lastColon >= 0 ? parseInt(rest.slice(lastColon + 1), 10) : NaN;

        const leadForFlow = await resolveLead();
        if (leadForFlow?.botId && !isNaN(optIdx)) {
          const flow = await this.resolveFlowForPixNode(leadForFlow.botId, chatId.toString(), nodeId);
          const node = (flow?.nodes as any[])?.find((n: any) => n.id === nodeId);
          const opt = node?.data?.pixOptions?.[optIdx];
          if (opt) {
            amount = Number(opt.value);
            planLabel = opt.label;
            planFlowId = flow?.id;
            if (opt.deliverable?.enabled && opt.deliverable?.message) {
              deliverable = opt.deliverable;
            }
            // Order bump: só existe pro formato novo (precisa de nodeId pra
            // rastrear de volta ao fluxo/config). Se ativo, oferece antes de
            // gerar o PIX — o valor só é somado se o lead responder "sim".
            const bump = (flow?.config as any)?.orderBump;
            if (flow?.id && bump?.enabled && bump?.title
              && !isNaN(parseFloat(String(bump.price ?? '0').replace(',', '.')))
              && parseFloat(String(bump.price ?? '0').replace(',', '.')) > 0
            ) {
              bumpOffer = { bump, nodeId, optIdx, flowId: flow.id, botId: leadForFlow.botId };
            }
          }
        }
      } else {
        // formato antigo: pix_VALOR|LABEL — botões já enviados antes desse
        // recurso existir continuam funcionando, só sem entregável (não tem
        // como saber qual opção era) nem order bump (não tem nodeId).
        const sep = raw.indexOf('|');
        const amountStr = sep >= 0 ? raw.slice(0, sep) : raw;
        amount = parseFloat(amountStr);
        planLabel = sep >= 0 ? raw.slice(sep + 1) : undefined;
      }

      if (bumpOffer && token) {
        await this.sendOrderBumpOffer(
          token, chatId.toString(), bumpOffer.bump, bumpOffer.nodeId, bumpOffer.optIdx,
          bumpOffer.flowId, bumpOffer.botId,
        );
        return { ok: true };
      }

      if (amount !== undefined && !isNaN(amount) && amount > 0 && token) {
        const lead = await resolveLead();
        if (lead) {
          await this.generatePlanCharge(workspaceId, token, chatId, lead.id, amount, planLabel, planFlowId, deliverable);
        }
      }
    } else if (data.startsWith('bump_yes:') || data.startsWith('bump_no:')) {
      if (!token) return { ok: true };
      const accepted = data.startsWith('bump_yes:');
      const rest = data.slice(accepted ? 'bump_yes:'.length : 'bump_no:'.length);
      const lastColon = rest.lastIndexOf(':');
      const nodeId = lastColon >= 0 ? rest.slice(0, lastColon) : rest;
      const optIdx = lastColon >= 0 ? parseInt(rest.slice(lastColon + 1), 10) : NaN;

      const lead = await resolveLead();
      if (lead?.botId && !isNaN(optIdx)) {
        const flow = await this.resolveFlowForPixNode(lead.botId, chatId.toString(), nodeId);
        const node = (flow?.nodes as any[])?.find((n: any) => n.id === nodeId);
        const opt = node?.data?.pixOptions?.[optIdx];
        if (opt) {
          const amount = Number(opt.value);
          const deliverable = opt.deliverable?.enabled && opt.deliverable?.message ? opt.deliverable : undefined;
          // Preço do bump sempre relido do fluxo no servidor — nunca confia em
          // nada vindo do callback_data (só nodeId/optIdx, iguais ao pix_id:).
          const bump = (flow?.config as any)?.orderBump;
          const bumpPrice = parseFloat(String(bump?.price ?? '0').replace(',', '.'));
          const bumpApplied = accepted && !isNaN(bumpPrice) && bumpPrice > 0;
          if (!isNaN(amount) && amount > 0) {
            await this.generatePlanCharge(
              workspaceId, token, chatId, lead.id,
              amount, opt.label, flow?.id, deliverable,
              bumpApplied ? bumpPrice : 0, bumpApplied, bumpApplied ? bump?.title : undefined,
            );
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
          ? await this.prisma.product.findFirst({ where: { id: productId, workspaceId } })
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
      // botId do webhook (bot que o cliente está conversando de verdade) — sem
      // isso, cai no fallback de getEnabledUpsells() e pode pegar o upsell de
      // OUTRO bot do mesmo workspace com o mesmo índice mas preço diferente do
      // que foi mostrado ao cliente (sendUpsells já usa leadBotId corretamente).
      const upsells = await this.getEnabledUpsells(workspaceId, botId);
      const upsell = upsells.find(u => u.idx === idx);
      if (upsell && upsell.price) {
        const amount = parseFloat(String(upsell.price).replace(',', '.'));
        if (amount > 0) {
          // Lock atômico Redis — mesmo padrão de pix_/pay_ (generatePlanCharge,
          // handler pay_) — sem isso, duplo toque/reenvio do callback_query pelo
          // Telegram gera 2 cobranças PIX pro mesmo clique de "Sim".
          const locked = await this.redis.set(`pix:lock:upsell_${chatId}`, '1', 'EX', 15, 'NX');
          if (!locked) return { ok: true };

          const lead = await resolveLead();
          if (lead) {
            // Registra o próximo upsell a mostrar quando esse pagamento for aprovado
            // -1 = sentinel "sequência encerrada, silêncio"
            const next = upsells.find(u => u.idx > idx);
            boundedSet(this.upsellProgress, chatId.toString(), next ? next.idx : -1);
            const loadingId = await this.sendLoading(token, chatId);
            // Título/índice do upsell capturados só pra estatística de qual upsell
            // vende mais no dashboard — nunca usado como gatilho de nada.
            const plan = { kind: 'upsell' as const, label: upsell.title, upsellIndex: idx, flowId: upsell.flowId };
            const charge = await this.pixService.createChargeByAmount(workspaceId, lead.id, amount, undefined, plan);
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
      const upsells = await this.getEnabledUpsells(workspaceId, botId);
      const next = upsells.find(u => u.idx > idx);
      if (next) {
        // Mesma trava do accept — evita reenviar a próxima oferta 2x no duplo toque.
        const locked = await this.redis.set(`pix:lock:upsell_${chatId}`, '1', 'EX', 15, 'NX');
        if (!locked) return { ok: true };

        let upsellCtx: { flowId: string; botId: string; precacheEnabled: boolean } | undefined;
        if (next.flowId && botId) {
          const sendingBot = await this.prisma.telegramBot.findUnique({
            where: { id: botId }, select: { precacheEnabled: true },
          });
          upsellCtx = { flowId: next.flowId, botId, precacheEnabled: !!sendingBot?.precacheEnabled };
        }
        const deletionDelayMs = await resolveFlowDeletionDelay(this.prisma, next.flowId ?? upsellCtx?.flowId);
        await this.sendUpsellMessage(token, chatId.toString(), next, upsellCtx, deletionDelayMs);
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

  // Gera o PIX de um plano do fluxo inicial — usado tanto pelo clique direto
  // no botão do plano (sem order bump, bumpApplied=false) quanto pela resposta
  // ao order bump (bumpApplied=true soma bumpValue). Mesma trava de lock e
  // mesmo fluxo de mensagens de sempre, só parametrizado pelos dois casos.
  private async generatePlanCharge(
    workspaceId: string,
    token: string,
    chatId: number,
    leadId: string,
    baseAmount: number,
    planLabel: string | undefined,
    planFlowId: string | undefined,
    deliverable: { enabled: boolean; message: string; delayMinutes: number } | undefined,
    bumpValue = 0,
    bumpApplied = false,
    bumpTitle?: string,
  ): Promise<void> {
    // Lock atômico Redis — sobrevive a restarts, sem race condition
    const locked = await this.redis.set(`pix:lock:pix_${chatId}`, '1', 'EX', 15, 'NX');
    if (!locked) return;

    const amount = baseAmount + (bumpApplied ? bumpValue : 0);
    const loadingId = await this.sendLoading(token, chatId);
    try {
      // Rótulo do botão (ex: "Plano 1") capturado só pra estatística de qual
      // plano vende mais no dashboard — nunca usado como gatilho de nada.
      // O label do order bump fica separado (orderBump.value) pra não sujar
      // o agrupamento por plano já existente no ranking.
      const plan = planLabel
        ? {
            kind: 'plan' as const,
            label: planLabel,
            flowId: planFlowId,
            ...(bumpApplied ? { orderBump: { applied: true, value: bumpValue } } : {}),
          }
        : undefined;
      const charge = await this.pixService.createChargeByAmount(workspaceId, leadId, amount, deliverable, plan);
      await this.deleteMsg(token, chatId, loadingId);
      const displayLabel = bumpApplied && bumpTitle ? `${planLabel ?? ''} + ${bumpTitle}`.trim() : planLabel;
      await this.sendPixMessage(token, chatId.toString(), charge, amount, displayLabel);
    } catch (err: any) {
      await this.deleteMsg(token, chatId, loadingId);
      this.logger.error(`PIX: erro ao criar cobrança para lead ${leadId}: ${err?.message}`);
    }
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
    // Query enxuta: só a chave `upsells` do config + token do bot. O findMany com
    // `include: { bot }` puxava TODOS os configs de fluxo ATIVOS inteiros (dezenas
    // de MB de mídia base64) a cada pagamento / escolha de plano.
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; botId: string | null; upsells: any; botToken: string | null;
    }>>`
      SELECT f.id, f."botId" AS "botId", f.config->'upsells' AS upsells, b."botToken" AS "botToken"
      FROM "Flow" f
      LEFT JOIN "TelegramBot" b ON b.id = f."botId"
      WHERE f."workspaceId" = ${workspaceId} AND f."isActive" = true
    `;

    const pick = (row: { id: string; upsells: any; botToken: string | null }) => {
      const stored: any[] = Array.isArray(row.upsells) ? row.upsells : [];
      return stored
        .map((u, i) => ({ ...u, idx: i, flowId: row.id, _botToken: row.botToken }))
        .filter(u => u.enabled && u.title);
    };

    // Tenta primeiro o flow do bot preferido (bot com que o usuário interagiu)
    if (preferBotId) {
      for (const row of rows) {
        if (row.botId !== preferBotId) continue;
        const enabled = pick(row);
        if (enabled.length > 0) return enabled;
      }
    }
    // Fallback: qualquer flow com upsells habilitados
    for (const row of rows) {
      const enabled = pick(row);
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

    // Upsell dispara bem depois da execução do fluxo — busca o temporizador
    // configurado direto do fluxo (não confia no mapa em memória do chat).
    const deletionDelayMs = await resolveFlowDeletionDelay(this.prisma, toSend.flowId ?? upsellCtx?.flowId);

    await this.sendUpsellMessage(token, chatId, toSend, upsellCtx, deletionDelayMs);
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
    deletionDelayMs?: number,
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

    // Cache de file_id do upsell — lido SEMPRE que o upsell tem mídia, não só
    // quando há base64/URL inline. Sem isso, um upsell com a mídia já cacheada
    // mas o base64 removido (limpeza de espaço) cairia no envio só-texto — o
    // file_id sozinho basta. Mesmo padrão de execVideo/sendOrderBumpOffer.
    // (Gate de precacheEnabled removido: o cache deve sempre ser preferido.)
    const cacheKey = ctx ? `upsell:${upsell.idx}:${ctx.botId}` : undefined;
    let cachedId: string | undefined;
    if (hasMedia && cacheKey) {
      const flowRow = await this.prisma.flow.findUnique({ where: { id: ctx!.flowId }, select: { config: true } });
      const cached = (flowRow?.config as any)?.mediaCache?.[cacheKey];
      if (cached?.botId === ctx!.botId) cachedId = cached.fileId as string;
    }

    if (hasMedia && (media || cachedId)) {
      const isBase64 = !!media && media.startsWith('data:');

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

      try {
        const { fileId: newId, messageId: mediaMsgId } = await sendTelegramMedia({
          botToken: token, chatId,
          type:     upsell.mediaType === 'image' ? 'photo' : 'video',
          fileId:   cachedId,
          fileUrl:  (!isBase64 && media) ? media : undefined,
          fileData: (isBase64 && media) ? media : undefined,
          caption,
          // Quando texto não cabe na caption, os botões vão na mensagem de texto separada
          replyMarkup: textFitsInCaption ? { inline_keyboard: keyboard } : undefined,
        });
        await this.scheduleMessageDeletion(token, chatId, mediaMsgId, deletionDelayMs);

        if (newId && cacheKey && ctx) this.saveMediaCache(ctx.flowId, cacheKey, newId, ctx.botId).catch(() => {});

        // Descrição não coube na caption → envia texto completo com botões
        if (!textFitsInCaption) {
          const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
            protect_content: true,
          }, { timeout: 15_000 });
          await this.scheduleMessageDeletion(token, chatId, res.data?.result?.message_id, deletionDelayMs);
        }
        return;
      } catch (e: any) {
        this.logger.warn(`[Upsell] Mídia falhou — enviando texto puro. Detalhe: ${e.message}`);
        // Fallthrough → envia texto
      }
    }

    const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId, text, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
      protect_content: true,
    }, { timeout: 15_000 });
    await this.scheduleMessageDeletion(token, chatId, res.data?.result?.message_id, deletionDelayMs);
  }

  // Oferta de order bump — mostrada antes de gerar o PIX de um plano do fluxo
  // inicial, quando `flow.config.orderBump` está ativo. Mesmo formato de
  // mídia/caption do sendUpsellMessage, com botões Sim/Não que carregam
  // nodeId/optIdx pra re-resolver o plano no servidor quando o lead responder.
  // Diferente do upsell, não agenda apagar a mensagem sozinha — fica visível
  // até o lead decidir.
  private async sendOrderBumpOffer(
    token: string, chatId: string, bump: any, nodeId: string, optIdx: number,
    flowId: string, botId: string,
  ): Promise<void> {
    const parts: string[] = [];
    if (bump.title)       parts.push(`<b>🎁 ${bump.title}</b>`);
    if (bump.description) parts.push(bump.description);
    if (bump.price)       parts.push(`\n💰 <b>Por apenas R$ ${bump.price}</b>`);
    const text = parts.join('\n\n') || '🎁 Aproveite essa oferta antes de continuar!';

    const keyboard = [[
      { text: bump.acceptText  || '✅ Sim, quero!',   callback_data: `bump_yes:${nodeId}:${optIdx}` },
      { text: bump.declineText || '❌ Não, obrigado', callback_data: `bump_no:${nodeId}:${optIdx}` },
    ]];

    const hasMedia = bump.mediaType === 'image' || bump.mediaType === 'video';
    const media    = bump.mediaUrl || bump.mediaData;

    // Cache de file_id — lido SEMPRE que o bump tem mídia, não só quando há
    // base64/URL inline. Sem isso, um order bump com a mídia já cacheada mas o
    // base64 removido (limpeza de espaço) cairia no envio só-texto — o file_id
    // sozinho basta pra enviar. Mesmo padrão de execVideo/sendUpsellMessage.
    // (O gate de precacheEnabled foi removido: o cache deve sempre ser preferido.)
    const cacheKey = `orderbump:${botId}`;
    let cachedId: string | undefined;
    if (hasMedia) {
      const flowRow = await this.prisma.flow.findUnique({ where: { id: flowId }, select: { config: true } });
      const cached = (flowRow?.config as any)?.mediaCache?.[cacheKey];
      if (cached?.botId === botId) cachedId = cached.fileId as string;
    }

    if (hasMedia && (media || cachedId)) {
      const isBase64 = !!media && media.startsWith('data:');

      // Telegram limita caption a 1024 chars — mesma regra do upsell.
      const CAPTION_LIMIT = 1024;
      const textFitsInCaption = text.length <= CAPTION_LIMIT;

      const shortCaption = (() => {
        const p: string[] = [];
        if (bump.title) p.push(`<b>🎁 ${bump.title}</b>`);
        if (bump.price) p.push(`💰 <b>R$ ${bump.price}</b>`);
        return p.join('\n') || '🎁 Oferta especial!';
      })();

      const caption = textFitsInCaption ? text : shortCaption;

      try {
        const { fileId: newId } = await sendTelegramMedia({
          botToken: token, chatId,
          type:     bump.mediaType === 'image' ? 'photo' : 'video',
          fileId:   cachedId,
          fileUrl:  (!isBase64 && media) ? media : undefined,
          fileData: (isBase64 && media) ? media : undefined,
          caption,
          replyMarkup: textFitsInCaption ? { inline_keyboard: keyboard } : undefined,
        });
        if (newId) this.saveMediaCache(flowId, cacheKey, newId, botId).catch(() => {});

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
        this.logger.warn(`[OrderBump] Mídia falhou — enviando texto puro. Detalhe: ${e.message}`);
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
    const result = await this.pixService.processWebhook(body, workspaceId || undefined);
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

  // Now Banks: { id, type: 'deposit.updated'|'withdraw.updated'|'med.retained',
  //   data: { transaction_id, status, amount }, created_at }
  // Traduz o status próprio da Now Banks pro vocabulário que pixService.processWebhook
  // entende — NUNCA repassar o status cru: 'COMPLETED' não bate com nenhuma entrada do
  // statusMap genérico e cairia no ramo de cancelamento por engano.
  async processNowBanksWebhook(body: any, rawBody?: Buffer, signature?: string) {
    // Verificação de assinatura HMAC (best-effort, não bloqueia): a doc da Now Banks
    // não especifica o algoritmo/encoding com certeza (só cita "ex: X-Signature"), e
    // hoje NENHUM adquirente configurado valida assinatura de webhook — a defesa real
    // contra forjamento é a reverificação do status direto na API do adquirente antes
    // de aprovar (pix.service.ts). Se a assinatura não bater, só loga — não descarta o
    // webhook, pra não arriscar quebrar a confirmação automática de pagamentos reais
    // por causa de uma suposição errada sobre o formato exato da assinatura.
    if (signature && rawBody) {
      try {
        const acquirer = await this.prisma.acquirer.findUnique({ where: { slug: 'nowbanks' } });
        const secret = acquirer?.webhookSecret ? decrypt(acquirer.webhookSecret) : null;
        if (secret) {
          const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
          if (expected !== signature) {
            this.logger.warn('[NowBanks] Assinatura HMAC não confere — prosseguindo mesmo assim (reverificação de status cobre a aprovação)');
          }
        }
      } catch (e: any) {
        this.logger.warn(`[NowBanks] Falha ao verificar assinatura: ${e.message}`);
      }
    }

    const type = body?.type;
    if (type && type !== 'deposit.updated') {
      // withdraw.updated / med.retained — não afetam confirmação de PIX recebido
      this.logger.log(`[NowBanks] Webhook ignorado (type=${type})`);
      return { received: true };
    }

    const data = body?.data ?? {};
    const transactionId = data.transaction_id ?? data.id;
    if (!transactionId) {
      this.logger.warn(`[NowBanks] Webhook sem transaction_id — campos: ${JSON.stringify(Object.keys(data))}`);
      return { received: true };
    }

    const statusMap: Record<string, string> = {
      COMPLETED: 'PAID',
      FAILED:    'FAILED',
      REJECTED:  'FAILED',
      CANCELED:  'CANCELLED',
      CANCELLED: 'CANCELLED',
    };
    const status = statusMap[String(data.status).toUpperCase()];
    if (!status) {
      // WAITING_PAYMENT / PENDING / PROCESSING / RETIDO — intermediário, nada a fazer ainda
      return { received: true };
    }

    const result = await this.pixService.processWebhook({ id: transactionId, status });
    if (result?.newStatus === 'APPROVED' && result.paymentId) {
      const lockKey = `upsell:done:${result.paymentId}`;
      const isFirst = await this.redis.set(lockKey, '1', 'EX', 7 * 24 * 3600, 'NX');
      if (isFirst) {
        this.sendUpsells(result.workspaceId, result.leadId).catch(async (err) => {
          this.logger.error(`[NowBanks Upsell] Falha ao disparar upsell: ${err?.message}`);
          await this.redis.del(lockKey).catch(() => {});
        });
      }
      this.dispatchDeliverable(result.paymentId).catch(() => {});
    }

    return { received: true };
  }

  // Velana: { id: <id do postback>, type: 'transaction'|'checkout'|'transfer', objectId,
  //   url, data: { id, status, ... } } — o "id" no topo é do POSTBACK, não da transação
  // (por isso não dá pra usar o parser genérico de pix.service.ts::processWebhook, que
  // priorizaria esse id errado). Traduz o vocabulário de status da Velana pro que
  // pixService.processWebhook entende, igual já feito pra Now Banks/QRCodes.
  async processVelanaWebhook(workspaceId: string, body: any) {
    if (body?.type && body.type !== 'transaction') {
      this.logger.log(`[Velana] Webhook ignorado (type=${body.type})`);
      return { received: true };
    }

    const data = body?.data ?? {};
    const transactionId = data.id;
    if (!transactionId) {
      this.logger.warn(`[Velana] Webhook sem id de transação — campos: ${JSON.stringify(Object.keys(data))}`);
      return { received: true };
    }

    const statusMap: Record<string, string> = {
      paid:        'PAID',
      refused:     'CANCELLED',
      canceled:    'CANCELLED',
      cancelled:   'CANCELLED',
      refunded:    'CANCELLED',
      chargedback: 'CANCELLED',
    };
    const status = statusMap[String(data.status).toLowerCase()];
    if (!status) {
      // waiting_payment / processing / authorized / in_protest / partially_paid —
      // intermediário, nada a fazer ainda
      return { received: true };
    }

    const result = await this.pixService.processWebhook({ id: String(transactionId), status }, workspaceId || undefined);
    if (result?.newStatus === 'APPROVED' && result.paymentId) {
      const lockKey = `upsell:done:${result.paymentId}`;
      const isFirst = await this.redis.set(lockKey, '1', 'EX', 7 * 24 * 3600, 'NX');
      if (isFirst) {
        this.sendUpsells(result.workspaceId, result.leadId).catch(async (err) => {
          this.logger.error(`[Velana Upsell] Falha ao disparar upsell: ${err?.message}`);
          await this.redis.del(lockKey).catch(() => {});
        });
      }
      this.dispatchDeliverable(result.paymentId).catch(() => {});
    }

    return { received: true };
  }

  // Mercado Pago (Orders API) não manda o status no corpo da notificação — só os
  // ids ({ type: 'order', data: { id } }) — então é preciso reconsultar a order
  // antes de decidir o que fazer. Isso é uma exigência da própria API deles, mas
  // por sorte cai exatamente no mesmo racional já usado pros outros adquirentes:
  // nunca aprovar só com o corpo do webhook (ver confirmPaidWithRetry em pix.service.ts,
  // que reconsulta de novo antes da aprovação final).
  async processMercadoPagoWebhook(body: any, xSignature?: string, xRequestId?: string) {
    if (body?.type && body.type !== 'order') {
      this.logger.log(`[MercadoPago] Webhook ignorado (type=${body.type})`);
      return { received: true };
    }

    const orderId = body?.data?.id;
    if (!orderId) {
      this.logger.warn(`[MercadoPago] Webhook sem data.id — campos: ${JSON.stringify(Object.keys(body || {}))}`);
      return { received: true };
    }

    const acquirer = await this.prisma.acquirer.findUnique({ where: { slug: 'mercadopago' } });
    if (!acquirer) {
      this.logger.warn('[MercadoPago] Webhook recebido mas adquirente não está configurado');
      return { received: true };
    }

    // Verificação de assinatura HMAC (best-effort, não bloqueia — mesmo racional do
    // NowBanks acima: a defesa real é a reconsulta à API antes de aprovar).
    if (xSignature && acquirer.webhookSecret) {
      try {
        const secret = decrypt(acquirer.webhookSecret);
        const parts: Record<string, string> = {};
        for (const part of xSignature.split(',')) {
          const [k, v] = part.trim().split('=');
          if (k && v) parts[k] = v;
        }
        if (parts.ts && parts.v1) {
          const manifest = `id:${String(orderId).toLowerCase()};request-id:${xRequestId ?? ''};ts:${parts.ts};`;
          const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
          if (expected !== parts.v1) {
            this.logger.warn('[MercadoPago] Assinatura HMAC não confere — prosseguindo mesmo assim (reverificação de status cobre a aprovação)');
          }
        }
      } catch (e: any) {
        this.logger.warn(`[MercadoPago] Falha ao verificar assinatura: ${e.message}`);
      }
    }

    let status: string | undefined;
    try {
      const apiKey = decrypt(acquirer.apiKey);
      const { data } = await axios.get(`https://api.mercadopago.com/v1/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15_000,
      });
      status = data?.transactions?.payments?.[0]?.status ?? data?.status;
    } catch (e: any) {
      this.logger.warn(`[MercadoPago] Falha ao consultar order ${orderId}: ${e.message}`);
      return { received: true };
    }

    const statusMap: Record<string, string> = {
      processed:    'PAID',
      expired:      'EXPIRED',
      canceled:     'CANCELLED',
      cancelled:    'CANCELLED',
      refunded:     'CANCELLED',
      charged_back: 'CANCELLED',
      failed:       'FAILED',
    };
    const mapped = statusMap[status ?? ''];
    if (!mapped) {
      // created / processing / action_required — intermediário, nada a fazer ainda
      return { received: true };
    }

    const result = await this.pixService.processWebhook({ id: String(orderId), status: mapped });
    if (result?.newStatus === 'APPROVED' && result.paymentId) {
      const lockKey = `upsell:done:${result.paymentId}`;
      const isFirst = await this.redis.set(lockKey, '1', 'EX', 7 * 24 * 3600, 'NX');
      if (isFirst) {
        this.sendUpsells(result.workspaceId, result.leadId).catch(async (err) => {
          this.logger.error(`[MercadoPago Upsell] Falha ao disparar upsell: ${err?.message}`);
          await this.redis.del(lockKey).catch(() => {});
        });
      }
      this.dispatchDeliverable(result.paymentId).catch(() => {});
    }

    return { received: true };
  }

  // Woovi (rebrand da OpenPix) manda o status direto no nome do evento — não
  // precisa reconsultar a API só pra saber o que aconteceu (diferente do Mercado
  // Pago), mas a reverificação em confirmPaidWithRetry (pix.service.ts) ainda
  // roda antes da aprovação final, então o corpo do webhook sozinho nunca é
  // suficiente pra confirmar pagamento — mesmo princípio de todo adquirente aqui.
  async processWooviWebhook(body: any, authorizationHeader?: string) {
    const event = body?.event;
    if (event && !['OPENPIX:CHARGE_COMPLETED', 'OPENPIX:CHARGE_EXPIRED'].includes(event)) {
      // OPENPIX:CHARGE_CREATED / TRANSACTION_RECEIVED — intermediário, nada a fazer ainda
      this.logger.log(`[Woovi] Webhook ignorado (event=${event})`);
      return { received: true };
    }

    const correlationID = body?.charge?.correlationID;
    if (!correlationID) {
      this.logger.warn(`[Woovi] Webhook sem charge.correlationID — campos: ${JSON.stringify(Object.keys(body || {}))}`);
      return { received: true };
    }

    // Verificação best-effort: a Woovi permite configurar um valor de Authorization
    // esperado no cadastro do webhook, ecoado de volta em toda chamada — mesmo
    // racional das outras verificações aqui (não bloqueia; a defesa real é a
    // reconsulta à API antes de aprovar).
    const acquirer = await this.prisma.acquirer.findUnique({ where: { slug: 'woovi' } });
    if (acquirer?.webhookSecret) {
      try {
        const secret = decrypt(acquirer.webhookSecret);
        if (authorizationHeader !== secret) {
          this.logger.warn('[Woovi] Authorization do webhook não confere — prosseguindo mesmo assim (reverificação de status cobre a aprovação)');
        }
      } catch (e: any) {
        this.logger.warn(`[Woovi] Falha ao verificar authorization: ${e.message}`);
      }
    }

    const status = event === 'OPENPIX:CHARGE_EXPIRED' ? 'EXPIRED' : 'PAID';

    const result = await this.pixService.processWebhook({ id: correlationID, status });
    if (result?.newStatus === 'APPROVED' && result.paymentId) {
      const lockKey = `upsell:done:${result.paymentId}`;
      const isFirst = await this.redis.set(lockKey, '1', 'EX', 7 * 24 * 3600, 'NX');
      if (isFirst) {
        this.sendUpsells(result.workspaceId, result.leadId).catch(async (err) => {
          this.logger.error(`[Woovi Upsell] Falha ao disparar upsell: ${err?.message}`);
          await this.redis.del(lockKey).catch(() => {});
        });
      }
      this.dispatchDeliverable(result.paymentId).catch(() => {});
    }

    return { received: true };
  }

  // Pagar.me manda o status direto no tipo do evento (charge.paid /
  // charge.payment_failed) — mesmo racional de todo adquirente aqui: a
  // reverificação em confirmPaidWithRetry (pix.service.ts) roda antes da
  // aprovação final, então o corpo do webhook sozinho nunca é suficiente pra
  // confirmar pagamento.
  async processPagarmeWebhook(body: any, authorizationHeader?: string) {
    const type = body?.type;
    if (type && !['charge.paid', 'charge.payment_failed'].includes(type)) {
      // order.paid / charge.pending / charge.processing / etc — intermediário
      // ou redundante (charge.paid já cobre o caso de sucesso), nada a fazer.
      this.logger.log(`[Pagarme] Webhook ignorado (type=${type})`);
      return { received: true };
    }

    const chargeId = body?.data?.id;
    if (!chargeId) {
      this.logger.warn(`[Pagarme] Webhook sem data.id — campos: ${JSON.stringify(Object.keys(body || {}))}`);
      return { received: true };
    }

    // Verificação best-effort: a Pagar.me permite configurar Basic Auth
    // (usuário:senha) no cadastro do webhook, ecoado no header Authorization de
    // toda chamada — mesmo racional das outras verificações aqui (não bloqueia;
    // a defesa real é a reconsulta à API antes de aprovar).
    const acquirer = await this.prisma.acquirer.findUnique({ where: { slug: 'pagarme' } });
    if (acquirer?.webhookSecret) {
      try {
        const secret = decrypt(acquirer.webhookSecret);
        if (authorizationHeader !== secret) {
          this.logger.warn('[Pagarme] Authorization do webhook não confere — prosseguindo mesmo assim (reverificação de status cobre a aprovação)');
        }
      } catch (e: any) {
        this.logger.warn(`[Pagarme] Falha ao verificar authorization: ${e.message}`);
      }
    }

    const status = type === 'charge.payment_failed' ? 'FAILED' : 'PAID';

    const result = await this.pixService.processWebhook({ id: chargeId, status });
    if (result?.newStatus === 'APPROVED' && result.paymentId) {
      const lockKey = `upsell:done:${result.paymentId}`;
      const isFirst = await this.redis.set(lockKey, '1', 'EX', 7 * 24 * 3600, 'NX');
      if (isFirst) {
        this.sendUpsells(result.workspaceId, result.leadId).catch(async (err) => {
          this.logger.error(`[Pagarme Upsell] Falha ao disparar upsell: ${err?.message}`);
          await this.redis.del(lockKey).catch(() => {});
        });
      }
      this.dispatchDeliverable(result.paymentId).catch(() => {});
    }

    return { received: true };
  }
}
