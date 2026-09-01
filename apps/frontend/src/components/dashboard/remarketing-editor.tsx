'use client'

// Editor de remarketing (slots com temporizador, conteúdo, mídia e botões PIX).
// Extraído do construtor de fluxo pra ser reaproveitado também na aba dedicada
// de Remarketing do dashboard — por isso não depende do BuilderCtx (contexto
// que só existe dentro do construtor): workspaceId/flowId/botId chegam como
// props explícitas.

import { useRef, useState, useEffect } from 'react'
import {
  Loader2, X, Plus, Upload, Link2, Image, Video, Banknote, Repeat, Save,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

/** @deprecated Legado — fluxos antigos usam este formato em flow.config.remarketing */
export interface RemarketingConfig {
  enabled: boolean
  firstDelay: number
  interval: number
  stopAfter: number
  content: string
  mediaType: 'none' | 'image' | 'video'
  mediaData?: string
  mediaUrl?: string
  mediaName?: string
  buttons?: { label: string; type: string; value: string }[]
}

export interface RemarketingSlotConfig {
  enabled: boolean
  firstDelay: number   // minutos: para slot 0 = após fluxo; slots 1,2... = após slot anterior
  interval: number     // horas: intervalo entre reenvios dentro do slot
  stopAfter: number    // dias: parar de reenviar após X dias
  content: string
  mediaType: 'none' | 'image' | 'video'
  mediaData?: string
  mediaUrl?: string
  mediaName?: string
  buttons?: { label: string; type: string; value: string }[]
}

export const EMPTY_REMARKETING_SLOT: RemarketingSlotConfig = {
  enabled: false, firstDelay: 30, interval: 5, stopAfter: 3, content: '', mediaType: 'none', buttons: [],
}

export const REMARKETING_SLOT_COUNT = 10

// Monta os até REMARKETING_SLOT_COUNT slots a partir do config salvo no Flow —
// suporta o array multi-slot novo (flowConfig.remarketings), o formato legado
// de slot único (flowConfig.remarketing, migrado automaticamente pro slot 0) e
// fluxo sem nenhum remarketing configurado ainda (todos os slots vazios).
export function buildRemarketingSlots(flowConfig: any): RemarketingSlotConfig[] {
  const stored = flowConfig?.remarketings
  if (Array.isArray(stored)) {
    // Sempre mescla com EMPTY para garantir que campos novos (interval, stopAfter)
    // tenham defaults mesmo em slots salvos antes desses campos existirem
    const merge = (s: any) => s ? { ...EMPTY_REMARKETING_SLOT, ...s } : { ...EMPTY_REMARKETING_SLOT }
    return Array.from({ length: REMARKETING_SLOT_COUNT }, (_, i) => merge(stored[i]))
  }
  // Migração automática: formato legado → slot 0
  const legacy = flowConfig?.remarketing as any
  if (legacy) {
    return [
      {
        enabled:    !!legacy.enabled,
        firstDelay: legacy.firstDelay ?? 30,
        interval:   legacy.interval   ?? 5,
        stopAfter:  legacy.stopAfter  ?? 3,
        content:    legacy.content    ?? '',
        mediaType:  legacy.mediaType  ?? 'none',
        mediaData:  legacy.mediaData,
        mediaUrl:   legacy.mediaUrl,
        mediaName:  legacy.mediaName,
        buttons:    legacy.buttons    ?? [],
      },
      ...Array.from({ length: REMARKETING_SLOT_COUNT - 1 }, () => ({ ...EMPTY_REMARKETING_SLOT })),
    ]
  }
  return Array.from({ length: REMARKETING_SLOT_COUNT }, () => ({ ...EMPTY_REMARKETING_SLOT }))
}

// Cadência fixa do modelo cíclico (não é mais configurável por slot): 1º envio
// 30 min após o fluxo, depois 1 a cada 2 h ciclando pelas mensagens ativas, por
// 5 dias — ou até o lead bloquear o bot. A mensagem enviada se apaga em 1 h.

const MAX_PIX_BUTTONS = 3

// ─── Preview de mídia (com fallback pro file_id cacheado do Telegram) ─────────
//
// Fluxos antigos podem ter tido o fileData/fileUrl removido (limpeza de espaço),
// restando só o file_id já cacheado pro Telegram — que não é uma URL navegável
// direto. Nesse caso busca os bytes via proxy autenticado do backend, que resolve
// o file_id (com o token do bot, nunca exposto ao navegador) e devolve o arquivo.
function useMediaFallback(
  directSrc: string | undefined,
  cacheKey: string | undefined,
  workspaceId: string | undefined,
  flowId: string | undefined,
) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setResolvedUrl(null)
    if (directSrc || !cacheKey || !workspaceId || !flowId) { setLoading(false); return }
    let objectUrl: string | null = null
    let cancelled = false
    setLoading(true)
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
    fetch(`/api/workspaces/${workspaceId}/flows/${flowId}/media-preview?key=${encodeURIComponent(cacheKey)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => { if (!res.ok) throw new Error('not found'); return res.blob() })
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setResolvedUrl(objectUrl)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [directSrc, cacheKey, workspaceId, flowId])

  return { src: directSrc || resolvedUrl, loading }
}

function MediaUpload({
  accept, current, currentName, onFile, onUrl, urlValue, cacheKey, workspaceId, flowId,
}: {
  accept:       string
  current?:     string
  currentName?: string
  onFile:       (data: string, name: string) => void
  onUrl:        (url: string) => void
  urlValue?:    string
  cacheKey?:    string
  workspaceId?: string
  flowId?:      string
}) {
  const [mode, setMode] = useState<'upload' | 'url'>(current && !current.startsWith('http') ? 'upload' : urlValue ? 'url' : 'upload')
  const inputRef = useRef<HTMLInputElement>(null)
  const isImage  = accept.startsWith('image')

  // Fallback: quando não há fileData/fileUrl (limpo por otimização de espaço em
  // fluxos antigos), tenta resolver via file_id já cacheado pro Telegram.
  const { src: resolvedCurrent, loading: resolvingFallback } = useMediaFallback(current, cacheKey, workspaceId, flowId)

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
      <div className="flex rounded-[3px] border border-white/[0.06] overflow-hidden">
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
          {resolvingFallback ? (
            <div className="w-full h-20 rounded-[4px] border border-white/[0.06] bg-[#141414] flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-[#444]" />
              <span className="text-[11px] text-[#555]">Carregando prévia salva no Telegram...</span>
            </div>
          ) : resolvedCurrent && !resolvedCurrent.startsWith('http') ? (
            <div className="relative">
              {isImage ? (
                <img src={resolvedCurrent} className="w-full h-36 object-cover rounded-[4px] border border-white/[0.06]" />
              ) : (
                <video
                  src={resolvedCurrent}
                  controls
                  preload="metadata"
                  className="w-full h-36 object-cover rounded-[4px] border border-white/[0.06] bg-black"
                />
              )}
              {currentName && !isImage && (
                <p className="text-[11px] text-[#555] text-center mt-1.5 truncate max-w-full">{currentName}</p>
              )}
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-2 w-full h-8 rounded-[3px] border border-white/[0.06] bg-[#141414] text-xs text-[#666] hover:text-white hover:bg-[#1A1A1A] transition-all flex items-center justify-center gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" /> Trocar arquivo
              </button>
            </div>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full h-20 rounded-[4px] border-2 border-dashed border-white/[0.08] bg-[#141414] hover:border-white/[0.10] transition-all flex flex-col items-center justify-center gap-1.5"
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
            className="w-full h-9 rounded-[3px] border border-white/[0.06] bg-[#141414] px-3 text-xs text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#2563EB]/30 transition-all"
          />
          {current && current.startsWith('http') && (
            <div className="mt-2">
              {isImage ? (
                <img src={current} className="w-full h-36 object-cover rounded-[4px] border border-white/[0.06]" />
              ) : (
                <video
                  src={current}
                  controls
                  preload="metadata"
                  className="w-full h-36 object-cover rounded-[4px] border border-white/[0.06] bg-black"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RemarketingSlot({ number, data, onChange, workspaceId, flowId, botId }: {
  number:       number
  data:         RemarketingSlotConfig
  onChange:     (p: Partial<RemarketingSlotConfig>) => void
  workspaceId?: string
  flowId?:      string
  botId?:       string
}) {
  const remarketingCacheKey = botId ? `remarketing:slot:${number - 1}` : undefined
  const enabled    = data.enabled
  const color      = enabled ? '#2563EB' : '#333'
  const hasContent = data.content || data.mediaType !== 'none' || (data.buttons && data.buttons.length > 0)

  return (
    <div className="rounded-[4px] overflow-hidden" style={{ border: `1px solid ${enabled ? '#2563EB33' : '#1E1E1E'}`, background: '#0D0D0D' }}>
      {/* header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors"
            style={{ background: enabled ? '#2563EB22' : '#1A1A1A', color, border: `1.5px solid ${color}` }}>
            {number}
          </div>
          <span className="text-xs font-semibold" style={{ color: enabled ? '#E0E0E0' : '#444' }}>
            Remarketing {number}
          </span>
          {enabled && hasContent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2563EB18', color: '#2563EB' }}>
              ✓ Configurado
            </span>
          )}
          {enabled && !hasContent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#EF444418', color: '#EF4444' }}>
              Sem conteúdo
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange({ enabled: !enabled })}
          className="relative w-9 h-5 rounded-full transition-colors shrink-0"
          style={{ background: enabled ? '#2563EB' : '#2A2A2A' }}
        >
          <span className="absolute top-0.5 transition-all rounded-full w-4 h-4 bg-white"
            style={{ left: enabled ? '18px' : '2px' }} />
        </button>
      </div>

      {/* fields */}
      {enabled && (
        <div className="px-3 pb-3 space-y-3" style={{ borderTop: '1px solid #1A1A1A' }}>

          {/* Content type */}
          <div>
            <label className="text-[10px] font-bold text-[#444] uppercase tracking-widest block mb-1.5">Conteúdo</label>
            <div className="flex gap-1.5 mb-2">
              {(['text', 'image', 'video'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => onChange({ mediaType: t === 'text' ? 'none' : t, mediaData: '', mediaUrl: '', mediaName: '' })}
                  className={`flex-1 h-7 rounded-[3px] text-[10px] font-semibold transition-all border ${
                    (t === 'text' ? data.mediaType === 'none' : data.mediaType === t)
                      ? 'bg-[#1E1E1E] text-white border-white/[0.10]'
                      : 'bg-[#141414] text-[#444] border-white/[0.06]'
                  }`}
                >
                  {t === 'text' ? '💬 Texto' : t === 'image' ? '🖼 Imagem' : '🎬 Vídeo'}
                </button>
              ))}
            </div>

            <textarea
              value={data.content}
              onChange={e => onChange({ content: e.target.value })}
              placeholder="Digite a mensagem..."
              rows={3}
              className="w-full px-3 py-2 rounded-[3px] text-xs text-white placeholder-[#2A2A2A] outline-none resize-none"
              style={{ background: '#151515', border: '1px solid #222' }}
            />

            {(data.mediaType === 'image' || data.mediaType === 'video') && (
              <div className="mt-2">
                <MediaUpload
                  accept={data.mediaType === 'image' ? 'image/*' : 'video/mp4,video/mov,video/avi,video/mkv,video/webm'}
                  current={data.mediaData || data.mediaUrl}
                  currentName={data.mediaName}
                  onFile={(d, n) => onChange({ mediaData: d, mediaName: n, mediaUrl: '' })}
                  onUrl={u => onChange({ mediaUrl: u, mediaData: '', mediaName: '' })}
                  urlValue={data.mediaUrl}
                  cacheKey={remarketingCacheKey}
                  workspaceId={workspaceId}
                  flowId={flowId}
                />
              </div>
            )}
          </div>

          {/* PIX Buttons */}
          <div className="pt-2" style={{ borderTop: '1px solid #1A1A1A' }}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-[#444] uppercase tracking-widest flex items-center gap-1.5">
                <Banknote className="h-3 w-3 text-[#00B37E]" />
                Botões PIX
              </label>
              {(data.buttons || []).length < MAX_PIX_BUTTONS && (
                <button
                  onClick={() => onChange({ buttons: [...(data.buttons || []), { label: '', type: 'pix', value: '' }] })}
                  className="flex items-center gap-1 text-[10px] text-[#00B37E] hover:text-[#00D48E] transition-colors font-semibold"
                >
                  <Plus className="h-3 w-3" /> Adicionar
                </button>
              )}
            </div>
            {(data.buttons || []).length === 0 && (
              <p className="text-[10px] text-[#2A2A2A] text-center py-1">Opcional</p>
            )}
            {(data.buttons || []).map((btn, i) => (
              <div key={i} className="bg-[#141414] border border-white/[0.06] rounded-[4px] p-2 mb-2">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[9px] font-bold text-[#333] uppercase tracking-wide">Pagamento {i + 1}</p>
                  <button onClick={() => onChange({ buttons: (data.buttons || []).filter((_, j) => j !== i) })}
                    className="text-[#333] hover:text-[#EF4444] transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <input
                  value={btn.label}
                  onChange={e => { const next = [...(data.buttons || [])]; next[i] = { ...next[i], label: e.target.value }; onChange({ buttons: next }) }}
                  placeholder="Ex: Plano Básico"
                  className="w-full h-7 px-2.5 rounded-[3px] text-[10px] text-white placeholder-[#2A2A2A] outline-none mb-1.5"
                  style={{ background: '#111', border: '1px solid #222' }}
                />
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#555] font-medium">R$</span>
                  <input
                    value={btn.value}
                    onChange={e => { const next = [...(data.buttons || [])]; next[i] = { ...next[i], value: e.target.value }; onChange({ buttons: next }) }}
                    placeholder="0,00" type="number" min="0" step="0.01"
                    className="w-full h-7 pl-8 pr-2.5 rounded-[3px] text-[10px] text-white placeholder-[#2A2A2A] outline-none"
                    style={{ background: '#111', border: '1px solid #222' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function RemarketingEditor({
  remarketings, onChange, onSave, onClose, saving, workspaceId, flowId, botId,
}: {
  remarketings: RemarketingSlotConfig[]
  onChange:     (slots: RemarketingSlotConfig[]) => void
  onSave:       () => void
  onClose:      () => void
  saving:       boolean
  workspaceId?: string
  flowId?:      string
  botId?:       string
}) {
  const update = (idx: number, patch: Partial<RemarketingSlotConfig>) => {
    const next = [...remarketings]
    next[idx]  = { ...next[idx], ...patch }
    onChange(next)
  }

  const enabledCount    = remarketings.filter(r => r.enabled).length
  const enabledIndices  = remarketings.reduce<number[]>((acc, r, i) => { if (r.enabled) acc.push(i); return acc }, [])

  return (
    <div className="flex flex-col">
      {/* header */}
      <div className="flex items-center justify-between gap-3 pb-4 mb-4 flex-wrap" style={{ borderBottom: '1px solid #1A1A1A' }}>
        <div>
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-[#2563EB]" />
            <p className="text-sm font-bold text-white">Remarketing</p>
            {enabledCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: '#2563EB22', color: '#2563EB' }}>
                {enabledCount} ativo{enabledCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#555] mt-1 max-w-md leading-relaxed">
            Depois que o fluxo completa, o bot manda a 1ª mensagem ativa em 30 min. A cada 2h envia a próxima, ciclando entre as ativas (volta pra 1ª ao terminar). Cada mensagem se apaga em 1h. Roda por 5 dias ou até o lead bloquear o bot.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onClose}
            className="h-9 px-4 rounded-[4px] text-xs font-semibold text-[#888] hover:text-white hover:bg-white/[0.04] transition-all">
            Cancelar
          </button>
          <button onClick={onSave} disabled={saving}
            className="h-9 px-4 rounded-[4px] text-sm font-semibold transition-all flex items-center justify-center gap-2 text-white"
            style={{ background: saving ? '#2563EB66' : '#2563EB' }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar Remarketing'}
          </button>
        </div>
      </div>

      {/* Sequence preview */}
      {enabledCount > 1 && (
        <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-[4px] flex-wrap mb-4" style={{ background: '#111', border: '1px solid #1A1A1A' }}>
          <span className="text-[9px] text-[#555] mr-1">A cada 2h:</span>
          {enabledIndices.map((idx, pos) => (
            <div key={idx} className="flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                  style={{ background: '#2563EB22', color: '#2563EB', border: '1px solid #2563EB44' }}>
                  {idx + 1}
                </div>
                <span className="text-[9px] text-[#555]">R{idx + 1}</span>
              </div>
              {pos < enabledIndices.length - 1 && (
                <span className="text-[10px] text-[#333]">→</span>
              )}
            </div>
          ))}
          <span className="text-[10px] text-[#2563EB]">↻ recomeça</span>
        </div>
      )}

      {/* slots — grade usando a largura toda da página, não mais coluna estreita */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
        {Array.from({ length: REMARKETING_SLOT_COUNT }, (_, i) => (
          <RemarketingSlot
            key={i}
            number={i + 1}
            data={remarketings[i]}
            onChange={p => update(i, p)}
            workspaceId={workspaceId}
            flowId={flowId}
            botId={botId}
          />
        ))}
      </div>
    </div>
  )
}
