-- Rename advertiserId to pixelId in KwaiIntegration
ALTER TABLE "KwaiIntegration" RENAME COLUMN "advertiserId" TO "pixelId";

-- Add event toggle fields to KwaiIntegration
ALTER TABLE "KwaiIntegration" ADD COLUMN "eventAddToCart" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "KwaiIntegration" ADD COLUMN "eventPurchase"  BOOLEAN NOT NULL DEFAULT TRUE;

-- Create KwaiEventLog table
CREATE TABLE "KwaiEventLog" (
    "id"           TEXT NOT NULL,
    "workspaceId"  TEXT NOT NULL,
    "eventName"    TEXT NOT NULL,
    "pixelId"      TEXT NOT NULL,
    "clickId"      TEXT,
    "chatId"       TEXT,
    "orderId"      TEXT,
    "value"        DOUBLE PRECISION,
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "response"     JSONB,
    "errorMessage" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KwaiEventLog_pkey" PRIMARY KEY ("id")
);

-- Add index and FK for KwaiEventLog
CREATE INDEX "KwaiEventLog_workspaceId_idx" ON "KwaiEventLog"("workspaceId");

ALTER TABLE "KwaiEventLog" ADD CONSTRAINT "KwaiEventLog_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
