-- CreateTable: Domain
CREATE TABLE IF NOT EXISTS "Domain" (
    "id"        TEXT         NOT NULL,
    "domain"    TEXT         NOT NULL,
    "isActive"  BOOLEAN      NOT NULL DEFAULT false,
    "isDefault" BOOLEAN      NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- UniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Domain_domain_key" ON "Domain"("domain");

-- AddColumn: domainId in Redirector (nullable, backward-compatible)
ALTER TABLE "Redirector" ADD COLUMN IF NOT EXISTS "domainId" TEXT;

-- ForeignKey: Redirector.domainId -> Domain.id (SET NULL on delete)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Redirector_domainId_fkey'
    ) THEN
        ALTER TABLE "Redirector"
            ADD CONSTRAINT "Redirector_domainId_fkey"
            FOREIGN KEY ("domainId") REFERENCES "Domain"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Seed: register the current platform domain as default
-- Uses FRONTEND_URL env if available, falls back to 'app.firebot.shop'
INSERT INTO "Domain" ("id", "domain", "isActive", "isDefault", "createdAt", "updatedAt")
VALUES (
    gen_random_uuid()::text,
    'app.firebot.shop',
    true,
    true,
    NOW(),
    NOW()
)
ON CONFLICT ("domain") DO NOTHING;
