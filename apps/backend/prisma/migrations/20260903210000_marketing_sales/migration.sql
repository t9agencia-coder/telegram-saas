-- Fase 2b do módulo Tracking — atribuição de vendas. 100% aditivo (2 CREATE TABLE).
-- MarketingSale espelha Payment aprovado com campanha/conjunto/anúncio resolvidos.

-- CreateTable
CREATE TABLE "MarketingSale" (
    "id"                TEXT NOT NULL,
    "workspaceId"       TEXT NOT NULL,
    "paymentId"         TEXT NOT NULL,
    "leadId"            TEXT,
    "amount"            DECIMAL(14,2) NOT NULL,
    "currency"          TEXT NOT NULL DEFAULT 'BRL',
    "occurredAt"        TIMESTAMP(3) NOT NULL,
    "fbAdAccountId"     TEXT,
    "fbCampaignId"      TEXT,
    "fbAdSetId"         TEXT,
    "fbAdId"            TEXT,
    "attributionSource" TEXT NOT NULL DEFAULT 'none',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingScanState" (
    "id"            TEXT NOT NULL,
    "lastPaidAt"    TIMESTAMP(3),
    "lastPaymentId" TEXT,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingScanState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSale_paymentId_key" ON "MarketingSale"("paymentId");
CREATE INDEX "MarketingSale_workspaceId_occurredAt_idx" ON "MarketingSale"("workspaceId", "occurredAt");
CREATE INDEX "MarketingSale_fbCampaignId_occurredAt_idx" ON "MarketingSale"("fbCampaignId", "occurredAt");
CREATE INDEX "MarketingSale_fbAdSetId_occurredAt_idx" ON "MarketingSale"("fbAdSetId", "occurredAt");
CREATE INDEX "MarketingSale_fbAdId_occurredAt_idx" ON "MarketingSale"("fbAdId", "occurredAt");

-- AddForeignKey
ALTER TABLE "MarketingSale" ADD CONSTRAINT "MarketingSale_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NOTA: o índice parcial "Payment_approved_paidAt_idx" (ON "Payment"("paidAt") WHERE status='APPROVED')
-- é criado CONCURRENTLY pelo script de deploy, FORA desta migration, pra não travar
-- escrita na tabela Payment durante o boot. Não faz parte do schema Prisma.
