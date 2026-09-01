-- Permite que um redirecionador mande o tráfego que casou com as regras pra
-- um link externo qualquer, em vez de sempre montar um deep link do Telegram.
-- Colunas aditivas com default — redirecionadores existentes continuam
-- 'telegram', comportamento idêntico ao de hoje.

ALTER TABLE "Redirector" ADD COLUMN IF NOT EXISTS "destinationType" TEXT NOT NULL DEFAULT 'telegram';
ALTER TABLE "Redirector" ADD COLUMN IF NOT EXISTS "externalUrl" TEXT;
