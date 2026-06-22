'use client'

import { useCallback, useRef, useState, useEffect, createContext, useContext } from 'react'
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  Handle,
  Position,
  useReactFlow,
  BackgroundVariant,
  MarkerType,
  Panel,
  ConnectionMode,
  NodeToolbar,
  type NodeProps,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  ArrowLeft, Save, Check, Loader2, X, Plus, Trash2,
  MessageSquare, Image, Video, LayoutGrid, Zap, Bot,
  Clock, Upload, Link2, ChevronDown, Banknote,
  GitBranch, Calendar, Shuffle, AlertTriangle, RotateCcw,
} from 'lucide-react'
import { api } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowNodeType = 'trigger' | 'text' | 'image' | 'video' | 'buttons' | 'delay' | 'pix_buttons' | 'condition' | 'schedule'

interface ButtonDef {
  label: string
  type:  'next' | 'url'
  url?:  string
}

interface PixOption {
  label:   string
  value:   number
  desc?:   string
  pixCode: string
}

interface DelayConfig {
  value: number
  unit:  'seconds' | 'minutes' | 'hours'
}

interface RandomDelayConfig {
  minValue: number
  maxValue: number
  unit:     'seconds' | 'minutes' | 'hours'
}

interface ConditionConfig {
  operator: 'contains' | 'equals' | 'starts_with'
  value:    string
}

interface ScheduleConfig {
  time:  string  // HH:mm
  days?: number[] // 0=Dom, 1=Seg ... 6=Sáb
}

interface FlowNodeData {
  nodeType:   FlowNodeType
  label:      string
  content?:   string
  fileData?:  string
  fileName?:  string
  fileUrl?:   string
  caption?:   string
  mediaMode?: 'upload' | 'url'
  buttons?:    ButtonDef[]
  pixOptions?: PixOption[]
  delay?:      DelayConfig
  waitBefore?: DelayConfig
  randomDelay?: RandomDelayConfig
  condition?:  ConditionConfig
  schedule?:   ScheduleConfig
}

// ─── Constants ────────────────────────────────────────────────────────────────

const META: Record<FlowNodeType, { color: string; icon: React.ElementType; label: string }> = {
  trigger:     { color: '#3B82F6', icon: Zap,          label: 'Início' },
  text:        { color: '#10B981', icon: MessageSquare, label: 'Texto' },
  image:       { color: '#8B5CF6', icon: Image,         label: 'Imagem' },
  video:       { color: '#EC4899', icon: Video,         label: 'Vídeo' },
  buttons:     { color: '#F59E0B', icon: LayoutGrid,    label: 'Botões' },
  delay:       { color: '#64748B', icon: Clock,         label: 'Aguardar' },
  pix_buttons: { color: '#00B37E', icon: Banknote,      label: 'Pagamento PIX' },
  condition:   { color: '#FF6B35', icon: GitBranch,     label: 'Condição' },
  schedule:    { color: '#06B6D4', icon: Calendar,      label: 'Agendar' },
}

const PALETTE: { type: FlowNodeType; label: string; desc: string }[] = [
  { type: 'text',        label: 'Mensagem de Texto',   desc: 'Texto com variáveis' },
  { type: 'image',       label: 'Imagem',              desc: 'Foto do computador ou URL' },
  { type: 'video',       label: 'Vídeo',               desc: 'Vídeo do computador ou URL' },
  { type: 'buttons',     label: 'Botões',              desc: 'Mensagem com botões' },
  { type: 'condition',   label: 'Condição',            desc: 'Desvia por palavra-chave' },
  { type: 'delay',       label: 'Aguardar',            desc: 'Pausa fixa ou aleatória' },
  { type: 'schedule',    label: 'Agendar',             desc: 'Enviar em horário específico' },
  { type: 'pix_buttons', label: 'Botões de PIX',       desc: 'Planos de pagamento via PIX' },
]

