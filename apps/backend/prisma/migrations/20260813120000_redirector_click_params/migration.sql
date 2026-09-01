-- Parâmetros da URL clicada, salvos direto no RedirectorClick (aba "Filtro"
-- do admin) — evita depender de UserTracking, que não tem FK pra Redirector.
-- Colunas aditivas, todas nullable — nenhuma linha existente é afetada.
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "utmSource"   TEXT;
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "utmMedium"   TEXT;
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT;
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "utmContent"  TEXT;
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "utmTerm"     TEXT;
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "fbclid"      TEXT;
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "ttclid"      TEXT;
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "kwaiId"      TEXT;

-- A tabela recebe dezenas de milhares de linhas por dia e nunca teve
-- índice — a aba "Filtro" pagina/ordena por data e filtra por redirecionador,
-- então esses dois cobrem os acessos reais sem duplicar índice.
CREATE INDEX IF NOT EXISTS "RedirectorClick_createdAt_idx" ON "RedirectorClick"("createdAt");
CREATE INDEX IF NOT EXISTS "RedirectorClick_redirectorId_createdAt_idx" ON "RedirectorClick"("redirectorId", "createdAt");
