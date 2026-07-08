-- CreateTable: RemarketingBroadcast
-- Registro persistente de cada disparo em massa do Remarketing Master:
-- progresso (sent/failed) e histórico, sobrevive mesmo se o fluxo for editado/apagado depois.
CREATE TABLE IF NOT EXISTS "RemarketingBroadcast" (
    "id"          TEXT         NOT NULL,
    "flowId"      TEXT         NOT NULL,
    "flowName"    TEXT         NOT NULL,
    "botUsername" TEXT,
    "workspaceId" TEXT,
    "total"       INTEGER      NOT NULL,
    "sent"        INTEGER      NOT NULL DEFAULT 0,
    "failed"      INTEGER      NOT NULL DEFAULT 0,
    "status"      TEXT         NOT NULL DEFAULT 'RUNNING',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"  TIMESTAMP(3),

    CONSTRAINT "RemarketingBroadcast_pkey" PRIMARY KEY ("id")
);

-- Index: ordenação por data no histórico
CREATE INDEX IF NOT EXISTS "RemarketingBroadcast_createdAt_idx" ON "RemarketingBroadcast"("createdAt");
