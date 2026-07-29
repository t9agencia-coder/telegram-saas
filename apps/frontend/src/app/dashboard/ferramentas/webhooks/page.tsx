'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Webhook, Loader2, Check, X, Send, RefreshCw, Save, ShieldCheck, AlertCircle, History,
} from 'lucide-react'

const ACCENT = '#E50914'

const EVENTS: { key: string; label: string; desc: string }[] = [
  { key: 'sale_pending',  label: 'Venda Pendente', desc: 'PIX gerado, aguardando pagamento' },
  { key: 'sale_approved', label: 'Venda Aprovada', desc: 'Pagamento confirmado e aprovado' },
]

interface Settings {
  enabled: boolean
  url: string
  enabledEvents: string[]
  hasSecret: boolean
}

interface LogRow {
  id: string
  event: string
  url: string
  responseStatus: number | null
  executionMs: number | null
  attempts: number
  success: boolean
  errorMessage: string | null
  isTest: boolean
  createdAt: string
}

function eventLabel(e: string) {
  return EVENTS.find((x) => x.key === e)?.label || e
}

function formatDate(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function WebhooksPage() {
  const { workspaceId } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [resending, setResending] = useState<string | null>(null)

  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['sale_pending', 'sale_approved'])
  const [hasSecret, setHasSecret] = useState(false)
  const [secret, setSecret] = useState('')
  const [secretTouched, setSecretTouched] = useState(false)

  const [logs, setLogs] = useState<LogRow[]>([])
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null)

  const loadLogs = useCallback(async () => {
    if (!workspaceId) return
    try {
      const d = await api.get(`/workspaces/${workspaceId}/webhook/logs?limit=20`)
      setLogs(d.items)
    } catch (e) { console.error(e) }
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    ;(async () => {
      setLoading(true)
      try {
        const s: Settings = await api.get(`/workspaces/${workspaceId}/webhook`)
        setEnabled(s.enabled)
        setUrl(s.url || '')
        setEvents(s.enabledEvents?.length ? s.enabledEvents : ['sale_pending', 'sale_approved'])
        setHasSecret(s.hasSecret)
        await loadLogs()
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [workspaceId, loadLogs])

  const toggleEvent = (key: string) => {
    setEvents((prev) => prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key])
  }

  const save = async () => {
    setBanner(null)
    setSaving(true)
    try {
      const body: any = { enabled, url: url.trim(), enabledEvents: events }
      if (secretTouched) body.secret = secret // '' limpa, valor define
      const s: Settings = await api.put(`/workspaces/${workspaceId}/webhook`, body)
      setEnabled(s.enabled); setUrl(s.url || ''); setEvents(s.enabledEvents); setHasSecret(s.hasSecret)
      setSecret(''); setSecretTouched(false)
      setBanner({ ok: true, msg: 'Configuração salva com sucesso' })
    } catch (e: any) {
      setBanner({ ok: false, msg: e.message || 'Falha ao salvar' })
    } finally { setSaving(false) }
  }

  const test = async () => {
    setBanner(null)
    setTesting(true)
    try {
      const r = await api.post(`/workspaces/${workspaceId}/webhook/test`)
      setBanner({
        ok: r.success,
        msg: r.success
          ? `Webhook entregue (HTTP ${r.responseStatus}, ${r.executionMs}ms)`
          : `Falha: ${r.message}${r.responseStatus ? ` (HTTP ${r.responseStatus})` : ''}`,
      })
      await loadLogs()
    } catch (e: any) {
      setBanner({ ok: false, msg: e.message || 'Falha no teste' })
    } finally { setTesting(false) }
  }

  const resend = async (id: string) => {
    setResending(id)
    try {
      await api.post(`/workspaces/${workspaceId}/webhook/logs/${id}/resend`)
      setTimeout(loadLogs, 1200)
    } catch (e: any) {
      setBanner({ ok: false, msg: e.message || 'Falha ao reenviar' })
    } finally { setResending(null) }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#666666]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Webhooks" description="Envie eventos de venda automaticamente para sistemas externos (CRM, ERP, automações)" />

      {banner && (
        <div className={cn(
          'flex items-center gap-2 rounded-[4px] border px-4 py-3 text-sm',
          banner.ok ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]' : 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]'
        )}>
          {banner.ok ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
          {banner.msg}
        </div>
      )}

      {/* Configuração */}
      <Card className="rounded-[4px] border-white/[0.06] bg-[#141414]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <div className="w-8 h-8 rounded-[3px] flex items-center justify-center" style={{ background: `${ACCENT}1a` }}>
                <Webhook className="h-4 w-4" style={{ color: ACCENT }} />
              </div>
              Integração de Webhook
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className={cn('text-xs font-medium', enabled ? 'text-[#22C55E]' : 'text-[#666666]')}>
                {enabled ? 'Ativo' : 'Inativo'}
              </span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>URL do Webhook</Label>
            <Input
              placeholder="https://meusistema.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-[#666666]">Endereço que receberá um POST HTTP com os dados da venda.</p>
          </div>

          <div className="space-y-2">
            <Label>Eventos</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EVENTS.map((ev) => {
                const on = events.includes(ev.key)
                return (
                  <button
                    key={ev.key}
                    type="button"
                    onClick={() => toggleEvent(ev.key)}
                    className={cn(
                      'flex items-start gap-3 rounded-[4px] border p-3 text-left transition-colors',
                      on ? 'border-white/[0.12] bg-white/[0.03]' : 'border-white/[0.06] bg-transparent hover:bg-white/[0.02]'
                    )}
                  >
                    <div className={cn(
                      'mt-0.5 h-4 w-4 rounded-[3px] border flex items-center justify-center shrink-0',
                      on ? 'border-transparent' : 'border-white/20'
                    )} style={on ? { background: ACCENT } : {}}>
                      {on && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm text-white">{ev.label}</p>
                      <p className="text-[11px] text-[#666666]">{ev.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#666666]" />
              Webhook Secret <span className="text-[#666666] font-normal">(opcional)</span>
            </Label>
            <Input
              type="password"
              placeholder={hasSecret && !secretTouched ? '•••••••• (secret configurado)' : 'Enviado no header X-Webhook-Secret'}
              value={secret}
              onChange={(e) => { setSecret(e.target.value); setSecretTouched(true) }}
            />
            <p className="text-xs text-[#666666]">
              Se preenchido, é enviado no header <code className="text-[#888]">X-Webhook-Secret</code> pro sistema externo validar a origem.
              {hasSecret && !secretTouched && ' Deixe em branco pra manter o atual.'}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
            <Button variant="outline" onClick={test} disabled={testing || !url.trim()}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar Webhook de Teste
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card className="rounded-[4px] border-white/[0.06] bg-[#141414]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <History className="h-4 w-4 text-[#666666]" />
              Histórico de Envios
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={loadLogs}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Data', 'Evento', 'Status', 'HTTP', 'Tempo', 'Tentativas', 'Erro', ''].map((h) => (
                  <th key={h} className="text-left text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const pending = !l.success && l.attempts === 0
                return (
                  <tr key={l.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{formatDate(l.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-white whitespace-nowrap">
                      {eventLabel(l.event)}
                      {l.isTest && <span className="ml-1.5 text-[10px] text-[#666] bg-white/[0.06] px-1.5 py-0.5 rounded">teste</span>}
                    </td>
                    <td className="px-4 py-3">
                      {l.success ? (
                        <span className="inline-flex items-center gap-1 text-xs text-[#22C55E]"><Check className="h-3 w-3" /> Sucesso</span>
                      ) : pending ? (
                        <span className="inline-flex items-center gap-1 text-xs text-[#F59E0B]"><Loader2 className="h-3 w-3 animate-spin" /> Enviando</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-[#EF4444]"><AlertCircle className="h-3 w-3" /> Falhou</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#B3B3B3]">{l.responseStatus ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-[#B3B3B3] whitespace-nowrap">{l.executionMs != null ? `${l.executionMs}ms` : '—'}</td>
                    <td className="px-4 py-3 text-xs text-[#B3B3B3]">{l.attempts}</td>
                    <td className="px-4 py-3 text-xs text-[#666] max-w-[200px] truncate" title={l.errorMessage || ''}>{l.errorMessage || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {!l.isTest && (
                        <button
                          onClick={() => resend(l.id)}
                          disabled={resending === l.id}
                          className="inline-flex items-center gap-1 text-xs text-[#666] hover:text-white transition-colors disabled:opacity-50"
                        >
                          {resending === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          Reenviar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {logs.length === 0 && (
            <div className="flex flex-col items-center py-12 text-[#666666]">
              <Webhook className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Nenhum envio ainda</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
