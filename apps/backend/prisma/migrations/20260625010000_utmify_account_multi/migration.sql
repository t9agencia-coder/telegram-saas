-- CreateTable
CREATE TABLE "UtmifyAccount" (
    "id"             TEXT NOT NULL,
    "workspaceId"    TEXT NOT NULL,
    "botId"          TEXT,
    "name"           TEXT,
    "apiKey"         TEXT NOT NULL,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "eventPixGerado" BOOLEAN NOT NULL DEFAULT true,
    "eventPixPago"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtmifyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UtmifyAccount_workspaceId_idx" ON "UtmifyAccount"("workspaceId");

-- AddForeignKey
ALTER TABLE "UtmifyAccount" ADD CONSTRAINT "UtmifyAccount_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtmifyAccount" ADD CONSTRAINT "UtmifyAccount_botId_fkey"
    FOREIGN KEY ("botId") REFERENCES "TelegramBot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
