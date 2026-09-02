'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { PeriodTabs } from '@/components/marketing/period-tabs'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { MarketingPeriod, fmtMoney, fmtInt, periodQuery, statusColor } from '@/lib/marketing'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MarketingCampaignDetailPage() {
  const { workspaceId } = useAuthStore()
  const { id } = useParams<{ id: string }>()
  const [period, setPeriod] = useState<MarketingPeriod>('last7')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspaceId || !id) return
    setLoading(true)
    api.get(`/workspaces/${workspaceId}/marketing/campaigns/${id}?${periodQuery(period)}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [workspaceId, id, period])

  const cur = data?.currency || 'BRL'
  const cp = data?.campaign

  return (
    <div>
      <PageHeader title={cp?.name || 'Campanha'} description="Conjuntos e anúncios">
        <PeriodTabs value={period} onChange={setPeriod} />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-[#666]" /></div>
      ) : !cp ? (
        <p className="text-sm text-[#666]">Campanha não encontrada.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Status" value={cp.effectiveStatus || cp.status || '—'} badge={statusColor(cp.effectiveStatus || cp.status)} />
            <Stat label="Orçamento" value={cp.dailyBudget != null ? `${fmtMoney(cp.dailyBudget, cur)}/dia` : cp.lifetimeBudget != null ? fmtMoney(cp.lifetimeBudget, cur) : '—'} />
            <Stat label="Gasto" value={fmtMoney(cp.spend, cur)} />
            <Stat label="Objetivo" value={cp.objective || '—'} />
          </div>

          {(data.adSets ?? []).map((s: any) => (
            <div key={s.id} className="rounded-[4px] border border-white/[0.06] bg-[#141414] mb-4 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{s.name || s.fbAdSetId}</p>
                  <p className="text-[11px] text-[#666]">
                    Gasto {fmtMoney(s.spend, cur)} · {fmtInt(s.impressions)} impr. · {fmtInt(s.clicks)} cliques
                  </p>
                </div>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-[3px] font-medium shrink-0', statusColor(s.effectiveStatus || s.status))}>
                  {s.effectiveStatus || s.status || '—'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-[#666] uppercase tracking-wide">
                      <th className="text-left font-medium px-4 py-2">Anúncio</th>
                      <th className="text-left font-medium px-4 py-2">Status</th>
                      <th className="text-right font-medium px-4 py-2">Gasto</th>
                      <th className="text-right font-medium px-4 py-2">Impr.</th>
                      <th className="text-right font-medium px-4 py-2">Cliques</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(s.ads ?? []).map((a: any) => (
                      <tr key={a.id} className="border-t border-white/[0.04]">
                        <td className="px-4 py-2 text-white/90">{a.name || a.fbAdId}</td>
                        <td className="px-4 py-2">
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-[3px] font-medium', statusColor(a.effectiveStatus || a.status))}>
                            {a.effectiveStatus || a.status || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-white/90">{fmtMoney(a.spend, cur)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-white/70">{fmtInt(a.impressions)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-white/70">{fmtInt(a.clicks)}</td>
                      </tr>
                    ))}
                    {(s.ads ?? []).length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-3 text-center text-[11px] text-[#666]">Sem anúncios</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="mt-2 text-[11px] text-[#555]">Ativar / pausar / alterar orçamento chega na Fase 3.</p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4">
      <p className="text-xs text-[#666] font-medium mb-1">{label}</p>
      {badge
        ? <span className={cn('text-xs px-1.5 py-0.5 rounded-[3px] font-medium', badge)}>{value}</span>
        : <p className="text-base font-semibold text-white">{value}</p>}
    </div>
  )
}
