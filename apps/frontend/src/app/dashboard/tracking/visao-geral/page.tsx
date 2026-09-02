'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/dashboard/page-header'
import { PeriodTabs } from '@/components/tracking/period-tabs'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { MarketingPeriod, fmtMoney, fmtInt, fmtRatio, periodQuery, statusColor } from '@/lib/tracking'
import {
  Loader2, DollarSign, TrendingUp, Wallet, Megaphone, ShoppingCart, Clock, Percent, Receipt, Target,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { cn } from '@/lib/utils'

interface FinanceCards {
  grossRevenue: number; netRevenue: number; profit: number; adSpend: number
  taxes: number; refunds: number; sales: number; pendingSales: number
  pendingAmount: number; cancelledSales: number; refundedSales: number
  avgTicket: number; roas: number
}

export default function TrackingOverviewPage() {
  const { workspaceId } = useAuthStore()
  const [period, setPeriod] = useState<MarketingPeriod>('today')
  const [fin, setFin] = useState<{ cards: FinanceCards; series: any[]; fees: any } | null>(null)
  const [table, setTable] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    const q = periodQuery(period)
    Promise.all([
      api.get(`/workspaces/${workspaceId}/tracking/finance/overview?${q}`),
      api.get(`/workspaces/${workspaceId}/tracking/campaigns?${q}`),
    ])
      .then(([f, t]) => { setFin(f); setTable(t) })
      .catch(() => { setFin(null); setTable(null) })
      .finally(() => setLoading(false))
  }, [workspaceId, period])

  const c = fin?.cards
  const cur = 'BRL'

  const cards = c ? [
    { label: 'Faturamento bruto', value: fmtMoney(c.grossRevenue, cur), icon: DollarSign, tone: 'text-white' },
    { label: 'Faturamento líquido', value: fmtMoney(c.netRevenue, cur), icon: Wallet, tone: 'text-white' },
    { label: 'Lucro', value: fmtMoney(c.profit, cur), icon: TrendingUp, tone: c.profit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]' },
    { label: 'Gasto com anúncios', value: fmtMoney(c.adSpend, cur), icon: Megaphone, tone: 'text-white' },
    { label: 'ROAS', value: c.adSpend > 0 ? `${fmtRatio(c.roas)}x` : '—', icon: Target, tone: 'text-white' },
    { label: 'Vendas', value: fmtInt(c.sales), icon: ShoppingCart, tone: 'text-white' },
    { label: 'Vendas pendentes', value: fmtInt(c.pendingSales), icon: Clock, tone: 'text-[#F59E0B]' },
    { label: 'Taxas', value: fmtMoney(c.taxes, cur), icon: Percent, tone: 'text-white', sub: fin?.fees && (fin.fees.percentFee || fin.fees.fixedFee) ? `${fin.fees.percentFee}% + ${fmtMoney(fin.fees.fixedFee, cur)}/venda` : 'não configurada' },
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

          <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <p className="text-xs text-[#666] font-medium">Campanhas</p>
              {table?.connected === false && (
                <Link href="/dashboard/tracking/integracoes" className="text-[11px] text-[#4496ff] hover:underline">Conectar Facebook Ads →</Link>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-[#666] uppercase tracking-wide">
                    <th className="text-left font-medium px-4 py-2">Campanha</th>
                    <th className="text-right font-medium px-4 py-2">Gasto</th>
                    <th className="text-right font-medium px-4 py-2">Impr.</th>
                    <th className="text-right font-medium px-4 py-2">Cliques</th>
                    <th className="text-right font-medium px-4 py-2">CTR</th>
                    <th className="text-right font-medium px-4 py-2">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {(table?.campaigns ?? []).length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-[#666] text-xs">
                      {table?.connected === false ? 'Conecte o Facebook Ads pra ver as campanhas.' : 'Sem dados de campanha no período.'}
                    </td></tr>
                  )}
                  {(table?.campaigns ?? []).map((cp: any) => (
                    <tr key={cp.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5">
                        <Link href={`/dashboard/tracking/campanhas/${cp.id}`} className="text-white hover:text-[#4496ff] transition-colors">
                          {cp.name || cp.fbCampaignId}
                        </Link>
                        <span className={cn('ml-2 text-[10px] px-1.5 py-0.5 rounded-[3px] font-medium', statusColor(cp.effectiveStatus || cp.status))}>
                          {cp.effectiveStatus || cp.status || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/90">{fmtMoney(cp.spend, cur)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/70">{fmtInt(cp.impressions)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/70">{fmtInt(cp.clicks)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/70">{cp.ctr == null ? '—' : `${(cp.ctr * 100).toFixed(2)}%`}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/70">{fmtMoney(cp.cpc, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-[#555]">
            Receita, líquido e lucro vêm das vendas do seu sistema. Gasto vem da Meta (sync a cada ~15 min).
            ROAS/CPA por campanha (atribuição venda→anúncio) entram na próxima fase.
          </p>
        </>
      )}
    </div>
  )
}
