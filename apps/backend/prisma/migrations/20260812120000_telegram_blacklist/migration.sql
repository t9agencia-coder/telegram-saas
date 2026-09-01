-- Blacklist global de usuários do Telegram, chaveada pelo telegramId puro
-- (não pelo Lead.id interno, que não é único por usuário — ver comentário
-- no schema.prisma). Índice único cobre tanto a constraint de duplicidade
-- quanto o lookup rápido usado como fallback do cache em Redis.
CREATE TABLE "TelegramBlacklist" (
    "id"         TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "reason"     TEXT,
    "createdBy"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramBlacklist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramBlacklist_telegramId_key" ON "TelegramBlacklist"("telegramId");
