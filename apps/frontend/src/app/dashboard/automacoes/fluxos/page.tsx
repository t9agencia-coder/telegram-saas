'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { FlowBuilder } from './builder'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { WarmupQrModal } from '@/components/dashboard/warmup-qr-modal'
import {
  Bot, Plus, Loader2, X, Layout, Zap,
  CheckCircle2, XCircle, Info, ExternalLink, AlertTriangle,
  Link2, MessageSquare, AlertCircle, Copy, MoreVertical,
  ArrowRightLeft, BookTemplate, QrCode,
} from 'lucide-react'

// ─── Skeleton de carregamento ─────────────────────────────────────────────────

function FlowCardSkeleton({ delay }: { delay: number }) {
  return (
    <div
      className="bg-[#141414] rounded-[4px] border border-white/[0.06] p-5 animate-fade-in"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'backwards' }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Skeleton className="w-10 h-10 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
        <Skeleton className="w-9 h-5 rounded-full shrink-0" />
      </div>
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-3 w-28 mb-3" />
      <Skeleton className="h-5 w-20 rounded-full mb-3" />
      <div className="flex items-center justify-between pt-2 border-t border-[#222]">
        <Skeleton className="h-2.5 w-14" />
        <Skeleton className="w-7 h-7 rounded-[3px]" />
      </div>
    </div>
  )
}

// ─── Templates prontos ────────────────────────────────────────────────────────

const FLOW_TEMPLATES = [
  {
    id: 'boas_vindas',
    name: 'Boas-vindas',
    description: 'Mensagem de boas-vindas quando o usuário inicia o bot',
    trigger: 'start',
    icon: '👋',
    nodes: [
      { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 50 },  data: { label: 'Início' } },
      { id: 'text-1',    type: 'text',    position: { x: 250, y: 180 }, data: { content: 'Olá! Seja bem-vindo! 🎉\n\nEstou aqui para te ajudar. Como posso te atender hoje?' } },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'text-1' },
    ],
  },
  {
    id: 'funil_vendas',
    name: 'Funil de Vendas',
    description: 'Apresentação do produto com delay e botão de compra',
    trigger: 'start',
    icon: '🛒',
    nodes: [
      { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 50 },  data: { label: 'Início' } },
      { id: 'text-1',    type: 'text',    position: { x: 250, y: 180 }, data: { content: 'Olá! Que bom ter você aqui! 🚀\n\nPrepara que vou te apresentar algo incrível...' } },
      { id: 'delay-1',   type: 'delay',   position: { x: 250, y: 320 }, data: { delay: { value: 3, unit: 'seconds' } } },
      { id: 'text-2',    type: 'text',    position: { x: 250, y: 460 }, data: { content: '✨ *[Nome do Produto]*\n\n📌 Benefício 1\n📌 Benefício 2\n📌 Benefício 3\n\n💰 Por apenas R$ XX,XX' } },
      { id: 'buttons-1', type: 'buttons', position: { x: 250, y: 600 }, data: { content: 'Aproveite agora!', buttons: [{ label: '✅ Quero Comprar', type: 'url', url: 'https://' }, { label: '❓ Tirar Dúvidas', type: 'callback' }] } },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'text-1' },
      { id: 'e2', source: 'text-1',    target: 'delay-1' },
      { id: 'e3', source: 'delay-1',   target: 'text-2' },
      { id: 'e4', source: 'text-2',    target: 'buttons-1' },
    ],
  },
  {
    id: 'menu_opcoes',
    name: 'Menu de Opções',
    description: 'Menu com botões para direcionar o usuário',
    trigger: 'start',
    icon: '📋',
    nodes: [
      { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 50 },  data: { label: 'Início' } },
      { id: 'buttons-1', type: 'buttons', position: { x: 250, y: 180 }, data: { content: 'Olá! O que você deseja fazer? 👇', buttons: [{ label: '🛍️ Ver Produtos', type: 'callback' }, { label: '📞 Falar com Suporte', type: 'callback' }, { label: '❓ Dúvidas Frequentes', type: 'callback' }] } },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'buttons-1' },
    ],
  },
  {
    id: 'deep_link_promo',
    name: 'Promoção (Deep Link)',
    description: 'Ativado por link específico — ideal para campanhas',
    trigger: 'deep_link',
    icon: '🎯',
    nodes: [
      { id: 'trigger-1', type: 'trigger', position: { x: 250, y: 50 },  data: { label: 'Deep Link' } },
      { id: 'text-1',    type: 'text',    position: { x: 250, y: 180 }, data: { content: '🎉 *Oferta Exclusiva!*\n\nVocê encontrou uma promoção especial!\n\nAproveite agora antes que acabe.' } },
      { id: 'delay-1',   type: 'delay',   position: { x: 250, y: 320 }, data: { delay: { value: 2, unit: 'seconds' } } },
      { id: 'buttons-1', type: 'buttons', position: { x: 250, y: 460 }, data: { content: '⏰ Oferta por tempo limitado!', buttons: [{ label: '🔥 Garantir Oferta', type: 'url', url: 'https://' }] } },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'text-1' },
      { id: 'e2', source: 'text-1',    target: 'delay-1' },
      { id: 'e3', source: 'delay-1',   target: 'buttons-1' },
    ],
  },
]

