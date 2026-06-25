-- Add version counter to Flow
ALTER TABLE "Flow" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- Create FlowVersion history table
CREATE TABLE IF NOT EXISTS "FlowVersion" (
  "id"        TEXT NOT NULL,
  "flowId"    TEXT NOT NULL,
  "version"   INTEGER NOT NULL,
  "nodes"     JSONB NOT NULL,
  "edges"     JSONB NOT NULL,
  "config"    JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FlowVersion_pkey" PRIMARY KEY ("id")
);

-- Foreign key
ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index for fast lookup by flow
CREATE INDEX IF NOT EXISTS "FlowVersion_flowId_idx" ON "FlowVersion"("flowId");
