'use client'

import { cn } from '@/lib/utils'
import { Clock, ArrowRight } from 'lucide-react'

const activities = [
  { action: 'Novo pagamento recebido', detail: 'João Silva - R$ 197,00', time: '2 min atrás', type: 'payment' },
  { action: 'Bot conectado', detail: '@meubot foi ativado com sucesso', time: '15 min atrás', type: 'bot' },
  { action: 'Nova venda realizada', detail: 'Curso Digital - R$ 197,00', time: '32 min atrás', type: 'sale' },
  { action: 'Meta de vendas', detail: '95% da meta mensal atingida', time: '1 h atrás', type: 'goal' },
  { action: 'Lead capturado', detail: 'Ana Costa via Facebook Ads', time: '2 h atrás', type: 'lead' },
]

export function ActivityFeed() {
  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Atividades Recentes</h3>
          <p className="text-xs text-[#666666] mt-0.5">Últimas movimentações</p>
        </div>
        <button className="text-xs text-[#E50914] hover:text-[#FF1F2D] transition-colors font-medium flex items-center gap-1">
          Ver todas
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-0">
        {activities.map((activity, i) => (
          <div
            key={i}
            className="flex items-start gap-3 py-3 border-b border-[#2A2A2A]/30 last:border-0 hover:bg-[#1E1E1E] -mx-5 px-5 transition-colors rounded-none"
          >
            <div className="w-2 h-2 rounded-full bg-[#E50914] mt-1.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">{activity.action}</p>
              <p className="text-xs text-[#666666] mt-0.5">{activity.detail}</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#666666] shrink-0">
              <Clock className="h-3 w-3" />
              {activity.time}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
