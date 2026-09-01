'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Megaphone, RefreshCw, ExternalLink, Settings2,
  Plus, X, Loader2, Bot as BotIcon, ArrowLeft, Users,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import {
  RemarketingEditor,
  buildRemarketingSlots,
  type RemarketingSlotConfig,
} from '@/components/dashboard/remarketing-editor'

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

interface PickableFlow {
  id: string
  name: string
  botId: string | null
  botUsername: string | null
  isActive: boolean
}

// Card de lista compacto — só o essencial (nome, bot, status, ações). O detalhe
// de cada mensagem (temporizador, conteúdo, botões) fica só na tela de edição,
// pra não duplicar a mesma informação em dois lugares.
function FlowCard({ flow, onConfigure }: { flow: FlowSummary; onConfigure: (flowId: string) => void }) {
  const activeSlots = flow.slots.length

  return (
    <Card className="hover:border-white/[0.08] transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0 ${
              flow.isActive ? 'bg-green-500/10' : 'bg-white/[0.04]'
            }`}>
              <Megaphone className={`h-4.5 w-4.5 ${flow.isActive ? 'text-green-500' : 'text-[#666666]'}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-white truncate">{flow.flowName}</h3>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  flow.isActive ? 'bg-green-500/10 text-green-500' : 'bg-white/[0.04] text-[#666666]'
                }`}>
                  {flow.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <p className="text-xs text-[#666666] mt-0.5 truncate">
                {flow.botUsername ? `@${flow.botUsername} · ` : ''}
                {activeSlots} mensage{activeSlots > 1 ? 'ns' : 'm'} configurada{activeSlots > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/dashboard/automacoes/fluxos?openFlow=${flow.flowId}`}>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-[#666666] hover:text-white gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir fluxo
              </Button>
            </Link>
            <Button size="sm" className="gap-2 bg-[#E50914] hover:bg-[#E50914]/90 text-white" onClick={() => onConfigure(flow.flowId)}>
              <Settings2 className="h-3.5 w-3.5" />
              Configurar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FlowPickerModal({ flows, loading, onPick, onClose }: {
  flows:   PickableFlow[]
  loading: boolean
  onPick:  (flowId: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-md rounded-[8px] overflow-hidden flex flex-col" style={{ background: '#0A0A0A', border: '1px solid #1A1A1A', maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #1A1A1A' }}>
          <p className="text-sm font-bold text-white">Escolha um fluxo</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-[#444] hover:text-white rounded-[3px] hover:bg-[#1A1A1A] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[#444]" />
            </div>
          ) : flows.length === 0 ? (
            <p className="text-xs text-[#666666] text-center py-10 px-4">
              Nenhum fluxo com bot conectado encontrado. Crie um fluxo primeiro em Automações → Fluxos.
            </p>
          ) : (
            <div className="space-y-1">
              {flows.map(f => (
                <button
                  key={f.id}
                  onClick={() => onPick(f.id)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[6px] hover:bg-white/[0.04] transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-[5px] bg-white/[0.04] flex items-center justify-center shrink-0">
                      <BotIcon className="h-3.5 w-3.5 text-[#666666]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{f.name}</p>
                      {f.botUsername && <p className="text-[11px] text-[#666666] truncate">@{f.botUsername}</p>}
                    </div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                    f.isActive ? 'bg-green-500/10 text-green-500' : 'bg-white/[0.04] text-[#666666]'
                  }`}>
                    {f.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface EditingFlow {
  id:     string
  name:   string
  botId:  string | null
  config: Record<string, any>
}

export default function CampanhasPage() {
  const { workspaceId } = useAuthStore()
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Editor de remarketing (a própria página vira o editor, ver early-return abaixo)
  const [editingFlow, setEditingFlow]   = useState<EditingFlow | null>(null)
  const [editorLoading, setEditorLoading] = useState(false)
  const [remarketings, setRemarketings] = useState<RemarketingSlotConfig[]>([])
  const [saving, setSaving] = useState(false)

  // Seletor de fluxo (criar remarketing num fluxo que ainda não tem nenhum)
  const [pickerOpen, setPickerOpen]       = useState(false)
  const [pickableFlows, setPickableFlows] = useState<PickableFlow[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)

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

  const openEditor = useCallback(async (flowId: string) => {
    if (!workspaceId) return
    setPickerOpen(false)
    setEditorLoading(true)
    try {
      const full = await api.get(`/workspaces/${workspaceId}/flows/${flowId}`)
      setEditingFlow({ id: full.id, name: full.name, botId: full.botId ?? null, config: full.config || {} })
      setRemarketings(buildRemarketingSlots(full.config))
    } catch {
      // erro silencioso
    } finally {
      setEditorLoading(false)
    }
  }, [workspaceId])

  const closeEditor = () => {
    setEditingFlow(null)
    setRemarketings([])
  }

  const saveEditor = useCallback(async () => {
    if (!workspaceId || !editingFlow) return
    setSaving(true)
    try {
      const newConfig = { ...editingFlow.config, remarketings }
      await api.patch(`/workspaces/${workspaceId}/flows/${editingFlow.id}`, { config: newConfig })
      closeEditor()
      load(true)
    } catch {
      // erro silencioso
    } finally {
      setSaving(false)
    }
  }, [workspaceId, editingFlow, remarketings, load])

  const openPicker = useCallback(async () => {
    if (!workspaceId) return
    setPickerOpen(true)
    setPickerLoading(true)
    try {
      const data = await api.get(`/workspaces/${workspaceId}/flows`)
      setPickableFlows(
        (data || [])
          .filter((f: any) => !!f.botId)
          .map((f: any) => ({
            id: f.id, name: f.name, botId: f.botId,
            botUsername: f.bot?.username ?? null, isActive: f.isActive,
          })),
      )
    } catch {
      // erro silencioso
    } finally {
      setPickerLoading(false)
    }
  }, [workspaceId])

  const totalScheduled = flows.reduce((acc, f) => acc + f.scheduledCount, 0)

  // Editando um fluxo: a página inteira vira o editor, sem popup.
  if (editingFlow) {
    const editingScheduled = flows.find(f => f.flowId === editingFlow.id)?.scheduledCount ?? 0
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={closeEditor}
            className="flex items-center gap-1.5 text-xs text-[#666666] hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para Remarketing
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-xs text-[#666666] truncate">{editingFlow.name}</p>
            {editingScheduled > 0 && (
              <span className="shrink-0 inline-flex items-center gap-1.5 text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded-full">
                <Users className="h-3 w-3" />
                {editingScheduled} agendado{editingScheduled > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="p-5">
            <RemarketingEditor
              remarketings={remarketings}
              onChange={setRemarketings}
              onSave={saveEditor}
              onClose={closeEditor}
              saving={saving}
              workspaceId={workspaceId ?? undefined}
              flowId={editingFlow.id}
              botId={editingFlow.botId ?? undefined}
            />
          </CardContent>
        </Card>
      </div>
    )
  }

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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing}
            className="text-[#666666] hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" className="gap-2 bg-[#E50914] hover:bg-[#E50914]/90 text-white" onClick={openPicker}>
            <Plus className="h-3.5 w-3.5" />
            Novo remarketing
          </Button>
        </div>
      </PageHeader>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/[0.04] rounded-[8px]" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-40 bg-white/[0.04] rounded" />
                    <div className="h-2.5 w-24 bg-white/[0.04] rounded" />
                  </div>
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
                Escolha um fluxo e configure até 10 mensagens automáticas pra recuperar leads.
              </p>
            </div>
            <Button size="sm" className="gap-2 bg-[#E50914] hover:bg-[#E50914]/90 text-white" onClick={openPicker}>
              <Plus className="h-3.5 w-3.5" />
              Novo remarketing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {flows.map(flow => (
            <FlowCard key={flow.flowId} flow={flow} onConfigure={openEditor} />
          ))}
        </div>
      )}

      {pickerOpen && (
        <FlowPickerModal
          flows={pickableFlows}
          loading={pickerLoading}
          onPick={openEditor}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {editorLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <Loader2 className="h-6 w-6 animate-spin text-[#E50914]" />
        </div>
      )}
    </div>
  )
}
