// ─── Modelo cíclico de remarketing (atual) ───────────────────────────────────
// Sem configuração de tempo por slot. Todo lead que completa o fluxo entra numa
// cadeia: 1º disparo 30 min depois, então 1 a cada 2 h, ciclando pelos slots
// habilitados (A→B→…→último→A→…), até fechar 5 dias — ou o lead bloquear o bot.
// A mensagem de cada disparo se apaga sozinha 1 h depois.
//   agendamento:  WebhooksService.scheduleRemarketingMulti
//   execução:     RemarketingProcessor.handleRemarketingCycle
export const REMARKETING_FIRST_DELAY_MS = 30 * 60 * 1000;         // 30 min após o fluxo completar
export const REMARKETING_INTERVAL_MS    = 2 * 60 * 60 * 1000;     // 2 h entre disparos
export const REMARKETING_WINDOW_MS      = 5 * 24 * 60 * 60 * 1000; // encerra a cadeia após 5 dias
export const REMARKETING_DELETE_MS      = 60 * 60 * 1000;         // apaga a mensagem 1 h depois

// ─── LEGADO ──────────────────────────────────────────────────────────────────
// Modelo antigo (multi-slot com firstDelay/interval/stopAfter por slot). Mantido
// só para as cadeias que já estavam em andamento drenarem — leads novos usam o
// modelo cíclico acima. Remover quando as cadeias antigas terminarem (o teto
// antigo era 7 dias por slot, ~35 dias no total pra 5 slots).
const MAX_REMARKETING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function computeRemarketingSends(slot: {
  firstDelay?: number;
  interval?:   number;
  stopAfter?:  number;
}): { totalSends: number; intervalMs: number; firstDelayMs: number } | null {
  const firstDelayMs = (slot.firstDelay || 30) * 60 * 1000;
  const intervalMs   = (slot.interval   || 5)  * 3600 * 1000;
  const stopAfterMs  = (slot.stopAfter  || 3)  * 86400 * 1000;

  if (firstDelayMs >= MAX_REMARKETING_WINDOW_MS) return null;

  const maxSendsByWindow = Math.floor((MAX_REMARKETING_WINDOW_MS - firstDelayMs) / intervalMs) + 1;
  const totalSends = Math.min(
    Math.floor((stopAfterMs - firstDelayMs) / intervalMs) + 1,
    maxSendsByWindow,
  );
  if (totalSends < 1) return null;

  return { totalSends, intervalMs, firstDelayMs };
}
