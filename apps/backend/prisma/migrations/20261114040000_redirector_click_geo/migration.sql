-- Localização (estado/cidade) do clique — só adiciona colunas.
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "city" TEXT;
