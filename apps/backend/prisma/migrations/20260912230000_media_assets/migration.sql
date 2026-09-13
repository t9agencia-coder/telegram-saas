-- Mídia-teca (Fase 1) — 100% aditivo: 1 CREATE TABLE, nada existente é tocado.
--
-- Guarda a identidade do arquivo original de cada mídia de fluxo. Os bytes ficam
-- no volume `media_data` (/app/media), em caminho derivado do sha256. Antes disso
-- o Telegram era a única cópia depois que o base64 era removido do fluxo, e
-- trocar/excluir o bot destruía a mídia junto com o file_id.

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id"           TEXT NOT NULL,
    "workspaceId"  TEXT NOT NULL,
    "sha256"       TEXT NOT NULL,
    "mime"         TEXT NOT NULL,
    "type"         TEXT NOT NULL,
    "sizeBytes"    INTEGER NOT NULL,
    "originalName" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Dedupe por conteúdo dentro do workspace: reenviar o mesmo vídeo reaproveita
-- a linha (e o arquivo em disco) em vez de duplicar.
CREATE UNIQUE INDEX "MediaAsset_workspaceId_sha256_key" ON "MediaAsset"("workspaceId", "sha256");
CREATE INDEX "MediaAsset_workspaceId_idx" ON "MediaAsset"("workspaceId");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
