'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Megaphone, Clock, RefreshCw, Users, Layers, ExternalLink, Settings2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'

interface RemarketingSlot {
  index: number
  firstDelay: number   // minutos
  interval: number     // horas
  stopAfter: number    // dias
  content: string
  mediaType: 'none' | 'image' | 'video'
  buttonsCount: number
}

interface FlowSummary {
  flowId: string
  flowName: string
  isActive: boolean
  botUsername: string | null
  slots: RemarketingSlot[]
  scheduledCount: number
}

function fmtDelay(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function fmtInterval(h: number): string {
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d} dia${d > 1 ? 's' : ''}`
}

function SlotCard({ slot, total }: { slot: RemarketingSlot; total: number }) {
  const label = total === 1 ? 'Mensagem' : `Slot ${slot.index + 1}`
  const preview = slot.content
    ? slot.content.length > 90 ? slot.content.slice(0, 90) + '…' : slot.content
    : slot.mediaType !== 'none'
      ? slot.mediaType === 'image' ? '🖼 Imagem' : '🎬 Vídeo'
      : null

  return (
    <div className="rounded-[6px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#B3B3B3]">{label}</span>
        <div className="flex items-center gap-3 text-xs text-[#666666]">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            1º envio: <strong className="text-[#B3B3B3]">{fmtDelay(slot.firstDelay)}</strong>
          </span>
          <span>a cada <strong className="text-[#B3B3B3]">{fmtInterval(slot.interval)}</strong></span>
          <span>para após <strong className="text-[#B3B3B3]">{slot.stopAfter}d</strong></span>
          {slot.buttonsCount > 0 && (
            <span className="text-[#666666]">{slot.buttonsCount} botão{slot.buttonsCount > 1 ? 'ões' : ''}</span>
          )}
        </div>
      </div>
      {preview && (
        <p className="text-xs text-[#666666] leading-relaxed line-clamp-2">{preview}</p>
      )}
    </div>
  )
}

function FlowCard({ flow }: { flow: FlowSummary }) {
  const hasMultiSlot = flow.slots.length > 1

  return (
    <Card className="hover:border-white/[0.08] transition-colors">
      <CardContent className="p-5 space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-[6px] flex items-center justify-center shrink-0 ${
              flow.isActive ? 'bg-green-500/10' : 'bg-white/[0.04]'
            }`}>
              <Megaphone className={`h-4 w-4 ${flow.isActive ? 'text-green-500' : 'text-[#666666]'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-white">{flow.flowName}</h3>
                {hasMultiSlot && (
                  <span className="inline-flex items-center gap-1 text-xs bg-white/[0.06] text-[#B3B3B3] px-1.5 py-0.5 rounded">
                    <Layers className="h-3 w-3" />
                    {flow.slots.length} slots
                  </span>
                )}
              </div>
              {flow.botUsername && (
                <p className="text-xs text-[#666666] mt-0.5">@{flow.botUsername}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Contador de leads agendados */}
            {flow.scheduledCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded-full">
                <Users className="h-3 w-3" />
                {flow.scheduledCount} agendado{flow.scheduledCount > 1 ? 's' : ''}
              </span>
            )}

            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              flow.isActive ? 'bg-green-500/10 text-green-500' : 'bg-white/[0.04] text-[#666666]'
            }`}>
              {flow.isActive ? 'Ativo' : 'Inativo'}
            </span>

            <Link href={`/dashboard/automacoes/fluxos?openFlow=${flow.flowId}`}>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[#666666] hover:text-white">
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Slots de remarketing */}
        <div className="space-y-2">
          {flow.slots.map(slot => (
            <SlotCard key={slot.index} slot={slot} total={flow.slots.length} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function CampanhasPage() {
  const { workspaceId } = useAuthStore()
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (!workspaceId) return
    if (isRefresh) setRefreshing(true)
    try {
      const data = await api.get(`/workspaces/${workspaceId}/flows/remarketing-summary`)
      setFlows(data)
    } catch {
      // erro silencioso — não quebra a página
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  const totalScheduled = flows.reduce((acc, f) => acc + f.scheduledCount, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remarketing"
        description={
          loading
            ? 'Carregando…'
            : flows.length === 0
              ? 'Nenhum fluxo com remarketing configurado'
              : `${flows.length} fluxo${flows.length > 1 ? 's' : ''} com remarketing${totalScheduled > 0 ? ` · ${totalScheduled} leads agendados` : ''}`
        }
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => load(true)}
          disabled={refreshing}
          className="text-[#666666] hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="animate-pulse space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-white/[0.04] rounded-[6px]" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-40 bg-white/[0.04] rounded" />
                      <div className="h-2.5 w-24 bg-white/[0.04] rounded" />
                    </div>
                  </div>
                  <div className="h-12 bg-white/[0.04] rounded-[6px]" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : flows.length === 0 ? (
        <Card>
          <CardContent className="p-10 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center">
              <Megaphone className="h-6 w-6 text-[#444444]" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Nenhum remarketing configurado</p>
              <p className="text-xs text-[#666666] mt-1">
                Configure o remarketing nos seus fluxos para começar a recuperar leads.
              </p>
            </div>
            <Link href="/dashboard/automacoes/fluxos">
              <Button size="sm" variant="outline" className="gap-2">
                <ExternalLink className="h-3.5 w-3.5" />
                Ir para Fluxos
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {flows.map(flow => (
            <FlowCard key={flow.flowId} flow={flow} />
          ))}
        </div>
      )}
    </div>
  )
}
