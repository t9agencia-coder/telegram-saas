-- Verificação de e-mail no cadastro (código de 6 dígitos).
-- Default true em emailVerified preserva o acesso de todos os usuários já
-- existentes — só o fluxo de registro novo grava false explicitamente.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationAttempts" INTEGER NOT NULL DEFAULT 0;
