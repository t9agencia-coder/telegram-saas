'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Loader2, Receipt, Check, Clock, Search } from 'lucide-react'

interface PaymentRow {
  id: string
  transactionId: string
  amount: number
  status: string
  approvalStatus: 'APPROVED' | 'PENDING' | null
  approvedAt: string | null
  approvedBy: string | null
  createdAt: string
  paidAt: string | null
  lead: { workspaceId: string; workspace: { name: string } | null }
}

type Filter = 'ALL' | 'APPROVED' | 'PENDING'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function AdminVendasPage() {
  const [payments,   setPayments]   = useState<PaymentRow[]>([])
  const [listTotal,  setListTotal]  = useState(0) // total pra paginação, respeita o filtro atual
  const [allTotal,   setAllTotal]   = useState(0) // total geral, sempre sem filtro (pros cards)
  const [pending,    setPending]    = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState<Filter>('ALL')
  const [search,     setSearch]     = useState('')
  const [approving,  setApproving]  = useState<string | null>(null)
  const [page,       setPage]       = useState(1)
  const limit = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (filter !== 'ALL') qs.set('approvalStatus', filter)
      const [d, allD, pendingCount] = await Promise.all([
        api.get(`/admin/payments?${qs.toString()}`),
        api.get('/admin/payments?page=1&limit=1'),
        api.get<number>('/admin/payments/pending-count'),
      ])
      setPayments(d.items)
      setListTotal(d.total)
      setAllTotal(allD.total)
      setPending(pendingCount)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [page, filter])

  useEffect(() => { load() }, [load])

  const approve = async (id: string) => {
    setApproving(id)
    try {
      await api.patch(`/admin/payments/${id}/approve`, {})
      await load()
    } catch (e) { console.error(e) }
    finally { setApproving(null) }
  }

  const filtered = payments.filter((p) =>
    p.transactionId.toLowerCase().includes(search.toLowerCase()) ||
    (p.lead?.workspace?.name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Receipt className="h-6 w-6 text-[#3B82F6]" /> Vendas
          </h1>
          <p className="text-sm text-[#555] mt-1">{allTotal} venda{allTotal !== 1 ? 's' : ''} no total</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => { setFilter('PENDING'); setPage(1) }}
          className={cn(
            'rounded-[4px] border p-4 text-left transition-colors',
            filter === 'PENDING' ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10' : 'border-white/[0.06] bg-[#141414] hover:border-[#F59E0B]/25'
          )}
        >
          <p className="text-xs text-[#666] font-medium uppercase tracking-wide mb-1">Pendentes de Aprovação</p>
          <p className="text-xl font-semibold text-[#F59E0B]">{pending}</p>
        </button>
        <button
          onClick={() => { setFilter('APPROVED'); setPage(1) }}
          className={cn(
            'rounded-[4px] border p-4 text-left transition-colors',
            filter === 'APPROVED' ? 'border-[#22C55E]/40 bg-[#22C55E]/10' : 'border-white/[0.06] bg-[#141414] hover:border-[#22C55E]/25'
          )}
        >
          <p className="text-xs text-[#666] font-medium uppercase tracking-wide mb-1">Aprovadas</p>
          <p className="text-xl font-semibold text-[#22C55E]">{allTotal - pending}</p>
        </button>
        <button
          onClick={() => { setFilter('ALL'); setPage(1) }}
          className={cn(
            'rounded-[4px] border p-4 text-left transition-colors',
            filter === 'ALL' ? 'border-[#3B82F6]/40 bg-[#3B82F6]/10' : 'border-white/[0.06] bg-[#141414] hover:border-[#3B82F6]/25'
          )}
        >
          <p className="text-xs text-[#666] font-medium uppercase tracking-wide mb-1">Todas</p>
          <p className="text-xl font-semibold text-white">{allTotal}</p>
        </button>
      </div>

      <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#666]" />
            <input
              placeholder="Buscar por transação ou conta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-64 rounded-[3px] border border-white/[0.08] bg-[#1A1A1A] pl-9 pr-3 text-sm text-white placeholder:text-[#666] outline-none focus:border-[#3B82F6]/40 transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin text-[#E50914]" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Transação', 'Conta', 'Valor', 'Status de Aprovação', 'Recebido em', 'Aprovado em', 'Ações'].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold text-[#444] uppercase tracking-wider px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-[#151515] transition-colors">
                  <td className="px-5 py-4 text-xs font-mono text-[#B3B3B3]">{p.transactionId.slice(0, 16)}...</td>
                  <td className="px-5 py-4 text-sm text-white">{p.lead?.workspace?.name || '—'}</td>
                  <td className="px-5 py-4 text-sm font-medium text-white tabular-nums">{formatCurrency(p.amount)}</td>
                  <td className="px-5 py-4">
                    {p.approvalStatus === 'PENDING' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-[#F59E0B] bg-[#F59E0B]/10">
                        🟡 Pendente
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-[#22C55E] bg-[#22C55E]/10">
                        ✅ Aprovada
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-[#666] whitespace-nowrap">{formatDate(p.createdAt)}</td>
                  <td className="px-5 py-4 text-xs text-[#666] whitespace-nowrap">{formatDate(p.approvedAt)}</td>
                  <td className="px-5 py-4">
                    {p.approvalStatus === 'PENDING' ? (
                      <button
                        onClick={() => approve(p.id)}
                        disabled={approving === p.id}
                        className="px-3 py-1.5 rounded-[3px] text-xs font-bold text-white bg-[#22C55E] hover:bg-[#16A34A] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {approving === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Aprovar
                      </button>
                    ) : (
                      <span className="text-xs text-[#444]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-[#666]">
            <Receipt className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">Nenhuma venda encontrada</p>
          </div>
        )}
      </div>

      {listTotal > limit && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs text-[#666] border border-white/[0.06] rounded-[3px] disabled:opacity-40 hover:text-white transition-colors"
          >
            Anterior
          </button>
          <span className="text-xs text-[#666]">Página {page} de {Math.ceil(listTotal / limit)}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(listTotal / limit)}
            className="px-3 py-1.5 text-xs text-[#666] border border-white/[0.06] rounded-[3px] disabled:opacity-40 hover:text-white transition-colors"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}
