-- Navegador (user agent) de todo clique, inclusive barrados — só adiciona coluna.
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
