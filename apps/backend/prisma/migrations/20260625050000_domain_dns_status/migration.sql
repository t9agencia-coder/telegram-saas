-- AddColumn: dnsStatus (default 'pending' para novos domínios)
ALTER TABLE "Domain" ADD COLUMN IF NOT EXISTS "dnsStatus" TEXT NOT NULL DEFAULT 'pending';

-- AddColumn: verifiedAt (nullable)
ALTER TABLE "Domain" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);

-- Marcar domínios já ativos (app.firebot.shop) como verificados
-- isActive=true implica que já estava funcionando antes desta migração
UPDATE "Domain"
SET "dnsStatus" = 'active',
    "verifiedAt" = NOW()
WHERE "isActive" = true;

-- Domínios inativos ficam como 'pending' (já é o default)
