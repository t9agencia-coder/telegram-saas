-- Add testToken field to KwaiIntegration
ALTER TABLE "KwaiIntegration" ADD COLUMN "testToken" TEXT NOT NULL DEFAULT '';
