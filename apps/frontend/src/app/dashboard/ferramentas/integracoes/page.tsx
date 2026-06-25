'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import {
  Loader2, Eye, EyeOff, CheckCircle2, XCircle,
  Zap, ShoppingCart, BadgeDollarSign, ToggleLeft, ToggleRight,
  Info, Wifi, Plus, Pencil, Trash2, Bot, AlertTriangle, CreditCard,
} from 'lucide-react'

// ─── UTMify Logo ──────────────────────────────────────────────────────────────
const UtmifyIcon = ({ size = 20 }: { size?: number }) => (
  <img
    src="/utmify_logo.jpg"
    alt="UTMify"
    width={size}
    height={size}
    style={{ borderRadius: 7, objectFit: 'cover', display: 'block' }}
  />
)

// ─── Facebook Logo SVG ─────────────────────────────────────────────────────────
const FbIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="7" fill="#1877F2" />
    <path
      d="M22 16h-4v-2c0-.9.7-1 1.3-1H22v-4h-3.2C15.4 9 14 11 14 13.5V16h-3v4h3v9h4v-9h2.7L22 16z"
      fill="white"
    />
  </svg>
)

// ─── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ configured, active, testOk }: { configured: boolean; active: boolean; testOk: boolean | null }) {
  if (!configured && !active) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/30 bg-white/[0.05] border border-white/[0.08] rounded-full px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-white/25" />
        Não configurado
      </span>
    )
  }
  if (!active) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/40 bg-white/[0.04] border border-white/[0.06] rounded-full px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
        Pausado
      </span>
    )
  }
  if (testOk === false) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2.5 py-1">
        <XCircle className="w-3 h-3" />
        Erro de conexão
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-medium text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
      Conectado
    </span>
  )
}

// ─── Event toggle row ──────────────────────────────────────────────────────────
function EventRow({
  icon: Icon,
  label,
  description,
  enabled,
  onChange,
  color = '#1877F2',
}: {
  icon: React.ElementType
  label: string
  description: string
  enabled: boolean
  onChange: (v: boolean) => void
  color?: string
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/[0.05] last:border-0">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-[3px]" style={enabled ? { backgroundColor: `${color}26` } : { backgroundColor: 'rgba(255,255,255,0.04)' }}>
          <Icon className="h-3.5 w-3.5" style={enabled ? { color } : { color: 'rgba(255,255,255,0.25)' }} />
        </div>
        <div>
          <p className={`text-xs font-semibold ${enabled ? 'text-white' : 'text-white/40'}`}>{label}</p>
          <p className="text-[11px] text-white/25 leading-none mt-0.5">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={`transition-colors ${enabled ? 'text-green-400' : 'text-white/20'}`}
      >
        {enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
      </button>
    </div>
  )
}

// ─── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3">
      {children}
    </p>
  )
}