const EDGE_OPTS = {
  style:     { strokeWidth: 2, stroke: '#E50914' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#E50914' },
  animated:  true,
}

const genNodeId = (type: string) =>
  `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

const genEdgeId = (src: string, tgt: string) =>
  `edge_${src}__${tgt}_${Math.random().toString(36).slice(2, 6)}`

const BuilderCtx = createContext<{ deleteNode: (id: string) => void }>({ deleteNode: () => {} })

function fmtDelay(d?: DelayConfig) {
  if (!d || !d.value) return null
  const u = d.unit === 'seconds' ? 's' : d.unit === 'minutes' ? 'min' : 'h'
  return `${d.value}${u}`
}

function fmtRandomDelay(d?: RandomDelayConfig) {
  if (!d || !d.minValue || !d.maxValue) return null
  const u = d.unit === 'seconds' ? 's' : d.unit === 'minutes' ? 'min' : 'h'
  return `${d.minValue}-${d.maxValue}${u}`
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface NodeError { id: string; message: string }

function getNodeErrors(nodes: Node<FlowNodeData>[]): NodeError[] {
  const errors: NodeError[] = []
  for (const n of nodes) {
    const d = n.data
    if (d.nodeType === 'text' && !d.content?.trim()) {
      errors.push({ id: n.id, message: 'Conteúdo vazio' })
    }
    if (d.nodeType === 'image' && !d.fileData && !d.fileUrl) {
      errors.push({ id: n.id, message: 'Selecione uma imagem' })
    }
    if (d.nodeType === 'video' && !d.fileData && !d.fileUrl) {
      errors.push({ id: n.id, message: 'Selecione um vídeo' })
    }
    if (d.nodeType === 'condition') {
      if (!d.condition?.value?.trim()) {
        errors.push({ id: n.id, message: 'Defina a condição' })
      }
    }
    if (d.nodeType === 'schedule') {
      if (!d.schedule?.time) {
        errors.push({ id: n.id, message: 'Defina o horário' })
      }
    }
    if (d.nodeType === 'buttons') {
      const hasContent = d.content?.trim()
      const hasButtons = (d.buttons ?? []).length > 0 && (d.buttons ?? []).some(b => b.label.trim())
      if (!hasContent && !hasButtons) {
        errors.push({ id: n.id, message: 'Adicione texto ou botões' })
      }
    }
    if (d.nodeType === 'delay') {
      const hasFixed  = d.delay?.value && d.delay.value > 0
      const hasRandom = d.randomDelay?.minValue && d.randomDelay?.maxValue
      if (!hasFixed && !hasRandom) {
        errors.push({ id: n.id, message: 'Defina a duração' })
      }
    }
  }
  return errors
}

// ─── Handle styles ────────────────────────────────────────────────────────────

const mkHandle = (color: string, pos: Position, extra?: React.CSSProperties): React.CSSProperties => ({
  background: '#0D0D0D',
  width: 14,
  height: 14,
  border: `2.5px solid ${color}`,
  borderRadius: '50%',
  ...(pos === Position.Top    ? { top: -7 }    : {}),
  ...(pos === Position.Bottom ? { bottom: -7 } : {}),
  cursor: 'crosshair',
  transition: 'transform 0.15s, box-shadow 0.15s',
  ...extra,
})

// ─── Node component ───────────────────────────────────────────────────────────

function FlowNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const { deleteNode } = useContext(BuilderCtx)
  const m       = META[data.nodeType]
  const Ico     = m.icon
  const isStart = data.nodeType === 'trigger'
  const isDelay = data.nodeType === 'delay'
  const delayFmt = fmtDelay(data.delay)
  const randomFmt = fmtRandomDelay(data.randomDelay)
  const waitFmt  = fmtDelay(data.waitBefore)
  const cond = data.condition
  const sched = data.schedule

  const errors = getNodeErrors([{ id, data } as Node<FlowNodeData>])

  return (
    <>
    {!isStart && (
      <NodeToolbar isVisible={selected} position={Position.Top} align="end" offset={6}>
        <button
          onMouseDown={e => { e.stopPropagation(); deleteNode(id) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            height: 28, padding: '0 10px',
            background: '#1A1A1A', border: '1px solid #333',
            borderRadius: 8, cursor: 'pointer', color: '#888',
            fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#EF4444'; (e.currentTarget as HTMLElement).style.borderColor = '#EF4444' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#888'; (e.currentTarget as HTMLElement).style.borderColor = '#333' }}
        >
          <Trash2 style={{ width: 12, height: 12 }} />
          Excluir
        </button>
      </NodeToolbar>
    )}
    <div style={{
      background:   '#161616',
      border:       `1.5px solid ${selected ? m.color : errors.length > 0 ? '#EF444466' : '#252525'}`,
      borderRadius: 16,
      minWidth:     220,
      maxWidth:     260,
      boxShadow:    selected
        ? `0 0 0 3px ${m.color}22, 0 8px 40px #00000088`
        : '0 4px 20px #00000060',
      userSelect: 'none',
      position: 'relative',
    }}>
      <div style={{ height: 3, background: m.color, borderRadius: '14px 14px 0 0' }} />

      {!isStart && (
        <Handle type="target" position={Position.Top} style={mkHandle(m.color, Position.Top)} />
      )}

      <div style={{ padding: '12px 14px 10px' }}>
        {/* error badge */}
        {errors.length > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 9, color: '#EF4444', background: '#EF444412',
            border: '1px solid #EF444422', borderRadius: 6,
            padding: '2px 6px', marginBottom: 8,
          }}>
            <AlertTriangle style={{ width: 9, height: 9 }} />
            {errors[0].message}
          </div>
        )}

        {/* wait-before badge */}
        {waitFmt && !errors.length && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 9, color: '#64748B', background: '#64748B12',
            border: '1px solid #64748B22', borderRadius: 6,
            padding: '2px 6px', marginBottom: 8,
          }}>
            <Clock style={{ width: 9, height: 9 }} />
            Aguardar {waitFmt}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: `${m.color}1E`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Ico style={{ color: m.color, width: 16, height: 16 }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#fff', margin: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>
              {data.label}
            </p>
            <p style={{ fontSize: 10, color: `${m.color}99`, margin: '2px 0 0' }}>{m.label}</p>
          </div>
        </div>

        {/* previews */}
        {data.nodeType === 'text' && data.content && (
          <p style={{
            marginTop: 10, paddingTop: 10, borderTop: '1px solid #222',
            fontSize: 11, color: '#666', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {data.content}
          </p>
        )}

        {(data.nodeType === 'image') && (data.fileData || data.fileUrl) && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #222' }}>
            <img src={data.fileData || data.fileUrl}
              style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8 }} />
            {data.caption && (
              <p style={{ fontSize: 10, color: '#555', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {data.caption}
              </p>
            )}
          </div>
        )}

        {data.nodeType === 'video' && (data.fileData || data.fileUrl) && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #222' }}>
            <div style={{
              width: '100%', height: 60, borderRadius: 8,
              background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Video style={{ width: 14, height: 14, color: '#EC4899' }} />
              <span style={{ fontSize: 10, color: '#666' }}>{data.fileName || data.fileUrl}</span>
            </div>
            {data.caption && (
              <p style={{ fontSize: 10, color: '#555', marginTop: 4 }}>{data.caption}</p>
            )}
          </div>
        )}

        {data.nodeType === 'buttons' && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #222' }}>
            {(data.buttons ?? []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(data.buttons ?? []).slice(0, 3).map((btn, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '4px 8px', borderRadius: 6, border: '1px solid #222',
                    fontSize: 10, color: '#CCC',
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                      {btn.label || '…'}
                    </span>
                    <span style={{ fontSize: 9, color: '#555' }}>{btn.type === 'url' ? '🔗' : '→'}</span>
                  </div>
                ))}
                {(data.buttons ?? []).length > 3 && (
                  <p style={{ fontSize: 9, color: '#444', textAlign: 'right' }}>+{(data.buttons ?? []).length - 3} mais</p>
                )}
              </div>
            ) : data.content ? (
              <p style={{ fontSize: 10, color: '#555', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {data.content}
              </p>
            ) : (
              <p style={{ fontSize: 10, color: '#444' }}>Clique para configurar</p>
            )}
          </div>
        )}

        {data.nodeType === 'delay' && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #222' }}>
            {delayFmt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#888' }}>
                <Clock style={{ width: 12, height: 12 }} />
                Aguardar {delayFmt}
              </div>
            )}
            {randomFmt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#888' }}>
                <Shuffle style={{ width: 12, height: 12 }} />
                Aleatório {randomFmt}
              </div>
            )}
            {!delayFmt && !randomFmt && (
              <p style={{ fontSize: 10, color: '#444' }}>Clique para configurar</p>
            )}
          </div>
        )}

        {data.nodeType === 'condition' && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #222' }}>
            {cond?.value ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#FF6B35' }}>
                <GitBranch style={{ width: 12, height: 12 }} />
                {cond.operator === 'contains' ? 'contém' : cond.operator === 'equals' ? '=' : 'começa com'} "{cond.value}"
              </div>
            ) : (
              <p style={{ fontSize: 10, color: '#444' }}>Clique para configurar</p>
            )}
          </div>
        )}

        {data.nodeType === 'schedule' && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #222' }}>
            {sched?.time ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#06B6D4' }}>
                <Calendar style={{ width: 12, height: 12 }} />
                {sched.time}
                {sched.days && sched.days.length > 0 && (
                  <span style={{ color: '#555', fontSize: 10 }}>
                    · {sched.days.map(d => ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d]).join(', ')}
                  </span>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 10, color: '#444' }}>Clique para configurar</p>
            )}
          </div>
        )}

        {data.nodeType === 'pix_buttons' && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #222' }}>
            {(data.pixOptions ?? []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(data.pixOptions ?? []).slice(0, 3).map((opt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: '#CCC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                      {opt.label || '…'}
                    </span>
                    <span style={{ fontSize: 10, color: '#00B37E', fontWeight: 700, flexShrink: 0, marginLeft: 6 }}>
                      R$ {Number(opt.value || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
                {(data.pixOptions ?? []).length > 3 && (
                  <p style={{ fontSize: 9, color: '#444', textAlign: 'right' }}>
                    +{(data.pixOptions ?? []).length - 3} mais
                  </p>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 10, color: '#444' }}>Clique para adicionar planos</p>
            )}
          </div>
        )}

        {isStart && (
          <p style={{
            marginTop: 10, paddingTop: 10, borderTop: '1px solid #1A1A1A',
            fontSize: 10, color: '#3B82F655', textAlign: 'center',
          }}>
            Ponto de início — fixo e obrigatório
          </p>
        )}
      </div>

      {/* source handle — condition has two output handles */}
      {data.nodeType === 'condition' ? (
        <>
          <Handle type="source" position={Position.Bottom} id="yes"
            style={mkHandle('#10B981', Position.Bottom, { left: '35%' })} />
          <Handle type="source" position={Position.Bottom} id="no"
            style={mkHandle('#EF4444', Position.Bottom, { left: '65%' })} />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} style={mkHandle(m.color, Position.Bottom)} />
      )}
    </div>
    </>
  )
}

