-- Módulo Marketing (Fase 1) — tabelas próprias, 100% aditivo.
-- Nenhum ALTER/DROP em tabela existente. Espelho read-only da Meta Marketing API
-- (conexão OAuth + campanhas/adsets/ads/insights). Ver bloco "MÓDULO MARKETING"
-- no schema.prisma.

-- CreateTable
CREATE TABLE "MetaConnection" (
    "id"             TEXT NOT NULL,
    "workspaceId"    TEXT NOT NULL,
    "metaUserId"     TEXT,
    "accessToken"    TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes"         TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status"         TEXT NOT NULL DEFAULT 'active',
    "lastError"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdAccount" (
    "id"               TEXT NOT NULL,
    "workspaceId"      TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "fbAdAccountId"    TEXT NOT NULL,
    "name"             TEXT,
    "currency"         TEXT,
    "timezoneName"     TEXT,
    "status"           TEXT,
    "isSelected"       BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt"     TIMESTAMP(3),
    "lastInsightsAt"   TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCampaign" (
    "id"              TEXT NOT NULL,
    "adAccountId"     TEXT NOT NULL,
    "fbCampaignId"    TEXT NOT NULL,
    "name"            TEXT,
    "status"          TEXT,
    "effectiveStatus" TEXT,
    "objective"       TEXT,
    "dailyBudget"     DECIMAL(14,2),
    "lifetimeBudget"  DECIMAL(14,2),
    "syncedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdSet" (
    "id"              TEXT NOT NULL,
    "campaignId"      TEXT NOT NULL,
    "fbAdSetId"       TEXT NOT NULL,
    "name"            TEXT,
    "status"          TEXT,
    "effectiveStatus" TEXT,
    "dailyBudget"     DECIMAL(14,2),
    "lifetimeBudget"  DECIMAL(14,2),
    "syncedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAdSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAd" (
    "id"              TEXT NOT NULL,
    "adSetId"         TEXT NOT NULL,
    "fbAdId"          TEXT NOT NULL,
    "name"            TEXT,
    "status"          TEXT,
    "effectiveStatus" TEXT,
    "syncedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaInsightDaily" (
    "id"            TEXT NOT NULL,
    "workspaceId"   TEXT NOT NULL,
    "fbAdAccountId" TEXT NOT NULL,
    "fbCampaignId"  TEXT,
    "fbAdSetId"     TEXT,
    "fbAdId"        TEXT NOT NULL,
    "date"          DATE NOT NULL,
    "spend"         DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impressions"   INTEGER NOT NULL DEFAULT 0,
    "reach"         INTEGER NOT NULL DEFAULT 0,
    "clicks"        INTEGER NOT NULL DEFAULT 0,
    "linkClicks"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaInsightDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaConnection_workspaceId_idx" ON "MetaConnection"("workspaceId");

-- CreateIndex
CREATE INDEX "MetaAdAccount_metaConnectionId_idx" ON "MetaAdAccount"("metaConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdAccount_workspaceId_fbAdAccountId_key" ON "MetaAdAccount"("workspaceId", "fbAdAccountId");

-- CreateIndex
CREATE INDEX "MetaCampaign_fbCampaignId_idx" ON "MetaCampaign"("fbCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaign_adAccountId_fbCampaignId_key" ON "MetaCampaign"("adAccountId", "fbCampaignId");

-- CreateIndex
CREATE INDEX "MetaAdSet_fbAdSetId_idx" ON "MetaAdSet"("fbAdSetId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdSet_campaignId_fbAdSetId_key" ON "MetaAdSet"("campaignId", "fbAdSetId");

-- CreateIndex
CREATE INDEX "MetaAd_fbAdId_idx" ON "MetaAd"("fbAdId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAd_adSetId_fbAdId_key" ON "MetaAd"("adSetId", "fbAdId");

-- CreateIndex
CREATE INDEX "MetaInsightDaily_workspaceId_date_idx" ON "MetaInsightDaily"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "MetaInsightDaily_fbCampaignId_date_idx" ON "MetaInsightDaily"("fbCampaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MetaInsightDaily_fbAdId_date_key" ON "MetaInsightDaily"("fbAdId", "date");

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "MetaAdAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "MetaAdAccount_metaConnectionId_fkey" FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaign" ADD CONSTRAINT "MetaCampaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MetaCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "MetaAdSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
