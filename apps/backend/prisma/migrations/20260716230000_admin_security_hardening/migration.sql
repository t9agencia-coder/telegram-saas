-- 2FA (TOTP) obrigatório pra ADMIN + revogação de sessão (tokenVersion) +
-- AuditLog passa a aceitar ações fora de um workspace (painel de admin).
-- Ver incidente de segurança de 16/07/2026 (admin@admin.com comprometido).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AuditLog" ALTER COLUMN "workspaceId" DROP NOT NULL;
