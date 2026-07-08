-- AddColumn: sslStatus
ALTER TABLE "Domain" ADD COLUMN IF NOT EXISTS "sslStatus" TEXT NOT NULL DEFAULT 'pending';

-- AddColumn: sslIssuedAt
ALTER TABLE "Domain" ADD COLUMN IF NOT EXISTS "sslIssuedAt" TIMESTAMP(3);

-- Domínios já ativos (app.firebot.shop) já têm SSL funcionando
UPDATE "Domain"
SET "sslStatus" = 'active',
    "sslIssuedAt" = NOW()
WHERE "isActive" = true
  AND "dnsStatus" = 'active';
