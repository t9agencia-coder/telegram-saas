'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { Search, Check, Clock, Loader2 } from 'lucide-react'

interface Payment {
  id: string
  transactionId: string
  amount: number
  status: 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REFUNDED' | 'CANCELLED' | 'EXPIRED'
  createdAt: string
  paidAt?: string
  lead: { id: string; name?: string; leadUid: string; telegramId?: string }
  product: { id: string; name: string } | null
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

function formatTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()

  if (diff < TWO_HOURS_MS) {
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins} min atrás`
    const hours = Math.floor(mins / 60)
    return `${hours}h atrás`
  }

  const date = new Date(dateStr)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }) + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const statusConfig: Record<string, { label: string; icon: any; class: string }> = {
  APPROVED: { label: 'Aprovado', icon: Check, class: 'text-[#22C55E] bg-[#22C55E]/10' },
  PENDING: { label: 'Pendente', icon: Clock, class: 'text-[#F59E0B] bg-[#F59E0B]/10' },
}

interface Props {
  startDate: string
  endDate: string
}

export function RecentTransactions({ startDate, endDate }: Props) {
  const { workspaceId } = useAuthStore()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!workspaceId) return
    api.get<Payment[]>(`/workspaces/${workspaceId}/payments`)
      .then(setPayments)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [workspaceId])

  const dateFiltered = payments.filter((p) => {
    const d = new Date(p.createdAt)
    return d >= new Date(startDate) && d <= new Date(endDate)
  })

  const filtered = dateFiltered.filter(
    (t) =>
      (t.lead?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      t.transactionId.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] card-glow-premium">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Transações Recentes</h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#666666]" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-32 rounded-[3px] border border-white/[0.08] bg-[#1A1A1A] pl-7 pr-2.5 text-xs text-white placeholder:text-[#666666] outline-none focus:border-[#E50914]/40 focus:shadow-input-focus transition-all duration-200"
          />
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[#666666]" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-2.5 text-[10px] font-medium text-[#666666] uppercase tracking-wider">ID</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-medium text-[#666666] uppercase tracking-wider">Cliente</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-medium text-[#666666] uppercase tracking-wider">Produto</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-medium text-[#666666] uppercase tracking-wider">Valor</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-medium text-[#666666] uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-medium text-[#666666] uppercase tracking-wider">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => {
                const status = statusConfig[tx.status] || statusConfig.PENDING
                const StatusIcon = status.icon
                return (
                  <tr
                    key={tx.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3 text-xs font-medium text-white font-mono">
                      #{tx.transactionId.slice(-6).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#B3B3B3]">{tx.lead?.name || tx.lead?.telegramId || tx.lead?.leadUid || '—'}</td>
                    <td className="px-4 py-3 text-sm text-[#B3B3B3]">{tx.product?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-white">
                      R$ {Number(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] text-[11px] font-medium', status.class)}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666666]">{formatTime(tx.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-[#666666]">
          Nenhuma transação encontrada
        </div>
      )}
    </div>
  )
}


