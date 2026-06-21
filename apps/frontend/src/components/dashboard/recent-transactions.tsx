'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Search, ChevronDown, ArrowUpDown, MoreHorizontal, Check, X, Clock } from 'lucide-react'

const transactions = [
  { id: '#001234', customer: 'João Silva', product: 'Curso Digital', amount: 'R$ 197,00', status: 'approved', date: 'Hoje, 14:32' },
  { id: '#001233', customer: 'Maria Santos', product: 'Mentoria', amount: 'R$ 497,00', status: 'approved', date: 'Hoje, 13:15' },
  { id: '#001232', customer: 'Pedro Alves', product: 'E-book', amount: 'R$ 47,00', status: 'pending', date: 'Hoje, 11:48' },
  { id: '#001231', customer: 'Ana Costa', product: 'Curso Digital', amount: 'R$ 197,00', status: 'approved', date: 'Hoje, 10:02' },
  { id: '#001230', customer: 'Carlos Oliveira', product: 'Assinatura', amount: 'R$ 97,00', status: 'cancelled', date: 'Ontem, 18:20' },
  { id: '#001229', customer: 'Julia Lima', product: 'Mentoria', amount: 'R$ 497,00', status: 'approved', date: 'Ontem, 16:45' },
  { id: '#001228', customer: 'Lucas Pereira', product: 'Curso Digital', amount: 'R$ 197,00', status: 'processed', date: 'Ontem, 15:30' },
  { id: '#001227', customer: 'Beatriz Rocha', product: 'E-book', amount: 'R$ 47,00', status: 'approved', date: 'Ontem, 14:10' },
]

const statusConfig = {
  approved: { label: 'Aprovado', icon: Check, class: 'text-[#22C55E] bg-[#22C55E]/10' },
  pending: { label: 'Pendente', icon: Clock, class: 'text-[#F59E0B] bg-[#F59E0B]/10' },
  cancelled: { label: 'Cancelado', icon: X, class: 'text-[#EF4444] bg-[#EF4444]/10' },
  processed: { label: 'Processando', icon: Clock, class: 'text-[#3B82F6] bg-[#3B82F6]/10' },
} as const

export function RecentTransactions() {
  const [search, setSearch] = useState('')

  const filtered = transactions.filter(
    (t) =>
      t.customer.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#161616]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
        <div>
          <h3 className="text-sm font-semibold text-white">Transações Recentes</h3>
          <p className="text-xs text-[#666666] mt-0.5">{transactions.length} transações hoje</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#666666]" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-40 rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] pl-8 pr-3 text-xs text-white placeholder:text-[#666666] outline-none focus:border-[#E50914]/50 transition-colors"
            />
          </div>
          <button className="h-8 px-2.5 rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] flex items-center gap-1.5 text-xs text-[#B3B3B3] hover:text-white transition-colors">
            <ArrowUpDown className="h-3 w-3" />
            Ordenar
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2A2A2A]/50">
              <th className="text-left px-5 py-3 text-[10px] font-medium text-[#666666] uppercase tracking-wider">ID</th>
              <th className="text-left px-5 py-3 text-[10px] font-medium text-[#666666] uppercase tracking-wider">Cliente</th>
              <th className="text-left px-5 py-3 text-[10px] font-medium text-[#666666] uppercase tracking-wider">Produto</th>
              <th className="text-left px-5 py-3 text-[10px] font-medium text-[#666666] uppercase tracking-wider">Valor</th>
              <th className="text-left px-5 py-3 text-[10px] font-medium text-[#666666] uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-[10px] font-medium text-[#666666] uppercase tracking-wider">Data</th>
              <th className="px-5 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((tx) => {
              const status = statusConfig[tx.status as keyof typeof statusConfig]
              const StatusIcon = status.icon
              return (
                <tr
                  key={tx.id}
                  className="border-b border-[#2A2A2A]/30 hover:bg-[#1E1E1E] transition-colors group"
                >
                  <td className="px-5 py-3.5 text-sm font-medium text-white">{tx.id}</td>
                  <td className="px-5 py-3.5 text-sm text-[#B3B3B3]">{tx.customer}</td>
                  <td className="px-5 py-3.5 text-sm text-[#B3B3B3]">{tx.product}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-white">{tx.amount}</td>
                  <td className="px-5 py-3.5">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium', status.class)}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#666666]">{tx.date}</td>
                  <td className="px-5 py-3.5">
                    <button className="opacity-0 group-hover:opacity-100 transition-opacity text-[#666666] hover:text-white">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-[#666666]">
          Nenhuma transação encontrada
        </div>
      )}
    </div>
  )
}
