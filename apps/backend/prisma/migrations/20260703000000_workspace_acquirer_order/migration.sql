-- AddColumn: acquirerOrder em Workspace
-- Array vazio (default) = usa a configuração global de adquirentes PIX, exatamente
-- como já funciona hoje. Só passa a ter efeito quando o admin definir uma ordem
-- customizada pra um workspace específico.
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "acquirerOrder" TEXT[] NOT NULL DEFAULT '{}';
