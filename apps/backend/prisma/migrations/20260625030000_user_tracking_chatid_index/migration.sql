-- Índice composto para acelerar resolveTracking (chatId + capturedAt DESC)
-- Sem isso, cada evento Kwai/Facebook faz full scan em UserTracking
CREATE INDEX IF NOT EXISTS "UserTracking_chatId_capturedAt_idx"
  ON "UserTracking" ("chatId", "capturedAt" DESC);
