'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { Clock, Loader2 } from 'lucide-react'

interface FlowEvent {
  id: string
  eventName: string
  source: string
  createdAt: string
  metadata?: { flowId?: string; flowName?: string }
  lead: { id: string; name?: string; leadUid: string; telegramId?: string }
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

interface Props {
  startDate: string
  endDate: string
}

export function ActivityFeed({ startDate, endDate }: Props) {
  const { workspaceId } = useAuthStore()
  const [events, setEvents] = useState<FlowEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspaceId) return
    api.get<FlowEvent[]>(`/workspaces/${workspaceId}/events?eventName=MESSAGE_SENT&take=50`)
      .then((all) => {
        const filtered = all.filter((e) => {
          const d = new Date(e.createdAt)
          return d >= new Date(startDate) && d <= new Date(endDate)
        })
        setEvents(filtered.slice(0, 10))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [workspaceId, startDate, endDate])

  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 card-glow-premium">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Atividades</h3>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[#666666]" />
        </div>
      ) : (
        <div className="space-y-0">
          {events.map((event) => {
            const name = event.lead?.name || event.lead?.telegramId || event.lead?.leadUid || 'Visitante'
            const flowName = event.metadata?.flowName || 'Fluxo'

            return (
              <div
                key={event.id}
                className="flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] -mx-5 px-5 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-[#E50914] mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">Cliente entrou no fluxo</p>
                  <p className="text-xs text-[#666666] mt-0.5">
                    {name} &middot; {flowName}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[#666666] shrink-0 whitespace-nowrap">
                  <Clock className="h-3 w-3" />
                  {formatTime(event.createdAt)}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!loading && events.length === 0 && (
        <div className="py-8 text-center text-sm text-[#666666]">
          Nenhuma atividade recente
        </div>
      )}
    </div>
  )
}
