-- PWA instalável + Web Push (venda pendente/aprovada em tempo real).
-- Aditivo: cria 2 tabelas novas + 2 colunas novas em PlatformSettings.
-- Não altera/remove nada existente.

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "endpoint"    TEXT NOT NULL,
  "p256dh"      TEXT NOT NULL,
  "auth"        TEXT NOT NULL,
  "userAgent"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_workspaceId_idx" ON "PushSubscription"("workspaceId");

CREATE TABLE IF NOT EXISTS "PushNotificationSettings" (
  "id"            TEXT NOT NULL,
  "workspaceId"   TEXT NOT NULL,
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  "enabledEvents" TEXT[] NOT NULL DEFAULT ARRAY['sale_pending', 'sale_approved']::TEXT[],
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushNotificationSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushNotificationSettings_workspaceId_key" ON "PushNotificationSettings"("workspaceId");

ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "vapidPublicKey" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "vapidPrivateKey" TEXT;

-- FKs (best-effort; se já existirem por rerun, ignora)
DO $$ BEGIN
  ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PushNotificationSettings" ADD CONSTRAINT "PushNotificationSettings_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
