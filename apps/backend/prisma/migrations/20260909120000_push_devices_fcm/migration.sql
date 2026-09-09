-- Fase 6 — push do app mobile (FCM/APNs). 100% aditivo (1 CREATE TABLE).
-- Paralelo ao PushSubscription (web push); respeita o mesmo PushNotificationSettings.

-- CreateTable
CREATE TABLE "PushDevice" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "token"       TEXT NOT NULL,
    "platform"    TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_token_key" ON "PushDevice"("token");
CREATE INDEX "PushDevice_workspaceId_idx" ON "PushDevice"("workspaceId");

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
