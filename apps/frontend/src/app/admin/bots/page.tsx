'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Loader2, Bot, CheckCircle, Clock, XCircle, Filter } from 'lucide-react'

interface BotRow {
  id: string
  username: string
  status: 'ACTIVE' | 'PENDING_REVIEW' | 'BLOCKED'
  isActive: boolean
  createdAt: string
  workspace: { id: string; name: string; owner: { name: string; email: string } }
  _count: { flows: number }
}

const STATUS_OPTS = [
  { value: '',               label: 'Todos',      color: '#555' },
  { value: 'PENDING_REVIEW', label: 'Em análise', color: '#F59E0B' },
  { value: 'ACTIVE',         label: 'Ativos',     color: '#10B981' },
  { value: 'BLOCKED',        label: 'Bloqueados', color: '#EF4444' },
]

function StatusBadge({ status }: { status: string }) {
  if (status === 'ACTIVE')         return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/15"><CheckCircle className="h-3 w-3" /> Ativo</span>
  if (status === 'PENDING_REVIEW') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/15"><Clock className="h-3 w-3" /> Em análise</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/15"><XCircle className="h-3 w-3" /> Bloqueado</span>
}

export default function AdminBotsPage() {
  const [bots,      setBots]      = useState<BotRow[]>([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [acting,    setActing]    = useState<string | null>(null)
  const [filter,    setFilter]    = useState('')

  const load = async (s = filter) => {
    setLoading(true)
    try {
      const qs = s ? `?status=${s}&limit=50` : '?limit=50'
      const d  = await api.get(`/admin/bots${qs}`)
      setBots(d.bots)
      setTotal(d.total)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const setStatus = async (id: string, status: string) => {
    setActing(id)
    try {
      await api.patch(`/admin/bots/${id}/status`, { status })
      await load()
    } finally { setActing(null) }
  }

  const changeFilter = (v: string) => {
    setFilter(v)
    load(v)
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Bot className="h-6 w-6 text-[#10B981]" /> Bots
          </h1>
          <p className="text-sm text-[#555] mt-1">{total} bot{total !== 1 ? 's' : ''} na plataforma</p>
        </div>
        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#444]" />
          <div className="flex rounded-[4px] border border-white/[0.06] overflow-hidden bg-[#141414]">
            {STATUS_OPTS.map(o => (
              <button
                key={o.value}
                onClick={() => changeFilter(o.value)}
                className={`px-3 py-1.5 text-xs font-semibold transition-all ${
                  filter === o.value ? 'bg-[#1E1E1E] text-white' : 'text-[#555] hover:text-[#888]'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-[#E50914]" />
        </div>
      ) : (
        <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Bot', 'Dono', 'Fluxos', 'Cadastro', 'Status', 'Ações'].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold text-[#444] uppercase tracking-wider px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]">
              {bots.map(bot => (
                <tr key={bot.id} className="hover:bg-[#151515] transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-[4px] bg-[#10B981]/10 border border-[#10B981]/15 flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4 text-[#10B981]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">@{bot.username}</p>
                        <p className="text-[10px] text-[#444] font-mono">{bot.id.slice(0, 8)}…</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-white">{bot.workspace.owner.name}</p>
                    <p className="text-xs text-[#444]">{bot.workspace.owner.email}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm text-[#666]">{bot._count.flows}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs text-[#444]">{new Date(bot.createdAt).toLocaleDateString('pt-BR')}</span>
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={bot.status} /></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {bot.status !== 'ACTIVE' && (
                        <button
                          onClick={() => setStatus(bot.id, 'ACTIVE')}
                          disabled={acting === bot.id}
                          className="h-7 px-2.5 rounded-[3px] text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/15 hover:bg-green-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {acting === bot.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                          Aprovar
                        </button>
                      )}
                      {bot.status !== 'BLOCKED' && (
                        <button
                          onClick={() => setStatus(bot.id, 'BLOCKED')}
                          disabled={acting === bot.id}
                          className="h-7 px-2.5 rounded-[3px] text-[10px] font-bold bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/15 hover:bg-[#EF4444]/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          <XCircle className="h-3 w-3" /> Bloquear
                        </button>
                      )}
                      {bot.status !== 'PENDING_REVIEW' && (
                        <button
                          onClick={() => setStatus(bot.id, 'PENDING_REVIEW')}
                          disabled={acting === bot.id}
                          className="h-7 px-2.5 rounded-[3px] text-[10px] font-bold bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/15 hover:bg-[#F59E0B]/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          <Clock className="h-3 w-3" /> Análise
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {bots.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-[#444] text-sm">
                    Nenhum bot encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
