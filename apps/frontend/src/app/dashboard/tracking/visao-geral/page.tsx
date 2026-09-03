'use client'

import { useEffect, useState, Fragment } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { PeriodTabs } from '@/components/tracking/period-tabs'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { MarketingPeriod, fmtMoney, fmtInt, fmtRatio, periodQuery } from '@/lib/tracking'
import {
  Loader2, DollarSign, TrendingUp, Wallet, Megaphone, ShoppingCart, Clock, Percent, Receipt, Target, Facebook,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FinanceCards {
  grossRevenue: number; netRevenue: number; profit: number; adSpend: number
  metaAdsFee: number
  taxes: number; refunds: number; sales: number; pendingSales: number
  pendingAmount: number; cancelledSales: number; refundedSales: number
  avgTicket: number; roas: number
}
interface FunnelStage { key: string; label: string; count: number; pct: number }

// [base, brilho] por etapa
const FUNNEL_COLORS: Record<string, [string, string]> = {
  clicks:    ['#4496ff', '#7cb8ff'],
  starts:    ['#7c6cf0', '#a394f7'],
  generated: ['#f0972a', '#ffbc5c'],
  approved:  ['#20c05a', '#4ee089'],
}
const FUNNEL_FALLBACK: [string, string][] = [
  ['#4496ff', '#7cb8ff'], ['#7c6cf0', '#a394f7'], ['#f0972a', '#ffbc5c'], ['#20c05a', '#4ee089'],
]
const funnelPct = (p: number) => `${(p * 100).toFixed(p > 0 && p < 0.1 ? 2 : 1).replace('.', ',')}%`

/** Funil colunas + área de fluxo (estilo Mixpanel/Amplitude), SVG à mão. */
function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const W = 760, H = 300, padT = 60, padB = 30, padL = 26, padR = 26
  const base = H - padB, chartH = base - padT
  const colW = 30, n = stages.length
  const step = n > 1 ? (W - padL - padR - colW) / (n - 1) : 0
  const X = (i: number) => padL + i * step
  const top = stages[0]?.count || 1
  const h = (v: number) => Math.max(14, Math.pow(Math.max(v / top, 0), 0.46) * chartH)
  const R = (x: number) => Math.round(x * 10) / 10
  const col = (i: number): [string, string] => FUNNEL_COLORS[stages[i]?.key] ?? FUNNEL_FALLBACK[i % 4]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible', minWidth: 420 }}>
      <defs>
        {stages.map((s, i) => {
          const [a, b] = col(i)
          return (
            <Fragment key={s.key}>
              <linearGradient id={`fcol${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={b} /><stop offset="100%" stopColor={a} />
              </linearGradient>
              {i < n - 1 && (
                <linearGradient id={`fflow${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={a} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={col(i + 1)[0]} stopOpacity={0.07} />
                </linearGradient>
              )}
              <filter id={`fglow${i}`} x="-60%" y="-30%" width="220%" height="180%">
                <feGaussianBlur stdDeviation="7" result="b" />
                <feFlood floodColor={a} floodOpacity="0.35" />
                <feComposite in2="b" operator="in" result="g" />
                <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </Fragment>
          )
        })}
      </defs>

      <line x1={padL - 4} y1={base} x2={W - padR + 4} y2={base} stroke="rgba(255,255,255,.08)" strokeWidth={1} />

      {stages.slice(0, -1).map((s, i) => {
        const xa = X(i) + colW, xb = X(i + 1)
        const ya = base - h(s.count), yb = base - h(stages[i + 1].count)
        const cx = (xa + xb) / 2
        const rate = s.count > 0 ? stages[i + 1].count / s.count : 0
        return (
          <g key={`flow${i}`}>
            <path d={`M ${R(xa)} ${R(ya)} C ${R(cx)} ${R(ya)}, ${R(cx)} ${R(yb)}, ${R(xb)} ${R(yb)} L ${R(xb)} ${base} L ${R(xa)} ${base} Z`} fill={`url(#fflow${i})`} />
            <text x={R(cx)} y={R((ya + yb) / 2 - 6)} textAnchor="middle" fontSize={10.5} fill="#7c7c7c">{funnelPct(rate)}</text>
          </g>
        )
      })}

      {stages.map((s, i) => {
        const x = X(i), y = base - h(s.count), r = 5
        const tx = x + colW / 2
        const ly = Math.min(y - 12, base - 26)
        const [a] = col(i)
        return (
          <g key={s.key}>
            <path
              d={`M ${x} ${R(y + r)} Q ${x} ${R(y)} ${x + r} ${R(y)} L ${x + colW - r} ${R(y)} Q ${x + colW} ${R(y)} ${x + colW} ${R(y + r)} L ${x + colW} ${base} L ${x} ${base} Z`}
              fill={`url(#fcol${i})`} filter={`url(#fglow${i})`}
            />
            <text x={R(tx)} y={R(ly - 18)} textAnchor="middle" fontSize={11} fontWeight={500} fill="#9a9a9a">{s.label}</text>
            <text x={R(tx)} y={R(ly)} textAnchor="middle" fill="#fff" fontSize={19} fontWeight={700} letterSpacing="-0.3">{fmtInt(s.count)}</text>
            <text x={R(tx)} y={base + 19} textAnchor="middle" fontSize={12} fontWeight={600} fill={a}>{funnelPct(top > 0 ? s.count / top : 0)}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function TrackingOverviewPage() {
  const { workspaceId } = useAuthStore()
  const [period, setPeriod] = useState<MarketingPeriod>('today')
  const [fin, setFin] = useState<{ cards: FinanceCards; series: any[]; fees: any; metaFee?: { enabled: boolean; percent: number; amount: number }; funnel?: { top: number; stages: FunnelStage[] } } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    api.get(`/workspaces/${workspaceId}/tracking/finance/overview?${periodQuery(period)}`)
      .then(setFin)
      .catch(() => setFin(null))
      .finally(() => setLoading(false))
  }, [workspaceId, period])

  const c = fin?.cards
  const cur = 'BRL'

  const cards = c ? [
    { label: 'Faturamento bruto', value: fmtMoney(c.grossRevenue, cur), icon: DollarSign, tone: 'text-white' },
    { label: 'Faturamento líquido', value: fmtMoney(c.netRevenue, cur), icon: Wallet, tone: 'text-white' },
    { label: 'Lucro', value: fmtMoney(c.profit, cur), icon: TrendingUp, tone: c.profit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]' },
    { label: 'Gasto com anúncios', value: fmtMoney(c.adSpend, cur), icon: Megaphone, tone: 'text-white' },
    ...(fin?.metaFee?.enabled ? [{ label: 'Taxa Meta Ads (BR)', value: fmtMoney(c.metaAdsFee, cur), icon: Facebook, tone: 'text-white', sub: `${fin.metaFee.percent}% sobre gasto BR` }] : []),
    { label: 'ROAS', value: c.adSpend > 0 ? `${fmtRatio(c.roas)}x` : '—', icon: Target, tone: 'text-white' },
    { label: 'Vendas', value: fmtInt(c.sales), icon: ShoppingCart, tone: 'text-white' },
    { label: 'Vendas pendentes', value: fmtInt(c.pendingSales), icon: Clock, tone: 'text-[#F59E0B]' },
    { label: 'Taxas', value: fmtMoney(c.taxes, cur), icon: Percent, tone: 'text-white', sub: fin?.fees && (fin.fees.totalPercent || fin.fees.totalFixed) ? `${fin.fees.totalPercent}% + ${fmtMoney(fin.fees.totalFixed, cur)}/venda` : 'não configurada' },
    { label: 'Ticket médio', value: fmtMoney(c.avgTicket, cur), icon: Receipt, tone: 'text-white' },
  ] : []

  return (
    <div>
      <PageHeader title="Visão geral" description="Faturamento, lucro e ROI — vendas do sistema × gasto de anúncios">
        <PeriodTabs value={period} onChange={setPeriod} />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-[#666]" /></div>
      ) : !c ? (
        <p className="text-sm text-[#666]">Não foi possível carregar os dados.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {cards.map((card) => {
              const Icon = card.icon
              return (
                <div key={card.label} className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-[#666666] font-medium">{card.label}</p>
                    <Icon className="h-3.5 w-3.5 text-[#B3B3B3]" />
                  </div>
                  <p className={cn('text-xl font-bold tracking-tight tabular-nums', card.tone)}>{card.value}</p>
                  {'sub' in card && card.sub && <p className="text-[10px] text-[#555] mt-0.5">{card.sub}</p>}
                </div>
              )
            })}
          </div>

          {/* ── funil de conversão ─────────────────────────────────────── */}
          {(() => {
            if (!fin?.funnel) return null
            const stages = fin.funnel.stages
            const clicks = stages.find((s) => s.key === 'clicks')?.count ?? 0
            const approved = stages.find((s) => s.key === 'approved')?.count ?? 0
            const hasData = stages.some((s) => s.count > 0)
            const conv = clicks > 0 ? (approved / clicks) * 100 : 0
            return (
              <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-5 pt-4 mb-6 w-full lg:max-w-[600px]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-[#666] font-medium">Funil de conversão</p>
                  {hasData && clicks > 0 && (
                    <p className="text-xs text-[#999]">
                      conversão total <span className="text-[#22C55E] font-semibold">{conv.toFixed(conv > 0 && conv < 1 ? 2 : 1).replace('.', ',')}%</span>
                    </p>
                  )}
                </div>
                {hasData ? (
                  <div className="overflow-x-auto">
                    <FunnelChart stages={stages} />
                  </div>
                ) : (
                  <p className="py-8 text-center text-xs text-[#666]">Sem dados no período. Conecte o Facebook Ads e receba tráfego.</p>
                )}
                <p className="mt-2 text-[10px] text-[#555] leading-relaxed">
                  Cliques vêm da Meta · Starts = todos os /start do bot · Vendas geradas = PIX criados · Vendas aprovadas = PIX pagos.
                  % embaixo de cada coluna é sobre os cliques; o da curva é a passagem de uma etapa pra próxima. Altura ilustrativa.
                </p>
              </div>
            )
          })()}

          <p className="text-[11px] text-[#555]">
            Receita, líquido e lucro vêm das vendas do seu sistema. Gasto vem da Meta (sync a cada ~15 min).
            O detalhamento por campanha fica na aba <span className="text-[#4496ff]">Campanhas</span>.
          </p>
        </>
      )}
    </div>
  )
}
