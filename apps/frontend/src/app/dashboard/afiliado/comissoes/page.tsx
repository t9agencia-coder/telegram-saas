'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Handshake, Users, DollarSign, TrendingUp, Copy, ExternalLink } from 'lucide-react'

export default function ComissoesPage() {
  const [copied, setCopied] = useState(false)

  const affiliateLink = 'https://seudominio.com/ref/SEUCODIGO'

  const copyLink = () => {
    navigator.clipboard.writeText(affiliateLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const stats = [
    { label: 'Total de Afiliados', value: '24', icon: Users, change: '+3 este mês' },
    { label: 'Comissões Pagas', value: 'R$ 3.847', icon: DollarSign, change: '+12.5% vs mês passado' },
    { label: 'Comissões Pendentes', value: 'R$ 1.230', icon: TrendingUp, change: '8 afiliados' },
    { label: 'Taxa de Conversão', value: '18,4%', icon: TrendingUp, change: '+2.1%' },
  ]

  const commissions = [
    { affiliate: 'João Silva', sales: 12, value: 'R$ 594,00', status: 'paid', date: '15/01/2024' },
    { affiliate: 'Maria Santos', sales: 8, value: 'R$ 376,00', status: 'pending', date: '14/01/2024' },
    { affiliate: 'Carlos Lima', sales: 5, value: 'R$ 235,00', status: 'paid', date: '14/01/2024' },
    { affiliate: 'Ana Oliveira', sales: 3, value: 'R$ 141,00', status: 'pending', date: '13/01/2024' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Afiliado" description="Comissões e programa de afiliados" />

      <Card className="bg-gradient-to-r from-[#E50914]/5 to-transparent border-[#E50914]/20">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-medium text-white mb-1">Seu Link de Afiliado</h3>
              <p className="text-xs text-[#666666] mb-3">Compartilhe e ganhe 10% de comissão em cada venda</p>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-[#0D0D0D] px-3 py-1.5 rounded border border-[#2A2A2A] text-[#B3B3B3]">
                  {affiliateLink}
                </code>
                <Button size="sm" variant="outline" onClick={copyLink}>
                  <Copy className="h-3 w-3 mr-1" />
                  {copied ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
            </div>
            <Handshake className="h-10 w-10 text-[#E50914] opacity-50" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-[#666666]">{s.label}</CardTitle>
                <Icon className="h-4 w-4 text-[#E50914]" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-white">{s.value}</div>
                <p className="text-[11px] text-[#666666] mt-0.5">{s.change}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Comissões Recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2A2A2A]">
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Afiliado</th>
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Vendas</th>
                <th className="text-right text-xs text-[#666666] font-medium px-4 py-3">Valor</th>
                <th className="text-center text-xs text-[#666666] font-medium px-4 py-3">Status</th>
                <th className="text-left text-xs text-[#666666] font-medium px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c, i) => (
                <tr key={i} className="border-b border-[#2A2A2A] hover:bg-[#161616] transition-colors">
                  <td className="px-4 py-3 text-sm text-white">{c.affiliate}</td>
                  <td className="px-4 py-3 text-sm text-[#B3B3B3]">{c.sales}</td>
                  <td className="px-4 py-3 text-sm text-white text-right font-medium">{c.value}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.status === 'paid' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                    }`}>
                      {c.status === 'paid' ? 'Pago' : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#B3B3B3]">{c.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