// ─── Token input helper ────────────────────────────────────────────────────────
function TokenInput({
  value, onChange, tokenSuffix, error,
}: {
  value: string; onChange: (v: string) => void
  tokenSuffix?: string; error?: string
}) {
  const [show, setShow] = useState(false)
  const [changed, setChanged] = useState(false)

  const displayValue = changed ? value : tokenSuffix ? `••••••••••••${tokenSuffix}` : ''

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-white/50 font-medium">Access Token (CAPI)</label>
      <div className="relative">
        <input
          type={changed && !show ? 'password' : 'text'}
          value={displayValue}
          onChange={(e) => { setChanged(true); onChange(e.target.value) }}
          onFocus={() => { if (!changed && tokenSuffix) { setChanged(true); onChange('') } }}
          placeholder={tokenSuffix ? undefined : 'EAAb...'}
          className={[
            'w-full bg-white/[0.04] border rounded-[3px] px-3 py-2.5 pr-10 text-sm focus:outline-none transition-colors',
            !changed && tokenSuffix ? 'text-white/40 font-mono' : 'text-white',
            error ? 'border-red-500/60' : 'border-white/[0.06] focus:border-[#1877F2]/50',
          ].join(' ')}
        />
        {changed && (
          <button type="button" onClick={() => setShow(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error
        ? <p className="text-[11px] text-red-400 flex items-center gap-1"><XCircle className="h-3 w-3" />{error}</p>
        : <p className="text-[11px] text-white/20 flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />Gere em: Gerenciador de Eventos {'>'} Configurações {'>'} Conversions API
            {tokenSuffix && !changed && <span className="ml-auto text-white/30 font-mono">••••••{tokenSuffix}</span>}
          </p>}
    </div>
  )
}

// ─── Pixel Form Modal ─────────────────────────────────────────────────────────
function PixelModal({
  pixel, bots, usedBotIds, onSave, onClose,
}: {
  pixel?: any
  bots: any[]
  usedBotIds: string[]
  onSave: (data: any) => Promise<void>
  onClose: () => void
}) {
  const isEdit = !!pixel

  const [name, setName] = useState(pixel?.name ?? '')
  const [pixelId, setPixelId] = useState(pixel?.pixelId ?? '')
  const [accessToken, setAccessToken] = useState('')
  const [botId, setBotId] = useState(pixel?.botId ?? '')
  const [isActive, setIsActive] = useState<boolean>(pixel?.isActive ?? true)
  const [eventPageView, setEventPageView] = useState<boolean>(pixel?.eventPageView ?? true)
  const [eventAddToCart, setEventAddToCart] = useState<boolean>(pixel?.eventAddToCart ?? true)
  const [eventPurchase, setEventPurchase] = useState<boolean>(pixel?.eventPurchase ?? true)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const validate = () => {
    const e: Record<string, string> = {}
    if (!pixelId.trim()) e.pixelId = 'Pixel ID é obrigatório'
    else if (!/^\d+$/.test(pixelId.trim())) e.pixelId = 'Apenas números'
    else if (pixelId.trim().length < 10 || pixelId.trim().length > 20) e.pixelId = 'Entre 10 e 20 dígitos'

    if (!isEdit && !accessToken.trim()) e.accessToken = 'Access Token é obrigatório'
    else if (accessToken.trim() && accessToken.trim().length < 50) e.accessToken = `Mínimo 50 caracteres (${accessToken.trim().length}/50)`

    if (!botId && !pixel?.needsBotAssignment) e.botId = 'Selecione um Bot'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    setError('')
    try {
      const payload: any = {
        name: name.trim() || undefined,
        pixelId: pixelId.trim(),
        botId: botId || undefined,
        isActive, eventPageView, eventAddToCart, eventPurchase,
      }
      if (accessToken.trim()) payload.accessToken = accessToken.trim()
      await onSave(payload)
      onClose()
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar pixel')
    } finally {
      setSaving(false)
    }
  }

  const availableBots = bots.filter(b =>
    b.id === pixel?.botId || !usedBotIds.includes(b.id)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <FbIcon size={28} />
            <h3 className="text-white font-semibold">{isEdit ? 'Editar Pixel' : 'Adicionar Pixel'}</h3>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Nome */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">Nome do Pixel <span className="text-white/25">(opcional)</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Pixel Produto X"
              autoComplete="off"
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-[3px] px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#1877F2]/50" />
          </div>

          {/* Pixel ID */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">Pixel ID</label>
            <input value={pixelId} onChange={e => setPixelId(e.target.value)} placeholder="Ex: 1234567890123" inputMode="numeric"
              autoComplete="off"
              className={`w-full bg-white/[0.04] border rounded-[3px] px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none transition-colors ${errors.pixelId ? 'border-red-500/60' : 'border-white/[0.06] focus:border-[#1877F2]/50'}`} />
            {errors.pixelId
              ? <p className="text-[11px] text-red-400 flex items-center gap-1"><XCircle className="h-3 w-3" />{errors.pixelId}</p>
              : <p className="text-[11px] text-white/20 flex items-center gap-1"><Info className="h-3 w-3 shrink-0" />Gerenciador de Eventos {'>'} Pixel</p>}
          </div>

          {/* Token */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">
              Access Token (CAPI){isEdit && <span className="text-white/25 ml-1">(deixe em branco para manter)</span>}
            </label>
            <div className="relative">
              <input
                type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)}
                placeholder={isEdit ? `••••••${pixel?.tokenSuffix || ''}` : 'EAAb...'}
                autoComplete="new-password"
                className={`w-full bg-white/[0.04] border rounded-[3px] px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none transition-colors ${errors.accessToken ? 'border-red-500/60' : 'border-white/[0.06] focus:border-[#1877F2]/50'}`}
              />
            </div>
            {errors.accessToken && <p className="text-[11px] text-red-400 flex items-center gap-1"><XCircle className="h-3 w-3" />{errors.accessToken}</p>}
          </div>

          {/* Bot */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">Bot Vinculado</label>
            {pixel?.needsBotAssignment && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-[3px] mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <p className="text-[11px] text-amber-400">Pixel migrado — selecione um Bot para ativar o envio por bot</p>
              </div>
            )}
            <select value={botId} onChange={e => setBotId(e.target.value)}
              className={`w-full appearance-none bg-[#1a1a1a] border rounded-[3px] px-3 py-2.5 text-sm text-white focus:outline-none transition-colors ${errors.botId ? 'border-red-500/60' : 'border-white/[0.06] focus:border-[#1877F2]/50'}`}>
              <option value="" className="bg-[#1a1a1a]">{pixel?.needsBotAssignment ? 'Selecione um Bot (opcional)' : 'Selecione um Bot'}</option>
              {availableBots.map(b => (
                <option key={b.id} value={b.id} className="bg-[#1a1a1a]">@{b.username}</option>
              ))}
            </select>
            {errors.botId && <p className="text-[11px] text-red-400 flex items-center gap-1"><XCircle className="h-3 w-3" />{errors.botId}</p>}
          </div>

          {/* Eventos */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">Eventos ativos</label>
            <div className="rounded-[4px] border border-white/[0.06] bg-white/[0.02] px-4 py-1">
              <EventRow icon={Zap} label="PageView" description="Link de redirecionamento acessado" enabled={eventPageView} onChange={setEventPageView} />
              <EventRow icon={ShoppingCart} label="AddToCart" description="PIX gerado" enabled={eventAddToCart} onChange={setEventAddToCart} />
              <EventRow icon={BadgeDollarSign} label="Purchase" description="Venda aprovada" enabled={eventPurchase} onChange={setEventPurchase} />
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-white/60">Pixel ativo</span>
            <button type="button" onClick={() => setIsActive((v: boolean) => !v)} className={`transition-colors ${isActive ? 'text-green-400' : 'text-white/20'}`}>
              {isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            </button>
          </div>

          {error && (
            <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-[3px] px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.06] flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-[3px] border border-white/[0.1] text-white/60 hover:text-white text-sm transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-[#1877F2] hover:bg-[#1565d0] disabled:opacity-50 text-white text-sm font-semibold rounded-[3px] transition-colors flex items-center justify-center gap-2">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</> : isEdit ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Facebook Integration — multi-pixel
// ═══════════════════════════════════════════════════════════════════════════════
function FacebookIntegration({ workspaceId }: { workspaceId: string }) {
  const [pixels, setPixels] = useState<any[]>([])
  const [bots, setBots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; pixel?: any }>({ open: false })
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pixelData, botData] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/facebook/pixels`),
        api.get(`/workspaces/${workspaceId}/bots`),
      ])
      setPixels(Array.isArray(pixelData) ? pixelData : [])
      setBots(Array.isArray(botData) ? botData : [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  // Bot pode ter múltiplos pixels — sem restrição de seleção
  const usedBotIds: string[] = []

  const handleCreate = async (data: any) => {
    const created = await api.post(`/workspaces/${workspaceId}/facebook/pixels`, data)
    setPixels(prev => [...prev, created])
  }

  const handleUpdate = async (data: any) => {
    const updated = await api.patch(`/workspaces/${workspaceId}/facebook/pixels/${modal.pixel.id}`, data)
    setPixels(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  const handleDelete = async (pixelId: string) => {
    if (!confirm('Remover este Pixel? Os eventos deixarão de ser enviados para ele.')) return
    setDeletingId(pixelId)
    try {
      await api.delete(`/workspaces/${workspaceId}/facebook/pixels/${pixelId}`)
      setPixels(prev => prev.filter(p => p.id !== pixelId))
    } catch (e: any) {
      alert(e.message || 'Erro ao remover pixel')
    } finally {
      setDeletingId(null)
    }
  }

  const handleTest = async (pixelId: string) => {
    setTestingId(pixelId)
    setTestResults(prev => { const n = { ...prev }; delete n[pixelId]; return n })
    try {
      const res = await api.post(`/workspaces/${workspaceId}/facebook/pixels/${pixelId}/test`, {})
      setTestResults(prev => ({ ...prev, [pixelId]: { ok: res.connected, message: res.message } }))
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [pixelId]: { ok: false, message: e.message || 'Erro ao testar' } }))
    } finally {
      setTestingId(null)
    }
  }

  const handleToggleActive = async (pixel: any) => {
    const updated = await api.patch(`/workspaces/${workspaceId}/facebook/pixels/${pixel.id}`, {
      isActive: !pixel.isActive,
    })
    setPixels(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    )
  }

  const atLimit = pixels.length >= 5

  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <FbIcon size={36} />
          <div>
            <h2 className="text-white font-semibold text-base leading-none">Facebook Ads</h2>
            <p className="text-xs text-white/35 mt-0.5">Conversions API (CAPI) · {pixels.length}/5 pixels</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => !atLimit && setModal({ open: true })}
          disabled={atLimit}
          title={atLimit ? 'Limite máximo de 5 Pixels por conta atingido' : 'Adicionar Pixel'}
          className="flex items-center gap-2 px-4 py-2 rounded-[3px] bg-[#1877F2] hover:bg-[#1565d0] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" /> Adicionar Pixel
        </button>
      </div>

      {/* Limit warning */}
      {atLimit && (
        <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-[4px]">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400">Limite máximo de 5 Pixels por conta atingido.</p>
        </div>
      )}

      {/* Pixel list */}
      <div className="px-6 py-5 space-y-3">
        {pixels.length === 0 ? (
          <div className="text-center py-12">
            <FbIcon size={40} />
            <p className="text-white/40 text-sm mt-4">Nenhum Pixel configurado</p>
            <p className="text-white/25 text-xs mt-1">Clique em "Adicionar Pixel" para começar</p>
          </div>
        ) : (
          pixels.map(pixel => {
            const testResult = testResults[pixel.id]
            const isTesting = testingId === pixel.id
            const isDeleting = deletingId === pixel.id
            const bot = bots.find(b => b.id === pixel.botId)

            return (
              <div
                key={pixel.id}
                className={[
                  'rounded-[4px] border bg-white/[0.02] p-4 transition-colors',
                  testResult?.ok === false
                    ? 'border-red-500/20'
                    : pixel.isActive
                      ? 'border-green-500/15'
                      : 'border-white/[0.06]',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Nome + status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-semibold truncate">
                        {pixel.name || `Pixel ${pixel.pixelId.slice(-6)}`}
                      </span>
                      {pixel.needsBotAssignment && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" /> Sem bot
                        </span>
                      )}
                      {pixel.isActive ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                          <span className="w-1 h-1 rounded-full bg-green-400" /> Ativo
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/30 bg-white/[0.04] border border-white/[0.06] rounded-full px-2 py-0.5">Inativo</span>
                      )}
                    </div>

                    {/* Metadados */}
                    <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-white/35 font-mono">ID: {pixel.pixelId}</span>
                      {pixel.tokenSuffix && (
                        <span className="text-xs text-white/25 font-mono">Token: ••••••{pixel.tokenSuffix}</span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-white/35">
                        <Bot className="h-3 w-3" />
                        {bot ? `@${bot.username}` : <span className="text-amber-400/70">Sem bot vinculado</span>}
                      </span>
                    </div>

                    {/* Eventos */}
                    <div className="mt-2 flex items-center gap-2">
                      {[
                        { key: 'eventPageView', label: 'PageView' },
                        { key: 'eventAddToCart', label: 'AddToCart' },
                        { key: 'eventPurchase', label: 'Purchase' },
                      ].map(({ key, label }) => (
                        <span key={key} className={`text-[10px] rounded px-1.5 py-0.5 ${pixel[key] ? 'bg-[#1877F2]/15 text-[#1877F2]' : 'bg-white/[0.04] text-white/20 line-through'}`}>
                          {label}
                        </span>
                      ))}
                    </div>

                    {/* Test result */}
                    {testResult && (
                      <div className={`mt-2 flex items-center gap-1.5 text-xs ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {testResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {testResult.message}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(pixel)}
                      className={`p-2 rounded-[3px] transition-colors ${pixel.isActive ? 'text-green-400' : 'text-white/20'}`}
                      title={pixel.isActive ? 'Desativar' : 'Ativar'}
                    >
                      {pixel.isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTest(pixel.id)}
                      disabled={isTesting}
                      className="p-2 rounded-[3px] text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                      title="Testar conexão"
                    >
                      {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ open: true, pixel })}
                      className="p-2 rounded-[3px] text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(pixel.id)}
                      disabled={isDeleting}
                      className="p-2 rounded-[3px] text-white/30 hover:text-red-400 hover:bg-red-500/[0.08] transition-colors disabled:opacity-40"
                      title="Remover"
                    >
                      {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal */}
      {modal.open && (
        <PixelModal
          pixel={modal.pixel}
          bots={bots}
          usedBotIds={usedBotIds}
          onSave={modal.pixel ? handleUpdate : handleCreate}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Página principal
// ═══════════════════════════════════════════════════════════════════════════════
export default function IntegracoesPage() {
  const { workspaceId } = useAuthStore()

  return (
    <div>
      <PageHeader title="Integrações" description="Gateways e conexões" />

      <Tabs defaultValue="facebook" className="space-y-6">
        <TabsList>
          <TabsTrigger value="facebook">Facebook Ads</TabsTrigger>
          <TabsTrigger value="kwai">Kwai Ads</TabsTrigger>
          <TabsTrigger value="utmify">UTMify</TabsTrigger>
        </TabsList>

        <TabsContent value="facebook">
          <FacebookIntegration workspaceId={workspaceId!} />
        </TabsContent>
        <TabsContent value="kwai">
          <KwaiIntegration workspaceId={workspaceId!} />
        </TabsContent>
        <TabsContent value="utmify">
          <UtmifyIntegration workspaceId={workspaceId!} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Outras abas — inalteradas
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Kwai Logo ────────────────────────────────────────────────────────────────
const KwaiIcon = ({ size = 20 }: { size?: number }) => (
  <img
    src="/kwai-logo.jpg"
    alt="Kwai"
    width={size}
    height={size}
    style={{ borderRadius: 7, objectFit: 'cover', display: 'block' }}
  />
)

// ─── Kwai Account Modal ───────────────────────────────────────────────────────
function KwaiAccountModal({
  account,
  bots,
  onSave,
  onClose,
}: {
  account?: any
  bots: any[]
  onSave: (data: any) => Promise<void>
  onClose: () => void
}) {
  const isEdit = !!account
  const [name, setName] = useState(account?.name || '')
  const [pixelId, setPixelId] = useState(account?.pixelId || '')
  const [tokenInput, setTokenInput] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [testTokenInput, setTestTokenInput] = useState('')
  const [showTestToken, setShowTestToken] = useState(false)
  const [botId, setBotId] = useState(account?.botId || '')
  const [isActive, setIsActive] = useState(account?.isActive ?? true)
  const [eventAddToCart, setEventAddToCart] = useState(account?.eventAddToCart ?? true)
  const [eventPurchase, setEventPurchase] = useState(account?.eventPurchase ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pixelId.trim()) { setError('Pixel ID é obrigatório'); return }
    if (!isEdit && !tokenInput.trim()) { setError('Access Token é obrigatório'); return }
    setSaving(true)
    setError('')
    try {
      const payload: any = {
        name: name.trim() || undefined,
        pixelId: pixelId.trim(),
        botId: botId || null,
        isActive,
        eventAddToCart,
        eventPurchase,
      }
      if (tokenInput.trim())     payload.accessToken = tokenInput.trim()
      if (testTokenInput.trim()) payload.testToken   = testTokenInput.trim()
      await onSave(payload)
      onClose()
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#141414] border border-white/[0.08] rounded-[6px] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <h3 className="text-white font-semibold text-sm">{isEdit ? 'Editar Conta Kwai' : 'Adicionar Conta Kwai'}</h3>
          <button type="button" onClick={onClose} className="text-white/30 hover:text-white transition-colors text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Nome */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">Nome <span className="text-white/20">(opcional)</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex: Campanha Principal"
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-[3px] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#FFC200]/50 transition-colors"
            />
          </div>

          {/* Pixel ID */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">Pixel ID</label>
            <input
              type="text"
              value={pixelId}
              onChange={e => setPixelId(e.target.value)}
              placeholder="Seu Kwai Pixel ID"
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-[3px] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#FFC200]/50 transition-colors"
            />
            <p className="text-[11px] text-white/20 flex items-center gap-1">
              <Info className="h-3 w-3 shrink-0" />Encontrado no painel AdsNebula
            </p>
          </div>

          {/* Access Token */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">
              Access Token {isEdit && <span className="text-white/20">(deixe vazio para manter o atual)</span>}
            </label>
            {isEdit && account?.tokenSuffix && !tokenInput && (
              <p className="text-xs text-white/30 font-mono">Token atual: ••••••••••••{account.tokenSuffix}</p>
            )}
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder={isEdit ? 'Novo token (opcional)' : 'Cole seu Access Token aqui'}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-[3px] px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-[#FFC200]/50 transition-colors"
              />
              <button type="button" onClick={() => setShowToken((v: boolean) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors">
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-white/20 flex items-center gap-1">
              <Info className="h-3 w-3 shrink-0" />AdsNebula › Pixels › API Token
            </p>
          </div>

          {/* Token de Teste */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">
              Token de Teste <span className="text-white/20">(necessário para testar)</span>
            </label>
            {isEdit && account?.testTokenSuffix && !testTokenInput && (
              <p className="text-xs text-white/30 font-mono">Token atual: ••••••••••••{account.testTokenSuffix}</p>
            )}
            <div className="relative">
              <input
                type={showTestToken ? 'text' : 'password'}
                value={testTokenInput}
                onChange={e => setTestTokenInput(e.target.value)}
                placeholder={isEdit ? 'Novo token de teste (opcional)' : 'Token de teste gerado pelo Kwai'}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-[3px] px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-[#FFC200]/50 transition-colors"
              />
              <button type="button" onClick={() => setShowTestToken((v: boolean) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors">
                {showTestToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-white/20 flex items-center gap-1">
              <Info className="h-3 w-3 shrink-0" />Painel Kwai › Pixels › Testar Eventos › Gerar Token
            </p>
          </div>

          {/* Bot */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">Bot vinculado <span className="text-white/20">(opcional)</span></label>
            <select
              value={botId}
              onChange={e => setBotId(e.target.value)}
              className="w-full appearance-none bg-[#1a1a1a] border border-white/[0.06] rounded-[3px] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#FFC200]/50 transition-colors"
            >
              <option value="" className="bg-[#1a1a1a] text-white">Nenhum (todos os bots)</option>
              {bots.map(b => <option key={b.id} value={b.id} className="bg-[#1a1a1a] text-white">@{b.username}</option>)}
            </select>
          </div>

          {/* Eventos */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">Eventos</label>
            <div className="rounded-[4px] border border-white/[0.06] bg-white/[0.02] px-4 py-1">
              <EventRow icon={ShoppingCart} label="AddToCart" description="PIX gerado" enabled={eventAddToCart} onChange={setEventAddToCart} color="#FFC200" />
              <EventRow icon={BadgeDollarSign} label="Purchase" description="PIX aprovado" enabled={eventPurchase} onChange={setEventPurchase} color="#FFC200" />
            </div>
          </div>

          {/* Ativo */}
          <div className="flex items-center justify-between py-2 border-t border-white/[0.05]">
            <span className="text-xs text-white/50 font-medium">Ativar integração</span>
            <button type="button" onClick={() => setIsActive((v: boolean) => !v)} className={`transition-colors ${isActive ? 'text-green-400' : 'text-white/20'}`}>
              {isActive ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
            </button>
          </div>

          {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-[3px] px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-white/[0.08] text-white/50 hover:text-white text-sm rounded-[3px] transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#FFC200] hover:bg-[#FFD140] disabled:opacity-50 text-black text-sm font-semibold rounded-[3px] transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</> : isEdit ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Kwai Multi-Conta ─────────────────────────────────────────────────────────
function KwaiIntegration({ workspaceId }: { workspaceId: string }) {
  const [accounts, setAccounts] = useState<any[]>([])
  const [bots, setBots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; account?: any }>({ open: false })
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [accountData, botData] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/kwai/accounts`),
        api.get(`/workspaces/${workspaceId}/bots`),
      ])
      setAccounts(Array.isArray(accountData) ? accountData : [])
      setBots(Array.isArray(botData) ? botData : [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  const handleCreate = async (data: any) => {
    const created = await api.post(`/workspaces/${workspaceId}/kwai/accounts`, data)
    setAccounts(prev => [...prev, created])
  }

  const handleUpdate = async (data: any) => {
    const updated = await api.patch(`/workspaces/${workspaceId}/kwai/accounts/${modal.account.id}`, data)
    setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a))
  }

  const handleDelete = async (accountId: string) => {
    if (!confirm('Remover esta conta Kwai? Os eventos deixarão de ser enviados para ela.')) return
    setDeletingId(accountId)
    try {
      await api.delete(`/workspaces/${workspaceId}/kwai/accounts/${accountId}`)
      setAccounts(prev => prev.filter(a => a.id !== accountId))
    } catch (e: any) {
      alert(e.message || 'Erro ao remover conta')
    } finally {
      setDeletingId(null)
    }
  }

  const handleTest = async (accountId: string) => {
    setTestingId(accountId)
    setTestResults(prev => { const n = { ...prev }; delete n[accountId]; return n })
    try {
      const res = await api.post(`/workspaces/${workspaceId}/kwai/accounts/${accountId}/test`, {})
      setTestResults(prev => ({ ...prev, [accountId]: { ok: res.ok, message: res.message } }))
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [accountId]: { ok: false, message: e.message || 'Erro ao testar' } }))
    } finally {
      setTestingId(null)
    }
  }

  const handleToggleActive = async (account: any) => {
    const next = !account.isActive
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, isActive: next } : a))
    try {
      const updated = await api.patch(`/workspaces/${workspaceId}/kwai/accounts/${account.id}`, { isActive: next })
      setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a))
    } catch {
      setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, isActive: account.isActive } : a))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    )
  }

  const atLimit = accounts.length >= 5

  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <KwaiIcon size={36} />
          <div>
            <h2 className="text-white font-semibold text-base leading-none">Kwai Ads</h2>
            <p className="text-xs text-white/35 mt-0.5">Conversions API via AdsNebula · {accounts.length}/5 contas</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => !atLimit && setModal({ open: true })}
          disabled={atLimit}
          title={atLimit ? 'Limite máximo de 5 contas por workspace atingido' : 'Adicionar Conta'}
          className="flex items-center gap-2 px-4 py-2 rounded-[3px] bg-[#FFC200] hover:bg-[#FFD140] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" /> Adicionar Conta
        </button>
      </div>

      {/* Limit warning */}
      {atLimit && (
        <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-[4px]">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400">Limite máximo de 5 contas por workspace atingido.</p>
        </div>
      )}

      {/* Account list */}
      <div className="px-6 py-5 space-y-3">
        {accounts.length === 0 ? (
          <div className="text-center py-12">
            <KwaiIcon size={40} />
            <p className="text-white/40 text-sm mt-4">Nenhuma conta configurada</p>
            <p className="text-white/25 text-xs mt-1">Clique em "Adicionar Conta" para começar</p>
          </div>
        ) : (
          accounts.map(account => {
            const testResult = testResults[account.id]
            const isTesting = testingId === account.id
            const isDeleting = deletingId === account.id
            const bot = bots.find(b => b.id === account.botId)

            return (
              <div
                key={account.id}
                className={[
                  'rounded-[4px] border bg-white/[0.02] p-4 transition-colors',
                  testResult?.ok === false
                    ? 'border-red-500/20'
                    : account.isActive
                      ? 'border-[#FFC200]/15'
                      : 'border-white/[0.06]',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Nome + status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-semibold truncate">
                        {account.name || `Pixel ••••${account.pixelId?.slice(-4) || '----'}`}
                      </span>
                      {account.isActive ? (
                        <span className="flex items-center gap-1 text-[10px] text-[#FFC200] bg-[#FFC200]/10 border border-[#FFC200]/20 rounded-full px-2 py-0.5">
                          <span className="w-1 h-1 rounded-full bg-[#FFC200]" /> Ativo
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/30 bg-white/[0.04] border border-white/[0.06] rounded-full px-2 py-0.5">Inativo</span>
                      )}
                    </div>

                    {/* Metadados */}
                    <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                      {account.pixelId && (
                        <span className="text-xs text-white/25 font-mono">Pixel: {account.pixelId}</span>
                      )}
                      {account.tokenSuffix && (
                        <span className="text-xs text-white/25 font-mono">Token: ••••••{account.tokenSuffix}</span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-white/35">
                        <Bot className="h-3 w-3" />
                        {bot ? `@${bot.username}` : <span className="text-white/25">Todos os bots</span>}
                      </span>
                    </div>

                    {/* Eventos */}
                    <div className="mt-2 flex items-center gap-2">
                      {[
                        { key: 'eventAddToCart', label: 'AddToCart' },
                        { key: 'eventPurchase',  label: 'Purchase'  },
                      ].map(({ key, label }) => (
                        <span key={key} className={`text-[10px] rounded px-1.5 py-0.5 ${account[key] ? 'bg-[#FFC200]/15 text-[#FFC200]' : 'bg-white/[0.04] text-white/20 line-through'}`}>
                          {label}
                        </span>
                      ))}
                    </div>

                    {/* Test result */}
                    {testResult && (
                      <div className={`mt-2 flex items-center gap-1.5 text-xs ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {testResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {testResult.message}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(account)}
                      className={`p-2 rounded-[3px] transition-colors ${account.isActive ? 'text-green-400' : 'text-white/20'}`}
                      title={account.isActive ? 'Desativar' : 'Ativar'}
                    >
                      {account.isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTest(account.id)}
                      disabled={isTesting}
                      className="p-2 rounded-[3px] text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                      title="Testar conexão"
                    >
                      {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ open: true, account })}
                      className="p-2 rounded-[3px] text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(account.id)}
                      disabled={isDeleting}
                      className="p-2 rounded-[3px] text-white/30 hover:text-red-400 hover:bg-red-500/[0.08] transition-colors disabled:opacity-40"
                      title="Remover"
                    >
                      {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal */}
      {modal.open && (
        <KwaiAccountModal
          account={modal.account}
          bots={bots}
          onSave={modal.account ? handleUpdate : handleCreate}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Adquirentes PIX — PodPay + PixzyPay
// ═══════════════════════════════════════════════════════════════════════════════

const CREDENTIAL_STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  VALID:         { label: 'Conectado',      color: 'text-green-400',   dot: 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]' },
  INVALID:       { label: 'Erro de conexão',color: 'text-red-400',     dot: 'bg-red-400' },
  UNSTABLE:      { label: 'Instável',       color: 'text-amber-400',   dot: 'bg-amber-400' },
  UNCONFIGURED:  { label: 'Não configurado',color: 'text-white/30',    dot: 'bg-white/25' },
}

interface AcquirerCardProps {
  slug: string
  title: string
  subtitle: string
  color: string
  acquirer: any | null
  showEnvironment?: boolean
  onReload: () => void
}

function AcquirerCard({ slug, title, subtitle, color, acquirer, showEnvironment, onReload }: AcquirerCardProps) {
  const [apiKey, setApiKey] = useState('')
  const [apiKeyChanged, setApiKeyChanged] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [environment, setEnvironment] = useState<string>(acquirer?.environment ?? 'production')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveOk, setSaveOk] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    if (acquirer) setEnvironment(acquirer.environment ?? 'production')
  }, [acquirer])

  const credStatus = CREDENTIAL_STATUS_LABELS[acquirer?.credentialStatus ?? 'UNCONFIGURED']
  const isActive   = acquirer?.isActive ?? false
  const borderColor = testResult?.ok === false ? 'border-red-500/25'
    : acquirer?.credentialStatus === 'VALID' ? `border-[${color}]/20`
    : 'border-white/[0.06]'

  const handleSave = async () => {
    if (!acquirer && !apiKey.trim()) { setSaveError('Informe a API Key'); return }
    setSaving(true); setSaveError(''); setSaveOk(false)
    try {
      if (!acquirer) {
        // Criar novo adquirente
        await api.post('/admin/acquirers', {
          name: title, slug,
          apiKey: apiKey.trim(),
          environment: environment || 'production',
          priority: slug === 'podpay' ? 0 : 1,
          isActive: false,
        })
      } else {
        const payload: any = { environment }
        if (apiKeyChanged && apiKey.trim()) payload.apiKey = apiKey.trim()
        await api.patch(`/admin/acquirers/${acquirer.id}`, payload)
      }
      setApiKey(''); setApiKeyChanged(false)
      setSaveOk(true); setTimeout(() => setSaveOk(false), 3000)
      onReload()
    } catch (e: any) {
      setSaveError(e.message || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const handleTest = async () => {
    if (!acquirer) { setSaveError('Salve as credenciais antes de testar'); return }
    setTesting(true); setTestResult(null)
    try {
      const res = await api.post(`/admin/acquirers/${acquirer.id}/validate`, {})
      setTestResult({ ok: res.success, message: res.message })
      onReload()
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message || 'Erro ao testar' })
    } finally { setTesting(false) }
  }

  const handleToggle = async () => {
    if (!acquirer) return
    setToggling(true)
    try {
      await api.patch(`/admin/acquirers/${acquirer.id}`, { isActive: !isActive })
      onReload()
    } catch { /* silent */ }
    finally { setToggling(false) }
  }

  const apiKeyDisplay = apiKeyChanged
    ? apiKey
    : acquirer?.credentialStatus !== 'UNCONFIGURED' ? '••••••••••••••••••••' : ''

  return (
    <div className={`rounded-[4px] border ${borderColor} bg-[#141414] overflow-hidden transition-colors duration-500`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[4px] flex items-center justify-center font-bold text-sm"
               style={{ backgroundColor: `${color}20`, color }}>
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-base leading-none">{title}</h2>
            <p className="text-xs text-white/35 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-1 border ${
            acquirer?.credentialStatus === 'VALID'
              ? 'text-green-400 bg-green-500/10 border-green-500/20'
              : acquirer?.credentialStatus === 'INVALID'
              ? 'text-red-400 bg-red-500/10 border-red-500/20'
              : acquirer?.credentialStatus === 'UNSTABLE'
              ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              : 'text-white/30 bg-white/[0.05] border-white/[0.08]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${credStatus.dot}`} />
            {credStatus.label}
          </span>
          {acquirer && (
            <button
              type="button"
              onClick={handleToggle}
              disabled={toggling || acquirer.credentialStatus !== 'VALID'}
              title={acquirer.credentialStatus !== 'VALID' ? 'Valide as credenciais primeiro' : undefined}
              className={`transition-colors disabled:opacity-30 ${isActive ? 'text-green-400' : 'text-white/20'}`}
            >
              {toggling
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : isActive ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Credenciais */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3">Credenciais</p>
          <div className="space-y-3">

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-xs text-white/50 font-medium">
                API Token / Key
                {acquirer && acquirer.credentialStatus !== 'UNCONFIGURED' && (
                  <span className="text-white/25 ml-1">(deixe em branco para manter)</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={apiKeyChanged ? (showKey ? 'text' : 'password') : 'text'}
                  value={apiKeyDisplay}
                  onChange={e => { setApiKey(e.target.value); setApiKeyChanged(true); setTestResult(null) }}
                  onFocus={() => {
                    if (!apiKeyChanged && acquirer?.credentialStatus !== 'UNCONFIGURED') {
                      setApiKey(''); setApiKeyChanged(true)
                    }
                  }}
                  placeholder={acquirer?.credentialStatus !== 'UNCONFIGURED' ? undefined : 'Cole sua API Key aqui'}
                  className={[
                    'w-full bg-white/[0.04] border rounded-[3px] px-3 py-2.5 pr-10 text-sm',
                    'focus:outline-none transition-colors',
                    !apiKeyChanged && acquirer?.credentialStatus !== 'UNCONFIGURED'
                      ? 'text-white/40 font-mono'
                      : 'text-white',
                    `border-white/[0.06] focus:border-[${color}]/50`,
                  ].join(' ')}
                />
                {apiKeyChanged && (
                  <button type="button" onClick={() => setShowKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors">
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </div>

            {/* Ambiente — apenas PodPay tem sandbox */}
            {showEnvironment && (
              <div className="space-y-1.5">
                <label className="text-xs text-white/50 font-medium">Ambiente</label>
                <select
                  value={environment}
                  onChange={e => setEnvironment(e.target.value)}
                  className="w-full appearance-none bg-[#1a1a1a] border border-white/[0.06] rounded-[3px] px-3 py-2.5 text-sm text-white focus:outline-none"
                >
                  <option value="production" className="bg-[#1a1a1a]">Produção</option>
                  <option value="sandbox"    className="bg-[#1a1a1a]">Sandbox</option>
                </select>
              </div>
            )}

          </div>
        </div>

        {/* Feedback */}
        {saveError && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/[0.06] border border-red-500/20 rounded-[3px] px-3 py-2.5">
            <XCircle className="h-3.5 w-3.5 shrink-0" />{saveError}
          </div>
        )}
        {saveOk && (
          <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/[0.06] border border-green-500/20 rounded-[3px] px-3 py-2.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />Configuração salva com sucesso
          </div>
        )}
        {testResult && (
          <div className={`flex items-center gap-2 text-xs rounded-[3px] px-3 py-2.5 border ${
            testResult.ok
              ? 'text-green-400 bg-green-500/[0.06] border-green-500/20'
              : 'text-red-400 bg-red-500/[0.06] border-red-500/20'
          }`}>
            {testResult.ok
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              : <XCircle className="h-3.5 w-3.5 shrink-0" />}
            {testResult.message}
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !acquirer}
            title={!acquirer ? 'Salve as credenciais antes de testar' : undefined}
            className="flex items-center gap-2 px-4 py-2 rounded-[3px] border border-white/[0.06] text-white/50 hover:text-white hover:border-white/20 text-xs font-medium transition-colors disabled:opacity-40"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
            Testar conexão
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-[3px] text-white text-xs font-semibold transition-colors disabled:opacity-30 ml-auto"
            style={{ backgroundColor: color }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? 'Salvando...' : acquirer ? 'Salvar alterações' : 'Configurar'}
          </button>
        </div>

        {/* Info sobre fallback */}
        {acquirer?.credentialStatus === 'VALID' && acquirer?.isActive && (
          <div className="flex items-center gap-2 text-[11px] text-white/25 border border-white/[0.05] rounded-[3px] px-3 py-2">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Prioridade {acquirer.priority + 1} no fallback automático de cobranças PIX
          </div>
        )}
      </div>
    </div>
  )
}

function PixAcquirersIntegration() {
  const [acquirers, setAcquirers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/admin/acquirers')
      setAcquirers(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const podpay   = acquirers.find(a => a.slug === 'podpay')
  const pixzypay = acquirers.find(a => a.slug === 'pixzypay')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 px-4 py-3 bg-white/[0.03] border border-white/[0.05] rounded-[4px] text-xs text-white/30">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <p>Configure uma ou mais adquirentes. O sistema usa fallback automático por prioridade — se a primeira falhar, tenta a próxima. Ambas podem estar ativas simultaneamente.</p>
      </div>

      <AcquirerCard
        slug="podpay"
        title="PodPay"
        subtitle="Gateway de PIX via PodPay"
        color="#6366f1"
        acquirer={podpay ?? null}
        showEnvironment={true}
        onReload={load}
      />

      <AcquirerCard
        slug="pixzypay"
        title="PixzyPay"
        subtitle="Gateway de PIX via PixzyPay"
        color="#10b981"
        acquirer={pixzypay ?? null}
        showEnvironment={false}
        onReload={load}
      />
    </div>
  )
}

// ─── UTMify Account Modal ──────────────────────────────────────────────────────
function UtmifyAccountModal({
  account,
  bots,
  onSave,
  onClose,
}: {
  account?: any
  bots: any[]
  onSave: (data: any) => Promise<void>
  onClose: () => void
}) {
  const isEdit = !!account
  const [name, setName] = useState(account?.name || '')
  const [tokenInput, setTokenInput] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [botId, setBotId] = useState(account?.botId || '')
  const [isActive, setIsActive] = useState(account?.isActive ?? true)
  const [eventPixGerado, setEventPixGerado] = useState(account?.eventPixGerado ?? true)
  const [eventPixPago, setEventPixPago] = useState(account?.eventPixPago ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isEdit && tokenInput.trim().length < 20) {
      setError(`Token mínimo 20 caracteres (${tokenInput.trim().length}/20)`)
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload: any = {
        name: name.trim() || undefined,
        botId: botId || null,
        isActive,
        eventPixGerado,
        eventPixPago,
      }
      if (tokenInput.trim()) payload.apiToken = tokenInput.trim()
      await onSave(payload)
      onClose()
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#141414] border border-white/[0.08] rounded-[6px] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h3 className="text-white font-semibold text-sm">{isEdit ? 'Editar Conta UTMify' : 'Adicionar Conta UTMify'}</h3>
          <button type="button" onClick={onClose} className="text-white/30 hover:text-white transition-colors text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Nome */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">Nome <span className="text-white/20">(opcional)</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex: Produto Principal"
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-[3px] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#7C3AED]/50 transition-colors"
            />
          </div>

          {/* API Token */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">
              API Token {isEdit && <span className="text-white/20">(deixe vazio para manter o atual)</span>}
            </label>
            {isEdit && account?.tokenSuffix && !tokenInput && (
              <p className="text-xs text-white/30 font-mono">Token atual: ••••••••••••{account.tokenSuffix}</p>
            )}
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder={isEdit ? 'Novo token (opcional)' : 'Cole seu API Token aqui'}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-[3px] px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-[#7C3AED]/50 transition-colors"
              />
              <button type="button" onClick={() => setShowToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors">
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-white/20 flex items-center gap-1">
              <Info className="h-3 w-3 shrink-0" />UTMify → Integrações → Webhooks → Credenciais de API
            </p>
          </div>

          {/* Bot */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">Bot vinculado <span className="text-white/20">(opcional)</span></label>
            <select
              value={botId}
              onChange={e => setBotId(e.target.value)}
              className="w-full appearance-none bg-[#1a1a1a] border border-white/[0.06] rounded-[3px] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#7C3AED]/50 transition-colors"
            >
              <option value="" className="bg-[#1a1a1a] text-white">Nenhum (todos os bots)</option>
              {bots.map(b => <option key={b.id} value={b.id} className="bg-[#1a1a1a] text-white">@{b.username}</option>)}
            </select>
          </div>

          {/* Eventos */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium">Eventos</label>
            <div className="rounded-[4px] border border-white/[0.06] bg-white/[0.02] px-4 py-1">
              <EventRow icon={ShoppingCart} label="PIX Gerado" description="waiting_payment" enabled={eventPixGerado} onChange={setEventPixGerado} />
              <EventRow icon={BadgeDollarSign} label="PIX Aprovado" description="paid" enabled={eventPixPago} onChange={setEventPixPago} />
            </div>
          </div>

          {/* Ativo */}
          <div className="flex items-center justify-between py-2 border-t border-white/[0.05]">
            <span className="text-xs text-white/50 font-medium">Ativar integração</span>
            <button type="button" onClick={() => setIsActive((v: boolean) => !v)} className={`transition-colors ${isActive ? 'text-green-400' : 'text-white/20'}`}>
              {isActive ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
            </button>
          </div>

          {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-[3px] px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-white/[0.08] text-white/50 hover:text-white text-sm rounded-[3px] transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#7C3AED] hover:bg-[#6d28d9] disabled:opacity-50 text-white text-sm font-semibold rounded-[3px] transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</> : isEdit ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── UTMify Multi-Conta ────────────────────────────────────────────────────────
function UtmifyIntegration({ workspaceId }: { workspaceId: string }) {
  const [accounts, setAccounts] = useState<any[]>([])
  const [bots, setBots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; account?: any }>({ open: false })
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [accountData, botData] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/utmify/accounts`),
        api.get(`/workspaces/${workspaceId}/bots`),
      ])
      setAccounts(Array.isArray(accountData) ? accountData : [])
      setBots(Array.isArray(botData) ? botData : [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  const handleCreate = async (data: any) => {
    const created = await api.post(`/workspaces/${workspaceId}/utmify/accounts`, data)
    setAccounts(prev => [...prev, created])
  }

  const handleUpdate = async (data: any) => {
    const updated = await api.patch(`/workspaces/${workspaceId}/utmify/accounts/${modal.account.id}`, data)
    setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a))
  }

  const handleDelete = async (accountId: string) => {
    if (!confirm('Remover esta conta UTMify? Os eventos deixarão de ser enviados para ela.')) return
    setDeletingId(accountId)
    try {
      await api.delete(`/workspaces/${workspaceId}/utmify/accounts/${accountId}`)
      setAccounts(prev => prev.filter(a => a.id !== accountId))
    } catch (e: any) {
      alert(e.message || 'Erro ao remover conta')
    } finally {
      setDeletingId(null)
    }
  }

  const handleTest = async (accountId: string) => {
    setTestingId(accountId)
    setTestResults(prev => { const n = { ...prev }; delete n[accountId]; return n })
    try {
      const res = await api.post(`/workspaces/${workspaceId}/utmify/accounts/${accountId}/test`, {})
      setTestResults(prev => ({ ...prev, [accountId]: { ok: res.connected, message: res.message } }))
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [accountId]: { ok: false, message: e.message || 'Erro ao testar' } }))
    } finally {
      setTestingId(null)
    }
  }

  const handleToggleActive = async (account: any) => {
    const updated = await api.patch(`/workspaces/${workspaceId}/utmify/accounts/${account.id}`, {
      isActive: !account.isActive,
    })
    setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    )
  }

  const atLimit = accounts.length >= 5

  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <UtmifyIcon size={36} />
          <div>
            <h2 className="text-white font-semibold text-base leading-none">UTMify</h2>
            <p className="text-xs text-white/35 mt-0.5">Rastreamento de UTMs · {accounts.length}/5 contas</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => !atLimit && setModal({ open: true })}
          disabled={atLimit}
          title={atLimit ? 'Limite máximo de 5 contas por workspace atingido' : 'Adicionar Conta'}
          className="flex items-center gap-2 px-4 py-2 rounded-[3px] bg-[#7C3AED] hover:bg-[#6d28d9] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" /> Adicionar Conta
        </button>
      </div>

      {/* Limit warning */}
      {atLimit && (
        <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-[4px]">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400">Limite máximo de 5 contas por workspace atingido.</p>
        </div>
      )}

      {/* Account list */}
      <div className="px-6 py-5 space-y-3">
        {accounts.length === 0 ? (
          <div className="text-center py-12">
            <UtmifyIcon size={40} />
            <p className="text-white/40 text-sm mt-4">Nenhuma conta configurada</p>
            <p className="text-white/25 text-xs mt-1">Clique em "Adicionar Conta" para começar</p>
          </div>
        ) : (
          accounts.map(account => {
            const testResult = testResults[account.id]
            const isTesting = testingId === account.id
            const isDeleting = deletingId === account.id
            const bot = bots.find(b => b.id === account.botId)

            return (
              <div
                key={account.id}
                className={[
                  'rounded-[4px] border bg-white/[0.02] p-4 transition-colors',
                  testResult?.ok === false
                    ? 'border-red-500/20'
                    : account.isActive
                      ? 'border-[#7C3AED]/15'
                      : 'border-white/[0.06]',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Nome + status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-semibold truncate">
                        {account.name || `Conta ••••${account.tokenSuffix || '------'}`}
                      </span>
                      {account.isActive ? (
                        <span className="flex items-center gap-1 text-[10px] text-[#a78bfa] bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-full px-2 py-0.5">
                          <span className="w-1 h-1 rounded-full bg-[#a78bfa]" /> Ativo
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/30 bg-white/[0.04] border border-white/[0.06] rounded-full px-2 py-0.5">Inativo</span>
                      )}
                    </div>

                    {/* Metadados */}
                    <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                      {account.tokenSuffix && (
                        <span className="text-xs text-white/25 font-mono">Token: ••••••{account.tokenSuffix}</span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-white/35">
                        <Bot className="h-3 w-3" />
                        {bot ? `@${bot.username}` : <span className="text-white/25">Todos os bots</span>}
                      </span>
                    </div>

                    {/* Eventos */}
                    <div className="mt-2 flex items-center gap-2">
                      {[
                        { key: 'eventPixGerado', label: 'PIX Gerado' },
                        { key: 'eventPixPago',   label: 'PIX Aprovado' },
                      ].map(({ key, label }) => (
                        <span key={key} className={`text-[10px] rounded px-1.5 py-0.5 ${account[key] ? 'bg-[#7C3AED]/15 text-[#a78bfa]' : 'bg-white/[0.04] text-white/20 line-through'}`}>
                          {label}
                        </span>
                      ))}
                    </div>

                    {/* Test result */}
                    {testResult && (
                      <div className={`mt-2 flex items-center gap-1.5 text-xs ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {testResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {testResult.message}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(account)}
                      className={`p-2 rounded-[3px] transition-colors ${account.isActive ? 'text-green-400' : 'text-white/20'}`}
                      title={account.isActive ? 'Desativar' : 'Ativar'}
                    >
                      {account.isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTest(account.id)}
                      disabled={isTesting}
                      className="p-2 rounded-[3px] text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                      title="Testar conexão"
                    >
                      {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ open: true, account })}
                      className="p-2 rounded-[3px] text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(account.id)}
                      disabled={isDeleting}
                      className="p-2 rounded-[3px] text-white/30 hover:text-red-400 hover:bg-red-500/[0.08] transition-colors disabled:opacity-40"
                      title="Remover"
                    >
                      {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal */}
      {modal.open && (
        <UtmifyAccountModal
          account={modal.account}
          bots={bots}
          onSave={modal.account ? handleUpdate : handleCreate}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}

