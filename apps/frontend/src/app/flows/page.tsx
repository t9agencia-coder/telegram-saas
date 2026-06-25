'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from 'reactflow'
import type { Connection, Node, NodeTypes } from 'reactflow'
import { BackgroundVariant } from 'reactflow'
import 'reactflow/dist/style.css'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import {
  GitBranch, Plus, Save, Loader2, MessageSquare, Image, Clock, DollarSign, Webhook,
  Bot, ExternalLink, AlertTriangle, CheckCircle2, XCircle, Info, Zap,
} from 'lucide-react'

const nodeTypes: NodeTypes = {}

const initialNodes: Node[] = [
  {
    id: 'start-1',
    type: 'input',
    position: { x: 250, y: 25 },
    data: { label: 'Start' },
    style: { background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600 },
  },
]

export default function FlowsPage() {
  const { workspaceId } = useAuthStore()
  const [flows, setFlows] = useState<any[]>([])
  const [bots, setBots] = useState<any[]>([])
  const [selectedFlow, setSelectedFlow] = useState<any>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [flowName, setFlowName] = useState('')
  const [flowDescription, setFlowDescription] = useState('')
  const [flowBotId, setFlowBotId] = useState('')
  const [saving, setSaving] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [error, setError] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [testingBotId, setTestingBotId] = useState<string | null>(null)
  const reactFlowWrapper = useRef(null)

  const loadData = async () => {
    if (!workspaceId) return
    try {
      const [flowsData, botsData] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/flows`),
        api.get(`/workspaces/${workspaceId}/bots`),
      ])
      setFlows(flowsData)
      setBots(botsData)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [workspaceId])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const addNode = useCallback((type: string) => {
    const newId = `${type}-${Date.now()}`
    const positions: Record<string, { x: number; y: number }> = {
      message: { x: 100, y: 150 },
      image: { x: 300, y: 150 },
      delay: { x: 500, y: 150 },
      payment: { x: 100, y: 300 },
      webhook: { x: 300, y: 300 },
    }

    const labels: Record<string, string> = {
      message: 'Message',
      image: 'Image',
      delay: 'Delay',
      payment: 'Payment',
      webhook: 'Webhook',
    }

    const colors: Record<string, string> = {
      message: '#3b82f6',
      image: '#a855f7',
      delay: '#f59e0b',
      payment: '#10b981',
      webhook: '#6366f1',
    }

    const pos = positions[type] || { x: 100, y: 100 }

    const newNode: Node = {
      id: newId,
      type: 'default',
      position: pos,
      data: { label: labels[type] || type },
      style: { background: colors[type] || '#6b7280', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px' },
    }

    setNodes((nds) => [...nds, newNode])
  }, [setNodes])

  const saveFlow = async () => {
    if (!workspaceId || !selectedFlow) return
    setSaving(true)
    setError('')
    try {
      await api.patch(`/workspaces/${workspaceId}/flows/${selectedFlow.id}`, {
        nodes,
        edges,
        name: flowName || selectedFlow.name,
        botId: flowBotId || selectedFlow.botId || undefined,
      })
      setSelectedFlow((prev: any) => ({ ...prev, nodes, edges, name: flowName || prev.name, botId: flowBotId || prev.botId }))
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const createFlow = async () => {
    if (!workspaceId || !flowName) return
    setSaving(true)
    setError('')
    try {
      const flow = await api.post(`/workspaces/${workspaceId}/flows`, {
        name: flowName,
        description: flowDescription || undefined,
        botId: flowBotId || undefined,
        nodes: initialNodes,
        edges: [],
      })
      setSelectedFlow(flow)
      setFlowBotId(flow.botId || '')
      setShowNewForm(false)
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Erro ao criar')
    } finally {
      setSaving(false)
    }
  }

  const toggleFlow = async (flow: any, newState: boolean) => {
    if (!workspaceId) return
    setTogglingId(flow.id)
    setError('')
    try {
      if (newState) {
        await api.post(`/workspaces/${workspaceId}/flows/${flow.id}/activate`)
      } else {
        await api.post(`/workspaces/${workspaceId}/flows/${flow.id}/deactivate`)
      }
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar estado do fluxo')
    } finally {
      setTogglingId(null)
    }
  }

  const testBot = async (botId: string) => {
    if (!workspaceId) return
    setTestingBotId(botId)
    setError('')
    try {
      await api.post(`/workspaces/${workspaceId}/bots/${botId}/test`)
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Erro ao testar bot')
    } finally {
      setTestingBotId(null)
    }
  }

  const selectFlow = (flow: any) => {
    setError('')
    setSelectedFlow(flow)
    setNodes(flow.nodes?.length ? flow.nodes : initialNodes)
    setEdges(flow.edges || [])
    setFlowName(flow.name)
    setFlowDescription(flow.description || '')
    setFlowBotId(flow.botId || '')
  }

  const getBotInfo = (flow: any) => {
    if (!flow.bot) return bots.find(b => b.id === flow.botId) || null
    return flow.bot
  }

  const canActivate = (flow: any) => {
    const nodeCount = flow.nodes?.length || 0
    if (nodeCount === 0) return { ok: false, reason: 'Fluxo sem blocos — adicione blocos ao canvas' }
    if (!flow.botId) return { ok: false, reason: 'Nenhum bot conectado — selecione um bot' }
    const bot = getBotInfo(flow)
    if (!bot) return { ok: false, reason: 'Bot não encontrado' }
    if (bot.status !== 'ACTIVE') return { ok: false, reason: `Bot @${bot.username} não está ativo (status: ${bot.status})` }
    return { ok: true, reason: '' }
  }

  const toolbarNodes = [
    { type: 'message', icon: MessageSquare, label: 'Message' },
    { type: 'image', icon: Image, label: 'Image' },
    { type: 'delay', icon: Clock, label: 'Delay' },
    { type: 'payment', icon: DollarSign, label: 'Payment' },
    { type: 'webhook', icon: Webhook, label: 'Webhook' },
  ]

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <PageHeader title="Fluxos" description="Crie automações com o construtor visual">
        <Button onClick={() => { setError(''); setShowNewForm(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Fluxo
        </Button>
      </PageHeader>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-[3px] text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {showNewForm && (
        <Card className="mb-4">
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label>Nome do fluxo</Label>
              <Input
                placeholder="Ex: Funil de Vendas"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição <span className="text-muted-foreground">(opcional)</span></Label>
              <Input
                placeholder="Descreva o objetivo do fluxo..."
                value={flowDescription}
                onChange={(e) => setFlowDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Bot <span className="text-muted-foreground">(opcional)</span></Label>
              {bots.length > 0 ? (
                <select
                  value={flowBotId}
                  onChange={(e) => setFlowBotId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Selecionar bot...</option>
                  {bots.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      @{b.username} {b.status !== 'ACTIVE' ? `(${b.status})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum bot cadastrado. Conecte um bot primeiro.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={createFlow} disabled={!flowName || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
              </Button>
              <Button variant="ghost" onClick={() => setShowNewForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="w-72 space-y-2 overflow-y-auto shrink-0">
          {flows.length === 0 && !showNewForm && (
            <div className="text-center py-8">
              <GitBranch className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum fluxo ainda</p>
            </div>
          )}
          {flows.map((flow: any) => {
            const bot = getBotInfo(flow)
            const nodeCount = flow.nodes?.length || 0
            const activation = canActivate(flow)
            return (
              <Card
                key={flow.id}
                className={`cursor-pointer transition-colors ${selectedFlow?.id === flow.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => selectFlow(flow)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{flow.name}</p>
                      <p className="text-xs text-muted-foreground">{nodeCount} bloco{nodeCount !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <Switch
                        checked={flow.isActive}
                        disabled={togglingId === flow.id || (!flow.isActive && !activation.ok)}
                        onCheckedChange={(checked) => toggleFlow(flow, checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {togglingId === flow.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </div>
                  </div>

                  {bot && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Bot className="h-3 w-3 shrink-0" />
                      <span className="truncate">@{bot.username}</span>
                      {bot.status === 'ACTIVE' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                      )}
                    </div>
                  )}

                  {flow.isActive ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-500">
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      Ativo
                    </div>
                  ) : (
                    !activation.ok && (
                      <div className="flex items-start gap-1.5 text-xs text-amber-500" title={activation.reason}>
                        <Info className="h-3 w-3 shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{activation.reason}</span>
                      </div>
                    )
                  )}
                  {!flow.isActive && bot?.status === 'PENDING_REVIEW' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); testBot(bot.id) }}
                      disabled={testingBotId === bot.id}
                      className="flex items-center gap-1.5 text-xs font-semibold text-green-500 hover:text-green-400 transition-colors"
                    >
                      {testingBotId === bot.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3" />
                      )}
                      {testingBotId === bot.id ? 'Ativando bot...' : 'Testar conexão do bot e ativar'}
                    </button>
                  )}

                  {bot?.status === 'ACTIVE' && (
                    <a
                      href={`https://t.me/${bot.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      t.me/{bot.username}
                    </a>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {selectedFlow ? (
            <>
              <div className="flex items-center justify-between mb-2 bg-card p-2 rounded-[3px] border">
                <div className="flex items-center gap-2 min-w-0">
                  <Input
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                    className="w-48 h-8 text-sm"
                  />
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground border-l pl-2 ml-2">
                    <Bot className="h-3 w-3" />
                    <select
                      value={flowBotId}
                      onChange={(e) => setFlowBotId(e.target.value)}
                      className="bg-transparent border-none text-xs focus:outline-none cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">Sem bot</option>
                      {bots.map((b: any) => (
                        <option key={b.id} value={b.id}>
                          @{b.username} {b.status !== 'ACTIVE' ? `(${b.status})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex gap-1 border-r pr-2 mr-2">
                    {toolbarNodes.map((item) => {
                      const Icon = item.icon
                      return (
                        <Button
                          key={item.type}
                          variant="outline"
                          size="sm"
                          onClick={() => addNode(item.type)}
                          title={`Add ${item.label}`}
                        >
                          <Icon className="h-4 w-4" />
                        </Button>
                      )
                    })}
                  </div>
                  <Button variant="outline" size="sm" onClick={saveFlow} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Salvar
                  </Button>
                </div>
              </div>

              <div className="flex-1 border rounded-[3px]" ref={reactFlowWrapper}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  fitView
                  attributionPosition="bottom-left"
                >
                  <Controls />
                  <MiniMap />
                  <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                </ReactFlow>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <GitBranch className="h-16 w-16 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">Selecione ou crie um fluxo para começar</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
