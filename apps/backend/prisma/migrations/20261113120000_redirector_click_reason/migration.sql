-- Motivo de o clique não ter entrado (página alternativa / bloqueado).
-- 100% aditivo: 1 coluna nova anulável. O backend-standby (imagem anterior)
-- continua funcionando durante o deploy, porque não conhece a coluna.
ALTER TABLE "RedirectorClick" ADD COLUMN IF NOT EXISTS "reason" TEXT;
