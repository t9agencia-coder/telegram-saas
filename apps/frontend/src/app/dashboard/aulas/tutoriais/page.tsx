'use client'

import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, Play, Clock, BarChart3 } from 'lucide-react'

const tutorials = [
  { title: 'Como configurar seu primeiro bot', duration: '12min', level: 'Iniciante', watched: false },
  { title: 'Criando fluxos de venda automatizados', duration: '18min', level: 'Intermediário', watched: false },
  { title: 'Integrando PIX ao seu checkout', duration: '15min', level: 'Intermediário', watched: true },
  { title: 'Configurando tracking com Facebook Ads', duration: '20min', level: 'Avançado', watched: false },
  { title: 'Analisando métricas e otimizando conversões', duration: '25min', level: 'Avançado', watched: false },
  { title: 'Estratégias de remarketing com bots', duration: '14min', level: 'Intermediário', watched: false },
]

export default function TutoriaisPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Aulas" description="Treinamentos e tutoriais" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tutorials.map((t, i) => (
          <Card key={i} className="group cursor-pointer hover:border-[#E50914]/50 transition-colors">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-[#E50914]/10 flex items-center justify-center">
                  <Play className="h-5 w-5 text-[#E50914]" />
                </div>
                {t.watched && (
                  <span className="text-[10px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full font-medium">
                    Concluído
                  </span>
                )}
              </div>
              <CardTitle className="text-base mt-3 group-hover:text-[#E50914] transition-colors">{t.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 text-xs text-[#666666]">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {t.duration}
                </span>
                <span className="flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" /> {t.level}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
