/**
 * Meta account_status (numérico) → token normalizado.
 * https://developers.facebook.com/docs/marketing-api/reference/ad-account
 */
export function normAccountStatus(code: string | number | null | undefined): string {
  switch (String(code ?? '')) {
    case '1': return 'ACTIVE';
    case '2': return 'DISABLED';
    case '3': return 'UNSETTLED';           // fatura em aberto
    case '7': return 'PENDING_RISK_REVIEW';
    case '8': return 'PENDING_SETTLEMENT';  // aguardando pagamento
    case '9': return 'IN_GRACE_PERIOD';     // pagamento em atraso
    case '100': return 'PENDING_CLOSURE';
    case '101': return 'CLOSED';
    default: return 'UNKNOWN';
  }
}
