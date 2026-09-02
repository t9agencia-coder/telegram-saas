'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/dashboard/page-header'
import { PeriodTabs } from '@/components/tracking/period-tabs'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { MarketingPeriod, fmtMoney, fmtInt, fmtRatio, periodQuery, statusColor } from '@/lib/tracking'
import { Loader2, DollarSign, Users, ShoppingCart, TrendingUp, MousePointerClick, Eye, Plug } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

export default function MarketingOverviewPage() {
  const { workspaceId } = useAuthStore()
  const [period, setPeriod] = useState<MarketingPeriod>('last7')
  const [ov, setOv] = useState<any>(null)
  const [table, setTable] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    const q = periodQuery(period)
    Promise.all([
      api.get(`/workspaces/${workspaceId}/tracking/overview?${q}`),
      api.get(`/workspaces/${workspaceId}/tracking/campaigns?${q}`),
    ])
      .then(([o, t]) => { setOv(o); setTable(t) })
      .catch(() => { setOv(null); setTable(null) })
      .finally(() => setLoading(false))
  }, [workspaceId, period])

  const notConnected = ov && ov.connected === false

  const cur = ov?.currency || 'BRL'
  const c = ov?.cards || {}
  const cards = [
    { label: 'Investimento', value: fmtMoney(c.spend, cur), icon: DollarSign },
    { label: 'Faturamento', value: c.revenue == null ? 'Fase 2' : fmtMoney(c.revenue, cur), icon: TrendingUp, muted: c.revenue == null },
    { label: 'Vendas', value: c.sales == null ? 'Fase 2' : fmtInt(c.sales), icon: ShoppingCart, muted: c.sales == null },
    { label: 'Leads', value: fmtInt(c.leads), icon: Users },
    { label: 'CPA', value: c.cpa == null ? 'Fase 2' : fmtMoney(c.cpa, cur), icon: DollarSign, muted: c.cpa == null },
    { label: 'CPL', value: fmtMoney(c.cpl, cur), icon: Users },
    { label: 'ROAS', value: c.roas == null ? 'Fase 2' : fmtRatio(c.roas), icon: TrendingUp, muted: c.roas == null },
    { label: 'Cliques', value: fmtInt(c.clicks), icon: MousePointerClick },
    { label: 'Impressões', value: fmtInt(c.impressions), icon: Eye },
  ]

  return (
    <div>
      <PageHeader title="Visão geral" description="Investimento, resultados e ROI das campanhas">
        <PeriodTabs value={period} onChange={setPeriod} />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-[#666]" /></div>
      ) : notConnected ? (
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-8 text-center">
          <Plug className="h-8 w-8 text-[#666] mx-auto mb-3" />
          <p className="text-sm text-white/70">Nenhuma conta de anúncios conectada.</p>
          <Link href="/dashboard/tracking/integracoes" className="mt-3 inline-block text-sm text-[#E50914] hover:underline">
            Conectar Facebook Ads →
          </Link>
        </div>
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
                  <p className={cn('text-xl font-bold tracking-tight', card.muted ? 'text-[#555]' : 'text-white')}>{card.value}</p>
                </div>
              )
            })}
          </div>

          <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 mb-6">
            <p className="text-xs text-[#666] font-medium mb-3">Evolução do gasto</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={(ov?.series ?? []).map((s: any) => ({ ...s, date: new Date(s.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="date" stroke="#666" fontSize={11} />
                  <YAxis stroke="#666" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #ffffff14', borderRadius: 4, fontSize: 12 }} />
                  <Line type="monotone" dataKey="spend" name="Gasto" stroke="#E50914" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]"><p className="text-xs text-[#666] font-medium">Campanhas</p></div>
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
                      Sem dados ainda — a primeira sincronização pode levar alguns minutos.
                    </td></tr>
                  )}
                  {(table?.campaigns ?? []).map((cp: any) => (
                    <tr key={cp.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5">
                        <Link href={`/dashboard/tracking/campanhas/${cp.id}`} className="text-white hover:text-[#E50914] transition-colors">
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
        </>
      )}
    </div>
  )
}
