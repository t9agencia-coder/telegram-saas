'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Link, Plus, Copy, BarChart3, ExternalLink, Trash2 } from 'lucide-react'

const initialLinks = [
  { id: '1', name: 'Oferta Curso Marketing', url: 'https://seucheckout.com/curso', clicks: 234, createdAt: '15/01' },
  { id: '2', name: 'E-book Completo', url: 'https://seucheckout.com/ebook', clicks: 156, createdAt: '14/01' },
  { id: '3', name: 'Mentoria VIP', url: 'https://seucheckout.com/mentoria', clicks: 89, createdAt: '13/01' },
  { id: '4', name: 'Página de Vendas', url: 'https://seucheckout.com/vendas', clicks: 412, createdAt: '12/01' },
]

export default function LinksPage() {
  const [links] = useState(initialLinks)

  return (
    <div className="space-y-6">
      <PageHeader title="Redirecionadores" description="Links e cloaking">
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Link
        </Button>
      </PageHeader>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Links de Redirecionamento</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2A2A2A]">
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Nome</th>
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">URL de Destino</th>
                <th className="text-right text-xs text-[#666666] font-medium px-4 py-3">Cliques</th>
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Criado em</th>
                <th className="text-center text-xs text-[#666666] font-medium px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} className="border-b border-[#2A2A2A] hover:bg-[#161616] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link className="h-4 w-4 text-[#E50914]" />
                      <span className="text-sm text-white font-medium">{l.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#666666] font-mono truncate max-w-[300px]">{l.url}</td>
                  <td className="px-4 py-3 text-sm text-white text-right font-medium">{l.clicks}</td>
                  <td className="px-4 py-3 text-sm text-[#B3B3B3]">{l.createdAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm"><Copy className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm"><BarChart3 className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm"><ExternalLink className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-400"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
