// Gravação atômica dos 3 esquemas de cache de mídia já existentes, extraída pra
// um lugar compartilhado — mesma query já usada e testada em
// webhooks.service.ts (mediaCache) e remarketing.processor.ts (legado/multi-slot).
// Usa jsonb_set/|| direto no Postgres pra nunca perder um update quando duas
// gravações concorrentes acontecem quase ao mesmo tempo.

export async function saveMediaCacheEntry(
  prisma: any,
  flowId: string,
  key: string,
  fileId: string,
  botId: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Flow"
    SET config = jsonb_set(
      COALESCE(config, '{}'::jsonb),
      '{mediaCache}',
      COALESCE(config->'mediaCache', '{}'::jsonb) || jsonb_build_object(${key}, jsonb_build_object('fileId', ${fileId}, 'botId', ${botId}))
    )
    WHERE id = ${flowId}
  `;
}

export async function saveRemarketingLegacyCache(
  prisma: any,
  flowId: string,
  fileId: string,
  botId: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Flow"
    SET config = jsonb_set(
      COALESCE(config, '{}'::jsonb),
      '{remarketing}',
      COALESCE(config->'remarketing', '{}'::jsonb) || jsonb_build_object('cachedFileId', ${fileId}, 'cachedBotId', ${botId})
    )
    WHERE id = ${flowId}
  `;
}

export async function saveRemarketingSlotCache(
  prisma: any,
  flowId: string,
  slotIndex: number,
  fileId: string,
  botId: string,
): Promise<void> {
  const slotPath = `{remarketings,${slotIndex}}`;
  await prisma.$executeRaw`
    UPDATE "Flow"
    SET config = jsonb_set(
      config,
      ${slotPath}::text[],
      COALESCE(config->'remarketings'->${slotIndex}::int, '{}'::jsonb) || jsonb_build_object('cachedFileId', ${fileId}, 'cachedBotId', ${botId})
    )
    WHERE id = ${flowId}
  `;
}
