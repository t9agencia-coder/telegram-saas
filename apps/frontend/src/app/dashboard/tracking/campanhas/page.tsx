'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { MarketingPeriod, fmtMoney, fmtInt, fmtRatio, fmtPct, periodQuery, statusColor, ACCOUNT_STATUS } from '@/lib/tracking'
import { Loader2, Plug, ChevronRight, Home, Pencil, X, Check, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type SortDir = 'desc' | 'asc'

type Level = 'accounts' | 'campaigns' | 'adsets' | 'ads'
const LEVEL_LABEL: Record<Level, string> = { accounts: 'Contas', campaigns: 'Campanhas', adsets: 'Conjuntos', ads: 'Criativos' }
const NEXT: Record<Level, Level | null> = { accounts: 'campaigns', campaigns: 'adsets', adsets: 'ads', ads: null }

type StatusFilter = 'any' | 'active' | 'paused' | 'with_issues'
const STATUS_OPTS: { v: StatusFilter; label: string }[] = [
  { v: 'any', label: 'Qualquer' },
  { v: 'active', label: 'Ativo' },
  { v: 'paused', label: 'Pausado' },
  { v: 'with_issues', label: 'Com restrição' },
]
const PERIOD_OPTS: { v: MarketingPeriod; label: string }[] = [
  { v: 'today', label: 'Hoje' },
  { v: 'yesterday', label: 'Ontem' },
  { v: 'last7', label: 'Últimos 7 dias' },
  { v: 'this_month', label: 'Esse mês' },
  { v: 'prev_month', label: 'Mês passado' },
]

interface Crumb { level: Level; id: string; name: string }
interface Row {
  id: string; fbId: string; name: string; status: string | null; effectiveStatus: string | null
  objective: string | null; dailyBudget: number | null; lifetimeBudget: number | null; hasChildren: boolean
  accountName?: string | null
  spend: number; impressions: number; reach: number; clicks: number; linkClicks: number
  ctr: number | null; cpc: number | null; cpm: number | null
  sales: number | null; revenue: number | null; profit: number | null
  roi: number | null; roas: number | null; margin: number | null; cpa: number | null
}
interface GridData {
  connected: boolean; rows: Row[]; breadcrumb: Crumb[]; currency?: string
  accounts?: { id: string; name: string }[]
  page?: number; pageSize?: number; total?: number; hasMore?: boolean
}

const isActive = (r: Row) => (r.effectiveStatus || r.status || '').toUpperCase() === 'ACTIVE'

export default function TrackingCampanhasPage() {
  const { workspaceId } = useAuthStore()
  const [period, setPeriod] = useState<MarketingPeriod>('today')
  const [status, setStatus] = useState<StatusFilter>('any')
  const [level, setLevel] = useState<Level>('campaigns')
  const [parentId, setParentId] = useState<string | undefined>()
  const [page, setPage] = useState(0)
  const [sortBy, setSortBy] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [data, setData] = useState<GridData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)

  // volta pra 1ª página ao trocar de nível/conta/período/status/ordenação
  useEffect(() => { setPage(0) }, [level, parentId, period, status, sortBy, sortDir])
  // ordenação não faz sentido carregar entre níveis
  useEffect(() => { setSortBy(null); setSortDir('desc') }, [level])

  const clickSort = (key: string) => {
    if (sortBy !== key) { setSortBy(key); setSortDir('desc'); return }   // 1º clique → maior→menor
    if (sortDir === 'desc') { setSortDir('asc'); return }               // 2º clique → menor→maior
    setSortBy(null); setSortDir('desc')                                 // 3º clique → padrão
  }

  const load = useCallback(() => {
    if (!workspaceId) return
    setLoading(true)
    const params = new URLSearchParams(periodQuery(period))
    params.set('level', level)
    if (status !== 'any') params.set('status', status)
    if (parentId) params.set('parentId', parentId)
    if (page) params.set('page', String(page))
    if (sortBy) { params.set('sortBy', sortBy); params.set('sortDir', sortDir) }
    api.get<GridData>(`/workspaces/${workspaceId}/tracking/grid?${params.toString()}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [workspaceId, period, level, parentId, page, status, sortBy, sortDir])

  useEffect(() => { load() }, [load])

  const cur = data?.currency || 'BRL'

  const drill = (row: Row) => {
    const nx = NEXT[level]
    if (!nx || !row.hasChildren) return
    setLevel(nx); setParentId(row.id)
  }
  const goTo = (lvl: Level, id?: string) => { setLevel(lvl); setParentId(id) }

  const toggleStatus = async (r: Row) => {
    setBusy(r.id)
    try {
      await api.post(`/workspaces/${workspaceId}/tracking/campaigns/${r.id}/status`, { active: !isActive(r) })
      load()
    } catch (e: any) {
      alert(e.message || 'A Meta rejeitou a alteração de status.')
    } finally { setBusy(null) }
  }

  const canManage = level === 'campaigns'

  const cols: { key: string; label: string; render: (r: Row) => React.ReactNode; align?: 'left' | 'right'; sortKey?: string }[] = [
    { key: 'name', label: LEVEL_LABEL[level].slice(0, -1), align: 'left', render: (r) => (
      <div className="flex items-center gap-2.5 min-w-0">
        {canManage && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleStatus(r) }}
            disabled={busy === r.id}
            title={isActive(r) ? 'Pausar campanha no Facebook' : 'Ativar campanha no Facebook'}
            className={cn(
              'relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40',
              isActive(r) ? 'bg-[#22C55E]' : 'bg-white/[0.15]',
            )}
          >
            {busy === r.id
              ? <Loader2 className="h-3 w-3 animate-spin text-white mx-auto" />
              : <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', isActive(r) ? 'translate-x-4' : 'translate-x-0.5')} />}
          </button>
        )}
        <div className="min-w-0">
          <span className={cn(r.hasChildren && 'group-hover:text-[#4496ff] transition-colors', 'text-white')}>{r.name}</span>
          {(r.accountName || r.objective) && (
            <p className="text-[10px] text-[#555]">
              {r.accountName && <span className="text-[#777]">{r.accountName}</span>}
              {r.accountName && r.objective ? ' · ' : ''}
              {r.objective || ''}
            </p>
          )}
        </div>
      </div>
    ) },
    { key: 'status', label: 'Status', render: (r) => {
      if (level === 'accounts') {
        const st = ACCOUNT_STATUS[r.effectiveStatus || 'UNKNOWN'] ?? ACCOUNT_STATUS.UNKNOWN
        return <span className={cn('text-[10px] px-1.5 py-0.5 rounded-[3px] font-medium', st.tone)}>{st.label}</span>
      }
      return (
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-[3px] font-medium', statusColor(r.effectiveStatus || r.status))}>
          {r.effectiveStatus || r.status || '—'}
        </span>
      )
    } },
    { key: 'budget', label: 'Orçamento', align: 'right', sortKey: 'budget', render: (r) => {
      const txt = r.dailyBudget != null ? `${fmtMoney(r.dailyBudget, cur)}/dia`
        : r.lifetimeBudget != null ? fmtMoney(r.lifetimeBudget, cur) : '—'
      if (!canManage) return txt
      return (
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(r) }}
          title="Editar orçamento / nome no Facebook"
          className="group/bud inline-flex items-center gap-1.5 text-white/80 hover:text-[#4496ff]"
        >
          {txt}
          <Pencil className="h-3 w-3 text-[#555] group-hover/bud:text-[#4496ff]" />
        </button>
      )
    } },
    { key: 'sales', label: 'Vendas', align: 'right', sortKey: 'sales', render: (r) => r.sales == null ? '—' : fmtInt(r.sales) },
    { key: 'revenue', label: 'Faturamento', align: 'right', sortKey: 'revenue', render: (r) => r.revenue == null ? '—' : fmtMoney(r.revenue, cur) },
    { key: 'profit', label: 'Lucro', align: 'right', sortKey: 'profit', render: (r) => r.profit == null ? '—'
      : <span className={r.profit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}>{fmtMoney(r.profit, cur)}</span> },
    { key: 'roi', label: 'ROI', align: 'right', sortKey: 'roi', render: (r) => r.roi == null ? '—' : `${fmtRatio(r.roi)}x` },
    { key: 'roas', label: 'ROAS', align: 'right', sortKey: 'roas', render: (r) => r.roas == null ? '—' : `${fmtRatio(r.roas)}x` },
    { key: 'margin', label: 'Margem', align: 'right', sortKey: 'margin', render: (r) => r.margin == null ? '—' : fmtPct(r.margin) },
    { key: 'cpa', label: 'CPA', align: 'right', sortKey: 'cpa', render: (r) => r.cpa == null ? '—' : fmtMoney(r.cpa, cur) },
    { key: 'spend', label: 'Gasto', align: 'right', sortKey: 'spend', render: (r) => fmtMoney(r.spend, cur) },
    { key: 'cpc', label: 'CPC', align: 'right', sortKey: 'cpc', render: (r) => fmtMoney(r.cpc, cur) },
    { key: 'ctr', label: 'CTR', align: 'right', sortKey: 'ctr', render: (r) => r.ctr == null ? '—' : fmtPct(r.ctr) },
    { key: 'cpm', label: 'CPM', align: 'right', sortKey: 'cpm', render: (r) => r.cpm == null ? '—' : fmtMoney(r.cpm, cur) },
    { key: 'impressions', label: 'Impr.', align: 'right', sortKey: 'impressions', render: (r) => fmtInt(r.impressions) },
    { key: 'clicks', label: 'Cliques', align: 'right', sortKey: 'clicks', render: (r) => fmtInt(r.clicks) },
  ]

  // dropdown de conta só reflete seleção quando estamos no nível de campanhas
  const accountValue = level === 'campaigns' ? (parentId ?? 'any') : 'any'

  return (
    <div>
      <PageHeader title="Campanhas" description="Contas → campanhas → conjuntos → criativos — de onde vem o resultado" />

      {/* ── barra de filtros ─────────────────────────────────────────── */}
      <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] px-4 py-3 mb-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#666] mb-1.5">Período</p>
          <div className="flex flex-wrap gap-1">
            {PERIOD_OPTS.map((o) => (
              <button
                key={o.v}
                onClick={() => setPeriod(o.v)}
                className={cn(
                  'px-2.5 py-1 rounded-[3px] text-xs font-medium border transition-colors whitespace-nowrap',
                  period === o.v
                    ? 'bg-[#4496ff]/10 text-[#4496ff] border-[#4496ff]/30'
                    : 'text-[#777] hover:text-white bg-[#1A1A1A] border-white/[0.08]',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#666] mb-1.5">Status da campanha</p>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="rounded-[4px] border border-white/[0.08] bg-[#1A1A1A] px-2.5 py-1.5 text-xs text-white/90 outline-none focus:border-[#4496ff]/40 min-w-[140px]"
          >
            {STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#666] mb-1.5">Conta de anúncio</p>
          <select
            value={accountValue}
            onChange={(e) => { const v = e.target.value; setLevel('campaigns'); setParentId(v === 'any' ? undefined : v) }}
            className="rounded-[4px] border border-white/[0.08] bg-[#1A1A1A] px-2.5 py-1.5 text-xs text-white/90 outline-none focus:border-[#4496ff]/40 min-w-[160px] max-w-[240px]"
          >
            <option value="any">Qualquer</option>
            {(data?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {/* tabs de nível + breadcrumb */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
        <button onClick={() => goTo('accounts')} className="inline-flex items-center gap-1 text-[#666] hover:text-white">
          <Home className="h-3 w-3" /> Contas
        </button>
        {(data?.breadcrumb ?? []).map((b) => (
          <span key={b.id} className="inline-flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-[#444]" />
            <button onClick={() => { const nx = NEXT[b.level]; if (nx) goTo(nx, b.id) }} className="text-[#666] hover:text-white truncate max-w-[160px]">
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
                  {cols.map((col) => {
                    const activeSort = col.sortKey && sortBy === col.sortKey
                    return (
                      <th
                        key={col.key}
                        onClick={() => col.sortKey && clickSort(col.sortKey)}
                        className={cn(
                          'font-medium px-3 py-2 select-none',
                          col.align === 'right' ? 'text-right' : 'text-left',
                          col.sortKey && 'cursor-pointer hover:text-white/80',
                          activeSort && 'text-[#4496ff] bg-[#4496ff]/[0.06]',
                        )}
                      >
                        <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'flex-row-reverse')}>
                          {col.label}
                          {col.sortKey && (
                            activeSort
                              ? (sortDir === 'desc'
                                  ? <ArrowDown className="h-3 w-3 text-[#4496ff]" />
                                  : <ArrowUp className="h-3 w-3 text-[#4496ff]" />)
                              : <ChevronsUpDown className="h-3 w-3 text-[#444]" />
                          )}
                        </span>
                      </th>
                    )
                  })}
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
                        'px-3 py-2.5 tabular-nums text-white/80',
                        col.align === 'right' ? 'text-right' : 'text-left',
                        col.sortKey && sortBy === col.sortKey && 'bg-[#4496ff]/[0.04]',
                      )}>
                        {col.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {level === 'campaigns' && (data?.total ?? 0) > 0 && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-white/[0.06] text-xs text-[#666]">
              <span>
                {(() => {
                  const ps = data?.pageSize ?? 100
                  const from = page * ps + 1
                  const to = Math.min((page + 1) * ps, data?.total ?? 0)
                  return `${from}–${to} de ${data?.total} campanhas`
                })()}
              </span>
              {((data?.total ?? 0) > (data?.pageSize ?? 100)) && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || loading}
                    className="rounded-[4px] border border-white/[0.1] px-2 py-1 text-white/70 hover:bg-white/[0.06] disabled:opacity-30"
                  >Anterior</button>
                  <span className="px-1 text-[#555]">pág. {page + 1}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!data?.hasMore || loading}
                    className="rounded-[4px] border border-white/[0.1] px-2 py-1 text-white/70 hover:bg-white/[0.06] disabled:opacity-30"
                  >Próxima</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-[#555]">
        Todos os valores em <span className="text-white/70">R$</span>. Gasto/cliques/impressões vêm da Meta (contas em dólar
        são convertidas pra BRL); Vendas/Faturamento/Lucro/ROI/ROAS/Margem/CPA vêm das vendas do seu sistema atribuídas ao
        anúncio pela UTM. Lucro = faturamento − taxas − gasto. Venda sem UTM de campanha não entra em nenhuma linha
        (aparece só no total da Visão geral). O “—” some quando a primeira venda do período é atribuída.
        Ativar/pausar e editar orçamento alteram a campanha direto no Facebook.
        Clique num cabeçalho pra ordenar (↓ maior→menor · ↑ menor→maior · 3º clique volta ao padrão) — vazios e “—” ficam sempre no fim.
      </p>

      {editing && (
        <EditCampaignModal
          row={editing}
          currency={cur}
          workspaceId={workspaceId!}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function EditCampaignModal({
  row, currency, workspaceId, onClose, onSaved,
}: { row: Row; currency: string; workspaceId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(row.name)
  const [budgetType, setBudgetType] = useState<'daily' | 'lifetime'>(row.lifetimeBudget != null ? 'lifetime' : 'daily')
  const [budget, setBudget] = useState(
    String(row.dailyBudget ?? row.lifetimeBudget ?? '').replace('.', ','),
  )
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const body: any = {}
      if (name.trim() && name.trim() !== row.name) body.name = name.trim()
      const b = Number(budget.replace(',', '.')) || 0
      if (b > 0) {
        if (budgetType === 'daily') body.dailyBudget = b
        else body.lifetimeBudget = b
      }
      await api.patch(`/workspaces/${workspaceId}/tracking/campaigns/${row.id}`, body)
      onSaved()
    } catch (e: any) {
      alert(e.message || 'A Meta rejeitou a alteração.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-[6px] border border-white/[0.08] bg-[#141414] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-white">Editar campanha</p>
          <button onClick={onClose} className="text-[#666] hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <label className="text-xs font-medium text-white/70 mb-1.5 block">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-[4px] border border-white/[0.08] bg-[#0D0D0D] px-3 py-2 text-sm text-white mb-4 focus:border-[#4496ff]/40 outline-none"
        />

        <label className="text-xs font-medium text-white/70 mb-1.5 block">Orçamento</label>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setBudgetType('daily')}
            className={cn('flex-1 rounded-[4px] border px-2 py-1.5 text-xs', budgetType === 'daily' ? 'border-[#4496ff]/40 bg-[#4496ff]/10 text-[#4496ff]' : 'border-white/[0.08] text-[#666] hover:text-white')}
          >Diário</button>
          <button
            onClick={() => setBudgetType('lifetime')}
            className={cn('flex-1 rounded-[4px] border px-2 py-1.5 text-xs', budgetType === 'lifetime' ? 'border-[#4496ff]/40 bg-[#4496ff]/10 text-[#4496ff]' : 'border-white/[0.08] text-[#666] hover:text-white')}
          >Total</button>
        </div>
        <div className="relative mb-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#666]">R$</span>
          <input
            value={budget}
            inputMode="decimal"
            onChange={(e) => setBudget(e.target.value)}
            placeholder="0,00"
            className="w-full rounded-[4px] border border-white/[0.08] bg-[#0D0D0D] pl-9 pr-3 py-2 text-sm text-white focus:border-[#4496ff]/40 outline-none"
          />
        </div>
        <p className="text-[10px] text-[#555] mb-4">
          Só funciona em campanhas com orçamento no nível da campanha (CBO). Se o orçamento for por conjunto, a Meta recusa e o erro aparece aqui.
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-[4px] px-3 py-2 text-sm text-[#999] hover:text-white">Cancelar</button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-[4px] bg-[#4496ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#4496ff]/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Salvar no Facebook
          </button>
        </div>
      </div>
    </div>
  )
}
