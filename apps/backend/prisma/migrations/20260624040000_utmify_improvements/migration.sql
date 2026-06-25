-- Add event toggle columns to UtmifyIntegration
ALTER TABLE "UtmifyIntegration"
  ADD COLUMN IF NOT EXISTS "eventPixGerado" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "eventPixPago"   BOOLEAN NOT NULL DEFAULT true;

-- Create UtmifyEventLog
CREATE TABLE IF NOT EXISTS "UtmifyEventLog" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId"  TEXT NOT NULL,
  "chatId"       TEXT,
  "orderId"      TEXT,
  "status"       TEXT NOT NULL,
  "valueInCents" INTEGER,
  "response"     JSONB,
  "errorMessage" TEXT,
  "sentAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UtmifyEventLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UtmifyEventLog_workspaceId_idx" ON "UtmifyEventLog"("workspaceId");
CREATE INDEX IF NOT EXISTS "UtmifyEventLog_orderId_idx"     ON "UtmifyEventLog"("orderId");
