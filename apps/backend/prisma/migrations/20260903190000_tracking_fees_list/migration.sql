-- Taxas nomeadas do módulo Tracking — várias por workspace (% ou fixo). 100% aditivo.
-- O seed a partir de TrackingFeeConfig é feito lazy no TrackingFinanceService.getFees.

-- CreateTable
CREATE TABLE "TrackingFee" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "kind"        TEXT NOT NULL DEFAULT 'percent',
    "value"       DECIMAL(12,4) NOT NULL DEFAULT 0,
    "enabled"     BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackingFee_workspaceId_idx" ON "TrackingFee"("workspaceId");

-- AddForeignKey
ALTER TABLE "TrackingFee" ADD CONSTRAINT "TrackingFee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
