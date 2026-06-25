CREATE TABLE IF NOT EXISTS "FacebookEventLog" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId"  TEXT NOT NULL,
  "chatId"       TEXT,
  "eventName"    TEXT NOT NULL,
  "pixelId"      TEXT NOT NULL,
  "orderId"      TEXT,
  "value"        DECIMAL(10, 2),
  "status"       TEXT NOT NULL,
  "response"     JSONB,
  "errorMessage" TEXT,
  "sentAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FacebookEventLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FacebookEventLog_workspaceId_idx" ON "FacebookEventLog"("workspaceId");
CREATE INDEX IF NOT EXISTS "FacebookEventLog_chatId_idx"      ON "FacebookEventLog"("chatId");
CREATE INDEX IF NOT EXISTS "FacebookEventLog_sentAt_idx"      ON "FacebookEventLog"("sentAt" DESC);
