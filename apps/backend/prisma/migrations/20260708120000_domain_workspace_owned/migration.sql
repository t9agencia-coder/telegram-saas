-- Domínios próprios por conta — aditivo, nulo por padrão. Todo domínio já
-- cadastrado (inclusive os globais do admin) fica com workspaceId NULL,
-- comportamento idêntico ao de hoje.
ALTER TABLE "Domain" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Domain" ADD CONSTRAINT "Domain_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Domain_workspaceId_idx" ON "Domain"("workspaceId");
