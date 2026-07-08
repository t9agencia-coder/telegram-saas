-- Chat de aquecimento de mídia (pré-cache proativo) — aditivo, nulo por padrão,
-- zero impacto em bot existente até o dono escanear o QR code.
ALTER TABLE "TelegramBot" ADD COLUMN IF NOT EXISTS "warmupChatId" TEXT;
