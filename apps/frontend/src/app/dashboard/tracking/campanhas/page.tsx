'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/dashboard/page-header'
import { PeriodTabs } from '@/components/tracking/period-tabs'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { MarketingPeriod, fmtMoney, fmtInt, fmtRatio, fmtPct, periodQuery, statusColor } from '@/lib/tracking'
import { Loader2, Plug, ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

type Level = 'accounts' | 'campaigns' | 'adsets' | 'ads'
const LEVEL_LABEL: Record<Level, string> = { accounts: 'Contas', campaigns: 'Campanhas', adsets: 'Conjuntos', ads: 'Criativos' }
const NEXT: Record<Level, Level | null> = { accounts: 'campaigns', campaigns: 'adsets', adsets: 'ads', ads: null }

interface Crumb { level: Level; id: string; name: string }
interface Row {
  id: string; fbId: string; name: string; status: string | null; effectiveStatus: string | null
  objective: string | null; dailyBudget: number | null; lifetimeBudget: number | null; hasChildren: boolean
  spend: number; impressions: number; reach: number; clicks: number; linkClicks: number
  ctr: number | null; cpc: number | null; cpm: number | null
  sales: number | null; revenue: number | null; profit: number | null
  roi: number | null; roas: number | null; margin: number | null; cpa: number | null
}

export default function TrackingCampanhasPage() {
  const { workspaceId } = useAuthStore()
  const [period, setPeriod] = useState<MarketingPeriod>('last7')
  const [level, setLevel] = useState<Level>('campaigns')
  const [parentId, setParentId] = useState<string | undefined>()
  const [data, setData] = useState<{ connected: boolean; rows: Row[]; breadcrumb: Crumb[]; currency?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!workspaceId) return
    setLoading(true)
    const params = new URLSearchParams(periodQuery(period))
    params.set('level', level)
    if (parentId) params.set('parentId', parentId)
    api.get(`/workspaces/${workspaceId}/tracking/grid?${params.toString()}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [workspaceId, period, level, parentId])

  useEffect(() => { load() }, [load])

  const cur = data?.currency || 'BRL'

  const drill = (row: Row) => {
    const nx = NEXT[level]
    if (!nx || !row.hasChildren) return
    setLevel(nx); setParentId(row.id)
  }
  const goTo = (lvl: Level, id?: string) => { setLevel(lvl); setParentId(id) }

  const cols: { key: string; label: string; render: (r: Row) => React.ReactNode; align?: 'left' | 'right'; rev?: boolean }[] = [
    { key: 'name', label: LEVEL_LABEL[level].slice(0, -1), align: 'left', render: (r) => (
      <div className="min-w-0">
        <span className={cn(r.hasChildren && 'group-hover:text-[#4496ff] transition-colors', 'text-white')}>{r.name}</span>
        {r.objective && <p className="text-[10px] text-[#555]">{r.objective}</p>}
      </div>
    ) },
    { key: 'status', label: 'Status', render: (r) => (
      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-[3px] font-medium', statusColor(r.effectiveStatus || r.status))}>
        {r.effectiveStatus || r.status || '—'}
      </span>
    ) },
    { key: 'budget', label: 'Orçamento', align: 'right', render: (r) =>
      r.dailyBudget != null ? `${fmtMoney(r.dailyBudget, cur)}/dia` : r.lifetimeBudget != null ? fmtMoney(r.lifetimeBudget, cur) : '—' },
    { key: 'sales', label: 'Vendas', align: 'right', rev: true, render: (r) => r.sales == null ? '—' : fmtInt(r.sales) },
    { key: 'revenue', label: 'Faturamento', align: 'right', rev: true, render: (r) => r.revenue == null ? '—' : fmtMoney(r.revenue, cur) },
    { key: 'profit', label: 'Lucro', align: 'right', rev: true, render: (r) => r.profit == null ? '—' : fmtMoney(r.profit, cur) },
    { key: 'roi', label: 'ROI', align: 'right', rev: true, render: (r) => r.roi == null ? '—' : fmtRatio(r.roi) },
    { key: 'roas', label: 'ROAS', align: 'right', rev: true, render: (r) => r.roas == null ? '—' : fmtRatio(r.roas) },
    { key: 'margin', label: 'Margem', align: 'right', rev: true, render: (r) => r.margin == null ? '—' : fmtPct(r.margin) },
    { key: 'cpa', label: 'CPA', align: 'right', rev: true, render: (r) => r.cpa == null ? '—' : fmtMoney(r.cpa, cur) },
    { key: 'spend', label: 'Gasto', align: 'right', render: (r) => fmtMoney(r.spend, cur) },
    { key: 'cpc', label: 'CPC', align: 'right', render: (r) => fmtMoney(r.cpc, cur) },
    { key: 'ctr', label: 'CTR', align: 'right', render: (r) => r.ctr == null ? '—' : fmtPct(r.ctr) },
    { key: 'cpm', label: 'CPM', align: 'right', render: (r) => r.cpm == null ? '—' : fmtMoney(r.cpm, cur) },
    { key: 'impressions', label: 'Impr.', align: 'right', render: (r) => fmtInt(r.impressions) },
    { key: 'clicks', label: 'Cliques', align: 'right', render: (r) => fmtInt(r.clicks) },
  ]

  return (
    <div>
      <PageHeader title="Campanhas" description="Contas → campanhas → conjuntos → criativos — de onde vem o resultado">
        <PeriodTabs value={period} onChange={setPeriod} />
      </PageHeader>

      {/* tabs de nível + breadcrumb */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
        <button onClick={() => goTo('accounts')} className="inline-flex items-center gap-1 text-[#666] hover:text-white">
          <Home className="h-3 w-3" /> Contas
        </button>
        {(data?.breadcrumb ?? []).map((b) => (
          <span key={b.id} className="inline-flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-[#444]" />
            <button onClick={() => goTo(b.level, b.level === 'accounts' ? undefined : b.id)} className="text-[#666] hover:text-white truncate max-w-[160px]">
              {b.name}
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3 text-[#444]" />
          <span className="text-[#4496ff] font-medium">{LEVEL_LABEL[level]}</span>
        </span>
      </div>

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
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-[11px] text-[#666] uppercase tracking-wide">
                  {cols.map((col) => (
                    <th key={col.key} className={cn('font-medium px-3 py-2', col.align === 'right' ? 'text-right' : 'text-left', col.rev && 'text-[#555]')}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).length === 0 && (
                  <tr><td colSpan={cols.length} className="px-4 py-6 text-center text-[#666] text-xs">
                    Nada sincronizado neste nível ainda.
                  </td></tr>
                )}
                {(data?.rows ?? []).map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => drill(r)}
                    className={cn(
                      'group border-t border-white/[0.04]',
                      r.hasChildren ? 'cursor-pointer hover:bg-white/[0.02]' : '',
                    )}
                  >
                    {cols.map((col) => (
                      <td key={col.key} className={cn(
                        'px-3 py-2.5 tabular-nums',
                        col.align === 'right' ? 'text-right' : 'text-left',
                        col.rev ? 'text-[#555]' : 'text-white/80',
                      )}>
                        {col.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-[#555]">
        Colunas em cinza (Vendas, Faturamento, Lucro, ROI, ROAS, Margem, CPA) dependem da atribuição venda→anúncio — entram na Fase 2b.
        Gasto, cliques, impressões, CTR, CPC e CPM já vêm da Meta.
      </p>
    </div>
  )
}
