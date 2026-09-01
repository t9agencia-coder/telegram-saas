'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { usePrivacyStore } from '@/store/privacy'
import { api } from '@/lib/api'
import { Loader2, Trophy, TrendingUp } from 'lucide-react'

interface RankRow {
  label: string
  sales: number
  revenue: number
}

interface PlansResponse {
  plans: RankRow[]
  upsells: RankRow[]
}

interface Props {
  startDate: string
  endDate: string
}

function RankingCard({ title, icon: Icon, rows, accentColor, emptyHint, hidden }: {
  title:      string
  icon:       any
  rows:       RankRow[]
  accentColor: string
  emptyHint:  string
  hidden:     boolean
}) {
  const maxSales = Math.max(1, ...rows.map((r) => r.sales))

  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] card-glow-premium">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <Icon className="h-3.5 w-3.5" style={{ color: accentColor }} />
        <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider">{title}</h3>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-[#666666]">{emptyHint}</div>
      ) : (
        <div className="p-4 space-y-4">
          {rows.map((row, i) => (
            <div key={`${row.label}-${i}`} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: `${accentColor}22`, color: accentColor }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm text-white truncate">{row.label}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-semibold text-white">{hidden ? '••' : row.sales}</span>
                  <span className="text-xs text-[#666666] ml-1">venda{row.sales !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(row.sales / maxSales) * 100}%`, background: accentColor }}
                  />
                </div>
                <span className="text-[11px] text-[#666666] tabular-nums shrink-0">
                  {hidden ? 'R$ ••••••' : `R$ ${row.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Ranking de "Planos" (botões PIX do node pix_buttons no construtor de fluxo) e de
// upsells por vendas — só considera vendas feitas depois que a captura do rótulo
// foi implementada; vendas antigas não têm essa granularidade e não aparecem aqui.
export function PlanRanking({ startDate, endDate }: Props) {
  const { workspaceId } = useAuthStore()
  const { hidden } = usePrivacyStore()
  const [data, setData] = useState<PlansResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    api.get<PlansResponse>(`/workspaces/${workspaceId}/analytics/plans?startDate=${startDate}&endDate=${endDate}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [workspaceId, startDate, endDate])

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-[4px] border border-white/[0.06] bg-[#141414] flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-[#666666]" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <RankingCard
        title="Planos mais vendidos"
        icon={Trophy}
        rows={data?.plans || []}
        accentColor="#E50914"
        emptyHint="Nenhuma venda de plano registrada no período"
        hidden={hidden}
      />
      <RankingCard
        title="Upsells mais vendidos"
        icon={TrendingUp}
        rows={data?.upsells || []}
        accentColor="#22C55E"
        emptyHint="Nenhuma venda de upsell registrada no período"
        hidden={hidden}
      />
    </div>
  )
}
