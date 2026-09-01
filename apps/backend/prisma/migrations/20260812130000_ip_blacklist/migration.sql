-- Camada complementar à TelegramBlacklist: bloqueio por IP, checável só no
-- fluxo do Redirecionador (único ponto que vê o IP real do visitante).
-- Permanente (sem expiresAt) e sem cache em Redis (volume bem menor que
-- mensagens do Telegram — ver comentário no schema.prisma).
CREATE TABLE "IpBlacklist" (
    "id"         TEXT NOT NULL,
    "ip"         TEXT NOT NULL,
    "telegramId" TEXT,
    "reason"     TEXT,
    "createdBy"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpBlacklist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IpBlacklist_ip_key" ON "IpBlacklist"("ip");
