-- Sistema de Saldo (Financeiro) — todas as tabelas são novas e aditivas.
-- Nada aqui altera o fluxo de pagamento/webhook existente.

-- Config global da taxa (singleton, sempre 1 linha, id fixo)
CREATE TABLE IF NOT EXISTS "BalanceConfig" (
    "id"        TEXT           NOT NULL,
    "feeType"   TEXT           NOT NULL DEFAULT 'FIXED',
    "feeValue"  DECIMAL(10,4)  NOT NULL DEFAULT 0.30,
    "updatedAt" TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceConfig_pkey" PRIMARY KEY ("id")
);

-- Saldo agregado por workspace
CREATE TABLE IF NOT EXISTS "WorkspaceBalance" (
    "id"             TEXT          NOT NULL,
    "workspaceId"    TEXT          NOT NULL,
    "available"      DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalReceived"  DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalWithdrawn" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updatedAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceBalance_workspaceId_key" ON "WorkspaceBalance"("workspaceId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'WorkspaceBalance_workspaceId_fkey'
    ) THEN
        ALTER TABLE "WorkspaceBalance"
            ADD CONSTRAINT "WorkspaceBalance_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Solicitações de saque
CREATE TABLE IF NOT EXISTS "BalanceWithdrawal" (
    "id"           TEXT          NOT NULL,
    "workspaceId"  TEXT          NOT NULL,
    "amount"       DECIMAL(10,2) NOT NULL,
    "pixKeyType"   TEXT          NOT NULL,
    "pixKey"       TEXT          NOT NULL,
    "status"       TEXT          NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "requestedAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"   TIMESTAMP(3),

    CONSTRAINT "BalanceWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BalanceWithdrawal_status_idx" ON "BalanceWithdrawal"("status");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BalanceWithdrawal_workspaceId_fkey'
    ) THEN
        ALTER TABLE "BalanceWithdrawal"
            ADD CONSTRAINT "BalanceWithdrawal_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Extrato (uma linha por movimentação: venda, saque, ajuste)
CREATE TABLE IF NOT EXISTS "BalanceTransaction" (
    "id"           TEXT          NOT NULL,
    "workspaceId"  TEXT          NOT NULL,
    "type"         TEXT          NOT NULL,
    "grossAmount"  DECIMAL(10,2) NOT NULL,
    "feeAmount"    DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netAmount"    DECIMAL(10,2) NOT NULL,
    "paymentId"    TEXT,
    "withdrawalId" TEXT,
    "status"       TEXT          NOT NULL DEFAULT 'COMPLETED',
    "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BalanceTransaction_paymentId_key" ON "BalanceTransaction"("paymentId");
CREATE INDEX IF NOT EXISTS "BalanceTransaction_workspaceId_createdAt_idx" ON "BalanceTransaction"("workspaceId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BalanceTransaction_workspaceId_fkey'
    ) THEN
        ALTER TABLE "BalanceTransaction"
            ADD CONSTRAINT "BalanceTransaction_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BalanceTransaction_paymentId_fkey'
    ) THEN
        ALTER TABLE "BalanceTransaction"
            ADD CONSTRAINT "BalanceTransaction_paymentId_fkey"
            FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'BalanceTransaction_withdrawalId_fkey'
    ) THEN
        ALTER TABLE "BalanceTransaction"
            ADD CONSTRAINT "BalanceTransaction_withdrawalId_fkey"
            FOREIGN KEY ("withdrawalId") REFERENCES "BalanceWithdrawal"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Flag de idempotência no próprio pagamento — nunca credita duas vezes a mesma venda
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "balanceCredited" BOOLEAN NOT NULL DEFAULT false;

-- Semente do config padrão: taxa fixa de R$0,30, id fixo (singleton)
INSERT INTO "BalanceConfig" ("id", "feeType", "feeValue", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'FIXED', 0.30, NOW())
ON CONFLICT ("id") DO NOTHING;
