-- Oculta domínio da lista de escolha em novos redirecionadores — aditivo,
-- default false, zero impacto em domínio/redirecionador existente.
ALTER TABLE "Domain" ADD COLUMN IF NOT EXISTS "hiddenFromPicker" BOOLEAN NOT NULL DEFAULT false;
