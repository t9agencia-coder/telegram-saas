-- Proteção contra replay de código TOTP: guarda o último timeStep aceito por
-- usuário e passa como `afterTimeStep` na próxima verificação (otplib), que
-- rejeita reutilizar o mesmo código (ou um anterior) dentro da janela válida.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastTotpTimeStep" INTEGER;
