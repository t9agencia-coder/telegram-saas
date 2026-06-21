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
import type { Connection, Node, Edge, NodeTypes } from 'reactflow'
import { BackgroundVariant } from 'reactflow'
import 'reactflow/dist/style.css'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { GitBranch, Plus, Save, Play, Square, Loader2, MessageSquare, Image, Clock, DollarSign, Webhook, Code } from 'lucide-react'

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

const initialEdges: Edge[] = []

export default function FluxosPage() {
  const { workspaceId } = useAuthStore()
  const [flows, setFlows] = useState<any[]>([])
  const [selectedFlow, setSelectedFlow] = useState<any>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [loading, setLoading] = useState(true)
  const [flowName, setFlowName] = useState('')
  const [saving, setSaving] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const reactFlowWrapper = useRef(null)

  const loadFlows = async () => {
    if (!workspaceId) return
    try {
      const data = await api.get(`/workspaces/${workspaceId}/flows`)
      setFlows(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFlows() }, [workspaceId])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const addNode = useCallback((type: string) => {
    const newId = `${type}-${Date.now()}`
    const positions = {
      message: { x: 100, y: 150 },
      image: { x: 300, y: 150 },
      delay: { x: 500, y: 150 },
      payment: { x: 100, y: 300 },
      webhook: { x: 300, y: 300 },
    }

    const labels = {
      message: 'Message',
      image: 'Image',
      delay: 'Delay',
      payment: 'Payment',
      webhook: 'Webhook',
    } as const

    const colors = {
      message: '#3b82f6',
      image: '#a855f7',
      delay: '#f59e0b',
      payment: '#10b981',
      webhook: '#6366f1',
    } as const

    const pos = positions[type as keyof typeof positions] || { x: 100, y: 100 }

    const newNode: Node = {
      id: newId,
      type: 'default',
      position: pos,
      data: { label: labels[type as keyof typeof labels] || type },
      style: { background: colors[type as keyof typeof colors] || '#6b7280', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px' },
    }

    setNodes((nds) => [...nds, newNode])
  }, [setNodes])

  const saveFlow = async () => {
    if (!workspaceId || !selectedFlow) return
    setSaving(true)
    try {
      await api.patch(`/workspaces/${workspaceId}/flows/${selectedFlow.id}`, {
        nodes,
        edges,
        name: flowName || selectedFlow.name,
      })
      loadFlows()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const createFlow = async () => {
    if (!workspaceId || !flowName) return
    setSaving(true)
    try {
      const flow = await api.post(`/workspaces/${workspaceId}/flows`, {
        name: flowName,
        nodes: initialNodes,
        edges: [],
      })
      setSelectedFlow(flow)
      setShowNewForm(false)
      loadFlows()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const activateFlow = async (id: string) => {
    if (!workspaceId) return
    await api.post(`/workspaces/${workspaceId}/flows/${id}/activate`)
    loadFlows()
  }

  const selectFlow = (flow: any) => {
    setSelectedFlow(flow)
    setNodes(flow.nodes?.length ? flow.nodes : initialNodes)
    setEdges(flow.edges || [])
    setFlowName(flow.name)
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
      <PageHeader title="Meus Fluxos" description="Fluxos de venda automatizados">
        <Button onClick={() => setShowNewForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Fluxo
        </Button>
      </PageHeader>

      {showNewForm && (
        <Card className="mb-4">
          <CardContent className="flex gap-4 pt-6">
            <Input
              placeholder="Nome do fluxo"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
            />
            <Button onClick={createFlow} disabled={!flowName || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
            </Button>
            <Button variant="ghost" onClick={() => setShowNewForm(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="w-64 space-y-2 overflow-y-auto">
          {flows.map((flow: any) => (
            <Card
              key={flow.id}
              className={`cursor-pointer transition-colors ${selectedFlow?.id === flow.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => selectFlow(flow)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{flow.name}</p>
                    <p className="text-xs text-muted-foreground">{flow.nodes?.length || 0} nodes</p>
                  </div>
                  <div className="flex gap-1">
                    {!flow.isActive ? (
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); activateFlow(flow.id) }}>
                        <Play className="h-3 w-3" />
                      </Button>
                    ) : (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Ativo</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex-1 flex flex-col">
          {selectedFlow ? (
            <>
              <div className="flex items-center justify-between mb-2 bg-card p-2 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Input
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                    className="w-48 h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 border-r pr-2 mr-2">
                    {toolbarNodes.map((item) => {
                      const Icon = item.icon
                      return (
                        <Button
                          key={item.type}
                          variant="outline"
                          size="sm"
                          onClick={() => addNode(item.type)}
                          title={`Adicionar ${item.label}`}
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

              <div className="flex-1 border rounded-lg" ref={reactFlowWrapper}>
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
              <div className="text-center">
                <GitBranch className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Selecione ou crie um fluxo para começar</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
