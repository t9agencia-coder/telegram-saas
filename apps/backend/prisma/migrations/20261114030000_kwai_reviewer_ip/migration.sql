-- Lista de revisores do Kwai já vistos (só adiciona tabela — seguro com o standby rodando a imagem antiga).
CREATE TABLE IF NOT EXISTS "KwaiReviewerIp" (
    "id" TEXT NOT NULL,
    "ipKey" TEXT NOT NULL,
    "lastIp" TEXT,
    "reason" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KwaiReviewerIp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "KwaiReviewerIp_ipKey_key" ON "KwaiReviewerIp"("ipKey");
