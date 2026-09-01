'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Loader2, Ban, ChevronLeft, ChevronRight, Search, Plus, X, Check, Trash2, Globe, MessageCircle } from 'lucide-react'

interface BlacklistEntry {
  id: string
  telegramId: string
  reason: string | null
  createdAt: string
  blockedByUser: { id: string; name: string; email: string } | null
}

interface IpBlacklistEntry {
  id: string
  ip: string
  telegramId: string | null
  reason: string | null
  createdAt: string
  blockedByUser: { id: string; name: string; email: string } | null
}

const LIMIT = 20
const TELEGRAM_ID_RE = /^\d+$/

export default function AdminBlacklistPage() {
  const [tab, setTab] = useState<'telegram' | 'ip'>('telegram')

  // ── Telegram ─────────────────────────────────────────────────────────────
  const [entries,  setEntries]  = useState<BlacklistEntry[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [acting,   setActing]   = useState<string | null>(null)

  const [search,       setSearch]       = useState('')
  const [searchInput,  setSearchInput]  = useState('')

  const [showForm,     setShowForm]     = useState(false)
  const [newId,        setNewId]        = useState('')
  const [newReason,    setNewReason]    = useState('')
  const [saving,       setSaving]       = useState(false)
  const [formError,    setFormError]    = useState<string | null>(null)
  const [linkedIpsMsg, setLinkedIpsMsg] = useState<string | null>(null)

  const load = async (p = page, s = search) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      if (s.trim()) qs.set('search', s.trim())
      const d = await api.get(`/admin/blacklist?${qs.toString()}`)
      setEntries(d.items)
      setTotal(d.total)
      setPage(p)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load(1, '') }, [])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const runSearch = () => {
    setSearch(searchInput)
    load(1, searchInput)
  }

  const openForm = () => {
    setNewId('')
    setNewReason('')
    setFormError(null)
    setShowForm(true)
  }

  const submitBlock = async () => {
    const id = newId.trim()
    if (!TELEGRAM_ID_RE.test(id)) {
      setFormError('Informe o Telegram User ID numérico (não o @username)')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const res = await api.post('/admin/blacklist', { telegramId: id, reason: newReason.trim() || undefined })
      setShowForm(false)
      await load(1, search)
      const parts: string[] = []
      if (res?.linkedIps?.length) parts.push(`${res.linkedIps.length} IP(s) também bloqueado(s) automaticamente`)
      if (res?.skippedIps?.length) parts.push(`${res.skippedIps.length} IP(s) pulado(s) por serem de operadora móvel/rede compartilhada`)
      if (parts.length) {
        setLinkedIpsMsg(parts.join(' · ') + '.')
        setTimeout(() => setLinkedIpsMsg(null), 7000)
      }
    } catch (e: any) {
      setFormError(e?.message || 'Falha ao bloquear usuário')
    } finally { setSaving(false) }
  }

  const unblock = async (telegramId: string) => {
    setActing(telegramId)
    try {
      await api.delete(`/admin/blacklist/${telegramId}`)
      await load(page, search)
    } catch (e) { console.error(e) }
    finally { setActing(null) }
  }

  // ── IP ───────────────────────────────────────────────────────────────────
  const [ipEntries, setIpEntries] = useState<IpBlacklistEntry[]>([])
  const [ipTotal,   setIpTotal]   = useState(0)
  const [ipPage,    setIpPage]    = useState(1)
  const [ipLoading, setIpLoading] = useState(true)
  const [ipActing,  setIpActing]  = useState<string | null>(null)

  const [ipSearch,      setIpSearch]      = useState('')
  const [ipSearchInput, setIpSearchInput] = useState('')

  const [ipShowForm,  setIpShowForm]  = useState(false)
  const [newIp,        setNewIp]        = useState('')
  const [newIpReason,  setNewIpReason]  = useState('')
  const [ipSaving,     setIpSaving]     = useState(false)
  const [ipFormError,  setIpFormError]  = useState<string | null>(null)

  const loadIps = async (p = ipPage, s = ipSearch) => {
    setIpLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      if (s.trim()) qs.set('search', s.trim())
      const d = await api.get(`/admin/blacklist/ips?${qs.toString()}`)
      setIpEntries(d.items)
      setIpTotal(d.total)
      setIpPage(p)
    } catch (e) { console.error(e) }
    finally { setIpLoading(false) }
  }

  useEffect(() => { if (tab === 'ip' && ipEntries.length === 0) loadIps(1, '') }, [tab])

  const ipTotalPages = Math.max(1, Math.ceil(ipTotal / LIMIT))

  const runIpSearch = () => {
    setIpSearch(ipSearchInput)
    loadIps(1, ipSearchInput)
  }

  const openIpForm = () => {
    setNewIp('')
    setNewIpReason('')
    setIpFormError(null)
    setIpShowForm(true)
  }

  const submitBlockIp = async () => {
    const ip = newIp.trim()
    if (!ip) {
      setIpFormError('Informe um endereço IP')
      return
    }
    setIpSaving(true)
    setIpFormError(null)
    try {
      await api.post('/admin/blacklist/ips', { ip, reason: newIpReason.trim() || undefined })
      setIpShowForm(false)
      await loadIps(1, ipSearch)
    } catch (e: any) {
      setIpFormError(e?.message || 'Falha ao bloquear IP')
    } finally { setIpSaving(false) }
  }

  const unblockIp = async (ip: string) => {
    setIpActing(ip)
    try {
      await api.delete(`/admin/blacklist/ips/${encodeURIComponent(ip)}`)
      await loadIps(ipPage, ipSearch)
    } catch (e) { console.error(e) }
    finally { setIpActing(null) }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Ban className="h-6 w-6 text-[#EF4444]" /> Blacklist
          </h1>
          <p className="text-sm text-[#555] mt-1">
            {tab === 'telegram'
              ? <>{total} usuário{total !== 1 ? 's' : ''} bloqueado{total !== 1 ? 's' : ''} · identificados pelo Telegram User ID, não pelo username</>
              : <>{ipTotal} IP{ipTotal !== 1 ? 's' : ''} bloqueado{ipTotal !== 1 ? 's' : ''} · camada complementar, só afeta cliques em Redirecionador</>}
          </p>
        </div>
        <button
          onClick={tab === 'telegram' ? openForm : openIpForm}
          className="h-9 px-4 rounded-[4px] font-semibold text-xs text-white flex items-center gap-2 shrink-0"
          style={{ background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)' }}
        >
          <Plus className="h-3.5 w-3.5" /> {tab === 'telegram' ? 'Bloquear usuário' : 'Bloquear IP'}
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-2 border-b border-white/[0.06]">
        <button
          onClick={() => setTab('telegram')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
            tab === 'telegram' ? 'border-[#EF4444] text-white' : 'border-transparent text-[#555] hover:text-white'
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5" /> Telegram User ID
        </button>
        <button
          onClick={() => setTab('ip')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
            tab === 'ip' ? 'border-[#EF4444] text-white' : 'border-transparent text-[#555] hover:text-white'
          }`}
        >
          <Globe className="h-3.5 w-3.5" /> IPs
        </button>
      </div>

      {linkedIpsMsg && (
        <div className="flex items-center gap-2 p-2.5 rounded-[4px] border border-[#F59E0B]/20 bg-[#F59E0B]/10 text-xs text-[#FCD34D]">
          <Globe className="h-3.5 w-3.5 shrink-0" /> {linkedIpsMsg}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#444]" />
          <input
            type="text"
            value={tab === 'telegram' ? searchInput : ipSearchInput}
            onChange={e => tab === 'telegram' ? setSearchInput(e.target.value) : setIpSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (tab === 'telegram' ? runSearch() : runIpSearch())}
            placeholder={tab === 'telegram' ? 'Buscar por Telegram User ID...' : 'Buscar por IP...'}
            className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] pl-9 pr-3 text-xs text-white placeholder:text-[#444] focus:outline-none focus:border-[#EF4444]/40 transition-all"
          />
        </div>
        <button
          onClick={tab === 'telegram' ? runSearch : runIpSearch}
          className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white transition-colors"
        >
          Buscar
        </button>
      </div>

      {tab === 'telegram' ? (
        loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin text-[#E50914]" />
          </div>
        ) : (
          <>
            <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Telegram User ID', 'Motivo', 'Bloqueado em', 'Bloqueado por', 'Ações'].map(h => (
                      <th key={h} className="text-left text-[10px] font-bold text-[#444] uppercase tracking-wider px-5 py-3.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]">
                  {entries.map(e => (
                    <tr key={e.id} className="hover:bg-[#151515] transition-colors group">
                      <td className="px-5 py-4">
                        <span className="text-sm font-mono text-white">{e.telegramId}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs text-[#888]">{e.reason || '—'}</span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="text-xs text-[#666]">{new Date(e.createdAt).toLocaleString('pt-BR')}</span>
                      </td>
                      <td className="px-5 py-4">
                        {e.blockedByUser ? (
                          <span className="text-xs text-[#666]">{e.blockedByUser.name}</span>
                        ) : (
                          <span className="text-xs text-[#444]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => unblock(e.telegramId)}
                          disabled={acting === e.telegramId}
                          title="Desbloquear"
                          className="w-7 h-7 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#444] hover:text-[#22C55E] hover:border-[#22C55E]/25 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                        >
                          {acting === e.telegramId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-16 text-[#444] text-sm">
                        {search ? 'Nenhum resultado para essa busca' : 'Nenhum usuário bloqueado ainda'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => load(page - 1)}
                  disabled={page <= 1}
                  className="w-8 h-8 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#666] hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-[#555]">Página {page} de {totalPages}</span>
                <button
                  onClick={() => load(page + 1)}
                  disabled={page >= totalPages}
                  className="w-8 h-8 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#666] hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )
      ) : (
        ipLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin text-[#E50914]" />
          </div>
        ) : (
          <>
            <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['IP', 'Origem', 'Motivo', 'Bloqueado em', 'Bloqueado por', 'Ações'].map(h => (
                      <th key={h} className="text-left text-[10px] font-bold text-[#444] uppercase tracking-wider px-5 py-3.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]">
                  {ipEntries.map(e => (
                    <tr key={e.id} className="hover:bg-[#151515] transition-colors group">
                      <td className="px-5 py-4">
                        <span className="text-sm font-mono text-white">{e.ip}</span>
                      </td>
                      <td className="px-5 py-4">
                        {e.telegramId ? (
                          <span className="text-[10px] font-mono text-[#666]">auto · ID {e.telegramId}</span>
                        ) : (
                          <span className="text-[10px] text-[#666]">manual</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs text-[#888]">{e.reason || '—'}</span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="text-xs text-[#666]">{new Date(e.createdAt).toLocaleString('pt-BR')}</span>
                      </td>
                      <td className="px-5 py-4">
                        {e.blockedByUser ? (
                          <span className="text-xs text-[#666]">{e.blockedByUser.name}</span>
                        ) : (
                          <span className="text-xs text-[#444]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => unblockIp(e.ip)}
                          disabled={ipActing === e.ip}
                          title="Desbloquear"
                          className="w-7 h-7 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#444] hover:text-[#22C55E] hover:border-[#22C55E]/25 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                        >
                          {ipActing === e.ip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {ipEntries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-16 text-[#444] text-sm">
                        {ipSearch ? 'Nenhum resultado para essa busca' : 'Nenhum IP bloqueado ainda'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {ipTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => loadIps(ipPage - 1)}
                  disabled={ipPage <= 1}
                  className="w-8 h-8 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#666] hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-[#555]">Página {ipPage} de {ipTotalPages}</span>
                <button
                  onClick={() => loadIps(ipPage + 1)}
                  disabled={ipPage >= ipTotalPages}
                  className="w-8 h-8 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#666] hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )
      )}

      {/* ── Modal: bloquear usuário Telegram ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#141414] border border-white/[0.08] rounded-[4px] w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[3px] bg-[#EF4444]/15 flex items-center justify-center shrink-0">
                  <Ban className="h-5 w-5 text-[#EF4444]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Bloquear usuário do Telegram</h3>
                  <p className="text-xs text-[#555] mt-0.5">Vale só para esta plataforma</p>
                </div>
              </div>
              <button onClick={() => setShowForm(false)} className="text-[#444] hover:text-white transition-colors mt-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Telegram User ID</p>
              <input
                type="text"
                value={newId}
                onChange={e => { setNewId(e.target.value.replace(/[^\d]/g, '')); setFormError(null) }}
                onKeyDown={e => e.key === 'Enter' && submitBlock()}
                placeholder="Ex: 123456789 (não é o @username)"
                className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] px-3 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#EF4444]/50 transition-all"
              />
            </div>

            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Motivo (opcional)</p>
              <input
                type="text"
                value={newReason}
                onChange={e => setNewReason(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitBlock()}
                placeholder="Ex: Fraude, spam..."
                maxLength={500}
                className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] px-3 text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#EF4444]/50 transition-all"
              />
            </div>

            <p className="text-[10px] text-[#444] leading-relaxed">
              IPs que esse usuário já usou pra clicar em algum Redirecionador seu são bloqueados automaticamente junto.
            </p>

            {formError && (
              <div className="flex items-center gap-2 p-2.5 rounded-[4px] border border-[#EF4444]/20 bg-[#EF4444]/10 text-xs text-[#EF4444]">
                <X className="h-3.5 w-3.5 shrink-0" /> {formError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 text-xs text-[#555] border border-white/[0.06] hover:text-white hover:border-white/15 rounded-[3px] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={submitBlock}
                disabled={saving || !newId.trim()}
                className="flex-1 px-4 py-2 text-xs font-bold text-white bg-[#EF4444] hover:bg-[#DC2626] rounded-[3px] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Bloquear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: bloquear IP ── */}
      {ipShowForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#141414] border border-white/[0.08] rounded-[4px] w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[3px] bg-[#EF4444]/15 flex items-center justify-center shrink-0">
                  <Globe className="h-5 w-5 text-[#EF4444]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Bloquear IP</h3>
                  <p className="text-xs text-[#555] mt-0.5">Só afeta cliques em links de Redirecionador</p>
                </div>
              </div>
              <button onClick={() => setIpShowForm(false)} className="text-[#444] hover:text-white transition-colors mt-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Endereço IP</p>
              <input
                type="text"
                value={newIp}
                onChange={e => { setNewIp(e.target.value.trim()); setIpFormError(null) }}
                onKeyDown={e => e.key === 'Enter' && submitBlockIp()}
                placeholder="Ex: 189.45.12.30"
                className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] px-3 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#EF4444]/50 transition-all"
              />
            </div>

            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Motivo (opcional)</p>
              <input
                type="text"
                value={newIpReason}
                onChange={e => setNewIpReason(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitBlockIp()}
                placeholder="Ex: Fraude, spam..."
                maxLength={500}
                className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] px-3 text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#EF4444]/50 transition-all"
              />
            </div>

            <p className="text-[10px] text-[#444] leading-relaxed">
              IP é fraco como identificador (redes compartilhadas, dinâmico, VPN) — use com cautela. Não expira sozinho.
            </p>

            {ipFormError && (
              <div className="flex items-center gap-2 p-2.5 rounded-[4px] border border-[#EF4444]/20 bg-[#EF4444]/10 text-xs text-[#EF4444]">
                <X className="h-3.5 w-3.5 shrink-0" /> {ipFormError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setIpShowForm(false)}
                className="flex-1 px-4 py-2 text-xs text-[#555] border border-white/[0.06] hover:text-white hover:border-white/15 rounded-[3px] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={submitBlockIp}
                disabled={ipSaving || !newIp.trim()}
                className="flex-1 px-4 py-2 text-xs font-bold text-white bg-[#EF4444] hover:bg-[#DC2626] rounded-[3px] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {ipSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Bloquear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
