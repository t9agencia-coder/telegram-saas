// Pré-cache inteligente de mídia — só afeta bots com precacheEnabled=true (criados
// a partir dessa feature). Enquanto nem toda mídia do fluxo tiver file_id cacheado
// pra esse bot, os delays configurados são substituídos por ~1s (só o suficiente
// pra respeitar o rate limit do Telegram) até o cache "esquentar".

const PRECACHE_DELAY_MS = 1000;

export function isFlowPrecacheComplete(flow: any, botId?: string | null): boolean {
  if (!botId) return true; // sem bot associado — nunca acelera, comportamento de sempre

  const nodes: any[] = flow?.nodes ?? [];
  const mediaCache = flow?.config?.mediaCache ?? {};
  const mediaNodeIds = nodes
    .filter((n) => n.type === 'image' || n.type === 'video')
    .map((n) => n.id);

  if (mediaNodeIds.length === 0) return true; // sem mídia, nada pra cachear

  return mediaNodeIds.every((id) => !!mediaCache[`${id}:${botId}`]?.fileId);
}

// Versão de baixo nível — recebe a completude já calculada, reaproveitável por
// qualquer sistema que tenha seu próprio jeito de checar cache (ex.: remarketing,
// que guarda cachedFileId/cachedBotId em campos próprios, não em mediaCache).
export function resolvePrecacheDelayFromCompleteness(
  precacheEnabled: boolean | undefined,
  isComplete: boolean,
  requestedDelayMs: number,
): number {
  if (!precacheEnabled) return requestedDelayMs;
  if (isComplete) return requestedDelayMs;
  return PRECACHE_DELAY_MS;
}

export function resolvePrecacheDelay(
  flow: any,
  botId: string | null | undefined,
  precacheEnabled: boolean | undefined,
  requestedDelayMs: number,
): number {
  return resolvePrecacheDelayFromCompleteness(
    precacheEnabled,
    isFlowPrecacheComplete(flow, botId),
    requestedDelayMs,
  );
}

// Checagem completa — nós do fluxo principal + upsells + remarketing (legado e
// multi-slot). Usada pra bloquear a ativação de um fluxo enquanto a mídia ainda
// não estiver 100% cacheada pro bot atual (só pra bots com precacheEnabled).
export function getFlowCacheStatus(
  flow: any,
  botId?: string | null,
): { complete: boolean; missing: number; total: number } {
  if (!botId) return { complete: true, missing: 0, total: 0 };

  const cfg = flow?.config ?? {};
  const mediaCache = cfg.mediaCache ?? {};
  let total = 0;
  let missing = 0;

  const check = (isCached: boolean) => {
    total++;
    if (!isCached) missing++;
  };

  // 1. Nós do fluxo principal
  const nodes: any[] = flow?.nodes ?? [];
  for (const n of nodes) {
    if (n.type !== 'image' && n.type !== 'video') continue;
    check(!!mediaCache[`${n.id}:${botId}`]?.fileId);
  }

  // 2. Upsells
  const upsells: any[] = Array.isArray(cfg.upsells) ? cfg.upsells : [];
  upsells.forEach((u, idx) => {
    if (!u?.enabled || (u.mediaType !== 'image' && u.mediaType !== 'video')) return;
    check(!!mediaCache[`upsell:${idx}:${botId}`]?.fileId);
  });

  // 3. Remarketing legado
  const legacy = cfg.remarketing;
  if (legacy?.enabled && (legacy.mediaType === 'image' || legacy.mediaType === 'video')) {
    check(legacy.cachedBotId === botId && !!legacy.cachedFileId);
  }

  // 4. Remarketing multi-slot
  const slots: any[] = Array.isArray(cfg.remarketings) ? cfg.remarketings : [];
  slots.forEach((s) => {
    if (!s?.enabled || (s.mediaType !== 'image' && s.mediaType !== 'video')) return;
    check(s.cachedBotId === botId && !!s.cachedFileId);
  });

  return { complete: missing === 0, missing, total };
}
