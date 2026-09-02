export const MKT_SYNC_QUEUE = 'tracking-meta-sync';

/** Intervalo entre ciclos de sincronização (estrutura + insights) por ad account. */
export const MKT_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 min

/** Quantos dias pra trás os insights são re-buscados a cada ciclo (ajuste tardio da Meta). */
export const MKT_INSIGHTS_LOOKBACK_DAYS = 3;

/** Períodos aceitos no dashboard. */
export type MarketingPeriod = 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'prev_month' | 'custom';
