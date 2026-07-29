-- Webhooks de saída (outbound) por conta — painel do usuário.
-- Aditivo: cria 2 tabelas novas, não altera/remove nada existente.

CREATE TABLE IF NOT EXISTS "WebhookSettings" (
  "id"            TEXT NOT NULL,
  "workspaceId"   TEXT NOT NULL,
  "enabled"       BOOLEAN NOT NULL DEFAULT false,
  "url"           TEXT,
  "secret"        TEXT,
  "enabledEvents" TEXT[] NOT NULL DEFAULT ARRAY['sale_pending', 'sale_approved']::TEXT[],
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookSettings_workspaceId_key" ON "WebhookSettings"("workspaceId");

CREATE TABLE IF NOT EXISTS "WebhookLog" (
  "id"             TEXT NOT NULL,
  "workspaceId"    TEXT NOT NULL,
  "paymentId"      TEXT,
  "eventId"        TEXT NOT NULL,
  "event"          TEXT NOT NULL,
  "url"            TEXT NOT NULL,
  "payload"        JSONB NOT NULL,
  "responseStatus" INTEGER,
  "responseBody"   TEXT,
  "executionMs"    INTEGER,
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "success"        BOOLEAN NOT NULL DEFAULT false,
  "errorMessage"   TEXT,
  "isTest"         BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookLog_eventId_key" ON "WebhookLog"("eventId");
CREATE INDEX IF NOT EXISTS "WebhookLog_workspaceId_createdAt_idx" ON "WebhookLog"("workspaceId", "createdAt");

-- FKs (best-effort; se já existirem por rerun, ignora)
DO $$ BEGIN
  ALTER TABLE "WebhookSettings" ADD CONSTRAINT "WebhookSettings_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