const NODE_MAP: Record<string, React.FC<NodeProps<FlowNodeData>>> = {
  trigger:     FlowNode,
  text:        FlowNode,
  image:       FlowNode,
  video:       FlowNode,
  buttons:     FlowNode,
  delay:       FlowNode,
  pix_buttons: FlowNode,
  condition:   FlowNode,
  schedule:    FlowNode,
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-semibold text-[#555] uppercase tracking-wide block mb-1.5">{children}</label>
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className="w-full h-9 rounded-xl border border-[#222] bg-[#0D0D0D] px-3 text-sm text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#E50914]/40 focus:ring-1 focus:ring-[#E50914]/10 transition-all" />
  )
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      className="w-full h-9 rounded-xl border border-[#222] bg-[#0D0D0D] px-3 text-sm text-white focus:outline-none focus:border-[#E50914]/40 transition-all appearance-none"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function DelayPicker({ value, onChange, label = 'Aguardar antes de enviar' }: {
  value?:    DelayConfig
  onChange:  (v: DelayConfig | undefined) => void
  label?:    string
}) {
  const [open, setOpen] = useState(!!value?.value)
  const v = value ?? { value: 0, unit: 'seconds' as const }

  return (
    <div className="bg-[#111] border border-[#1E1E1E] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-[#64748B]" />
          <span className="text-xs font-semibold text-[#888]">{label}</span>
          {value?.value ? (
            <span className="text-[10px] bg-[#64748B]/20 text-[#64748B] px-1.5 py-0.5 rounded-md font-mono">
              {fmtDelay(value)}
            </span>
          ) : (
            <span className="text-[10px] text-[#333]">Desativado</span>
          )}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-[#444] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 flex items-center gap-2 border-t border-[#1E1E1E] pt-3">
          <input
            type="number" min={0} max={999}
            value={v.value || ''}
            onChange={e => onChange({ ...v, value: parseInt(e.target.value) || 0 })}
            placeholder="0"
            className="w-20 h-8 rounded-lg border border-[#222] bg-[#0D0D0D] px-2.5 text-sm text-white text-center focus:outline-none focus:border-[#E50914]/30 transition-all"
          />
          <select
            value={v.unit}
            onChange={e => onChange({ ...v, unit: e.target.value as any })}
            className="flex-1 h-8 rounded-lg border border-[#222] bg-[#0D0D0D] px-2 text-xs text-white focus:outline-none focus:border-[#E50914]/30 transition-all appearance-none"
          >
            <option value="seconds">segundos</option>
            <option value="minutes">minutos</option>
            <option value="hours">horas</option>
          </select>
          {value?.value ? (
            <button onClick={() => onChange(undefined)}
              className="text-[#333] hover:text-[#EF4444] transition-colors">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function MediaUpload({
  accept, current, currentName, onFile, onUrl, urlValue,
}: {
  accept:      string
  current?:    string
  currentName?: string
  onFile:      (data: string, name: string) => void
  onUrl:       (url: string) => void
  urlValue?:   string
}) {
  const [mode, setMode] = useState<'upload' | 'url'>(current && !current.startsWith('http') ? 'upload' : urlValue ? 'url' : 'upload')
  const inputRef = useRef<HTMLInputElement>(null)
  const isImage  = accept.startsWith('image')

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      onFile(ev.target?.result as string, file.name)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg border border-[#222] overflow-hidden">
        <button
          onClick={() => setMode('upload')}
          className={`flex-1 flex items-center justify-center gap-1.5 h-8 text-xs font-semibold transition-all ${
            mode === 'upload' ? 'bg-[#1E1E1E] text-white' : 'text-[#444] hover:text-[#888]'
          }`}
        >
          <Upload className="h-3.5 w-3.5" /> Do computador
        </button>
        <button
          onClick={() => setMode('url')}
          className={`flex-1 flex items-center justify-center gap-1.5 h-8 text-xs font-semibold transition-all ${
            mode === 'url' ? 'bg-[#1E1E1E] text-white' : 'text-[#444] hover:text-[#888]'
          }`}
        >
          <Link2 className="h-3.5 w-3.5" /> Via URL
        </button>
      </div>

      {mode === 'upload' && (
        <>
          <input ref={inputRef} type="file" accept={accept} onChange={handleFile} className="hidden" />
          {current && !current.startsWith('http') ? (
            <div className="relative">
              {isImage ? (
                <img src={current} className="w-full h-36 object-cover rounded-xl border border-[#222]" />
              ) : (
                <div className="w-full h-20 rounded-xl border border-[#222] bg-[#0D0D0D] flex flex-col items-center justify-center gap-1.5">
                  <Video className="h-6 w-6 text-[#EC4899]" />
                  <p className="text-[11px] text-[#555] text-center px-4 truncate max-w-full">{currentName}</p>
                </div>
              )}
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-2 w-full h-8 rounded-lg border border-[#222] bg-[#0D0D0D] text-xs text-[#666] hover:text-white hover:bg-[#1A1A1A] transition-all flex items-center justify-center gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" /> Trocar arquivo
              </button>
            </div>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full h-20 rounded-xl border-2 border-dashed border-[#222] bg-[#0D0D0D] hover:border-[#333] transition-all flex flex-col items-center justify-center gap-1.5"
            >
              {isImage ? (
                <Image className="h-5 w-5 text-[#333]" />
              ) : (
                <Video className="h-5 w-5 text-[#333]" />
              )}
              <p className="text-[11px] text-[#444]">Clique para selecionar</p>
              <p className="text-[9px] text-[#2A2A2A]">
                {isImage ? 'JPG, PNG, GIF, WebP' : 'MP4, MOV, AVI, MKV'}
              </p>
            </button>
          )}
        </>
      )}

      {mode === 'url' && (
        <div>
          <input
            value={urlValue ?? ''}
            onChange={e => onUrl(e.target.value)}
            placeholder="https://..."
            className="w-full h-9 rounded-lg border border-[#222] bg-[#0D0D0D] px-3 text-xs text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#E50914]/30 transition-all"
          />
          {current && current.startsWith('http') && (
            <div className="mt-2">
              {isImage ? (
                <img src={current} className="w-full h-36 object-cover rounded-xl border border-[#222]" />
              ) : (
                <div className="w-full h-16 rounded-xl border border-[#222] bg-[#0D0D0D] flex items-center justify-center gap-2">
                  <Video className="h-5 w-5 text-[#EC4899]" />
                  <span className="text-[10px] text-[#555] truncate max-w-[200px]">{current}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Palette item ─────────────────────────────────────────────────────────────

function PaletteItem({ type, label, desc }: { type: FlowNodeType; label: string; desc: string }) {
  const m   = META[type]
  const Ico = m.icon
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('rf/type',  type)
        e.dataTransfer.setData('rf/label', label)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="flex items-center gap-3 p-3 rounded-xl border border-[#1A1A1A] bg-[#080808] hover:border-[#282828] hover:bg-[#111] cursor-grab active:cursor-grabbing transition-all select-none group"
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${m.color}18` }}>
        <Ico className="h-4 w-4" style={{ color: m.color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#CCC] group-hover:text-white transition-colors">{label}</p>
        <p className="text-[10px] text-[#3A3A3A] mt-0.5">{desc}</p>
      </div>
    </div>
  )
}

// ─── Config Panel ─────────────────────────────────────────────────────────────

function ConfigPanel({ node, onUpdate, onDelete, onClose }: {
  node: Node<FlowNodeData>; onUpdate: (id: string, patch: Partial<FlowNodeData>) => void; onDelete: (id: string) => void; onClose: () => void
}) {
  const data = node.data
  const m   = META[data.nodeType]
  const Ico = m.icon
  const isStart = data.nodeType === 'trigger'
  const isDelay = data.nodeType === 'delay'

  const [content, setContent]   = useState(data.content ?? '')
  const [fileData, setFileData] = useState(data.fileData ?? '')
  const [fileName, setFileName] = useState(data.fileName ?? '')
  const [fileUrl, setFileUrl]   = useState(data.fileUrl ?? '')
  const [caption, setCaption]   = useState(data.caption ?? '')
  const [buttons, setButtons]   = useState(data.buttons ?? [])
  const [pixOptions, setPixOptions] = useState(data.pixOptions ?? [])
  const [delay, setDelay]       = useState(data.delay)
  const [waitBefore, setWaitBefore] = useState(data.waitBefore)
  const [randomDelay, setRandomDelay] = useState(data.randomDelay)
  const [delayMode, setDelayMode] = useState<'fixed' | 'random'>(
    data.randomDelay ? 'random' : 'fixed'
  )
  const [condition, setCondition] = useState(data.condition ?? { operator: 'contains' as const, value: '' })
  const [schedule, setSchedule]   = useState(data.schedule ?? { time: '', days: [] as number[] })

  useEffect(() => {
    setContent(data.content ?? '')
    setFileData(data.fileData ?? '')
    setFileName(data.fileName ?? '')
    setFileUrl(data.fileUrl ?? '')
    setCaption(data.caption ?? '')
    setButtons(data.buttons ?? [])
    setPixOptions(data.pixOptions ?? [])
    setDelay(data.delay)
    setWaitBefore(data.waitBefore)
    setRandomDelay(data.randomDelay)
    setDelayMode(data.randomDelay ? 'random' : 'fixed')
    setCondition(data.condition ?? { operator: 'contains', value: '' })
    setSchedule(data.schedule ?? { time: '', days: [] })
  }, [node.id])

  const apply = () => {
    const patch: Partial<FlowNodeData> = {
      content, fileData, fileName, fileUrl, caption, buttons, pixOptions,
      waitBefore,
    }
    if (isDelay) {
      if (delayMode === 'fixed') {
        patch.delay = delay
        patch.randomDelay = undefined
      } else {
        patch.randomDelay = randomDelay
        patch.delay = undefined
      }
    }
    if (data.nodeType === 'condition') patch.condition = condition
    if (data.nodeType === 'schedule')   patch.schedule = schedule
    onUpdate(node.id, patch)
  }

  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  const toggleDay = (d: number) => {
    const days = schedule.days ?? []
    setSchedule(s => ({
      ...s,
      days: days.includes(d) ? days.filter(x => x !== d) : [...days, d],
    }))
  }

  return (
    <div className="w-72 shrink-0 flex flex-col bg-[#0A0A0A] border-l border-[#1A1A1A] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#1A1A1A]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${m.color}20` }}>
            <Ico className="h-3.5 w-3.5" style={{ color: m.color }} />
          </div>
          <p className="text-sm font-semibold text-white">{m.label}</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-[#444] hover:text-white transition-colors rounded-lg hover:bg-[#1E1E1E]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* trigger */}
        {isStart && (
          <div className="flex flex-col items-center text-center py-6">
            <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
              style={{ background: '#3B82F614', border: '1px solid #3B82F622' }}>
              <Zap className="h-7 w-7 text-[#3B82F6]" />
            </div>
            <p className="text-sm font-semibold text-white mb-2">Início do Fluxo</p>
            <p className="text-xs text-[#555] leading-relaxed max-w-[200px]">
              Ativado automaticamente quando o usuário envia qualquer mensagem para o bot.
            </p>
          </div>
        )}

        {/* text */}
        {data.nodeType === 'text' && (
          <div className="space-y-2">
            <FieldLabel>Mensagem</FieldLabel>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Olá {{nome}}, seja bem-vindo!"
              rows={5}
              className="w-full rounded-xl border border-[#222] bg-[#0D0D0D] px-3 py-2.5 text-sm text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#E50914]/40 focus:ring-1 focus:ring-[#E50914]/10 transition-all resize-none"
            />
            <div className="flex flex-wrap gap-1.5">
              {['{{nome}}', '{{username}}', '{{chat_id}}'].map(v => (
                <button key={v} onClick={() => setContent(c => c + v)}
                  className="text-[10px] font-mono bg-[#111] hover:bg-[#1A1A1A] border border-[#222] text-[#8B5CF6] px-2 py-0.5 rounded-md transition-colors">
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* image */}
        {data.nodeType === 'image' && (
          <>
            <div>
              <FieldLabel>Imagem</FieldLabel>
              <MediaUpload
                accept="image/*"
                current={fileData || fileUrl}
                currentName={fileName}
                onFile={(d, n) => { setFileData(d); setFileName(n); setFileUrl('') }}
                onUrl={u => { setFileUrl(u); setFileData(''); setFileName('') }}
                urlValue={fileUrl}
              />
            </div>
            <div>
              <FieldLabel>Legenda <span className="text-[#333] normal-case tracking-normal font-normal">(opcional)</span></FieldLabel>
              <TextInput value={caption} onChange={e => setCaption(e.target.value)} placeholder="Legenda da imagem..." />
            </div>
          </>
        )}

        {/* video */}
        {data.nodeType === 'video' && (
          <>
            <div>
              <FieldLabel>Vídeo</FieldLabel>
              <MediaUpload
                accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.mov,.avi,.mkv"
                current={fileData || fileUrl}
                currentName={fileName}
                onFile={(d, n) => { setFileData(d); setFileName(n); setFileUrl('') }}
                onUrl={u => { setFileUrl(u); setFileData(''); setFileName('') }}
                urlValue={fileUrl}
              />
            </div>
            <div>
              <FieldLabel>Legenda <span className="text-[#333] normal-case tracking-normal font-normal">(opcional)</span></FieldLabel>
              <TextInput value={caption} onChange={e => setCaption(e.target.value)} placeholder="Legenda do vídeo..." />
            </div>
          </>
        )}

        {/* buttons */}
        {data.nodeType === 'buttons' && (
          <>
            <div className="space-y-2">
              <FieldLabel>Mensagem acima dos botões</FieldLabel>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Escolha uma opção:"
                rows={3}
                className="w-full rounded-xl border border-[#222] bg-[#0D0D0D] px-3 py-2.5 text-sm text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#E50914]/40 transition-all resize-none"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Botões</FieldLabel>
              {buttons.map((btn, i) => (
                <div key={i} className="bg-[#111] border border-[#1E1E1E] rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-[#444] uppercase tracking-wide">Botão {i + 1}</p>
                    <button onClick={() => setButtons(bs => bs.filter((_, j) => j !== i))}
                      className="text-[#333] hover:text-[#EF4444] transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    value={btn.label}
                    onChange={e => { const b = [...buttons]; b[i] = { ...b[i], label: e.target.value }; setButtons(b) }}
                    placeholder="Texto do botão"
                    className="w-full h-8 rounded-lg border border-[#222] bg-[#0D0D0D] px-2.5 text-xs text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#E50914]/30 transition-all"
                  />
                  <select
                    value={btn.type}
                    onChange={e => { const b = [...buttons]; b[i] = { ...b[i], type: e.target.value as any }; setButtons(b) }}
                    className="w-full h-8 rounded-lg border border-[#222] bg-[#0D0D0D] px-2.5 text-xs text-white focus:outline-none focus:border-[#E50914]/30 transition-all appearance-none"
                  >
                    <option value="next">→ Próximo bloco</option>
                    <option value="url">🔗 Abrir URL</option>
                  </select>
                  {btn.type === 'url' && (
                    <input
                      value={btn.url ?? ''}
                      onChange={e => { const b = [...buttons]; b[i] = { ...b[i], url: e.target.value }; setButtons(b) }}
                      placeholder="https://..."
                      className="w-full h-8 rounded-lg border border-[#222] bg-[#0D0D0D] px-2.5 text-xs text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#E50914]/30 transition-all"
                    />
                  )}
                </div>
              ))}
              {buttons.length < 6 && (
                <button
                  onClick={() => setButtons(bs => [...bs, { label: '', type: 'next' }])}
                  className="flex items-center gap-1.5 text-xs text-[#E50914] hover:text-[#FF3322] transition-colors mt-1 font-semibold">
                  <Plus className="h-3.5 w-3.5" /> Adicionar botão
                </button>
              )}
            </div>
          </>
        )}

        {/* delay block */}
        {isDelay && (
          <div className="space-y-3">
            {/* mode toggle */}
            <div className="flex rounded-lg border border-[#222] overflow-hidden">
              <button
                onClick={() => setDelayMode('fixed')}
                className={`flex-1 flex items-center justify-center gap-1.5 h-8 text-xs font-semibold transition-all ${
                  delayMode === 'fixed' ? 'bg-[#1E1E1E] text-white' : 'text-[#444] hover:text-[#888]'
                }`}
              >
                <Clock className="h-3.5 w-3.5" /> Fixo
              </button>
              <button
                onClick={() => setDelayMode('random')}
                className={`flex-1 flex items-center justify-center gap-1.5 h-8 text-xs font-semibold transition-all ${
                  delayMode === 'random' ? 'bg-[#1E1E1E] text-white' : 'text-[#444] hover:text-[#888]'
                }`}
              >
                <Shuffle className="h-3.5 w-3.5" /> Aleatório
              </button>
            </div>

            {delayMode === 'fixed' ? (
              <div className="space-y-2">
                <FieldLabel>Duração da pausa</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={999}
                    value={delay?.value ?? ''}
                    onChange={e => setDelay(d => ({ ...(d ?? { unit: 'seconds' }), value: parseInt(e.target.value) || 0 }))}
                    placeholder="5"
                    className="w-24 h-10 rounded-xl border border-[#222] bg-[#0D0D0D] px-3 text-xl font-bold text-white text-center focus:outline-none focus:border-[#E50914]/40 transition-all"
                  />
                  <select
                    value={delay?.unit ?? 'seconds'}
                    onChange={e => setDelay(d => ({ ...(d ?? { value: 0 }), unit: e.target.value as any }))}
                    className="flex-1 h-10 rounded-xl border border-[#222] bg-[#0D0D0D] px-3 text-sm text-white focus:outline-none focus:border-[#E50914]/40 transition-all appearance-none"
                  >
                    <option value="seconds">segundos</option>
                    <option value="minutes">minutos</option>
                    <option value="hours">horas</option>
                  </select>
                </div>
                <p className="text-[11px] text-[#3A3A3A] leading-relaxed">
                  O fluxo aguarda esse tempo antes de continuar para o próximo bloco.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <FieldLabel>Intervalo aleatório</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={999}
                    value={randomDelay?.minValue ?? ''}
                    onChange={e => setRandomDelay(d => ({ ...(d ?? { maxValue: 10, unit: 'minutes' }), minValue: parseInt(e.target.value) || 0 }))}
                    placeholder="5"
                    className="w-20 h-10 rounded-xl border border-[#222] bg-[#0D0D0D] px-3 text-xl font-bold text-white text-center focus:outline-none focus:border-[#E50914]/40 transition-all"
                  />
                  <span className="text-[#555] text-xs">até</span>
                  <input
                    type="number" min={1} max={999}
                    value={randomDelay?.maxValue ?? ''}
                    onChange={e => setRandomDelay(d => ({ ...(d ?? { minValue: 5, unit: 'minutes' }), maxValue: parseInt(e.target.value) || 0 }))}
                    placeholder="10"
                    className="w-20 h-10 rounded-xl border border-[#222] bg-[#0D0D0D] px-3 text-xl font-bold text-white text-center focus:outline-none focus:border-[#E50914]/40 transition-all"
                  />
                  <select
                    value={randomDelay?.unit ?? 'minutes'}
                    onChange={e => setRandomDelay(d => ({ ...(d ?? { minValue: 5, maxValue: 10 }), unit: e.target.value as any }))}
                    className="flex-1 h-10 rounded-xl border border-[#222] bg-[#0D0D0D] px-3 text-sm text-white focus:outline-none focus:border-[#E50914]/40 transition-all appearance-none"
                  >
                    <option value="seconds">segundos</option>
                    <option value="minutes">minutos</option>
                    <option value="hours">horas</option>
                  </select>
                </div>
                <p className="text-[11px] text-[#3A3A3A] leading-relaxed">
                  O fluxo aguarda um tempo aleatório entre o mínimo e o máximo.
                </p>
              </div>
            )}
          </div>
        )}

        {/* condition */}
        {data.nodeType === 'condition' && (
          <div className="space-y-3">
            <div>
              <FieldLabel>Condição</FieldLabel>
              <p className="text-[11px] text-[#555] mb-2 leading-relaxed">
                Se a mensagem do usuário corresponder, segue pelo caminho <span style={{ color: '#10B981' }}>verde</span>.
                Senão, segue pelo <span style={{ color: '#EF4444' }}>vermelho</span>.
              </p>
            </div>
            <div>
              <FieldLabel>Verificar se</FieldLabel>
              <SelectInput
                value={condition.operator}
                onChange={v => setCondition(c => ({ ...c, operator: v as any }))}
                options={[
                  { value: 'contains', label: 'Contém' },
                  { value: 'equals', label: 'É igual a' },
                  { value: 'starts_with', label: 'Começa com' },
                ]}
              />
            </div>
            <div>
              <FieldLabel>Valor</FieldLabel>
              <TextInput
                value={condition.value}
                onChange={e => setCondition(c => ({ ...c, value: e.target.value }))}
                placeholder='Ex: sim, quero, ok'
              />
            </div>
            <div className="bg-[#111] border border-[#1E1E1E] rounded-xl p-3">
              <p className="text-[10px] text-[#444] leading-relaxed">
                Conecte o ● verde ao bloco se a condição for verdadeira,
                e o ● vermelho ao bloco se for falsa.
              </p>
            </div>
          </div>
        )}

        {/* schedule */}
        {data.nodeType === 'schedule' && (
          <div className="space-y-3">
            <div>
              <FieldLabel>Horário para enviar</FieldLabel>
              <input
                type="time"
                value={schedule.time}
                onChange={e => setSchedule(s => ({ ...s, time: e.target.value }))}
                className="w-full h-10 rounded-xl border border-[#222] bg-[#0D0D0D] px-3 text-lg font-bold text-white text-center focus:outline-none focus:border-[#E50914]/40 transition-all"
              />
            </div>
            <div>
              <FieldLabel>Dias da semana <span className="text-[#333] normal-case tracking-normal font-normal">(opcional)</span></FieldLabel>
              <div className="flex gap-1.5">
                {DAYS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`w-9 h-9 rounded-lg text-[10px] font-semibold transition-all ${
                      (schedule.days ?? []).includes(i)
                        ? 'bg-[#06B6D4] text-white'
                        : 'bg-[#111] text-[#555] border border-[#222] hover:border-[#333]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#3A3A3A] mt-1">Nenhum selecionado = todos os dias</p>
            </div>
            <div className="bg-[#111] border border-[#1E1E1E] rounded-xl p-3">
              <p className="text-[10px] text-[#444] leading-relaxed">
                O fluxo aguarda até o horário especificado para enviar a mensagem.
                Se o horário já passou, programa para o próximo dia.
              </p>
            </div>
          </div>
        )}

        {/* pix_buttons */}
        {data.nodeType === 'pix_buttons' && (
          <>
            <div className="space-y-2">
              <FieldLabel>Mensagem acima dos botões</FieldLabel>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Escolha seu plano de pagamento:"
                rows={3}
                className="w-full rounded-xl border border-[#222] bg-[#0D0D0D] px-3 py-2.5 text-sm text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#00B37E]/40 transition-all resize-none"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Opções de pagamento</FieldLabel>
              {pixOptions.map((opt, i) => (
                <div key={i} className="bg-[#111] border border-[#1E1E1E] rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-[#444] uppercase tracking-wide">Plano {i + 1}</p>
                    <button onClick={() => setPixOptions(ps => ps.filter((_, j) => j !== i))}
                      className="text-[#333] hover:text-[#EF4444] transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    value={opt.label}
                    onChange={e => { const p = [...pixOptions]; p[i] = { ...p[i], label: e.target.value }; setPixOptions(p) }}
                    placeholder='Ex: Plano Básico — R$ 10'
                    className="w-full h-8 rounded-lg border border-[#222] bg-[#0D0D0D] px-2.5 text-xs text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#00B37E]/30 transition-all"
                  />
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#555]">R$</span>
                    <input
                      type="number" min={0} step={0.01}
                      value={opt.value || ''}
                      onChange={e => { const p = [...pixOptions]; p[i] = { ...p[i], value: parseFloat(e.target.value) || 0 }; setPixOptions(p) }}
                      placeholder="0,00"
                      className="w-full h-8 rounded-lg border border-[#222] bg-[#0D0D0D] pl-8 pr-2.5 text-xs text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#00B37E]/30 transition-all"
                    />
                  </div>
                  <input
                    value={opt.desc ?? ''}
                    onChange={e => { const p = [...pixOptions]; p[i] = { ...p[i], desc: e.target.value }; setPixOptions(p) }}
                    placeholder="Descrição opcional..."
                    className="w-full h-8 rounded-lg border border-[#222] bg-[#0D0D0D] px-2.5 text-xs text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#00B37E]/30 transition-all"
                  />
                  <div>
                    <p className="text-[10px] text-[#555] mb-1">PIX copia e cola</p>
                    <textarea
                      value={opt.pixCode}
                      onChange={e => { const p = [...pixOptions]; p[i] = { ...p[i], pixCode: e.target.value }; setPixOptions(p) }}
                      placeholder="00020126..."
                      rows={2}
                      className="w-full rounded-lg border border-[#222] bg-[#0D0D0D] px-2.5 py-1.5 text-[10px] font-mono text-[#00B37E] placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#00B37E]/30 transition-all resize-none"
                    />
                  </div>
                </div>
              ))}
              {pixOptions.length < 8 && (
                <button
                  onClick={() => setPixOptions(ps => [...ps, { label: '', value: 0, pixCode: '' }])}
                  className="flex items-center gap-1.5 text-xs text-[#00B37E] hover:text-[#00D48E] transition-colors mt-1 font-semibold">
                  <Plus className="h-3.5 w-3.5" /> Adicionar opção
                </button>
              )}
            </div>
          </>
        )}

        {/* wait-before delay */}
        {!isStart && data.nodeType !== 'delay' && (
          <DelayPicker
            value={waitBefore}
            onChange={setWaitBefore}
            label="Aguardar antes de enviar"
          />
        )}

      </div>

      {/* footer */}
      {!isStart && (
        <div className="px-4 py-3 border-t border-[#1A1A1A] flex gap-2">
          <button onClick={apply}
            className="flex-1 h-9 rounded-xl bg-[#E50914] hover:bg-[#FF1F2D] text-white text-sm font-semibold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-[#E50914]/15">
            <Check className="h-3.5 w-3.5" /> Aplicar
          </button>
          <button onClick={() => onDelete(node.id)}
            className="w-9 h-9 rounded-xl border border-[#222] flex items-center justify-center text-[#444] hover:text-[#EF4444] hover:border-[#EF4444]/25 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Inner ────────────────────────────────────────────────────────────────────

function Inner({ flow, bot, workspaceId, onBack }: {
  flow: any; bot: any | null; workspaceId: string; onBack: () => void
}) {
  const wrapperRef       = useRef<HTMLDivElement>(null)
  const { project }      = useReactFlow()
  const autoSaveTimer    = useRef<ReturnType<typeof setTimeout>>()

  const startNode: Node<FlowNodeData> = {
    id: 'start', type: 'trigger',
    position: { x: 240, y: 60 },
    deletable: false,
    data: { nodeType: 'trigger', label: 'Mensagem recebida' },
  }

  const initNodes = flow.nodes?.length ? flow.nodes : [startNode]

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges ?? [])
  const [selected, setSelected]         = useState<Node<FlowNodeData> | null>(null)
  const [saving,   setSaving]           = useState(false)
  const [saved,    setSaved]            = useState(false)
  const [toast,    setToast]            = useState<string | null>(null)
  const [lastSaved, setLastSaved]       = useState<Date | null>(null)

  // Validation errors
  const errors = getNodeErrors(nodes)

  const doSave = useCallback(async (showToast = true) => {
    setSaving(true)
    try {
      await api.patch(`/workspaces/${workspaceId}/flows/${flow.id}`, {
        nodes, edges, botId: bot?.id ?? flow.botId,
      })
      setSaved(true)
      setLastSaved(new Date())
      if (showToast) {
        setToast('Fluxo salvo com sucesso!')
        setTimeout(() => { setSaved(false); setToast(null) }, 3000)
      } else {
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (err) {
      console.error(err)
      if (showToast) {
        setToast('Erro ao salvar. Tente novamente.')
        setTimeout(() => setToast(null), 3000)
      }
    }
    finally { setSaving(false) }
  }, [nodes, edges, workspaceId, flow.id, flow.botId, bot])

  // Auto-save
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    // Skip auto-save on mount (same as initial)
    autoSaveTimer.current = setTimeout(() => {
      doSave(false)
    }, 5000)
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [nodes, edges])

  const onConnect   = useCallback((p: any) =>
    setEdges(e => addEdge({ ...p, ...EDGE_OPTS, id: genEdgeId(p.source, p.target) }, e)),
  [setEdges])
  const onNodeClick = useCallback((_: any, n: Node<FlowNodeData>) => setSelected(n), [])
  const onPaneClick = useCallback(() => setSelected(null), [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!wrapperRef.current) return
    const type  = e.dataTransfer.getData('rf/type') as FlowNodeType
    const label = e.dataTransfer.getData('rf/label')
    if (!type) return
    const bounds   = wrapperRef.current.getBoundingClientRect()
    const position = project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
    const data: FlowNodeData = {
      nodeType: type, label,
      buttons:    type === 'buttons'     ? [] : undefined,
      pixOptions: type === 'pix_buttons' ? [] : undefined,
      delay:      type === 'delay'       ? { value: 5, unit: 'seconds' } : undefined,
      condition:  type === 'condition'   ? { operator: 'contains', value: '' } : undefined,
      schedule:   type === 'schedule'    ? { time: '', days: [] } : undefined,
    }
    setNodes(ns => ns.concat({ id: genNodeId(type), type, position, data }))
  }, [project, setNodes])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
  }, [])

  const updateNode = useCallback((id: string, patch: Partial<FlowNodeData>) => {
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    setSelected(prev => prev?.id === id
      ? { ...prev, data: { ...prev.data, ...patch } } as Node<FlowNodeData>
      : prev)
  }, [setNodes])

  const deleteNode = useCallback((id: string) => {
    if (id === 'start') return
    setNodes(ns => ns.filter(n => n.id !== id))
    setEdges(es => es.filter(e => e.source !== id && e.target !== id))
    setSelected(null)
  }, [setNodes, setEdges])

  const hasErrors = errors.length > 0

  return (
    <BuilderCtx.Provider value={{ deleteNode }}>
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#080808' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, display: 'flex', alignItems: 'center', gap: 8,
          background: saved ? '#0D1F14' : '#1F0D0D',
          border: `1px solid ${saved ? '#10B98133' : '#EF444433'}`,
          borderRadius: 12, padding: '10px 16px',
          boxShadow: '0 8px 32px #00000088',
          fontSize: 13, fontWeight: 600,
          color: saved ? '#10B981' : '#EF4444',
          animation: 'slideDown 0.25s ease',
        }}>
          {saved ? <Check style={{ width: 15, height: 15 }} /> : <X style={{ width: 15, height: 15 }} />}
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ background: '#0D0D0D', borderBottom: '1px solid #1A1A1A' }}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-[#555] hover:text-white transition-colors group shrink-0">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Voltar
          </button>
          <span className="text-[#222]">/</span>
          <p className="text-sm font-semibold text-white truncate">{flow.name}</p>
          {bot && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0"
              style={{ background: '#161616', border: '1px solid #222' }}>
              <Bot className="h-3 w-3 text-[#E50914]" />
              <span className="text-[11px] text-[#B3B3B3]">@{bot.username}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-[#333]">
            {nodes.length} blocos · {edges.length} conexões
            {errors.length > 0 && (
              <span className="text-[#EF4444] ml-2">{errors.length} pendente{errors.length > 1 ? 's' : ''}</span>
            )}
          </span>
          <button onClick={() => doSave(true)} disabled={saving}
            className={`h-8 px-4 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              saving ? 'bg-[#E50914]/50 text-white/50'
                : hasErrors ? 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30'
                : saved ? 'bg-green-500/15 text-green-400 border border-green-500/25'
                : 'bg-[#E50914] hover:bg-[#FF1F2D] text-white shadow-md shadow-[#E50914]/20'
            }`}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
             saved ? <Check   className="h-3.5 w-3.5" /> :
                     <Save    className="h-3.5 w-3.5" />}
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Palette */}
        <div className="w-52 shrink-0 flex flex-col overflow-y-auto"
          style={{ background: '#080808', borderRight: '1px solid #1A1A1A' }}>
          <div className="p-4 flex-1">
            <p className="text-[9px] font-bold text-[#2A2A2A] uppercase tracking-widest mb-3">Blocos</p>
            <div className="space-y-1.5">
              {PALETTE.map(item => <PaletteItem key={item.type} {...item} />)}
            </div>
          </div>
          <div className="p-4 border-t border-[#1A1A1A] space-y-2">
            <p className="text-[10px] font-semibold text-[#333]">Como conectar</p>
            <p className="text-[10px] text-[#2A2A2A] leading-relaxed">
              Passe o mouse sobre um bloco e arraste o <span className="text-[#E50914]">●</span> inferior para o <span className="text-[#E50914]">●</span> superior do próximo bloco.
            </p>
          </div>
        </div>

        {/* Canvas */}
        <div ref={wrapperRef} className="flex-1 relative" style={{ background: '#080808' }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onNodeClick={onNodeClick} onPaneClick={onPaneClick}
            onDrop={onDrop} onDragOver={onDragOver}
            nodeTypes={NODE_MAP}
            defaultEdgeOptions={EDGE_OPTS}
            connectionMode={ConnectionMode.Loose}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            style={{ background: '#080808' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} color="#191919" gap={24} size={1.5} />
            <Controls style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: 10 }} />
            {nodes.length <= 1 && (
              <Panel position="top-center">
                <div className="mt-8 px-5 py-2.5 rounded-xl text-xs text-[#3A3A3A]"
                  style={{ background: '#111', border: '1px solid #1E1E1E' }}>
                  Arraste um bloco da esquerda para o canvas
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Config panel */}
        {selected && (
          <ConfigPanel
            node={selected as Node<FlowNodeData>}
            onUpdate={updateNode}
            onDelete={deleteNode}
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      <style>{`
        .react-flow__handle { transition: transform 0.15s, box-shadow 0.15s !important; }
        .react-flow__handle:hover {
          transform: scale(1.4) !important;
          box-shadow: 0 0 0 4px rgba(229,9,20,0.25) !important;
        }
        .react-flow__handle-connecting { transform: scale(1.5) !important; }
        .react-flow__edge-path { filter: drop-shadow(0 0 3px rgba(229,9,20,0.3)); }
        .react-flow__controls-button { background: #111 !important; border-color: #222 !important; color: #666 !important; }
        .react-flow__controls-button:hover { background: #1A1A1A !important; color: #fff !important; }
        .react-flow__controls-button svg { fill: currentColor !important; }
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
    </BuilderCtx.Provider>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function FlowBuilder(props: {
  flow: any; bot: any | null; workspaceId: string; onBack: () => void
}) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  )
}
