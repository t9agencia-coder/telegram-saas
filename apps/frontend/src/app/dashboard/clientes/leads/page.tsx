'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Users, Search, Download, Filter, Mail, Phone, Tag } from 'lucide-react'

const leads = [
  { name: 'João Silva', email: 'joao@email.com', phone: '(11) 99999-0001', source: 'Instagram', status: 'new', date: '2024-01-15' },
  { name: 'Maria Santos', email: 'maria@email.com', phone: '(11) 99999-0002', source: 'Facebook', status: 'contacted', date: '2024-01-14' },
  { name: 'Carlos Lima', email: 'carlos@email.com', phone: '(11) 99999-0003', source: 'Google Ads', status: 'qualified', date: '2024-01-14' },
  { name: 'Ana Oliveira', email: 'ana@email.com', phone: '(11) 99999-0004', source: 'Indicação', status: 'converted', date: '2024-01-13' },
  { name: 'Pedro Costa', email: 'pedro@email.com', phone: '(11) 99999-0005', source: 'Instagram', status: 'new', date: '2024-01-13' },
  { name: 'Lucia Ferreira', email: 'lucia@email.com', phone: '(11) 99999-0006', source: 'Kwai', status: 'contacted', date: '2024-01-12' },
  { name: 'Roberto Alves', email: 'roberto@email.com', phone: '(11) 99999-0007', source: 'Google Ads', status: 'qualified', date: '2024-01-12' },
  { name: 'Patricia Souza', email: 'patricia@email.com', phone: '(11) 99999-0008', source: 'Facebook', status: 'new', date: '2024-01-11' },
]

const statusMap: Record<string, { label: string; class: string }> = {
  new: { label: 'Novo', class: 'bg-blue-500/10 text-blue-500' },
  contacted: { label: 'Contatado', class: 'bg-yellow-500/10 text-yellow-500' },
  qualified: { label: 'Qualificado', class: 'bg-purple-500/10 text-purple-500' },
  converted: { label: 'Convertido', class: 'bg-green-500/10 text-green-500' },
}

export default function LeadsPage() {
  const [search, setSearch] = useState('')

  const filtered = leads.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" description="Base de leads" />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#666666]" />
          <Input
            placeholder="Buscar leads..."
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
          <CardTitle className="text-base font-medium">Todos os Leads</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Nome</th>
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Contato</th>
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Origem</th>
                <th className="text-center text-xs text-[#666666] font-medium px-4 py-3">Status</th>
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => {
                const status = statusMap[l.status]
                return (
                  <tr key={i} className="border-b border-white/[0.06] hover:bg-[#141414] transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm text-white font-medium">{l.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm text-[#B3B3B3] flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {l.email}
                        </span>
                        <span className="text-sm text-[#666666] flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {l.phone}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[#B3B3B3] flex items-center gap-1">
                        <Tag className="h-3 w-3" /> {l.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.class}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#B3B3B3]">{l.date}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 text-[#666666]">
              <Users className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">Nenhum lead encontrado</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
