export type MarketingPeriod = 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'custom'

export const PERIOD_LABELS: Record<MarketingPeriod, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
  this_month: 'Este mês',
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
