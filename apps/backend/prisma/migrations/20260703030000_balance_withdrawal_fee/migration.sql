-- Taxa de saque: cobrada toda vez que o usuário solicita um saque. Aditivo, com
-- defaults seguros — não altera nenhum comportamento existente até o admin configurar.

ALTER TABLE "BalanceConfig" ADD COLUMN IF NOT EXISTS "withdrawalFee" DECIMAL(10,2) NOT NULL DEFAULT 5.00;

ALTER TABLE "BalanceWithdrawal" ADD COLUMN IF NOT EXISTS "feeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "BalanceWithdrawal" ADD COLUMN IF NOT EXISTS "netAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Semente: garante que a linha de config já existente ganhe o valor padrão de R$5,00
UPDATE "BalanceConfig" SET "withdrawalFee" = 5.00
WHERE id = '00000000-0000-0000-0000-000000000001' AND "withdrawalFee" IS NULL;
