-- Contenção de bots — 100% aditivo: 3 colunas novas anuláveis e 1 tabela nova.
-- Nada existente é alterado ou removido.
--
-- Ser aditivo aqui não é preferência: durante o deploy, o nginx manda o tráfego
-- para o backend-standby, que ainda roda a imagem ANTERIOR. Código antigo contra
-- schema novo só é seguro enquanto nada é removido ou renomeado.

-- ─── Saúde do bot ────────────────────────────────────────────────────────────
-- NULL em downSince = bot vivo, que é o estado de todos os bots já existentes.
-- Preenchido só quando o Telegram responde 401 (token revogado / bot banido);
-- nunca por 403, que é o usuário bloqueando o bot e vale só para aquele chat.
ALTER TABLE "TelegramBot" ADD COLUMN IF NOT EXISTS "downSince"     TIMESTAMP(3);
ALTER TABLE "TelegramBot" ADD COLUMN IF NOT EXISTS "downReason"    TEXT;
ALTER TABLE "TelegramBot" ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3);

-- ─── Fila ordenada de bots por fluxo ─────────────────────────────────────────
-- Tabela nova em vez de mais um campo no Flow: "Flow"."botId" continua
-- significando "o bot que está servindo agora", e é dele que dependem o cache de
-- mídia, o aquecimento e a trava de um fluxo ativo por bot. Aqui mora só a ORDEM.
CREATE TABLE IF NOT EXISTS "FlowBotSlot" (
    "id"        TEXT NOT NULL,
    "flowId"    TEXT NOT NULL,
    "botId"     TEXT NOT NULL,
    "ordem"     INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowBotSlot_pkey" PRIMARY KEY ("id")
);

-- Um bot pertence a um fluxo só. É o que mantém válida a trava
-- BOT_HAS_ACTIVE_FLOW quando um reserva é promovido a servindo.
CREATE UNIQUE INDEX IF NOT EXISTS "FlowBotSlot_botId_key"        ON "FlowBotSlot"("botId");
CREATE UNIQUE INDEX IF NOT EXISTS "FlowBotSlot_flowId_ordem_key" ON "FlowBotSlot"("flowId", "ordem");
CREATE        INDEX IF NOT EXISTS "FlowBotSlot_flowId_idx"       ON "FlowBotSlot"("flowId");

-- Cascade dos dois lados: apagar o fluxo ou o bot tira a linha da fila junto,
-- sem deixar referência órfã apontando para nada.
ALTER TABLE "FlowBotSlot"
  ADD CONSTRAINT "FlowBotSlot_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlowBotSlot"
  ADD CONSTRAINT "FlowBotSlot_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "TelegramBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
