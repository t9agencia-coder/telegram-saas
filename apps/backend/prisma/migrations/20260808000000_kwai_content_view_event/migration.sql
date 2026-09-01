-- Novo evento de topo de funil pro Kwai Ads, equivalente ao PageView do
-- Facebook CAPI: disparado quando o lead passa pelo redirecionador, antes de
-- existir qualquer Lead. Coluna aditiva com default true — contas já
-- configuradas passam a mandar o evento novo automaticamente, sem precisar
-- de ação manual, e nada do que já existe (AddToCart/Purchase) muda.

ALTER TABLE "KwaiIntegration" ADD COLUMN IF NOT EXISTS "eventContentView" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "KwaiAccount" ADD COLUMN IF NOT EXISTS "eventContentView" BOOLEAN NOT NULL DEFAULT true;
