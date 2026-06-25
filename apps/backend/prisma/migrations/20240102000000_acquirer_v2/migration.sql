-- Migration: acquirer_v2
-- Adiciona novos campos ao modelo Acquirer e torna endpointCreatePix/endpointCheckPix opcionais

-- Torna os endpoints opcionais (nullable)
ALTER TABLE "Acquirer" ALTER COLUMN "endpointCreatePix" DROP NOT NULL;
ALTER TABLE "Acquirer" ALTER COLUMN "endpointCheckPix"  DROP NOT NULL;

-- Adiciona novos campos
ALTER TABLE "Acquirer" ADD COLUMN IF NOT EXISTS "environment"       TEXT NOT NULL DEFAULT 'production';
ALTER TABLE "Acquirer" ADD COLUMN IF NOT EXISTS "logoUrl"           TEXT;
ALTER TABLE "Acquirer" ADD COLUMN IF NOT EXISTS "credentialStatus"  TEXT NOT NULL DEFAULT 'UNCONFIGURED';
ALTER TABLE "Acquirer" ADD COLUMN IF NOT EXISTS "lastValidatedAt"   TIMESTAMP(3);
ALTER TABLE "Acquirer" ADD COLUMN IF NOT EXISTS "lastTestedAt"      TIMESTAMP(3);
