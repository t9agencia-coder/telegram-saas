-- Taxas de pagamento/plataforma pro módulo Tracking (Fase 2a). 100% aditivo.
-- Singleton por workspace: % sobre a venda + valor fixo por venda.

-- CreateTable
CREATE TABLE "TrackingFeeConfig" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "percentFee"  DECIMAL(6,3) NOT NULL DEFAULT 0,
    "fixedFee"    DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingFeeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackingFeeConfig_workspaceId_key" ON "TrackingFeeConfig"("workspaceId");

-- AddForeignKey
ALTER TABLE "TrackingFeeConfig" ADD CONSTRAINT "TrackingFeeConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
