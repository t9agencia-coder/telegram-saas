-- AddColumn: disabledAcquirerIds em Workspace
-- Array vazio (default) = nenhum adquirente desativado pra esse workspace, exatamente
-- como já funciona hoje. Aplica-se como filtro em cima da ordem (global ou customizada).
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "disabledAcquirerIds" TEXT[] NOT NULL DEFAULT '{}';
