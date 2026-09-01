'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { Clock, Loader2, Ban, ChevronDown, ChevronUp } from 'lucide-react'

interface FlowEvent {
  id: string
  eventName: string
  source: string
  createdAt: string
  metadata?: { flowId?: string; flowName?: string }
  lead: { id: string; name?: string; leadUid: string; telegramId?: string; isBlocked?: boolean }
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const COLLAPSED_COUNT = 10
const FETCH_LIMIT = 100

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
  const [events,   setEvents]   = useState<FlowEvent[]>([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [blocking, setBlocking] = useState<string | null>(null)
  const [blocked,  setBlocked]  = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!workspaceId) return
    setExpanded(false)
    api.get<FlowEvent[]>(`/workspaces/${workspaceId}/events?eventName=MESSAGE_SENT&take=${FETCH_LIMIT}`)
      .then((all) => {
        const filtered = all.filter((e) => {
          const d = new Date(e.createdAt)
          return d >= new Date(startDate) && d <= new Date(endDate)
        })
        setEvents(filtered)
        // Estado inicial de bloqueado vem do backend (lead.isBlocked) — sem
        // isso, o indicador some ao recarregar a página, já que antes ele só
        // existia enquanto durava o clique do usuário nessa mesma sessão.
        setBlocked(new Set(
          filtered.filter(e => e.lead?.isBlocked && e.lead.telegramId).map(e => e.lead.telegramId!)
        ))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [workspaceId, startDate, endDate])

  const blockLead = async (eventId: string, telegramId: string, name: string) => {
    if (!workspaceId) return
    if (!confirm(`Bloquear ${name} (Telegram ID ${telegramId}) da plataforma inteira? Só um admin pode desfazer isso depois.`)) return
    setBlocking(telegramId)
    try {
      await api.post(`/workspaces/${workspaceId}/events/${eventId}/block-lead`, {})
      setBlocked(prev => new Set(prev).add(telegramId))
    } catch (e) { console.error(e) }
    finally { setBlocking(null) }
  }

  const visibleEvents = expanded ? events : events.slice(0, COLLAPSED_COUNT)
  const hasMore = events.length > COLLAPSED_COUNT

  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 card-glow-premium">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Atividades</h3>
        {!loading && events.length > 0 && (
          <span className="text-[10px] text-[#555]">{events.length}{events.length >= FETCH_LIMIT ? '+' : ''}</span>
        )}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[#666666]" />
        </div>
      ) : (
        <div className="space-y-0">
          {visibleEvents.map((event) => {
            const name = event.lead?.name || event.lead?.telegramId || event.lead?.leadUid || 'Visitante'
            const flowName = event.metadata?.flowName || 'Fluxo'
            const telegramId = event.lead?.telegramId
            const isBlocked  = telegramId ? blocked.has(telegramId) : false

            return (
              <div
                key={event.id}
                className="flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] -mx-5 px-5 transition-colors group"
              >
                <div className="w-2 h-2 rounded-full bg-[#E50914] mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">Cliente entrou no fluxo</p>
                  <p className="text-xs text-[#666666] mt-0.5">
                    {name} &middot; {flowName}
                  </p>
                </div>
                {telegramId && (
                  <button
                    onClick={() => !isBlocked && blockLead(event.id, telegramId, name)}
                    disabled={blocking === telegramId || isBlocked}
                    title={isBlocked ? `Bloqueado (ID ${telegramId})` : `Bloquear ${name} (ID ${telegramId}) de toda a plataforma`}
                    className={`w-6 h-6 rounded-[3px] border flex items-center justify-center shrink-0 transition-colors disabled:opacity-100 ${
                      isBlocked
                        ? 'border-[#EF4444]/25 text-[#EF4444] bg-[#EF4444]/10 opacity-100'
                        : 'border-white/[0.06] text-[#444] hover:text-[#EF4444] hover:border-[#EF4444]/25 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {blocking === telegramId
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Ban className="h-3 w-3" />}
                  </button>
                )}
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
      {!loading && hasMore && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full mt-2 pt-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-[#666666] hover:text-white border-t border-white/[0.04] transition-colors"
        >
          {expanded ? (
            <>Ver menos <ChevronUp className="h-3.5 w-3.5" /></>
          ) : (
            <>Ver todas ({events.length}) <ChevronDown className="h-3.5 w-3.5" /></>
          )}
        </button>
      )}
    </div>
  )
}
