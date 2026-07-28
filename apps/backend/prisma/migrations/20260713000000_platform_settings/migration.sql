-- Configurações globais da plataforma (singleton, sempre 1 linha, id fixo).
-- Tabela nova e aditiva — não altera nada existente.

CREATE TABLE IF NOT EXISTS "PlatformSettings" (
    "id"                 TEXT         NOT NULL,
    "telegramLinkDomain" TEXT         NOT NULL DEFAULT 't.me',
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- Semente do config padrão: t.me (comportamento atual, sem mudança), id fixo (singleton)
INSERT INTO "PlatformSettings" ("id", "telegramLinkDomain", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000002', 't.me', NOW())
ON CONFLICT ("id") DO NOTHING;
