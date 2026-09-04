// ─── Papel do processo nas filas BullMQ ──────────────────────────────────────
// Permite rodar o backend em 2 instâncias que dividem o event loop:
//
//   QUEUE_ROLE=api     → só as filas do caminho do fluxo (telegram-updates,
//                        scheduled-tasks). Compartilham estado em memória do
//                        WebhooksService (userLastMessage, locks). Roda junto
//                        do servidor HTTP que recebe os webhooks do Telegram.
//
//   QUEUE_ROLE=worker  → só as filas pesadas de background (telegram-remarketing,
//                        telegram-messages, webhook-events, push-notifications,
//                        outbound-webhooks). Não tocam o motor de fluxo.
//
//   QUEUE_ROLE=redirect → NENHUMA fila (nem flow, nem heavy). Só o servidor HTTP
//                        + produtores. Usado pela instância dedicada ao /r/
//                        (isolada do dashboard/webhooks).
//
//   (ausente / 'all')  → roda todas as filas — instância única (dev, ou fallback
//                        se a separação der problema: é só voltar pra 'all').
//
// Só afeta quais @Processor (Worker BullMQ) são instanciados. Os produtores
// (BullModule.registerQueue + @InjectQueue) continuam em todo processo.

const role = (process.env.QUEUE_ROLE || 'all').toLowerCase();

/** telegram-updates, scheduled-tasks — caminho do /start e continuação de fluxo. */
export const runsFlowQueues = (): boolean => role !== 'worker' && role !== 'redirect';

/** telegram-remarketing, telegram-messages, webhook-events, push, outbound-webhooks. */
export const runsHeavyQueues = (): boolean => role !== 'api' && role !== 'redirect';

export const queueRole = role;
