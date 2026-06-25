-- Add entryType and startPayload fields to Lead model
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "entryType" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "startPayload" TEXT;
