-- CreateTable UserTracking
CREATE TABLE IF NOT EXISTS "UserTracking" (
    "id"          TEXT         NOT NULL,
    "platform"    TEXT,
    "utmSource"   TEXT,
    "utmMedium"   TEXT,
    "utmCampaign" TEXT,
    "utmContent"  TEXT,
    "utmTerm"     TEXT,
    "fbclid"      TEXT,
    "fbp"         TEXT,
    "fbc"         TEXT,
    "ttclid"      TEXT,
    "ttp"         TEXT,
    "kwaiId"      TEXT,
    "kwaiPixel"   TEXT,
    "ip"          TEXT,
    "userAgent"   TEXT,
    "chatId"      TEXT,
    "capturedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTracking_pkey" PRIMARY KEY ("id")
);

-- Trigger to auto-update updatedAt
CREATE OR REPLACE FUNCTION update_user_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_tracking_updated_at ON "UserTracking";
CREATE TRIGGER user_tracking_updated_at
    BEFORE UPDATE ON "UserTracking"
    FOR EACH ROW EXECUTE FUNCTION update_user_tracking_updated_at();
