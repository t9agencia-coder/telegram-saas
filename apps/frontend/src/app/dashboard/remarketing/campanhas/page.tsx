'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Megaphone, Plus, Play, Pause, BarChart3, Settings } from 'lucide-react'

const campaigns = [
  { name: 'Remarketing Curso', status: 'active', audience: 'Visitantes do site', sent: 1250, conversions: 24, revenue: 'R$ 4.728' },
  { name: 'Abandono de Carrinho', status: 'active', audience: 'Carrinho abandonado', sent: 843, conversions: 18, revenue: 'R$ 3.546' },
  { name: 'Cross-sell E-book', status: 'paused', audience: 'Compradores de e-book', sent: 567, conversions: 9, revenue: 'R$ 1.773' },
  { name: 'Reativação Inativos', status: 'draft', audience: '30 dias sem compra', sent: 0, conversions: 0, revenue: 'R$ 0' },
]

export default function CampanhasPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Remarketing" description="Campanhas de remarketing">
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nova Campanha
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4">
        {campaigns.map((c, i) => (
          <Card key={i} className="hover:border-[#2A2A2A] transition-colors">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    c.status === 'active' ? 'bg-green-500/10' : c.status === 'paused' ? 'bg-yellow-500/10' : 'bg-[#2A2A2A]'
                  }`}>
                    <Megaphone className={`h-5 w-5 ${
                      c.status === 'active' ? 'text-green-500' : c.status === 'paused' ? 'text-yellow-500' : 'text-[#666666]'
                    }`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">{c.name}</h3>
                    <p className="text-xs text-[#666666] mt-0.5">Público: {c.audience}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[#B3B3B3]">
                      <span>{c.sent} enviadas</span>
                      <span>{c.conversions} conversões</span>
                      <span className="text-white font-medium">{c.revenue}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.status === 'active' ? 'bg-green-500/10 text-green-500' :
                    c.status === 'paused' ? 'bg-yellow-500/10 text-yellow-500' :
                    'bg-[#2A2A2A] text-[#666666]'
                  }`}>
                    {c.status === 'active' ? 'Ativa' : c.status === 'paused' ? 'Pausada' : 'Rascunho'}
                  </span>
                  <Button variant="ghost" size="sm">
                    {c.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm"><BarChart3 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm"><Settings className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
