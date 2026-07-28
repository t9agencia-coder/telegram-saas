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

export interface MediaCacheItem {
  key: string;       // identifica o item (id do nó, ou "upsell:0" etc.)
  label: string;      // nome amigável pra mostrar ao usuário
  cached: boolean;    // já tem file_id válido pra esse bot
  hasSource: boolean; // tem fileData/fileUrl (ou já foi cacheado por QUALQUER bot antes) —
                      // se false, não tem nada pra cachear e a espera nunca termina sozinha.
}

// Checagem completa — nós do fluxo principal + upsells + remarketing (legado e
// multi-slot). Usada pra bloquear a ativação de um fluxo enquanto a mídia ainda
// não estiver 100% cacheada pro bot atual (só pra bots com precacheEnabled).
// Também identifica itens "vazios" (sem fileData/fileUrl e nunca cacheados por
// nenhum bot) — esses nunca vão resolver sozinhos, então bloqueiam a ativação
// com um erro específico em vez de deixar o usuário esperando pra sempre.
export function getFlowCacheStatus(
  flow: any,
  botId?: string | null,
): { complete: boolean; missing: number; total: number; items: MediaCacheItem[] } {
  if (!botId) return { complete: true, missing: 0, total: 0, items: [] };

  const cfg = flow?.config ?? {};
  const mediaCache = cfg.mediaCache ?? {};
  const items: MediaCacheItem[] = [];

  const hasAnyCacheEntry = (prefix: string) =>
    Object.keys(mediaCache).some((k) => k === prefix || k.startsWith(`${prefix}:`));

  // 1. Nós do fluxo principal
  const nodes: any[] = flow?.nodes ?? [];
  for (const n of nodes) {
    if (n.type !== 'image' && n.type !== 'video') continue;
    const cached = !!mediaCache[`${n.id}:${botId}`]?.fileId;
    const hasSource = !!n.data?.fileData || !!n.data?.fileUrl || hasAnyCacheEntry(n.id);
    items.push({ key: n.id, label: n.data?.label || (n.type === 'image' ? 'Imagem' : 'Vídeo'), cached, hasSource });
  }

  // 2. Upsells
  const upsells: any[] = Array.isArray(cfg.upsells) ? cfg.upsells : [];
  upsells.forEach((u, idx) => {
    if (!u?.enabled || (u.mediaType !== 'image' && u.mediaType !== 'video')) return;
    const key = `upsell:${idx}`;
    const cached = !!mediaCache[`${key}:${botId}`]?.fileId;
    const hasSource = !!u.mediaData || !!u.mediaUrl || hasAnyCacheEntry(key);
    items.push({ key, label: `Upsell ${idx + 1}`, cached, hasSource });
  });

  // 3. Remarketing legado
  const legacy = cfg.remarketing;
  if (legacy?.enabled && (legacy.mediaType === 'image' || legacy.mediaType === 'video')) {
    const cached = legacy.cachedBotId === botId && !!legacy.cachedFileId;
    const hasSource = !!legacy.mediaData || !!legacy.mediaUrl || !!legacy.cachedFileId;
    items.push({ key: 'remarketing', label: 'Remarketing', cached, hasSource });
  }

  // 4. Remarketing multi-slot
  const slots: any[] = Array.isArray(cfg.remarketings) ? cfg.remarketings : [];
  slots.forEach((s, idx) => {
    if (!s?.enabled || (s.mediaType !== 'image' && s.mediaType !== 'video')) return;
    const cached = s.cachedBotId === botId && !!s.cachedFileId;
    const hasSource = !!s.mediaData || !!s.mediaUrl || !!s.cachedFileId;
    items.push({ key: `remarketing:${idx}`, label: `Remarketing ${idx + 1}`, cached, hasSource });
  });

  const missing = items.filter((i) => !i.cached).length;
  return { complete: missing === 0, missing, total: items.length, items };
}

// Itens que NUNCA vão cachear sozinhos (sem fileData/fileUrl e nunca cacheados
// por nenhum bot) — precisam de ação do usuário (reenviar a mídia), não adianta
// esperar o chat de aquecimento.
export function getStuckMediaItems(flow: any, botId?: string | null): MediaCacheItem[] {
  return getFlowCacheStatus(flow, botId).items.filter((i) => !i.cached && !i.hasSource);
}
