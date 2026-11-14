// Pré-cache inteligente de mídia — só afeta bots com precacheEnabled=true (criados
// a partir dessa feature). Enquanto nem toda mídia do fluxo tiver file_id cacheado
// pra esse bot, os delays configurados são substituídos por ~1s (só o suficiente
// pra respeitar o rate limit do Telegram) até o cache "esquentar".

import { remarketingCachedFileId } from './media-cache-store';

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
  // Mídia-teca: arquivo original guardado por nós, chave SEM botId. Se existe,
  // o item SEMPRE tem como se resolver — não importa qual bot o fluxo usa hoje,
  // nem se o bot que cacheou antes foi excluído. É a única fonte que sobrevive
  // à troca de bot, então conta como fonte válida aqui.
  const assets: Record<string, string> = cfg.mediaAssets ?? {};
  const items: MediaCacheItem[] = [];

  // file_id do Telegram é preso ao bot que subiu o arquivo — o file_id de OUTRO
  // bot nunca é recuperável pra este (getFile com o token errado sempre falha).
  // `hasSource` por isso NUNCA deve contar um cache de outro bot como "fonte
  // válida" — só a mídia bruta (fileData/fileUrl) ou já ter cacheado ESTE bot
  // específico (== `cached`) provam que dá pra resolver. Bug real encontrado em
  // produção: um fluxo trocado de bot, com a mídia bruta já removida (stripped
  // depois do 1º cache), ficava preso pra sempre em "aguarde alguns segundos"
  // — porque via o cachedFileId do bot antigo e achava que só faltava esperar.

  // 1. Nós do fluxo principal
  const nodes: any[] = flow?.nodes ?? [];
  for (const n of nodes) {
    if (n.type !== 'image' && n.type !== 'video') continue;
    const cached = !!mediaCache[`${n.id}:${botId}`]?.fileId;
    const hasSource = !!n.data?.fileData || !!n.data?.fileUrl || !!assets[n.id] || cached;
    items.push({ key: n.id, label: n.data?.label || (n.type === 'image' ? 'Imagem' : 'Vídeo'), cached, hasSource });
  }

  // 1b. Order bump — mesma convenção de chave (`orderbump:<botId>`) do envio.
  const bump: any = cfg.orderBump;
  if (bump?.enabled && (bump.mediaType === 'image' || bump.mediaType === 'video')) {
    const cached = !!mediaCache[`orderbump:${botId}`]?.fileId;
    const hasSource = !!bump.mediaData || !!bump.mediaUrl || !!assets['orderbump'] || cached;
    items.push({ key: 'orderbump', label: 'Order Bump', cached, hasSource });
  }

  // 2. Upsells
  const upsells: any[] = Array.isArray(cfg.upsells) ? cfg.upsells : [];
  upsells.forEach((u, idx) => {
    if (!u?.enabled || (u.mediaType !== 'image' && u.mediaType !== 'video')) return;
    const key = `upsell:${idx}`;
    const cached = !!mediaCache[`${key}:${botId}`]?.fileId;
    const hasSource = !!u.mediaData || !!u.mediaUrl || !!assets[key] || cached;
    items.push({ key, label: `Upsell ${idx + 1}`, cached, hasSource });
  });

  // 3. Remarketing legado
  // `remarketingCachedFileId` olha o mapa por bot antes do campo antigo — sem
  // isso, o cache de um bot passa a contar como ausente assim que OUTRO bot
  // esquenta o mesmo slot e sobrescreve `cachedBotId`.
  const legacy = cfg.remarketing;
  if (legacy?.enabled && (legacy.mediaType === 'image' || legacy.mediaType === 'video')) {
    const cached = !!remarketingCachedFileId(cfg, null, botId);
    const hasSource = !!legacy.mediaData || !!legacy.mediaUrl || !!assets['remarketing'] || cached;
    items.push({ key: 'remarketing', label: 'Remarketing', cached, hasSource });
  }

  // 4. Remarketing multi-slot
  const slots: any[] = Array.isArray(cfg.remarketings) ? cfg.remarketings : [];
  slots.forEach((s, idx) => {
    if (!s?.enabled || (s.mediaType !== 'image' && s.mediaType !== 'video')) return;
    const cached = !!remarketingCachedFileId(cfg, idx, botId);
    const hasSource = !!s.mediaData || !!s.mediaUrl || !!assets[`remarketing:${idx}`] || cached;
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
