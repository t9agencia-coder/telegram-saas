'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import {
  Megaphone, Loader2, Search, Send, Bot, GitBranch,
  Users, ShoppingCart, ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle2, X, Filter, RefreshCw,
  CheckSquare, Square, Layers, History, Clock,
} from 'lucide-react'

interface Lead {
  id: string
  telegramId: string
  name: string
  username: string | null
  createdAt: string
  workspaceId: string
  workspaceName: string | null
  botId: string | null
  botUsername: string | null
  hasPurchase: boolean
  paymentCount: number
}

interface Flow {
  id: string
  name: string
  workspaceId: string
  workspaceName: string | null
  botId: string | null
  botUsername: string | null
  nodeCount: number
}

interface DispatchResponse {
  broadcastId: string
  queued: number
  skipped: number
  noBotInfo: number
  flowName: string
  botUsername: string | null
}

interface BroadcastStatus {
  id: string
  flowName: string
  botUsername: string | null
  total: number
  sent: number
  failed: number
  pending: number
  percent: number
  status: 'RUNNING' | 'DONE' | 'CANCELLED'
  estimatedRemainingSecs: number
  createdAt: string
  finishedAt: string | null
}

type PurchaseFilter = 'all' | 'yes' | 'no'

const LIMIT = 50

export default function RemarketingMasterPage() {
  const [flows, setFlows]               = useState<Flow[]>([])
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null)
  const [loadingFlows, setLoadingFlows] = useState(true)

  const [leads, setLeads]           = useState<Lead[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loadingLeads, setLoadingLeads] = useState(true)

  const [search, setSearch]               = useState('')
  const [purchaseFilter, setPurchaseFilter] = useState<PurchaseFilter>('all')
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  const [selectAllMatching, setSelectAllMatching] = useState(false)

  const [dispatching, setDispatching]     = useState(false)
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastStatus | null>(null)
  const [dispatchSkipped, setDispatchSkipped] = useState(0)
  const [dispatchNoBotInfo, setDispatchNoBotInfo] = useState(0)
  const [history, setHistory]             = useState<BroadcastStatus[]>([])
  const [dispatchErr, setDispatchErr]     = useState<string | null>(null)
  const [showConfirm, setShowConfirm]     = useState(false)

  const [lastRefresh, setLastRefresh] = useState(new Date())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const broadcastPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // ── Debounce search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => setDebouncedSearch(search), 350)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

  // ── Load flows once ──────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/admin/remarketing/flows')
      .then((d: Flow[]) => setFlows(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingFlows(false))
  }, [])

  // ── Histórico de disparos ────────────────────────────────────────────────
  const loadHistory = useCallback(() => {
    api.get('/admin/remarketing/broadcasts')
      .then((d: BroadcastStatus[]) => setHistory(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  // ── Build query ──────────────────────────────────────────────────────────
  const buildQuery = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (debouncedSearch.trim()) p.set('search', debouncedSearch.trim())
    if (selectedFlow)           p.set('workspaceId', selectedFlow.workspaceId)
    if (purchaseFilter === 'yes') p.set('hasPurchase', 'true')
    if (purchaseFilter === 'no')  p.set('hasPurchase', 'false')
    return p.toString()
  }, [page, debouncedSearch, selectedFlow, purchaseFilter])

  // ── Load leads ───────────────────────────────────────────────────────────
  const loadLeads = useCallback(async (spinner = false) => {
    if (spinner) setLoadingLeads(true)
    try {
      const d = await api.get(`/admin/remarketing/leads?${buildQuery()}`)
      setLeads(d.leads ?? [])
      setTotal(d.total ?? 0)
      setLastRefresh(new Date())
    } catch {}
    finally { if (spinner) setLoadingLeads(false) }
  }, [buildQuery])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
    setSelectedIds(new Set())
    setSelectAllMatching(false)
  }, [debouncedSearch, selectedFlow, purchaseFilter])

  useEffect(() => { loadLeads(true) }, [loadLeads])

  // Poll every 5s
  useEffect(() => {
    pollRef.current = setInterval(() => loadLeads(false), 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadLeads])

  // ── Poll progresso do broadcast ativo a cada 1.5s até concluir ──────────────
  useEffect(() => {
    if (!activeBroadcast || activeBroadcast.status !== 'RUNNING') return
    broadcastPollRef.current = setInterval(async () => {
      try {
        const s: BroadcastStatus = await api.get(`/admin/remarketing/broadcast/${activeBroadcast.id}`)
        setActiveBroadcast(s)
        if (s.status === 'DONE') loadHistory()
      } catch {}
    }, 1500)
    return () => { if (broadcastPollRef.current) clearInterval(broadcastPollRef.current) }
  }, [activeBroadcast?.id, activeBroadcast?.status, loadHistory])

  // ── Selection helpers ────────────────────────────────────────────────────
  const allSelected  = selectAllMatching || (leads.length > 0 && leads.every(l => selectedIds.has(l.id)))
  const someSelected = !selectAllMatching && leads.some(l => selectedIds.has(l.id)) && !allSelected

  const toggleAll = () => {
    if (selectAllMatching) {
      setSelectAllMatching(false)
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(prev => {
      const next = new Set(prev)
      allSelected ? leads.forEach(l => next.delete(l.id)) : leads.forEach(l => next.add(l.id))
      return next
    })
  }

  const toggleOne = (id: string) => {
    if (selectAllMatching) {
      setSelectAllMatching(false)
      setSelectedIds(new Set(leads.filter(l => l.id !== id).map(l => l.id)))
      return
    }
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const enableSelectAllMatching = () => {
    setSelectAllMatching(true)
    setSelectedIds(new Set())
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────
  const effectiveCount = selectAllMatching ? total : selectedIds.size

  const dispatch = async () => {
    if (!selectedFlow || effectiveCount === 0) return
    setDispatching(true)
    setDispatchErr(null)
    try {
      const payload = selectAllMatching
        ? {
            flowId:      selectedFlow.id,
            selectAll:   true,
            workspaceId: selectedFlow.workspaceId,
            search:      debouncedSearch.trim() || undefined,
            hasPurchase: purchaseFilter === 'yes' ? true : purchaseFilter === 'no' ? false : undefined,
          }
        : {
            flowId:  selectedFlow.id,
            leadIds: Array.from(selectedIds),
          }
      const res: DispatchResponse = await api.post('/admin/remarketing/broadcast', payload)
      setDispatchSkipped(res.skipped)
      setDispatchNoBotInfo(res.noBotInfo)
      setActiveBroadcast({
        id:                     res.broadcastId,
        flowName:               res.flowName,
        botUsername:            res.botUsername,
        total:                  res.queued,
        sent:                   0,
        failed:                 0,
        pending:                res.queued,
        percent:                res.queued > 0 ? 0 : 100,
        status:                 res.queued > 0 ? 'RUNNING' : 'DONE',
        estimatedRemainingSecs: Math.ceil((res.queued * 300) / 1000),
        createdAt:              new Date().toISOString(),
        finishedAt:             null,
      })
      if (res.queued === 0) loadHistory()
      setSelectedIds(new Set())
      setSelectAllMatching(false)
      setShowConfirm(false)
    } catch (e: any) {
      setDispatchErr(e?.message || 'Erro ao disparar broadcast')
      setShowConfirm(false)
    } finally {
      setDispatching(false)
    }
  }

  const formatDuration = (secs: number) => secs < 60
    ? `~${Math.ceil(secs)}s`
    : `~${Math.ceil(secs / 60)} min`

  const totalPages       = Math.ceil(total / LIMIT)
  const estimatedSecs    = effectiveCount * 0.3
  const estimatedDisplay = formatDuration(estimatedSecs)

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="border-b border-white/[0.06] px-8 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2.5">
              <Megaphone className="h-5 w-5 text-[#E50914]" />
              Remarketing Master
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1.5 text-xs text-[#555]">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                {lastRefresh.toLocaleTimeString('pt-BR')}
              </span>
              <span className="text-[#2A2A2A]">·</span>
              <span className="text-xs text-[#555]">{total} lead{total !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <button
            onClick={() => loadLeads(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#555] hover:text-white border border-white/[0.06] hover:border-white/15 rounded-[3px] transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left Panel ── */}
        <div className="w-68 shrink-0 border-r border-white/[0.06] flex flex-col overflow-y-auto bg-[#080808]" style={{ width: 272 }}>

          {/* Flow Selector */}
          <div className="p-4 border-b border-white/[0.06]">
            <p className="text-[10px] font-bold text-[#3A3A3A] uppercase tracking-wider mb-3">Fluxo para Disparo</p>
            {loadingFlows ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-[#E50914]" />
              </div>
            ) : flows.length === 0 ? (
              <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-[3px] p-4 text-center">
                <GitBranch className="h-5 w-5 text-[#2A2A2A] mx-auto mb-2" />
                <p className="text-xs text-[#444]">Nenhum fluxo ativo com bot.</p>
                <p className="text-[10px] text-[#333] mt-1">Crie e ative um fluxo com bot.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {flows.map(f => {
                  const active = selectedFlow?.id === f.id
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        setSelectedFlow(prev => prev?.id === f.id ? null : f)
                        setSelectedIds(new Set())
                        setSelectAllMatching(false)
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-[3px] border transition-all ${
                        active
                          ? 'bg-[#E50914]/10 border-[#E50914]/25 text-white'
                          : 'bg-[#0D0D0D] border-white/[0.06] text-[#888] hover:text-white hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <GitBranch className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[#E50914]' : 'text-[#444]'}`} />
                        <span className="text-xs font-semibold truncate">{f.name}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#555]">
                        <span className="flex items-center gap-1"><Bot className="h-2.5 w-2.5" />@{f.botUsername || '—'}</span>
                        <span className="text-[#2A2A2A]">·</span>
                        <span>{f.nodeCount} nó{f.nodeCount !== 1 ? 's' : ''}</span>
                      </div>
                      {f.workspaceName && (
                        <p className="text-[10px] text-[#3A3A3A] mt-0.5 truncate">{f.workspaceName}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="p-4 space-y-4 border-b border-white/[0.06]">
            <div>
              <p className="text-[10px] font-bold text-[#3A3A3A] uppercase tracking-wider mb-2">Busca</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#444]" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Nome, @username, ID..."
                  className="w-full bg-[#0D0D0D] border border-white/[0.06] rounded-[3px] pl-7 pr-3 py-2 text-xs text-white placeholder-[#333] focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-[#3A3A3A] uppercase tracking-wider mb-2">Pagamento</p>
              <div className="flex flex-col gap-1">
                {(['all', 'yes', 'no'] as PurchaseFilter[]).map(v => {
                  const label = v === 'all' ? 'Todos' : v === 'yes' ? 'Com compra' : 'Sem compra'
                  const active = purchaseFilter === v
                  return (
                    <button
                      key={v}
                      onClick={() => setPurchaseFilter(v)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[3px] text-xs transition-all ${
                        active
                          ? 'bg-[#E50914]/10 text-[#E50914] border border-[#E50914]/15'
                          : 'text-[#555] hover:text-white border border-transparent hover:border-white/[0.06]'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#E50914]' : 'bg-[#2A2A2A]'}`} />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Dispatch Panel */}
          <div className="p-4 mt-auto">
            {selectedFlow && effectiveCount > 0 ? (
              <div className="space-y-3">
                <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-[3px] p-3 space-y-2">
                  {[
                    ['Selecionados', `${effectiveCount} lead${effectiveCount !== 1 ? 's' : ''}`],
                    ['Tempo est.',   estimatedDisplay],
                    ['Via bot',      `@${selectedFlow.botUsername || '?'}`],
                    ['Fluxo',        selectedFlow.name],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span className="text-[#444]">{k}</span>
                      <span className="text-white font-medium truncate ml-2 max-w-[120px]" title={String(v)}>{v}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={dispatching}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#E50914] hover:bg-[#c8010f] text-white text-sm font-bold rounded-[3px] transition-colors disabled:opacity-50"
                >
                  {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Disparar Agora
                </button>
              </div>
            ) : (
              <div className="text-xs text-[#333] text-center py-4">
                {!selectedFlow
                  ? 'Selecione um fluxo'
                  : 'Selecione leads para disparar'}
              </div>
            )}
          </div>

          {/* Histórico de Disparos */}
          {history.length > 0 && (
            <div className="p-4 border-t border-white/[0.06]">
              <p className="text-[10px] font-bold text-[#3A3A3A] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <History className="h-3 w-3" />
                Histórico de Disparos
              </p>
              <div className="space-y-1.5">
                {history.map(h => (
                  <div key={h.id} className="bg-[#0D0D0D] border border-white/[0.06] rounded-[3px] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-white truncate">{h.flowName}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                        h.status === 'DONE'
                          ? 'bg-green-500/10 text-green-400'
                          : h.status === 'CANCELLED'
                            ? 'bg-white/[0.06] text-[#777]'
                            : 'bg-[#E50914]/10 text-[#E50914]'
                      }`}>
                        {h.status === 'DONE' ? 'concluído' : h.status === 'CANCELLED' ? 'cancelado' : 'rodando'}
                      </span>
                    </div>
                    <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[10px] text-[#555] mt-1">
                      <span>{h.total} lead{h.total !== 1 ? 's' : ''}</span>
                      <span className="text-[#2A2A2A]">·</span>
                      <span className="text-green-400">{h.sent} entregue{h.sent !== 1 ? 's' : ''}</span>
                      {h.failed > 0 && (
                        <>
                          <span className="text-[#2A2A2A]">·</span>
                          <span className="text-[#E50914]">{h.failed} não chegou{h.failed !== 1 ? 'ram' : ''}</span>
                        </>
                      )}
                    </div>
                    <p className="text-[9px] text-[#3A3A3A] mt-1">
                      {new Date(h.createdAt).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Main Panel (Lead Table) ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Banners */}
          <div className="shrink-0">
            {activeBroadcast && (
              <div className={`mx-6 mt-4 rounded-[3px] border px-4 py-3 ${
                activeBroadcast.status === 'DONE'
                  ? 'bg-green-500/10 border-green-500/20'
                  : activeBroadcast.status === 'CANCELLED'
                    ? 'bg-white/[0.04] border-white/[0.08]'
                    : 'bg-[#E50914]/10 border-[#E50914]/20'
              }`}>
                <div className="flex items-start gap-3">
                  {activeBroadcast.status === 'DONE'
                    ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                    : activeBroadcast.status === 'CANCELLED'
                      ? <X className="h-4 w-4 text-[#777] shrink-0 mt-0.5" />
                      : <Loader2 className="h-4 w-4 text-[#E50914] shrink-0 mt-0.5 animate-spin" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${
                      activeBroadcast.status === 'DONE' ? 'text-green-400' : activeBroadcast.status === 'CANCELLED' ? 'text-[#777]' : 'text-[#E50914]'
                    }`}>
                      {activeBroadcast.status === 'DONE' ? 'Disparo concluído' : activeBroadcast.status === 'CANCELLED' ? 'Disparo cancelado' : 'Disparando agora'}
                      {activeBroadcast.botUsername ? ` · @${activeBroadcast.botUsername}` : ''}
                    </p>
                    <p className="text-xs text-[#555] mt-0.5">
                      {activeBroadcast.sent + activeBroadcast.failed} / {activeBroadcast.total} processados ·{' '}
                      <span className="text-green-400">{activeBroadcast.sent} entregue{activeBroadcast.sent !== 1 ? 's' : ''}</span>
                      {activeBroadcast.failed > 0 && (
                        <> · <span className="text-[#E50914]">{activeBroadcast.failed} não chegou{activeBroadcast.failed !== 1 ? 'ram' : ''}</span></>
                      )}
                      {dispatchSkipped > 0 && ` · ${dispatchSkipped} ignorado${dispatchSkipped !== 1 ? 's' : ''} (sem Telegram ID)`}
                      {dispatchNoBotInfo > 0 && ` · ${dispatchNoBotInfo} sem bot de origem salvo (tentativa via bot do fluxo)`}
                      {activeBroadcast.status === 'RUNNING' && activeBroadcast.pending > 0 && (
                        <span className="inline-flex items-center gap-1 ml-1">
                          · <Clock className="h-3 w-3" /> {formatDuration(activeBroadcast.estimatedRemainingSecs)} restante
                        </span>
                      )}
                    </p>
                    <div className="mt-2 h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          activeBroadcast.status === 'DONE' ? 'bg-green-400' : activeBroadcast.status === 'CANCELLED' ? 'bg-[#777]' : 'bg-[#E50914]'
                        }`}
                        style={{ width: `${activeBroadcast.percent}%` }}
                      />
                    </div>
                  </div>
                  <button onClick={() => setActiveBroadcast(null)} className="text-[#444] hover:text-white shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            {dispatchErr && (
              <div className="mx-6 mt-4 flex items-start gap-3 bg-[#E50914]/10 border border-[#E50914]/20 rounded-[3px] px-4 py-3">
                <AlertCircle className="h-4 w-4 text-[#E50914] shrink-0 mt-0.5" />
                <p className="text-sm text-[#E50914] flex-1">{dispatchErr}</p>
                <button onClick={() => setDispatchErr(null)} className="text-[#444] hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Table Toolbar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                className="text-[#444] hover:text-white transition-colors"
                title={allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              >
                {allSelected
                  ? <CheckSquare className="h-4 w-4 text-[#E50914]" />
                  : someSelected
                    ? <div className="w-4 h-4 rounded-[2px] border border-[#E50914] bg-[#E50914]/20 flex items-center justify-center">
                        <div className="w-2 h-0.5 bg-[#E50914] rounded-full" />
                      </div>
                    : <Square className="h-4 w-4" />
                }
              </button>
              {selectAllMatching ? (
                <>
                  <span className="flex items-center gap-1.5 text-xs text-[#E50914] font-semibold">
                    <Layers className="h-3.5 w-3.5" />
                    Todos os {total} leads selecionados
                  </span>
                  <button
                    onClick={() => { setSelectAllMatching(false); setSelectedIds(new Set()) }}
                    className="text-[10px] text-[#444] hover:text-[#E50914] transition-colors"
                  >
                    limpar
                  </button>
                </>
              ) : selectedIds.size > 0 && (
                <>
                  <span className="text-xs text-[#555]">
                    {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-[10px] text-[#444] hover:text-[#E50914] transition-colors"
                  >
                    limpar
                  </button>
                  {allSelected && total > leads.length && (
                    <button
                      onClick={enableSelectAllMatching}
                      className="text-[10px] text-[#E50914] hover:text-[#ff2030] font-medium underline underline-offset-2"
                    >
                      Selecionar todos os {total} leads que casam com o filtro
                    </button>
                  )}
                </>
              )}
            </div>
            {!selectedFlow && (
              <span className="text-xs text-[#333] flex items-center gap-1.5">
                <Filter className="h-3 w-3" />
                Selecione um fluxo para filtrar por workspace
              </span>
            )}
          </div>

          {/* Table */}
          {loadingLeads ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#E50914]" />
            </div>
          ) : leads.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
              <Users className="h-12 w-12 text-[#1A1A1A]" />
              <div>
                <p className="text-sm font-semibold text-[#444]">Nenhum lead encontrado</p>
                <p className="text-xs text-[#333] mt-1">
                  {selectedFlow
                    ? 'Nenhum lead deste workspace ainda. Aguarde interações com o bot.'
                    : 'Aguardando leads chegarem via bots...'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-[#080808]">
                  <tr className="border-b border-white/[0.06]">
                    <th className="w-10 px-4 py-3" />
                    {['Lead', 'Username', 'Bot', 'Workspace', 'Status', 'Entrada'].map(h => (
                      <th key={h} className="text-left text-[10px] font-bold text-[#3A3A3A] uppercase tracking-wider px-3 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => {
                    const sel = selectAllMatching || selectedIds.has(lead.id)
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => toggleOne(lead.id)}
                        className={`border-b border-white/[0.03] cursor-pointer transition-colors ${
                          sel ? 'bg-[#E50914]/5 hover:bg-[#E50914]/8' : 'hover:bg-[#0F0F0F]'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className={`w-4 h-4 rounded-[2px] border flex items-center justify-center transition-colors shrink-0 ${
                            sel ? 'bg-[#E50914] border-[#E50914]' : 'border-[#2A2A2A] hover:border-[#444]'
                          }`}>
                            {sel && <div className="w-2 h-1.5 border-b-2 border-l-2 border-white rotate-[-45deg] -mt-0.5" />}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-[3px] bg-[#E50914]/10 flex items-center justify-center shrink-0">
                              <span className="text-[#E50914] text-[10px] font-bold">
                                {(lead.name || '?')[0].toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white leading-tight truncate">{lead.name}</p>
                              <p className="text-[10px] text-[#3A3A3A]">{lead.telegramId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-[#666]">
                            {lead.username ? `@${lead.username}` : <span className="text-[#2A2A2A]">—</span>}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-[#555]">
                            {lead.botUsername ? `@${lead.botUsername}` : <span className="text-[#2A2A2A]">—</span>}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-[#444] truncate block max-w-[140px]">
                            {lead.workspaceName || <span className="text-[#2A2A2A]">—</span>}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {lead.hasPurchase ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/15">
                              <ShoppingCart className="h-2.5 w-2.5" /> Comprou
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#2A2A2A]">Sem compra</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-[10px] text-[#3A3A3A]">
                            {new Date(lead.createdAt).toLocaleDateString('pt-BR', {
                              day: '2-digit', month: '2-digit', year: '2-digit',
                            })}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-white/[0.06] shrink-0">
              <span className="text-xs text-[#3A3A3A]">
                Página {page} de {totalPages} · {total} leads
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-7 h-7 flex items-center justify-center rounded-[3px] border border-white/[0.06] text-[#444] hover:text-white disabled:opacity-25 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-[#3A3A3A] px-2">{page}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="w-7 h-7 flex items-center justify-center rounded-[3px] border border-white/[0.06] text-[#444] hover:text-white disabled:opacity-25 transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm Modal ── */}
      {showConfirm && selectedFlow && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#141414] border border-white/[0.08] rounded-[4px] w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[3px] bg-[#E50914]/15 flex items-center justify-center shrink-0">
                <Megaphone className="h-5 w-5 text-[#E50914]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Confirmar Broadcast</h3>
                <p className="text-xs text-[#555] mt-0.5">Esta ação não pode ser desfeita</p>
              </div>
            </div>

            <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-[3px] p-3 space-y-2.5">
              {[
                ['Fluxo',              selectedFlow.name],
                ['Bot',                `@${selectedFlow.botUsername || '?'}`],
                ['Workspace',          selectedFlow.workspaceName || '—'],
                ['Leads selecionados', `${effectiveCount}`],
                ['Tempo estimado',     estimatedDisplay],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between text-xs gap-2">
                  <span className="text-[#555] shrink-0">{k}</span>
                  <span className="text-white font-medium text-right">{v}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-[#3A3A3A] leading-relaxed">
              O fluxo será executado do início para cada lead, com 300 ms de intervalo entre disparos para respeitar os limites do Telegram.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 text-xs text-[#555] border border-white/[0.06] hover:text-white hover:border-white/15 rounded-[3px] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={dispatch}
                disabled={dispatching}
                className="flex-1 px-4 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#c8010f] rounded-[3px] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {dispatching
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5" />
                }
                Confirmar Disparo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
