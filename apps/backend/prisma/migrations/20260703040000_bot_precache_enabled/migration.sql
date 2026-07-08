-- Pré-cache inteligente de mídia — aditivo, default false preserva o
-- comportamento de todo bot já existente.
ALTER TABLE "TelegramBot" ADD COLUMN IF NOT EXISTS "precacheEnabled" BOOLEAN NOT NULL DEFAULT false;
