'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { PeriodTabs } from '@/components/tracking/period-tabs'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { MarketingPeriod, fmtMoney, fmtInt, fmtRatio, periodQuery } from '@/lib/tracking'
import {
  Loader2, DollarSign, TrendingUp, Wallet, Megaphone, ShoppingCart, Clock, Percent, Receipt, Target, Facebook,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { cn } from '@/lib/utils'

interface FinanceCards {
  grossRevenue: number; netRevenue: number; profit: number; adSpend: number
  metaAdsFee: number
  taxes: number; refunds: number; sales: number; pendingSales: number
  pendingAmount: number; cancelledSales: number; refundedSales: number
  avgTicket: number; roas: number
}
interface FunnelStage { key: string; label: string; count: number; pct: number }

const STAGE_COLOR = ['#4496ff', '#8b7bf0', '#F59E0B', '#22C55E']

/** Sankey do funil, desenhado à mão (SVG). Fluxo esq→dir, ribbons proporcionais. */
function FunnelSankey({ stages }: { stages: FunnelStage[] }) {
  const W = 900, H = 300
  const padT = 62, padB = 16
  const chartH = H - padT - padB
  const n = stages.length
  const nodeW = 16
  const x0 = 4
  const colGap = (W - x0 - nodeW) / (n - 1)
  const x = (i: number) => x0 + i * colGap
  const max = Math.max(...stages.map((s) => s.count), 1)
  // altura do nó proporcional; piso pra etapa pequena não sumir
  const h = (v: number) => Math.max(6, (v / max) * chartH)
  const fmtPct = (p: number) => `${(p * 100).toFixed(p > 0 && p < 0.1 ? 2 : 1)}%`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      <defs>
        {stages.slice(0, -1).map((_, i) => (
          <linearGradient key={i} id={`fnl${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={STAGE_COLOR[i]} stopOpacity={0.5} />
            <stop offset="100%" stopColor={STAGE_COLOR[i + 1]} stopOpacity={0.42} />
          </linearGradient>
        ))}
      </defs>

      {/* ribbons — largura = quem sobreviveu pra próxima etapa (top-aligned) */}
      {stages.slice(0, -1).map((s, i) => {
        const flow = h(stages[i + 1].count)
        const xa = x(i) + nodeW
        const xb = x(i + 1)
        const c1 = xa + colGap * 0.42
        const c2 = xb - colGap * 0.42
        const d = `M ${xa} ${padT} C ${c1} ${padT}, ${c2} ${padT}, ${xb} ${padT}`
          + ` L ${xb} ${padT + flow} C ${c2} ${padT + flow}, ${c1} ${padT + flow}, ${xa} ${padT + flow} Z`
        return <path key={i} d={d} fill={`url(#fnl${i})`} />
      })}

      {/* nós + rótulos */}
      {stages.map((s, i) => {
        const last = i === n - 1
        const lx = last ? x(i) - 10 : x(i) + nodeW + 10
        const anchor = last ? 'end' : 'start'
        return (
          <g key={s.key}>
            <rect x={x(i)} y={padT} width={nodeW} height={h(s.count)} rx={4} fill={STAGE_COLOR[i]} />
            <text x={lx} y={26} textAnchor={anchor} fontSize={13} fontWeight={600} fill="rgba(255,255,255,0.92)">{s.label}</text>
            <text x={lx} y={45} textAnchor={anchor} fontSize={13} fill="#8a8a8a">
              {fmtInt(s.count)}
              <tspan dx={7} fontWeight={600} fill={STAGE_COLOR[i]}>{fmtPct(s.pct)}</tspan>
            </text>
            {/* taxa de passagem da etapa anterior → esta */}
            {i > 0 && stages[i - 1].count > 0 && (
              <text
                x={x(i - 1) + nodeW + colGap / 2}
                y={padT - 8}
                textAnchor="middle"
                fontSize={11}
                fill="#666"
              >
                {fmtPct(s.count / stages[i - 1].count)}
              </text>
            )}
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

  const chartData = (fin?.series ?? []).map((s: any) => ({
    date: new Date(`${s.date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    bruto: s.gross, liquido: s.net, lucro: s.profit, anuncios: s.adSpend,
  }))

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

          <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 mb-6">
            <p className="text-xs text-[#666] font-medium mb-3">Evolução financeira</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gBruto" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4496ff" stopOpacity={0.25} /><stop offset="100%" stopColor="#4496ff" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gLucro" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22C55E" stopOpacity={0.25} /><stop offset="100%" stopColor="#22C55E" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="date" stroke="#666" fontSize={11} />
                  <YAxis stroke="#666" fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#1A1A1A', border: '1px solid #ffffff14', borderRadius: 4, fontSize: 12 }}
                    formatter={(v: any) => fmtMoney(Number(v), cur)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="bruto" name="Bruto" stroke="#4496ff" strokeWidth={2} fill="url(#gBruto)" />
                  <Area type="monotone" dataKey="liquido" name="Líquido" stroke="#a78bfa" strokeWidth={1.5} fillOpacity={0} />
                  <Area type="monotone" dataKey="lucro" name="Lucro" stroke="#22C55E" strokeWidth={2} fill="url(#gLucro)" />
                  <Area type="monotone" dataKey="anuncios" name="Anúncios" stroke="#EF4444" strokeWidth={1.5} fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── funil de conversão (Sankey) ────────────────────────────── */}
          {(() => {
            if (!fin?.funnel) return null
            const stages = fin.funnel.stages
            const clicks = stages.find((s) => s.key === 'clicks')?.count ?? 0
            const approved = stages.find((s) => s.key === 'approved')?.count ?? 0
            const hasData = stages.some((s) => s.count > 0)
            const conv = clicks > 0 ? (approved / clicks) * 100 : 0
            return (
              <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 mb-6">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-[#666] font-medium">Funil de conversão</p>
                  {hasData && clicks > 0 && (
                    <p className="text-xs text-[#999]">
                      conversão total: <span className="text-[#22C55E] font-medium">{conv.toFixed(conv > 0 && conv < 1 ? 2 : 1)}%</span>
                    </p>
                  )}
                </div>
                {hasData ? (
                  <div className="overflow-x-auto">
                    <div className="min-w-[620px]">
                      <FunnelSankey stages={stages} />
                    </div>
                  </div>
                ) : (
                  <p className="py-8 text-center text-xs text-[#666]">Sem dados no período. Conecte o Facebook Ads e receba tráfego.</p>
                )}
                <p className="mt-1 text-[10px] text-[#555]">
                  Cliques vêm da Meta · Starts = todos os /start do bot · Vendas geradas = PIX criados · Vendas aprovadas = PIX pagos.
                  Os % embaixo dos rótulos são sobre os cliques; os de cima, a passagem de uma etapa pra outra.
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
