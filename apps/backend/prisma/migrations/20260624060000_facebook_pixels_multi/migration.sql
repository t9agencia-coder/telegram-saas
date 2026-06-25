-- AddColumn Lead.botId
ALTER TABLE "Lead" ADD COLUMN "botId" TEXT;

-- AddForeignKey Lead.botId → TelegramBot
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "TelegramBot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable FacebookPixel
CREATE TABLE "FacebookPixel" (
    "id"             TEXT NOT NULL,
    "workspaceId"    TEXT NOT NULL,
    "botId"          TEXT,
    "name"           TEXT,
    "pixelId"        TEXT NOT NULL,
    "accessToken"    TEXT NOT NULL,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "eventPageView"  BOOLEAN NOT NULL DEFAULT true,
    "eventAddToCart" BOOLEAN NOT NULL DEFAULT true,
    "eventPurchase"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookPixel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FacebookPixel_workspaceId_idx" ON "FacebookPixel"("workspaceId");

-- AddForeignKey FacebookPixel.workspaceId → Workspace
ALTER TABLE "FacebookPixel" ADD CONSTRAINT "FacebookPixel_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey FacebookPixel.botId → TelegramBot
ALTER TABLE "FacebookPixel" ADD CONSTRAINT "FacebookPixel_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "TelegramBot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
