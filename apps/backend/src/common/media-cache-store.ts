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

// Depois que um node de mídia é cacheado (fileId salvo em config.mediaCache),
// o base64 bruto em node.data.fileData vira peso morto — o envio real sempre
// prefere o fileId. Sem isso, fluxos com vídeo/imagem incham pra dezenas de MB
// (já visto caso real de 40+MB) e o parse/serialize desse JSON gigante pode
// estourar a memória do backend/Postgres. Idempotente: só mexe em quem já tem
// fileId cacheado, nunca remove um node sem fallback.
export async function stripCachedFileDataFromNodes(
  prisma: any,
  flowId: string,
  botId: string,
): Promise<void> {
  const flow = await prisma.flow.findUnique({
    where: { id: flowId },
    select: { nodes: true, config: true },
  });
  if (!flow) return;

  const mediaCache = (flow.config as any)?.mediaCache || {};
  const nodes = Array.isArray(flow.nodes) ? (flow.nodes as any[]) : [];
  let changed = false;

  for (const node of nodes) {
    if (node.type !== 'video' && node.type !== 'image') continue;
    if (!node.data?.fileData) continue;
    const cached = mediaCache[`${node.id}:${botId}`];
    if (cached?.fileId) {
      delete node.data.fileData;
      changed = true;
    }
  }

  if (changed) {
    await prisma.flow.update({ where: { id: flowId }, data: { nodes } });
  }
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
