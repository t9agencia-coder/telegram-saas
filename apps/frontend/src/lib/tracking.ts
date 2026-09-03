export type MarketingPeriod = 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'prev_month' | 'custom'

export const PERIOD_LABELS: Record<MarketingPeriod, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last7: '7 dias',
  last30: '30 dias',
  this_month: 'Este mês',
  prev_month: 'Mês anterior',
  custom: 'Personalizado',
}

export function fmtMoney(v: number | null | undefined, currency = 'BRL'): string {
  if (v === null || v === undefined) return '—'
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v)
  } catch {
    return `R$ ${v.toFixed(2)}`
  }
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR').format(Math.round(v))
}

export function fmtRatio(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(digits)
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${(v * 100).toFixed(2)}%`
}

/** query string do período pra API */
export function periodQuery(period: MarketingPeriod, from?: Date, to?: Date): string {
  const p = new URLSearchParams({ period })
  if (period === 'custom' && from) p.set('from', from.toISOString())
  if (period === 'custom' && to) p.set('to', to.toISOString())
  return p.toString()
}

export function statusColor(status?: string | null): string {
  const s = (status || '').toUpperCase()
  if (s === 'ACTIVE') return 'text-[#22C55E] bg-[#22C55E]/10'
  if (s === 'PAUSED') return 'text-[#F59E0B] bg-[#F59E0B]/10'
  return 'text-[#666666] bg-white/[0.04]'
}

/** Status da conta de anúncio (Meta account_status normalizado no backend). */
export const ACCOUNT_STATUS: Record<string, { label: string; tone: string }> = {
  ACTIVE:              { label: 'Ativa',                 tone: 'text-[#22C55E] bg-[#22C55E]/10' },
  DISABLED:            { label: 'Desativada',            tone: 'text-[#EF4444] bg-[#EF4444]/10' },
  UNSETTLED:           { label: 'Fatura em aberto',      tone: 'text-[#EF4444] bg-[#EF4444]/10' },
  IN_GRACE_PERIOD:     { label: 'Pagamento em atraso',   tone: 'text-[#F59E0B] bg-[#F59E0B]/10' },
  PENDING_SETTLEMENT:  { label: 'Aguardando pagamento',  tone: 'text-[#F59E0B] bg-[#F59E0B]/10' },
  PENDING_RISK_REVIEW: { label: 'Em análise',            tone: 'text-[#F59E0B] bg-[#F59E0B]/10' },
  PENDING_CLOSURE:     { label: 'Encerramento pendente', tone: 'text-[#666666] bg-white/[0.04]' },
  CLOSED:              { label: 'Fechada',               tone: 'text-[#666666] bg-white/[0.04]' },
  UNKNOWN:             { label: '—',                     tone: 'text-[#666666] bg-white/[0.04]' },
}
