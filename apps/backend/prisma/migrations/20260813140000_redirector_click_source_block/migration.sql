-- Informações complementares no clique (aba "Filtro" do admin): origem do
-- tráfego classificada (rede social/WhatsApp/direto) e, quando o clique foi
-- barrado pela blacklist de IP, qual Telegram ID causou aquele bloqueio.
-- Colunas aditivas, todas nullable — nenhuma linha existente é afetada.
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "referer"           TEXT;
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "trafficSource"     TEXT;
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "blockedTelegramId" TEXT;
