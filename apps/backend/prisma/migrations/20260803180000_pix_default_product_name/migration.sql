-- Nome de produto padrão enviado às adquirentes PIX quando a cobrança não tem
-- produto de catálogo vinculado (botões de plano do fluxo, upsells). Editável
-- pelo painel admin. Coluna aditiva com default — não altera nada existente.

ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "pixDefaultProductName" TEXT NOT NULL DEFAULT 'Produto 1';
