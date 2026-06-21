'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Receipt, Search, Download, Filter, ArrowUpDown } from 'lucide-react'

const transactions = [
  { id: '#001', date: '2024-01-15', client: 'João Silva', product: 'Curso de Marketing', value: 'R$ 197,00', status: 'approved', method: 'PIX' },
  { id: '#002', date: '2024-01-14', client: 'Maria Santos', product: 'E-book Completo', value: 'R$ 47,00', status: 'pending', method: 'PIX' },
  { id: '#003', date: '2024-01-14', client: 'Carlos Lima', product: 'Mentoria Individual', value: 'R$ 497,00', status: 'approved', method: 'Cartão' },
  { id: '#004', date: '2024-01-13', client: 'Ana Oliveira', product: 'Curso de Marketing', value: 'R$ 197,00', status: 'refunded', method: 'PIX' },
  { id: '#005', date: '2024-01-13', client: 'Pedro Costa', product: 'Assinatura Mensal', value: 'R$ 97,00', status: 'approved', method: 'PIX' },
  { id: '#006', date: '2024-01-12', client: 'Lucia Ferreira', product: 'E-book Completo', value: 'R$ 47,00', status: 'approved', method: 'Cartão' },
  { id: '#007', date: '2024-01-12', client: 'Roberto Alves', product: 'Mentoria Individual', value: 'R$ 497,00', status: 'failed', method: 'PIX' },
  { id: '#008', date: '2024-01-11', client: 'Patricia Souza', product: 'Curso de Marketing', value: 'R$ 197,00', status: 'approved', method: 'PIX' },
]

const statusMap: Record<string, { label: string; class: string }> = {
  approved: { label: 'Aprovado', class: 'bg-green-500/10 text-green-500' },
  pending: { label: 'Pendente', class: 'bg-yellow-500/10 text-yellow-500' },
  refunded: { label: 'Reembolsado', class: 'bg-red-500/10 text-red-500' },
  failed: { label: 'Falhou', class: 'bg-red-500/10 text-red-500' },
}

export default function TransacoesPage() {
  const [search, setSearch] = useState('')

  const filtered = transactions.filter(t =>
    t.client.toLowerCase().includes(search.toLowerCase()) ||
    t.id.includes(search)
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Financeiro" description="Receitas e transações" />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#666666]" />
          <Input
            placeholder="Buscar transações..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4 mr-2" />
          Filtros
        </Button>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Histórico de Transações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2A2A2A]">
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">
                  <div className="flex items-center gap-1 cursor-pointer hover:text-white">
                    ID <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Data</th>
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Cliente</th>
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Produto</th>
                <th className="text-right text-xs text-[#666666] font-medium px-4 py-3">Valor</th>
                <th className="text-center text-xs text-[#666666] font-medium px-4 py-3">Status</th>
                <th className="text-center text-xs text-[#666666] font-medium px-4 py-3">Método</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const status = statusMap[t.status]
                return (
                  <tr key={t.id} className="border-b border-[#2A2A2A] hover:bg-[#161616] transition-colors">
                    <td className="px-4 py-3 text-sm text-white font-medium">{t.id}</td>
                    <td className="px-4 py-3 text-sm text-[#B3B3B3]">{t.date}</td>
                    <td className="px-4 py-3 text-sm text-white">{t.client}</td>
                    <td className="px-4 py-3 text-sm text-[#B3B3B3]">{t.product}</td>
                    <td className="px-4 py-3 text-sm text-white text-right font-medium">{t.value}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.class}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#B3B3B3] text-center">{t.method}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 text-[#666666]">
              <Receipt className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">Nenhuma transação encontrada</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
