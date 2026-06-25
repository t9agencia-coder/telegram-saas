-- Add event toggle columns to FacebookIntegration
ALTER TABLE "FacebookIntegration"
  ADD COLUMN IF NOT EXISTS "eventPageView"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "eventAddToCart" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "eventPurchase"  BOOLEAN NOT NULL DEFAULT true;
