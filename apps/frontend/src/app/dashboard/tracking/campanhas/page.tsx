'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/dashboard/page-header'
import { PeriodTabs } from '@/components/tracking/period-tabs'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { MarketingPeriod, fmtMoney, fmtInt, periodQuery, statusColor } from '@/lib/tracking'
import { Loader2, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MarketingCampaignsPage() {
  const { workspaceId } = useAuthStore()
  const [period, setPeriod] = useState<MarketingPeriod>('last7')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    api.get(`/workspaces/${workspaceId}/tracking/campaigns?${periodQuery(period)}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [workspaceId, period])

  const cur = data?.currency || 'BRL'

  return (
    <div>
      <PageHeader title="Campanhas" description="Desempenho por campanha do Facebook Ads">
        <PeriodTabs value={period} onChange={setPeriod} />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-[#666]" /></div>
      ) : data?.connected === false ? (
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-8 text-center">
          <Plug className="h-8 w-8 text-[#666] mx-auto mb-3" />
          <p className="text-sm text-white/70">Nenhuma conta de anúncios conectada.</p>
          <Link href="/dashboard/tracking/integracoes" className="mt-3 inline-block text-sm text-[#4496ff] hover:underline">Conectar Facebook Ads →</Link>
        </div>
      ) : (
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-[#666] uppercase tracking-wide">
                  <th className="text-left font-medium px-4 py-2">Campanha</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                  <th className="text-right font-medium px-4 py-2">Orçamento</th>
                  <th className="text-right font-medium px-4 py-2">Gasto</th>
                  <th className="text-right font-medium px-4 py-2">Impr.</th>
                  <th className="text-right font-medium px-4 py-2">Cliques</th>
                  <th className="text-right font-medium px-4 py-2">CTR</th>
                  <th className="text-right font-medium px-4 py-2">CPC</th>
                </tr>
              </thead>
              <tbody>
                {(data?.campaigns ?? []).length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-[#666] text-xs">
                    Sem campanhas sincronizadas ainda.
                  </td></tr>
                )}
                {(data?.campaigns ?? []).map((cp: any) => (
                  <tr key={cp.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/tracking/campanhas/${cp.id}`} className="text-white hover:text-[#4496ff] transition-colors">
                        {cp.name || cp.fbCampaignId}
                      </Link>
                      {cp.objective && <p className="text-[10px] text-[#555]">{cp.objective}</p>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-[3px] font-medium', statusColor(cp.effectiveStatus || cp.status))}>
                        {cp.effectiveStatus || cp.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white/70">
                      {cp.dailyBudget != null ? `${fmtMoney(cp.dailyBudget, cur)}/dia` : cp.lifetimeBudget != null ? fmtMoney(cp.lifetimeBudget, cur) : '—'}
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
      )}
      <p className="mt-3 text-[11px] text-[#555]">Faturamento, vendas, CPA e ROAS por campanha chegam na Fase 2 (atribuição).</p>
    </div>
  )
}