// ─── Templates modal ──────────────────────────────────────────────────────────

function TemplatesModal({
  onSelect,
  onClose,
}: {
  onSelect: (template: typeof FLOW_TEMPLATES[0]) => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl bg-[#141414] border border-white/[0.06] rounded-[4px] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-bold text-white">Modelos Prontos</h2>
            <p className="text-xs text-[#555555] mt-0.5">Escolha um modelo para começar rapidamente</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[#555555] hover:text-white transition-colors rounded-[3px] hover:bg-[#1E1E1E]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
          {FLOW_TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="text-left p-4 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] hover:border-[#E50914]/40 hover:bg-[#1A0F0F] transition-all group"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{t.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-white group-hover:text-[#FF4444]">{t.name}</p>
                  <p className="text-[11px] text-[#444]">
                    {t.trigger === 'deep_link' ? '🔗 Deep Link' : t.trigger === 'direct_start' ? '⚡ Busca Direta' : '💬 Mensagem'}
                    {' · '}{t.nodes.length - 1} bloco{t.nodes.length - 1 !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <p className="text-xs text-[#555] leading-relaxed">{t.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Migrate bot modal ────────────────────────────────────────────────────────

function MigrateBotModal({
  flow,
  bots,
  onConfirm,
  onClose,
}: {
  flow: any
  bots: any[]
  onConfirm: (botId: string) => Promise<void>
  onClose: () => void
}) {
  const [botId,  setBotId]  = useState(flow.botId || '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!botId) return
    setSaving(true)
    try { await onConfirm(botId) } finally { setSaving(false) }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm bg-[#141414] border border-white/[0.06] rounded-[4px] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-bold text-white">Migrar para outro Bot</h2>
            <p className="text-xs text-[#555555] mt-0.5 truncate max-w-[220px]">{flow.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[#555555] hover:text-white transition-colors rounded-[3px] hover:bg-[#1E1E1E]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#666666] uppercase tracking-wide block mb-2">Selecionar Bot</label>
            <div className="relative">
              <select
                value={botId}
                onChange={e => setBotId(e.target.value)}
                className="w-full h-10 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] pl-3 pr-10 text-sm text-white focus:outline-none focus:border-[#E50914]/40 focus:ring-1 focus:ring-[#E50914]/15 transition-all appearance-none"
              >
                <option value="">Selecionar bot...</option>
                {bots.map((b: any) => (
                  <option key={b.id} value={b.id}>@{b.username}</option>
                ))}
              </select>
              <Bot className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#444444] pointer-events-none" />
            </div>
          </div>
          {flow.isActive && (
            <div className="flex items-start gap-2 p-3 rounded-[3px] bg-amber-500/8 border border-amber-500/15">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400">O fluxo será desativado automaticamente ao migrar.</p>
            </div>
          )}
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={submit}
            disabled={!botId || saving}
            className="flex-1 h-10 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] text-white text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
            {saving ? 'Migrando...' : 'Migrar Bot'}
          </button>
          <button onClick={onClose} className="h-10 px-4 rounded-[4px] border border-white/[0.06] text-sm text-[#666666] hover:text-white hover:bg-[#1E1E1E] transition-all">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Import modal ─────────────────────────────────────────────────────────────

const FLOW_FILE_VERSION = '1.0'

function ImportModal({
  bots,
  onConfirm,
  onClose,
}: {
  bots: any[]
  onConfirm: (data: { name: string; botId: string; parsed: any }) => Promise<void>
  onClose: () => void
}) {
  const [parsed,   setParsed]   = useState<any>(null)
  const [error,    setError]    = useState('')
  const [botId,    setBotId]    = useState('')
  const [saving,   setSaving]   = useState(false)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Arquivo muito grande (máx 5 MB)'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!data?.flow?.nodes || !data?.flow?.edges) {
          setError('Arquivo inválido — estrutura de fluxo não reconhecida')
          return
        }
        setError('')
        setParsed(data)
        if (bots.length === 1) setBotId(bots[0].id)
      } catch {
        setError('Não foi possível ler o arquivo — verifique se é um .flow válido')
      }
    }
    reader.readAsText(file)
  }

  const submit = async () => {
    if (!parsed) return
    setSaving(true)
    try {
      await onConfirm({ name: parsed.flow.name, botId, parsed })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-[#141414] border border-white/[0.06] rounded-[4px] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-bold text-white">Importar Fluxo</h2>
            <p className="text-xs text-[#555555] mt-0.5">Carregue um arquivo .flow exportado</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[#555555] hover:text-white transition-colors rounded-[3px] hover:bg-[#1E1E1E]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* file picker */}
          <label className="flex flex-col items-center justify-center gap-2 h-28 rounded-[4px] border-2 border-dashed border-white/[0.08] bg-[#0D0D0D] hover:border-[#E50914]/40 hover:bg-[#1A0F0F] transition-all cursor-pointer">
            <input type="file" accept=".flow,.json" className="hidden" onChange={handleFile} />
            <BookTemplate className="h-7 w-7 text-[#444]" />
            <span className="text-sm text-[#555]">Clique para selecionar arquivo <span className="text-[#444]">.flow</span></span>
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* summary after file loaded */}
          {parsed && (
            <div className="p-4 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] space-y-2.5">
              <p className="text-xs font-semibold text-[#666] uppercase tracking-wide">Resumo do fluxo</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#555]">Nome</span>
                <span className="text-xs text-white font-medium truncate max-w-[200px]">{parsed.flow.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#555]">Blocos</span>
                <span className="text-xs text-white">{(parsed.flow.nodes?.length ?? 0) - 1}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#555]">Ativação</span>
                <span className="text-xs text-white">
                  {parsed.flow.trigger === 'deep_link' ? 'Deep Link' : parsed.flow.trigger === 'direct_start' ? 'Busca Direta' : 'Mensagem recebida'}
                </span>
              </div>
              {parsed.version && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#555]">Versão</span>
                  <span className="text-xs text-[#444]">{parsed.version}</span>
                </div>
              )}
            </div>
          )}

          {/* bot selector */}
          {parsed && (
            <div>
              <label className="text-xs font-semibold text-[#666666] uppercase tracking-wide block mb-2">
                Usar com qual Bot?
              </label>
              <div className="relative">
                <select
                  value={botId}
                  onChange={e => setBotId(e.target.value)}
                  className="w-full h-10 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] pl-3 pr-10 text-sm text-white focus:outline-none focus:border-[#E50914]/40 focus:ring-1 focus:ring-[#E50914]/15 transition-all appearance-none"
                >
                  <option value="">Nenhum bot (vincular depois)</option>
                  {bots.map((b: any) => (
                    <option key={b.id} value={b.id}>@{b.username}</option>
                  ))}
                </select>
                <Bot className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#444444] pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={submit}
            disabled={!parsed || saving}
            className="flex-1 h-10 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] text-white text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? 'Importando...' : 'Importar Fluxo'}
          </button>
          <button onClick={onClose} className="h-10 px-4 rounded-[4px] border border-white/[0.06] text-sm text-[#666666] hover:text-white hover:bg-[#1E1E1E] transition-all">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create flow modal ────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: 'start',        label: 'Mensagem recebida',     desc: 'Qualquer mensagem do usuário dispara o fluxo' },
  { value: 'deep_link',    label: 'Link Direto (Deep Link)', desc: 'Ativado quando o usuário entra via /start + payload' },
  { value: 'direct_start', label: 'Busca Direta',           desc: 'Ativado quando o usuário envia /start sem payload' },
]

function CreateFlowModal({
  bots,
  onCancel,
  onCreate,
  preselectedBotId,
  initialTemplate,
}: {
  bots:              any[]
  onCancel:          () => void
  onCreate:          (name: string, description: string, botId: string, trigger: string, config: any) => Promise<void>
  preselectedBotId?: string
  initialTemplate?:  typeof FLOW_TEMPLATES[0] | null
}) {
  const [name,    setName]    = useState(initialTemplate?.name ?? '')
  const [desc,    setDesc]    = useState(initialTemplate?.description ?? '')
  const [botId,   setBotId]   = useState(preselectedBotId || '')
  const [trigger, setTrigger] = useState(initialTemplate?.trigger ?? 'start')
  const [payload, setPayload] = useState('')
  const [saving,  setSaving]  = useState(false)

  // Auto-seleciona o único bot disponível se não vier preselectedBotId
  useEffect(() => {
    if (!botId && bots.length === 1) setBotId(bots[0].id)
  }, [bots, botId])

  const submit = async () => {
    if (!name.trim()) return
    if (bots.length > 0 && !botId) return
    setSaving(true)
    try {
      const config = trigger === 'deep_link' && payload.trim() ? { startPayload: payload.trim() } : undefined
      await onCreate(name.trim(), desc.trim(), botId, trigger, config)
    } finally {
      setSaving(false)
    }
  }

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      {/* modal */}
      <div className="w-full max-w-md bg-[#141414] border border-white/[0.06] rounded-[4px] shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-bold text-white">Novo Fluxo</h2>
            <p className="text-xs text-[#555555] mt-0.5">Configure o fluxo de automação</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center text-[#555555] hover:text-white transition-colors rounded-[3px] hover:bg-[#1E1E1E]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="p-6 space-y-5">
          {/* bot selector */}
          <div>
            <label className="text-xs font-semibold text-[#666666] uppercase tracking-wide block mb-2">
              Bot {bots.length > 0 ? <span className="text-[#E50914]">*</span> : <span className="text-[#3A3A3A] normal-case tracking-normal font-normal">(opcional)</span>}
            </label>
            {bots.length > 0 ? (
              <div className="relative">
                <select
                  value={botId}
                  onChange={e => setBotId(e.target.value)}
                  className="w-full h-10 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] pl-3 pr-10 text-sm text-white focus:outline-none focus:border-[#E50914]/40 focus:ring-1 focus:ring-[#E50914]/15 transition-all appearance-none"
                >
                  {bots.length > 1 && <option value="">Selecionar bot...</option>}
                  {bots.map((b: any) => (
                    <option key={b.id} value={b.id}>@{b.username}</option>
                  ))}
                </select>
                <Bot className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#444444] pointer-events-none" />
              </div>
            ) : (
              <div className="h-10 rounded-[4px] border border-white/[0.06] bg-[#0A0A0A] flex items-center px-3">
                <p className="text-sm text-[#444444]">Nenhum bot cadastrado — adicione um em Meus Robôs primeiro</p>
              </div>
            )}
          </div>

          {/* name */}
          <div>
            <label className="text-xs font-semibold text-[#666666] uppercase tracking-wide block mb-2">
              Nome do fluxo <span className="text-[#E50914]">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              placeholder="Ex: Funil de Vendas, Boas-vindas..."
              className="w-full h-10 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] px-3 text-sm text-white placeholder:text-[#444444] focus:outline-none focus:border-[#E50914]/40 focus:ring-1 focus:ring-[#E50914]/15 transition-all"
            />
          </div>

          {/* description */}
          <div>
            <label className="text-xs font-semibold text-[#666666] uppercase tracking-wide block mb-2">
              Descrição <span className="text-[#3A3A3A] normal-case tracking-normal font-normal">(opcional)</span>
            </label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Descreva o objetivo deste fluxo..."
              rows={3}
              className="w-full rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] px-3 py-2.5 text-sm text-white placeholder:text-[#444444] focus:outline-none focus:border-[#E50914]/40 focus:ring-1 focus:ring-[#E50914]/15 transition-all resize-none"
            />
          </div>

          {/* trigger */}
          <div>
            <label className="text-xs font-semibold text-[#666666] uppercase tracking-wide block mb-2">
              Tipo de ativação
            </label>
            <div className="space-y-2">
              {TRIGGER_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setTrigger(opt.value)}
                  className="w-full text-left px-3.5 py-2.5 rounded-[4px] border text-sm transition-colors"
                  style={{
                    background: trigger === opt.value ? '#1A0F0F' : '#0D0D0D',
                    borderColor: trigger === opt.value ? '#E5091440' : '#2A2A2A',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0"
                      style={{
                        borderColor: trigger === opt.value ? '#E50914' : '#444',
                      }}>
                      {trigger === opt.value && (
                        <div className="w-2 h-2 rounded-full bg-[#E50914]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium">{opt.label}</p>
                      <p className="text-xs text-[#555] mt-0.5">{opt.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {trigger === 'deep_link' && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-[#666666] uppercase tracking-wide block mb-2">
                  Payload esperado <span className="text-[#E50914]">*</span>
                </label>
                <input
                  value={payload}
                  onChange={e => setPayload(e.target.value)}
                  placeholder="Ex: fluxo_123, promocao_10, etc"
                  className="w-full h-10 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] px-3 text-sm text-white placeholder:text-[#444444] focus:outline-none focus:border-[#E50914]/40 focus:ring-1 focus:ring-[#E50914]/15 transition-all"
                />
                <p className="text-[11px] text-[#444] mt-1.5">
                  O fluxo será ativado quando o usuário clicar em t.me/bot?start={payload ? payload : 'SEU_PAYLOAD'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="px-6 pb-6 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={!name.trim() || saving || (bots.length > 0 && !botId)}
            className="flex-1 h-10 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#E50914]/20"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {saving ? 'Criando...' : 'Criar e abrir editor'}
          </button>
          <button
            onClick={onCancel}
            className="h-10 px-4 rounded-[4px] border border-white/[0.06] text-sm text-[#666666] hover:text-white hover:bg-[#1E1E1E] transition-all"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FluxosPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-[#E50914]" /></div>}>
      <FluxosPageInner />
    </Suspense>
  )
}

function FluxosPageInner() {
  const searchParams  = useSearchParams()
  const { workspaceId } = useAuthStore()

  const preselectedBotId = searchParams.get('botId') || ''

  const [flows,        setFlows]        = useState<any[]>([])
  const [bots,         setBots]         = useState<any[]>([])
  const [selectedFlow, setSelectedFlow] = useState<any>(null)
  const [loading,      setLoading]      = useState(true)
  const [openingId,    setOpeningId]    = useState<string | null>(null)
  const [creating,     setCreating]     = useState(false)
  const [togglingId,      setTogglingId]      = useState<string | null>(null)
  const [testingBotId,   setTestingBotId]   = useState<string | null>(null)
  const [conflictFlowId, setConflictFlowId] = useState<string | null>(null)
  const [activationError, setActivationError] = useState<string | null>(null)
  const [openMenuId,     setOpenMenuId]     = useState<string | null>(null)
  const [duplicatingId,  setDuplicatingId]  = useState<string | null>(null)
  const [exportingId,    setExportingId]    = useState<string | null>(null)
  const [migrateFlow,    setMigrateFlow]    = useState<any>(null)
  const [showTemplates,  setShowTemplates]  = useState(false)
  const [showImport,     setShowImport]     = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<typeof FLOW_TEMPLATES[0] | null>(null)
  const [warmupBot, setWarmupBot] = useState<{ id: string; username: string } | null>(null)

  const loadData = useCallback(async () => {
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
  }, [workspaceId])

  useEffect(() => { loadData() }, [loadData])

  // Abre modal automaticamente quando vem de "Criar Fluxo" em um bot
  useEffect(() => {
    if (preselectedBotId && !loading) setCreating(true)
  }, [preselectedBotId, loading])

  // Fecha menu "⋯" ao clicar fora
  useEffect(() => {
    if (!openMenuId) return
    const close = () => setOpenMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenuId])

  const getBotInfo = (flow: any) => {
    if (!flow.bot) return bots.find(b => b.id === flow.botId) || null
    return flow.bot
  }

  const canActivate = (flow: any) => {
    const nodeCount = flow.nodeCount ?? 0
    if (nodeCount === 0) return { ok: false, reason: 'Fluxo sem blocos — adicione blocos ao canvas' }
    if (!flow.botId) return { ok: false, reason: 'Nenhum bot conectado — selecione um bot' }
    const bot = getBotInfo(flow)
    if (!bot) return { ok: false, reason: 'Bot não encontrado' }
    if (bot.status !== 'ACTIVE') return { ok: false, reason: `Bot @${bot.username} não está ativo (status: ${bot.status})` }
    if (flow.cacheComplete === false) {
      return bot.warmupChatId
        ? { ok: false, reason: `Aguardando cache de mídia (${flow.cacheMissing ?? '?'} pendente) — aguarde alguns segundos` }
        : { ok: false, reason: 'Configure o pré-cache antes de ativar' }
    }
    if (flow.trigger === 'deep_link' && !flow.config?.startPayload) return { ok: true, reason: 'Deep Link sem payload — responderá a qualquer /start' }
    return { ok: true, reason: '' }
  }

  const toggleFlow = async (flow: any, newState: boolean) => {
    if (!workspaceId) return
    setTogglingId(flow.id)
    setActivationError(null)
    try {
      if (newState) {
        await api.post(`/workspaces/${workspaceId}/flows/${flow.id}/activate`)
      } else {
        await api.post(`/workspaces/${workspaceId}/flows/${flow.id}/deactivate`)
      }
      await loadData()
    } catch (err: any) {
      if (err?.message === 'BOT_HAS_ACTIVE_FLOW') {
        const conflicting = flows.find(f => f.botId === flow.botId && f.isActive && f.id !== flow.id)
        setConflictFlowId(conflicting?.id ?? flow.botId)
      } else {
        setActivationError(err?.message || 'Erro ao alterar estado do fluxo')
      }
    } finally {
      setTogglingId(null)
    }
  }

  const testBot = async (botId: string) => {
    if (!workspaceId) return
    setTestingBotId(botId)
    try {
      await api.post(`/workspaces/${workspaceId}/bots/${botId}/test`)
      await loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setTestingBotId(null)
    }
  }

  // Sempre busca dados frescos do DB antes de abrir o editor
  const openFlow = async (flowId: string) => {
    if (openingId) return
    setOpeningId(flowId)
    try {
      const freshFlow = await api.get(`/workspaces/${workspaceId}/flows/${flowId}`)
      setSelectedFlow(freshFlow)
    } catch {
      // fallback para o snapshot da lista
      const fallback = flows.find(f => f.id === flowId)
      if (fallback) setSelectedFlow(fallback)
    } finally {
      setOpeningId(null)
    }
  }

  const handleCreate = async (name: string, description: string, botId: string, trigger: string, config?: any) => {
    if (!workspaceId) return
    const flow = await api.post(`/workspaces/${workspaceId}/flows`, {
      name,
      description: description || undefined,
      botId:       botId || undefined,
      trigger:     trigger || 'start',
      config:      config || {},
      nodes:       pendingTemplate?.nodes ?? [],
      edges:       pendingTemplate?.edges ?? [],
    })
    setPendingTemplate(null)
    setCreating(false)
    await loadData()
    setSelectedFlow(flow)
  }

  const handleDuplicate = async (flow: any) => {
    if (!workspaceId) return
    setDuplicatingId(flow.id)
    setOpenMenuId(null)
    try {
      await api.post(`/workspaces/${workspaceId}/flows/${flow.id}/duplicate`, {})
      await loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setDuplicatingId(null)
    }
  }

  const handleExport = async (flow: any) => {
    setOpenMenuId(null)
    setExportingId(flow.id)
    try {
      // A listagem só traz um resumo (nodes/config podem ter dezenas de MB de mídia
      // embutida) — busca o fluxo completo antes de montar o arquivo de exportação.
      const fullFlow = await api.get(`/workspaces/${workspaceId}/flows/${flow.id}`)
      const exportData = {
        version:    FLOW_FILE_VERSION,
        platform:   'FireBot',
        created_at: new Date().toISOString(),
        flow: {
          name:        fullFlow.name,
          description: fullFlow.description || '',
          trigger:     fullFlow.trigger,
          config:      fullFlow.config || {},
          nodes:       fullFlow.nodes || [],
          edges:       fullFlow.edges || [],
        },
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${flow.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.flow`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    } finally {
      setExportingId(null)
    }
  }

  const handleMigrateBot = async (botId: string) => {
    if (!workspaceId || !migrateFlow) return
    await api.patch(`/workspaces/${workspaceId}/flows/${migrateFlow.id}`, {
      botId,
      isActive: false,
    })
    setMigrateFlow(null)
    await loadData()
  }

  const handleImport = async ({ name, botId, parsed }: { name: string; botId: string; parsed: any }) => {
    if (!workspaceId) return
    const existingNames = flows.map(f => f.name)
    let finalName = name || 'Fluxo Importado'
    if (existingNames.includes(finalName)) {
      finalName = `${finalName} (importado)`
      let i = 2
      while (existingNames.includes(finalName)) finalName = `${name} (importado ${i++})`
    }
    const flow = await api.post(`/workspaces/${workspaceId}/flows`, {
      name:        finalName,
      description: parsed.flow.description || undefined,
      botId:       botId || undefined,
      trigger:     parsed.flow.trigger || 'start',
      config:      parsed.flow.config || {},
      nodes:       parsed.flow.nodes || [],
      edges:       parsed.flow.edges || [],
    })
    setShowImport(false)
    await loadData()
    setSelectedFlow(flow)
  }

  const handleTemplateSelect = (template: typeof FLOW_TEMPLATES[0]) => {
    setPendingTemplate(template)
    setShowTemplates(false)
    setCreating(true)
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-72" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <FlowCardSkeleton key={i} delay={i * 40} />
          ))}
        </div>
      </div>
    )
  }

  // ── Builder (fullscreen overlay) ────────────────────────────────────────────
  if (selectedFlow) {
    const bot = bots.find(b => b.id === selectedFlow.botId) ?? null
    return (
      <FlowBuilder
        flow={selectedFlow}
        bot={bot}
        workspaceId={workspaceId!}
        onBack={() => { setSelectedFlow(null); loadData() }}
      />
    )
  }

  // ── Flow list ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Modals */}
      {creating && (
        <CreateFlowModal
          bots={bots}
          onCancel={() => { setCreating(false); setPendingTemplate(null) }}
          onCreate={handleCreate}
          preselectedBotId={preselectedBotId}
          initialTemplate={pendingTemplate}
        />
      )}
      {showTemplates && (
        <TemplatesModal onSelect={handleTemplateSelect} onClose={() => setShowTemplates(false)} />
      )}
      {showImport && (
        <ImportModal bots={bots} onConfirm={handleImport} onClose={() => setShowImport(false)} />
      )}
      {migrateFlow && (
        <MigrateBotModal
          flow={migrateFlow}
          bots={bots}
          onConfirm={handleMigrateBot}
          onClose={() => setMigrateFlow(null)}
        />
      )}

      {warmupBot && workspaceId && (
        <WarmupQrModal workspaceId={workspaceId} bot={warmupBot} onClose={() => { setWarmupBot(null); loadData() }} />
      )}

      {/* Conflict modal */}
      {conflictFlowId && (() => {
        const conflictFlow = flows.find(f => f.id === conflictFlowId)
        const conflictBot  = conflictFlow ? getBotInfo(conflictFlow) : null
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          >
            <div className="w-full max-w-sm bg-[#141414] border border-white/[0.06] rounded-[4px] shadow-2xl overflow-hidden">
              <div className="p-6 text-center">
                <div className="w-14 h-14 rounded-[4px] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="h-7 w-7 text-amber-500" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">Este bot já possui um fluxo ativo</h3>
                <p className="text-sm text-[#666666] leading-relaxed">
                  {conflictBot ? `@${conflictBot.username}` : 'Este bot'} já está executando
                  {conflictFlow ? ` o fluxo "${conflictFlow.name}"` : ' outro fluxo'}.
                  {' '}Desative o fluxo atual antes de ativar outro.
                </p>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                {conflictFlow && (
                  <button
                    onClick={() => { setConflictFlowId(null); openFlow(conflictFlow.id) }}
                    className="flex-1 h-10 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] text-white text-sm font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver fluxo ativo
                  </button>
                )}
                <button
                  onClick={() => setConflictFlowId(null)}
                  className="flex-1 h-10 rounded-[4px] border border-white/[0.06] text-sm text-[#666666] hover:text-white hover:bg-[#1E1E1E] transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <div className="space-y-6">
        {activationError && (
          <div className="flex items-start gap-3 p-4 rounded-[4px] bg-red-500/8 border border-red-500/20">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-400 font-medium">Erro ao ativar fluxo</p>
              <p className="text-xs text-red-400/70 mt-0.5">{activationError}</p>
            </div>
            <button onClick={() => setActivationError(null)} className="text-red-400/50 hover:text-red-400 transition-colors shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <PageHeader
          title="Fluxos de Automação"
          description="Crie automações visuais estilo n8n para o seu bot do Telegram"
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="h-10 px-4 rounded-[4px] border border-white/[0.08] text-[#888] hover:text-white hover:bg-[#1E1E1E] text-sm font-medium transition-all flex items-center gap-2"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Importar
            </button>
            <button
              onClick={() => setShowTemplates(true)}
              className="h-10 px-4 rounded-[4px] border border-white/[0.08] text-[#888] hover:text-white hover:bg-[#1E1E1E] text-sm font-medium transition-all flex items-center gap-2"
            >
              <BookTemplate className="h-4 w-4" />
              Modelos
            </button>
            <button
              onClick={() => setCreating(true)}
              className="h-10 px-5 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-[#E50914]/20"
            >
              <Plus className="h-4 w-4" />
              Novo Fluxo
            </button>
          </div>
        </PageHeader>

        {/* Empty state */}
        {flows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-[4px] bg-[#E50914]/8 border border-[#E50914]/15 flex items-center justify-center mb-6">
              <Layout className="h-10 w-10 text-[#E50914]" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Crie seu primeiro fluxo</h2>
            <p className="text-sm text-[#555555] mb-8 max-w-xs leading-relaxed">
              Conecte blocos de lógica para criar automações inteligentes para o seu bot do Telegram.
            </p>
            <button
              onClick={() => setCreating(true)}
              className="h-11 px-7 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] text-white text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-[#E50914]/20"
            >
              <Zap className="h-4 w-4" />
              Criar Primeiro Fluxo
            </button>
          </div>
        )}

        {/* Flow grid */}
        {flows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {flows.map((flow: any, idx: number) => {
              const nodeCount = flow.nodeCount ?? 0
              const bot       = getBotInfo(flow)
              const activation = canActivate(flow)
              return (
                <div
                  key={flow.id}
                  onClick={() => openFlow(flow.id)}
                  className="bg-[#141414] rounded-[4px] border border-white/[0.06] p-5 hover:border-[#E50914]/25 hover:bg-[#191919] transition-all cursor-pointer group card-glow-premium animate-fade-in"
                  style={{
                    animationDelay: `${Math.min(idx * 30, 300)}ms`,
                    animationFillMode: 'backwards',
                    ...(openingId === flow.id ? { opacity: 0.6, pointerEvents: 'none' } : {}),
                  }}
                >
                  {/* top row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-[4px] bg-[#E50914]/8 border border-[#E50914]/15 flex items-center justify-center shrink-0">
                        {openingId === flow.id
                          ? <Loader2 className="h-5 w-5 text-[#E50914] animate-spin" />
                          : <Layout className="h-5 w-5 text-[#E50914]" />
                        }
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white truncate">{flow.name}</p>
                          <span className="text-[10px] font-mono text-[#3A3A3A] shrink-0">
                            #{String(idx + 1).padStart(3, '0')}
                          </span>
                        </div>
                        {flow.description && (
                          <p className="text-xs text-[#444444] mt-0.5 truncate">{flow.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={flow.isActive}
                        disabled={togglingId === flow.id || (!flow.isActive && !activation.ok)}
                        onCheckedChange={(checked) => toggleFlow(flow, checked)}
                      />
                      {togglingId === flow.id && <Loader2 className="h-3 w-3 animate-spin text-[#555555]" />}
                    </div>
                  </div>

                  {/* bot info */}
                  {bot && (
                    <div className="flex items-center gap-1.5 text-xs text-[#555555] mb-2">
                      <Bot className="h-3 w-3 shrink-0" />
                      <span className="truncate">@{bot.username}</span>
                      {bot.status === 'ACTIVE' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                      )}
                    </div>
                  )}

                  {/* trigger badge */}
                  <div className="flex items-center gap-1.5 text-xs text-[#666] mb-2">
                    {flow.trigger === 'deep_link' ? (
                      <span className="flex items-center gap-1 text-[#8B5CF6]">
                        <Link2 className="h-3 w-3" /> Deep Link {flow.config?.startPayload && `(${flow.config.startPayload})`}
                      </span>
                    ) : flow.trigger === 'direct_start' ? (
                      <span className="flex items-center gap-1 text-[#3B82F6]">
                        <Zap className="h-3 w-3" /> Busca Direta
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[#555]">
                        <MessageSquare className="h-3 w-3" /> Mensagem recebida
                      </span>
                    )}
                  </div>

                  {/* status badge */}
                  <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-[3px] mb-2 border ${
                    flow.isActive
                      ? 'bg-green-500/8 text-green-400 border-green-500/15'
                      : 'bg-[#1A1A1A] text-[#555555] border-white/[0.06]'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${flow.isActive ? 'bg-green-400' : 'bg-[#444]'}`} />
                    {flow.isActive ? 'Fluxo Ativo' : 'Fluxo Inativo'}
                  </div>

                  {/* validation hint: erro (bloqueado) ou aviso (permitido mas com observação) */}
                  {!flow.isActive && !activation.ok && (
                    <div className="flex items-start gap-1.5 text-xs mb-2">
                      <Info className="h-3 w-3 shrink-0 mt-0.5 text-red-400" />
                      <span className="text-red-400/80">{activation.reason}</span>
                    </div>
                  )}
                  {!flow.isActive && flow.cacheComplete === false && !bot?.warmupChatId && bot && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setWarmupBot(bot) }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#F59E0B] hover:text-[#FBBF24] transition-colors mb-2"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      Configurar Pré-Cache
                    </button>
                  )}
                  {!flow.isActive && activation.ok && activation.reason && (
                    <div className="flex items-start gap-1.5 text-xs mb-2">
                      <Info className="h-3 w-3 shrink-0 mt-0.5 text-[#555]" />
                      <span className="text-[#555555]">{activation.reason}</span>
                    </div>
                  )}
                  {/* test bot button when PENDING_REVIEW */}
                  {!flow.isActive && bot?.status === 'PENDING_REVIEW' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); testBot(bot.id) }}
                      disabled={testingBotId === bot.id}
                      className="flex items-center gap-1.5 text-xs font-semibold text-green-500 hover:text-green-400 transition-colors mb-2"
                    >
                      {testingBotId === bot.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3" />
                      )}
                      {testingBotId === bot.id ? 'Ativando bot...' : 'Testar conexão do bot e ativar'}
                    </button>
                  )}

                  {/* t.me link */}
                  {bot?.status === 'ACTIVE' && (
                    <a
                      href={`https://t.me/${bot.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-[#E50914] hover:underline mb-2"
                    >
                      <ExternalLink className="h-3 w-3" />
                      t.me/{bot.username}
                    </a>
                  )}

                  {/* bottom row */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#222]" onClick={e => e.stopPropagation()}>
                    <span className="text-[11px] text-[#3A3A3A]">
                      {nodeCount === 0 ? 'Canvas vazio' : `${nodeCount} bloco${nodeCount !== 1 ? 's' : ''}`}
                    </span>
                    <div className="relative">
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === flow.id ? null : flow.id) }}
                        className="w-7 h-7 flex items-center justify-center rounded-[3px] text-[#444] hover:text-white hover:bg-[#2A2A2A] transition-colors"
                      >
                        {duplicatingId === flow.id || exportingId === flow.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <MoreVertical className="h-3.5 w-3.5" />
                        }
                      </button>
                      {openMenuId === flow.id && (
                        <div className="absolute bottom-8 right-0 w-44 bg-[#1A1A1A] border border-white/[0.08] rounded-[4px] shadow-xl z-10 overflow-hidden">
                          <button
                            onClick={() => handleDuplicate(flow)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-[#AAA] hover:text-white hover:bg-[#252525] transition-colors"
                          >
                            <Copy className="h-3.5 w-3.5" /> Duplicar
                          </button>
                          <button
                            onClick={() => handleExport(flow)}
                            disabled={exportingId === flow.id}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-[#AAA] hover:text-white hover:bg-[#252525] transition-colors disabled:opacity-50"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" /> Exportar .flow
                          </button>
                          <button
                            onClick={() => { setOpenMenuId(null); setMigrateFlow(flow) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-[#AAA] hover:text-white hover:bg-[#252525] transition-colors"
                          >
                            <Bot className="h-3.5 w-3.5" /> Migrar Bot
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
