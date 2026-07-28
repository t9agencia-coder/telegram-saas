-- Cadastro passa a coletar WhatsApp e IP de origem do usuário.
-- Nullable: usuários já existentes não têm esses dados retroativos.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "registrationIp" TEXT;
