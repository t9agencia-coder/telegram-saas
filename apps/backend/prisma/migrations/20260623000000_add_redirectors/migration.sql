-- Add redirectors relation to Workspace (no column needed — FK is on Redirector)
-- Add redirectors relation to Flow (no column needed — FK is on Redirector)

-- CreateTable Redirector
CREATE TABLE IF NOT EXISTS "Redirector" (
    "id"                TEXT         NOT NULL,
    "workspaceId"       TEXT         NOT NULL,
    "name"              TEXT         NOT NULL,
    "slug"              TEXT         NOT NULL,
    "flowId"            TEXT,
    "alternativeUrl"    TEXT         NOT NULL,
    "rules"             JSONB        NOT NULL DEFAULT '{}',
    "isActive"          BOOLEAN      NOT NULL DEFAULT true,
    "totalClicks"       INTEGER      NOT NULL DEFAULT 0,
    "telegramClicks"    INTEGER      NOT NULL DEFAULT 0,
    "alternativeClicks" INTEGER      NOT NULL DEFAULT 0,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Redirector_pkey" PRIMARY KEY ("id")
);

-- CreateTable RedirectorClick
CREATE TABLE IF NOT EXISTS "RedirectorClick" (
    "id"           TEXT         NOT NULL,
    "redirectorId" TEXT         NOT NULL,
    "destination"  TEXT         NOT NULL,
    "source"       TEXT,
    "device"       TEXT,
    "os"           TEXT,
    "country"      TEXT,
    "language"     TEXT,
    "ip"           TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedirectorClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex unique slug
CREATE UNIQUE INDEX IF NOT EXISTS "Redirector_slug_key" ON "Redirector"("slug");

-- AddForeignKey Redirector → Workspace
ALTER TABLE "Redirector"
    ADD CONSTRAINT "Redirector_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Redirector → Flow (optional)
ALTER TABLE "Redirector"
    ADD CONSTRAINT "Redirector_flowId_fkey"
    FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey RedirectorClick → Redirector
ALTER TABLE "RedirectorClick"
    ADD CONSTRAINT "RedirectorClick_redirectorId_fkey"
    FOREIGN KEY ("redirectorId") REFERENCES "Redirector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trigger to auto-update updatedAt on Redirector
CREATE OR REPLACE FUNCTION update_redirector_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS redirector_updated_at ON "Redirector";
CREATE TRIGGER redirector_updated_at
    BEFORE UPDATE ON "Redirector"
    FOR EACH ROW EXECUTE FUNCTION update_redirector_updated_at();
