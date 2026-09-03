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

          {/* ── funil de conversão ─────────────────────────────────────── */}
          {fin?.funnel && (
            <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 mb-6">
              <p className="text-xs text-[#666] font-medium mb-4">Funil de conversão</p>
              <div className="space-y-2.5">
                {fin.funnel.stages.map((st, i) => {
                  const colors = ['#4496ff', '#a78bfa', '#F59E0B', '#22C55E']
                  const clr = colors[i] ?? '#4496ff'
                  const w = Math.max(2, Math.min(100, st.pct * 100))
                  return (
                    <div key={st.key}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-white/80">{st.label}</span>
                        <span className="text-[#999] tabular-nums">
                          {fmtInt(st.count)}
                          <span className="ml-2 font-medium" style={{ color: clr }}>{(st.pct * 100).toFixed(st.pct < 0.1 ? 2 : 1)}%</span>
                        </span>
                      </div>
                      <div className="h-6 rounded-[3px] bg-white/[0.04] overflow-hidden">
                        <div className="h-full rounded-[3px] transition-all" style={{ width: `${w}%`, background: `${clr}33`, borderRight: `2px solid ${clr}` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-[10px] text-[#555]">
                Cliques vêm da Meta · Starts = todos os /start do bot · Vendas geradas = PIX criados · Vendas aprovadas = PIX pagos.
                % sempre em relação aos cliques (topo).
              </p>
            </div>
          )}

          <p className="text-[11px] text-[#555]">
            Receita, líquido e lucro vêm das vendas do seu sistema. Gasto vem da Meta (sync a cada ~15 min).
            O detalhamento por campanha fica na aba <span className="text-[#4496ff]">Campanhas</span>.
          </p>
        </>
      )}
    </div>
  )
}
