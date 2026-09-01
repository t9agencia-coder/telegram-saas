-- URL do redirect que originou o clique, persistida em UserTracking pra ser
-- reaproveitada como event_source_url do Facebook CAPI em eventos que
-- disparam depois (AddToCart/Purchase), quando não há mais contexto de
-- página disponível. Coluna aditiva, nullable — nenhuma linha existente é afetada.
ALTER TABLE "UserTracking" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
