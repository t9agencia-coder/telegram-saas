-- CreateTable
CREATE TABLE "KwaiAccount" (
    "id"             TEXT NOT NULL,
    "workspaceId"    TEXT NOT NULL,
    "botId"          TEXT,
    "name"           TEXT,
    "pixelId"        TEXT NOT NULL,
    "accessToken"    TEXT NOT NULL,
    "testToken"      TEXT NOT NULL DEFAULT '',
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "eventAddToCart" BOOLEAN NOT NULL DEFAULT true,
    "eventPurchase"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KwaiAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KwaiAccount_workspaceId_idx" ON "KwaiAccount"("workspaceId");

-- AddForeignKey
ALTER TABLE "KwaiAccount" ADD CONSTRAINT "KwaiAccount_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KwaiAccount" ADD CONSTRAINT "KwaiAccount_botId_fkey"
    FOREIGN KEY ("botId") REFERENCES "TelegramBot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
