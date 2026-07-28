-- Bloqueio de conta por tentativas de login falhas, independente do IP.
-- Ver: rate-limit por IP (ThrottlerGuard) sozinho não impede um atacante
-- distribuindo as tentativas por vários IPs contra a mesma conta.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
