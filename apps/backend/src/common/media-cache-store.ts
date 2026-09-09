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

/**
 * Versão completa do strip: nós + upsells + remarketing (legado e multi-slot).
 * O `stripCachedFileDataFromNodes` acima só cobria os nós — upsell/remarketing
 * com base64 (caso real: 31 MB só de remarketing num fluxo) ficavam até o cron
 * semanal. Aqui, com `isValid` opcional, também confere o file_id no Telegram
 * antes de remover (nunca tira o base64 se o file_id estiver morto).
 *
 * Retorna quantos itens foram limpos. Idempotente.
 */
export async function stripCachedMediaFromFlow(
  prisma: any,
  flowId: string,
  botId: string,
  isValid?: (fileId: string) => Promise<boolean>,
): Promise<number> {
  const flow = await prisma.flow.findUnique({
    where: { id: flowId },
    select: { nodes: true, config: true },
  });
  if (!flow) return 0;

  const nodes: any[] = Array.isArray(flow.nodes) ? flow.nodes : [];
  const cfg: any = flow.config || {};
  const mc: Record<string, any> = cfg.mediaCache || {};
  let changedNodes = false;
  let changedCfg = false;
  let stripped = 0;

  const okToStrip = async (fileId: string | undefined | null): Promise<boolean> => {
    if (!fileId) return false;
    if (!isValid) return true;
    try { return await isValid(fileId); } catch { return false; }
  };

  // 1. nós
  for (const n of nodes) {
    if (n.type !== 'video' && n.type !== 'image') continue;
    if (!n.data?.fileData || Buffer.byteLength(String(n.data.fileData), 'utf8') < 100) continue;
    const fid = mc[`${n.id}:${botId}`]?.fileId;
    if (await okToStrip(fid)) { delete n.data.fileData; changedNodes = true; stripped++; }
  }

  // 2. upsells
  if (Array.isArray(cfg.upsells)) {
    for (let i = 0; i < cfg.upsells.length; i++) {
      const u = cfg.upsells[i];
      if (!u?.mediaData || Buffer.byteLength(String(u.mediaData), 'utf8') < 100) continue;
      const fid = mc[`upsell:${i}:${botId}`]?.fileId;
      if (await okToStrip(fid)) { delete u.mediaData; changedCfg = true; stripped++; }
    }
  }

  // 3. remarketing legado
  if (cfg.remarketing && typeof cfg.remarketing === 'object') {
    const rm = cfg.remarketing;
    if (rm.mediaData && Buffer.byteLength(String(rm.mediaData), 'utf8') >= 100) {
      const fid = rm.cachedBotId === botId ? rm.cachedFileId : undefined;
      if (await okToStrip(fid)) { delete rm.mediaData; changedCfg = true; stripped++; }
    }
  }

  // 4. remarketing multi-slot
  if (Array.isArray(cfg.remarketings)) {
    for (const s of cfg.remarketings) {
      if (!s?.mediaData || Buffer.byteLength(String(s.mediaData), 'utf8') < 100) continue;
      const fid = s.cachedBotId === botId ? s.cachedFileId : undefined;
      if (await okToStrip(fid)) { delete s.mediaData; changedCfg = true; stripped++; }
    }
  }

  if (changedNodes || changedCfg) {
    const data: any = {};
    if (changedNodes) data.nodes = nodes;
    if (changedCfg) data.config = cfg;
    await prisma.flow.update({ where: { id: flowId }, data });
  }
  return stripped;
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
