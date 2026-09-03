export const MKT_SYNC_QUEUE = 'tracking-meta-sync';

/** Intervalo entre ciclos de sincronização (estrutura + insights) por ad account. */
export const MKT_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 min

/** Quantos dias pra trás os insights são re-buscados a cada ciclo (ajuste tardio da Meta). */
export const MKT_INSIGHTS_LOOKBACK_DAYS = 3;

/** Fila do scan de vendas (Payment → MarketingSale com atribuição). */
export const MKT_SALES_QUEUE = 'tracking-sales-scan';

/** Fila de gestão de campanha na Meta (ativar/pausar em massa). */
export const MKT_OPS_QUEUE = 'tracking-meta-ops';

/** Teto de campanhas por ação em massa (protege contra abuso e rate limit da Meta). */
export const MKT_OPS_MAX_BULK = 2000;

/** Teto de cópias por duplicação de campanha (1 clique = até N cópias na Meta). */
export const MKT_DUPLICATE_MAX = 30;

/** Intervalo entre passadas do scan de vendas quando não há backlog. */
export const MKT_SALES_INTERVAL_MS = 2 * 60 * 1000; // 2 min

/** Quantos pagamentos por passada. Backlog → re-enfileira na hora até drenar. */
export const MKT_SALES_BATCH = 1000;

/** Backfill inicial: quantos dias pra trás na 1ª passada (cobre "mês passado"). */
export const MKT_SALES_BACKFILL_DAYS = 75;

/** Períodos aceitos no dashboard. */
export type MarketingPeriod = 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'prev_month' | 'custom';
