-- Controle de Aprovação de Vendas por Conta (painel admin)
-- Aditivo: não remove/altera nenhum campo existente. Toda venda já paga é
-- retroativamente marcada como approvalStatus='APPROVED' pra não mudar
-- nenhum dashboard/estatística existente.

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "approvalControlEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "approvalPercentage" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "approvalApprovedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "approvalTotalCount" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  CREATE TYPE "SaleApprovalStatus" AS ENUM ('APPROVED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "approvalStatus" "SaleApprovalStatus";
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;

UPDATE "Payment" SET "approvalStatus" = 'APPROVED' WHERE status = 'APPROVED' AND "approvalStatus" IS NULL;

CREATE INDEX IF NOT EXISTS "Payment_status_approvalStatus_idx" ON "Payment"("status", "approvalStatus");
