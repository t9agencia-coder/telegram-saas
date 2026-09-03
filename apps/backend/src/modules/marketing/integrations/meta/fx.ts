/**
 * Conversão de moeda pra BRL. O painel de Tracking é sempre em real: as vendas
 * vêm em BRL (PIX) e o gasto da Meta vem na moeda da conta (algumas contas rodam
 * em USD). Taxa estática via env — ajustável sem novo deploy; default aproximado.
 *   MARKETING_USD_BRL, MARKETING_EUR_BRL
 */
function envRate(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : def;
}

/** Quantos BRL vale 1 unidade da moeda dada. */
export function brlPerUnit(currency: string | null | undefined): number {
  const c = (currency || 'BRL').toUpperCase();
  if (!c || c === 'BRL') return 1;
  if (c === 'USD') return envRate('MARKETING_USD_BRL', 5.4);
  if (c === 'EUR') return envRate('MARKETING_EUR_BRL', 5.9);
  return 1; // moeda não mapeada — não converte (evita número absurdo)
}
