'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle, HelpCircle,
  Eye, EyeOff, Shield, ArrowRight, X, Zap, Copy, Check,
  Wallet, Clock, TrendingUp, RefreshCw, QrCode, Plus, ArrowUpDown,
  GripVertical,
} from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type CredStatus = 'UNCONFIGURED' | 'VALID' | 'INVALID' | 'UNSTABLE'

interface PodpayStatus {
  configured: boolean; id?: string; environment?: string
  credentialStatus?: CredStatus; isActive?: boolean; lastValidatedAt?: string
}
interface PodpayBalance { amount: number; waitingFunds: number; maxAntecipable: number; reserve: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS: Record<CredStatus, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  UNCONFIGURED: { label: 'Não configurado',   color: '#666',     bg: '#1A1A1A',   border: '#2A2A2A',   Icon: HelpCircle    },
  VALID:        { label: 'Conectado',          color: '#00B37E',  bg: '#00B37E10', border: '#00B37E30', Icon: CheckCircle2  },
  INVALID:      { label: 'Credencial inválida',color: '#EF4444',  bg: '#EF444410', border: '#EF444430', Icon: XCircle       },
  UNSTABLE:     { label: 'Instável',           color: '#F59E0B',  bg: '#F59E0B10', border: '#F59E0B30', Icon: AlertTriangle },
}

function Badge({ status }: { status: CredStatus }) {
  const s = STATUS[status]
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
      style={{ color: s.color, background: s.bg, borderColor: s.border }}>
      <s.Icon className="h-2.5 w-2.5" />{s.label}
    </span>
  )
}

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Card base ────────────────────────────────────────────────────────────────

function AcquirerCard({ children, accent = '#7C3AED', active = false }: {
  children: React.ReactNode; accent?: string; active?: boolean
}) {
  return (
    <div
      className="rounded-[4px] border flex flex-col overflow-hidden transition-all"
      style={{
        background: '#0F0F14',
        borderColor: active ? `${accent}40` : '#1E1E1E',
        boxShadow: active ? `0 0 0 1px ${accent}20` : 'none',
      }}
    >
      {children}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// CARD PODPAY
// ═════════════════════════════════════════════════════════════════════════════

function PodpayCard({ onValidated }: { onValidated?: () => void }) {
  const [status,     setStatus]     = useState<PodpayStatus | null>(null)
  const [balance,    setBalance]    = useState<PodpayBalance | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [apiKey,     setApiKey]     = useState('')
  const [showKey,    setShowKey]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [feedback,   setFeedback]   = useState<{ ok: boolean; msg: string } | null>(null)
  const [testResult, setTestResult] = useState<any>(null)
  const [testing,    setTesting]    = useState(false)
  const [copied,     setCopied]     = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.get('/admin/podpay') as PodpayStatus
      setStatus(s)
      if (s.configured && s.credentialStatus === 'VALID') {
        api.get('/admin/podpay/balance').then((b: any) => setBalance(b)).catch(() => {})
      }
    } catch { setStatus({ configured: false }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const connect = async () => {
    if (!apiKey.trim()) return
    setSaving(true); setFeedback(null)
    try {
      const r: any = await api.post('/admin/podpay/setup', { apiKey: apiKey.trim() })
      setFeedback({ ok: r.success, msg: r.message })
      if (r.success) { setApiKey(''); setShowForm(false); loadStatus(); onValidated?.() }
    } catch (e: any) { setFeedback({ ok: false, msg: e.message || 'Erro' }) }
    finally { setSaving(false) }
  }

  const testPix = async () => {
    if (!status?.id) return
    setTesting(true); setTestResult(null)
    try { setTestResult(await api.post(`/admin/acquirers/${status.id}/test-pix`, {})) }
    catch (e: any) { setTestResult({ success: false, message: e.message }) }
    finally { setTesting(false) }
  }

  const copy = (t: string) => {
    navigator.clipboard.writeText(t)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const isValid   = status?.credentialStatus === 'VALID'
  const isSandbox = status?.environment === 'sandbox'
  const envHint   = apiKey.startsWith('sk_test') ? 'sandbox' : apiKey.startsWith('sk_live') ? 'production' : null

  return (
    <AcquirerCard accent="#7C3AED" active={isValid}>
      {/* Topo do card */}
      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Logo + Nome */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[4px] flex items-center justify-center text-white font-black text-lg shrink-0"
              style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)' }}>P</div>
            <div>
              <p className="text-base font-black text-white">Podpay</p>
              <p className="text-[11px] text-[#555]">PIX · Cartão · Boleto</p>
            </div>
          </div>
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-[#444]" />
            : status?.configured && status.credentialStatus
              ? <Badge status={status.credentialStatus} />
              : <Badge status="UNCONFIGURED" />
          }
        </div>

        {/* Ambiente */}
        {isValid && (
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
              isSandbox
                ? 'text-[#F59E0B] bg-[#F59E0B]/8 border-[#F59E0B]/20'
                : 'text-[#00B37E] bg-[#00B37E]/8 border-[#00B37E]/20'
            }`}>{isSandbox ? 'sandbox' : 'produção'}</span>
            {status?.lastValidatedAt && (
              <span className="text-[10px] text-[#333]">
                validado {new Date(status.lastValidatedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        )}

        {/* Saldo (quando conectado) */}
        {isValid && balance && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Disponível',   value: balance.amount,        color: '#00B37E', I: Wallet     },
              { label: 'Em liberação', value: balance.waitingFunds,  color: '#F59E0B', I: Clock      },
              { label: 'Antecipável',  value: balance.maxAntecipable,color: '#3B82F6', I: TrendingUp },
              { label: 'Reserva',      value: balance.reserve,       color: '#8B5CF6', I: Shield     },
            ].map(({ label, value, color, I }) => (
              <div key={label} className="bg-[#141414] rounded-[4px] p-2.5 border border-white/[0.06]">
                <div className="flex items-center gap-1 mb-1">
                  <I className="h-2.5 w-2.5" style={{ color }} />
                  <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide">{label}</p>
                </div>
                <p className="text-sm font-black text-white">{brl(value)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Estado vazio */}
        {!loading && !status?.configured && !showForm && (
          <p className="text-xs text-[#444] leading-relaxed">
            Aceite PIX instantâneo, cartão de crédito e boleto. Cole sua API Key para ativar.
          </p>
        )}

        {/* Formulário */}
        {showForm && (
          <div className="space-y-3">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setFeedback(null) }}
                onKeyDown={e => e.key === 'Enter' && connect()}
                placeholder="sk_live_... ou sk_test_..."
                className="w-full h-10 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-10 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#7C3AED]/50 transition-all"
              />
              <button onClick={() => setShowKey(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-white">
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {envHint && (
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${envHint === 'sandbox' ? 'bg-[#F59E0B]' : 'bg-[#00B37E]'}`} />
                <span className={`text-[10px] font-semibold ${envHint === 'sandbox' ? 'text-[#F59E0B]' : 'text-[#00B37E]'}`}>
                  Ambiente {envHint === 'sandbox' ? 'Sandbox' : 'Produção'} detectado
                </span>
              </div>
            )}
            {feedback && (
              <div className={`flex items-center gap-2 p-2.5 rounded-[4px] border text-xs font-medium ${
                feedback.ok ? 'bg-[#00B37E]/10 border-[#00B37E]/20 text-[#00B37E]' : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
              }`}>
                {feedback.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                {feedback.msg}
              </div>
            )}
          </div>
        )}

        {/* Resultado do teste PIX */}
        {testResult && (
          <div className="space-y-3">
            {/* Status */}
            <div className={`flex items-center gap-2 p-2.5 rounded-[4px] border text-xs ${
              testResult.success
                ? 'bg-[#00B37E]/10 border-[#00B37E]/20 text-[#00B37E]'
                : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
            }`}>
              {testResult.success
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                : <XCircle     className="h-3.5 w-3.5 shrink-0" />
              }
              <span className="flex-1">{testResult.message}</span>
              <button onClick={() => setTestResult(null)}>
                <X className="h-3 w-3 opacity-50 hover:opacity-100" />
              </button>
            </div>

            {testResult.success && (
              <>
                {/* QR Code */}
                {testResult.qrCodeImage && (
                  <div className="flex flex-col items-center gap-2 p-4 rounded-[4px] bg-white">
                    <img
                      src={testResult.qrCodeImage}
                      alt="QR Code PIX"
                      className="w-44 h-44"
                    />
                    <p className="text-[10px] text-[#999] font-semibold">PIX R$10 — escaneie para pagar</p>
                  </div>
                )}

                {/* PIX copia e cola */}
                {testResult.pixCode && (
                  <div>
                    <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">PIX Copia e Cola</p>
                    <div className="relative">
                      <input
                        readOnly
                        value={testResult.pixCode}
                        className="w-full h-8 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-9 font-mono text-[10px] text-white focus:outline-none"
                      />
                      <button
                        onClick={() => copy(testResult.pixCode)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#444] hover:text-white transition-colors"
                      >
                        {copied
                          ? <Check className="h-3 w-3 text-[#00B37E]" />
                          : <Copy  className="h-3 w-3" />
                        }
                      </button>
                    </div>
                    {testResult.transactionId && (
                      <p className="text-[9px] text-[#333] font-mono mt-1">ID: {testResult.transactionId}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rodapé com botões */}
      <div className="px-5 pb-5 flex items-center gap-2">
        {!loading && (
          <>
            {!isValid ? (
              <>
                {showForm ? (
                  <>
                    <button onClick={connect} disabled={saving || !apiKey.trim()}
                      className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all"
                      style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)' }}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                    <button onClick={() => { setShowForm(false); setFeedback(null) }}
                      className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white transition-all">
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button onClick={() => setShowForm(true)}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white flex items-center justify-center gap-1.5 transition-all"
                    style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)' }}>
                    <ArrowRight className="h-3.5 w-3.5" /> Adicionar API Key
                  </button>
                )}
              </>
            ) : (
              <>
                <button onClick={testPix} disabled={testing}
                  className="flex-1 h-9 rounded-[4px] border border-[#F59E0B]/30 text-xs font-semibold text-[#F59E0B] hover:bg-[#F59E0B]/10 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Testar R$10
                </button>
                <button onClick={() => { setShowForm(s => !s); setFeedback(null) }}
                  className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white transition-all">
                  Alterar chave
                </button>
                <button onClick={() => { setBalance(null); api.get('/admin/podpay/balance').then((b: any) => setBalance(b)).catch(() => {}) }}
                  className="h-9 w-9 rounded-[4px] border border-white/[0.06] flex items-center justify-center text-[#444] hover:text-white transition-all">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </>
        )}
      </div>
    </AcquirerCard>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// CARD PIXZYPAY
// ═════════════════════════════════════════════════════════════════════════════

function PixzypayCard({ onValidated }: { onValidated?: () => void }) {
  const [acquirer,   setAcquirer]   = useState<any>(null)
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [apiKey,     setApiKey]     = useState('')
  const [showKey,    setShowKey]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [feedback,   setFeedback]   = useState<{ ok: boolean; msg: string } | null>(null)
  const [testResult, setTestResult] = useState<any>(null)
  const [testing,    setTesting]    = useState(false)
  const [validating, setValidating] = useState(false)
  const [copied,     setCopied]     = useState(false)

  const loadAcquirer = useCallback(async () => {
    try {
      const list: any[] = await api.get('/admin/acquirers')
      setAcquirer(list.find((a: any) => a.slug === 'pixzypay') ?? null)
    } catch { setAcquirer(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAcquirer() }, [loadAcquirer])

  const save = async () => {
    if (!apiKey.trim()) return
    setSaving(true); setFeedback(null)
    try {
      if (!acquirer) {
        await api.post('/admin/acquirers', {
          name: 'PixzyPay', slug: 'pixzypay',
          apiKey: apiKey.trim(), environment: 'production', priority: 1, isActive: false,
        })
      } else {
        await api.patch(`/admin/acquirers/${acquirer.id}`, { apiKey: apiKey.trim() })
      }
      setApiKey(''); setShowForm(false)
      await loadAcquirer()
      setFeedback({ ok: true, msg: 'Chave salva! Clique em "Validar credenciais" para ativar.' })
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message || 'Erro ao salvar' })
    } finally { setSaving(false) }
  }

  const validate = async () => {
    if (!acquirer?.id) return
    setValidating(true); setFeedback(null)
    try {
      const r: any = await api.post(`/admin/acquirers/${acquirer.id}/validate`, {})
      setFeedback({ ok: r.success, msg: r.message })
      await loadAcquirer()
      if (r.success) onValidated?.()
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message || 'Erro ao validar' })
    } finally { setValidating(false) }
  }

  const testPix = async () => {
    if (!acquirer?.id) return
    setTesting(true); setTestResult(null)
    try { setTestResult(await api.post(`/admin/acquirers/${acquirer.id}/test-pix`, {})) }
    catch (e: any) { setTestResult({ success: false, message: e.message }) }
    finally { setTesting(false) }
  }

  const copy = (t: string) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const isValid    = acquirer?.credentialStatus === 'VALID' || acquirer?.credentialStatus === 'UNSTABLE'
  const credStatus: CredStatus = acquirer?.credentialStatus ?? 'UNCONFIGURED'

  return (
    <AcquirerCard accent="#10B981" active={isValid}>
      <div className="p-5 flex flex-col gap-4 flex-1">

        {/* Logo + Nome */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[4px] flex items-center justify-center text-white font-black text-lg shrink-0"
              style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>Z</div>
            <div>
              <p className="text-base font-black text-white">PixzyPay</p>
              <p className="text-[11px] text-[#555]">PIX instantâneo</p>
            </div>
          </div>
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-[#444]" />
            : <Badge status={credStatus} />}
        </div>

        {/* Ambiente / última validação */}
        {acquirer && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border text-[#10B981] bg-[#10B981]/8 border-[#10B981]/20">
              produção
            </span>
            {acquirer.lastValidatedAt && (
              <span className="text-[10px] text-[#333]">
                validado {new Date(acquirer.lastValidatedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        )}

        {/* Estado vazio */}
        {!loading && !acquirer && !showForm && (
          <p className="text-xs text-[#444] leading-relaxed">
            Gateway PIX com QR Code e copia-e-cola. Cole seu API Token para ativar.
          </p>
        )}

        {/* Formulário API Key */}
        {showForm && (
          <div className="space-y-3">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setFeedback(null) }}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder="Cole seu API Token aqui..."
                className="w-full h-10 rounded-xl border border-[#222] bg-[#0D0D0D] px-3 pr-10 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#10B981]/50 transition-all"
              />
              <button onClick={() => setShowKey(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-white">
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium ${
            feedback.ok
              ? 'bg-[#10B981]/10 border-[#10B981]/20 text-[#10B981]'
              : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
          }`}>
            {feedback.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
            {feedback.msg}
          </div>
        )}

        {/* Resultado do teste PIX */}
        {testResult && (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs ${
              testResult.success
                ? 'bg-[#10B981]/10 border-[#10B981]/20 text-[#10B981]'
                : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
            }`}>
              {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
              <span className="flex-1">{testResult.message}</span>
              <button onClick={() => setTestResult(null)}><X className="h-3 w-3 opacity-50 hover:opacity-100" /></button>
            </div>
            {testResult.success && (
              <>
                {testResult.qrCodeImage && (
                  <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white">
                    <img src={testResult.qrCodeImage} alt="QR Code PIX" className="w-44 h-44" />
                    <p className="text-[10px] text-[#999] font-semibold">PIX R$10 — escaneie para pagar</p>
                  </div>
                )}
                {testResult.pixCode && (
                  <div>
                    <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">PIX Copia e Cola</p>
                    <div className="relative">
                      <input readOnly value={testResult.pixCode}
                        className="w-full h-8 rounded-xl border border-[#222] bg-[#0D0D0D] px-3 pr-9 font-mono text-[10px] text-white focus:outline-none" />
                      <button onClick={() => copy(testResult.pixCode)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#444] hover:text-white transition-colors">
                        {copied ? <Check className="h-3 w-3 text-[#10B981]" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    {testResult.transactionId && (
                      <p className="text-[9px] text-[#333] font-mono mt-1">ID: {testResult.transactionId}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="px-5 pb-5 flex items-center gap-2">
        {!loading && (
          <>
            {!acquirer ? (
              showForm ? (
                <>
                  <button onClick={save} disabled={saving || !apiKey.trim()}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-[#222] text-xs text-[#555] hover:text-white">
                    Cancelar
                  </button>
                </>
              ) : (
                <button onClick={() => setShowForm(true)}
                  className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                  <ArrowRight className="h-3.5 w-3.5" /> Adicionar API Token
                </button>
              )
            ) : !isValid ? (
              showForm ? (
                <>
                  <button onClick={save} disabled={saving || !apiKey.trim()}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-[#222] text-xs text-[#555] hover:text-white">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button onClick={validate} disabled={validating}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                    {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {validating ? 'Validando...' : 'Validar credenciais'}
                  </button>
                  <button onClick={() => { setShowForm(true); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-[#222] text-xs text-[#555] hover:text-white">
                    Alterar chave
                  </button>
                </>
              )
            ) : showForm ? (
              <>
                <button onClick={save} disabled={saving || !apiKey.trim()}
                  className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={() => { setShowForm(false); setFeedback(null) }}
                  className="h-9 px-3 rounded-[4px] border border-[#222] text-xs text-[#555] hover:text-white">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button onClick={testPix} disabled={testing}
                  className="flex-1 h-9 rounded-[4px] border border-[#10B981]/30 text-xs font-semibold text-[#10B981] hover:bg-[#10B981]/10 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Testar R$10
                </button>
                <button onClick={() => { setShowForm(true); setFeedback(null) }}
                  className="h-9 px-3 rounded-[4px] border border-[#222] text-xs text-[#555] hover:text-white">
                  Alterar chave
                </button>
              </>
            )}
          </>
        )}
      </div>
    </AcquirerCard>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SEÇÃO DE PRIORIDADE (drag-and-drop)
// ═════════════════════════════════════════════════════════════════════════════

const PRIORITY_ACCENT: Record<string, string> = { podpay: '#7C3AED', pixzypay: '#10B981', nexuspag: '#2563EB', qrcodes2: '#0EA5E9', qrcodes3: '#F59E0B' }

function PrioritySection({ refreshKey }: { refreshKey: number }) {
  const [items,    setItems]    = useState<any[]>([])
  const [original, setOriginal] = useState<any[]>([])
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [overIdx,  setOverIdx]  = useState<number | null>(null)
  const dragIdx = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const list: any[] = await api.get('/admin/acquirers')
      const sorted = list.sort((a, b) => a.priority - b.priority)
      setItems(sorted)
      setOriginal(sorted)
    } catch {}
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const dirty = items.map(i => i.id).join(',') !== original.map(i => i.id).join(',')

  // ── Handlers drag-and-drop HTML5 ──────────────────────────────────────────

  const onDragStart = (idx: number) => {
    dragIdx.current = idx
  }

  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setOverIdx(idx)
  }

  const onDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    const from = dragIdx.current
    if (from === null || from === targetIdx) { setOverIdx(null); return }
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(targetIdx, 0, moved)
    setItems(next)
    dragIdx.current = null
    setOverIdx(null)
  }

  const onDragEnd = () => {
    dragIdx.current = null
    setOverIdx(null)
  }

  // ── Salvar ────────────────────────────────────────────────────────────────

  const save = async () => {
    setSaving(true)
    try {
      await api.post('/admin/acquirers/reorder', { ids: items.map((a: any) => a.id) })
      setOriginal(items)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    finally { setSaving(false) }
  }

  const discard = () => { setItems(original) }

  if (items.length === 0) return null

  return (
    <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold text-white/70">Ordem de fallback</p>
          <p className="text-[10px] text-[#444] mt-0.5">Arraste para reordenar — o sistema tenta o #1, depois o #2…</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && !saving && (
            <button
              onClick={discard}
              className="h-7 px-2.5 rounded-[4px] border border-white/[0.06] text-[11px] text-[#555] hover:text-white transition-all"
            >
              Desfazer
            </button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="h-7 px-3 rounded-[4px] text-[11px] font-semibold flex items-center gap-1.5 transition-all disabled:opacity-30"
            style={{
              background: saved ? '#00B37E15' : dirty ? '#7C3AED' : 'transparent',
              color:      saved ? '#00B37E'   : dirty ? '#fff'    : '#333',
              border:     saved ? '1px solid #00B37E30' : dirty ? 'none' : '1px solid #222',
            }}
          >
            {saving
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : saved
                ? <CheckCircle2 className="h-3 w-3" />
                : <Check className="h-3 w-3" />
            }
            {saving ? 'Salvando…' : saved ? 'Salvo!' : 'Salvar ordem'}
          </button>
        </div>
      </div>

      {/* Lista arrastável */}
      <div className="divide-y divide-white/[0.03]">
        {items.map((a, i) => {
          const color  = PRIORITY_ACCENT[a.slug] ?? '#888'
          const active = a.credentialStatus === 'VALID' && a.isActive
          const isOver = overIdx === i && dragIdx.current !== null && dragIdx.current !== i

          return (
            <div
              key={a.id}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={e => onDragOver(e, i)}
              onDrop={e => onDrop(e, i)}
              onDragEnd={onDragEnd}
              className="flex items-center gap-3 px-4 py-2.5 select-none transition-colors"
              style={{
                background:  isOver ? `${color}08` : 'transparent',
                borderTop:   isOver ? `2px solid ${color}50` : '2px solid transparent',
                cursor:      'grab',
              }}
            >
              {/* Grip */}
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-[#333]" />

              {/* Número */}
              <span className="text-[11px] font-black w-5 text-center shrink-0"
                style={{ color: active ? color : '#333' }}>
                #{i + 1}
              </span>

              {/* Dot de status */}
              <span className="text-[9px] shrink-0" style={{ color: active ? color : '#333' }}>
                {active ? '●' : '○'}
              </span>

              {/* Nome */}
              <span className="text-[12px] font-semibold flex-1"
                style={{ color: active ? '#ddd' : '#444' }}>
                {a.name}
              </span>

              {/* Badge status */}
              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0"
                style={{
                  color:       active ? color : '#444',
                  background:  active ? `${color}10` : 'transparent',
                  borderColor: active ? `${color}25` : '#222',
                }}>
                {active ? 'ativo' : a.credentialStatus === 'UNCONFIGURED' ? 'não configurado' : a.credentialStatus?.toLowerCase()}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// CARD NEXUSPAG
// ═════════════════════════════════════════════════════════════════════════════

const NEXUSPAG_ACCENT = '#2563EB'

function NexusPagCard({ onValidated }: { onValidated?: () => void }) {
  const [acquirer,   setAcquirer]   = useState<any>(null)
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [apiKey,     setApiKey]     = useState('')
  const [showKey,    setShowKey]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [feedback,   setFeedback]   = useState<{ ok: boolean; msg: string } | null>(null)
  const [testResult, setTestResult] = useState<any>(null)
  const [testing,    setTesting]    = useState(false)
  const [validating, setValidating] = useState(false)
  const [copied,     setCopied]     = useState(false)

  const loadAcquirer = useCallback(async () => {
    try {
      const list: any[] = await api.get('/admin/acquirers')
      setAcquirer(list.find((a: any) => a.slug === 'nexuspag') ?? null)
    } catch { setAcquirer(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAcquirer() }, [loadAcquirer])

  const save = async () => {
    if (!apiKey.trim()) return
    setSaving(true); setFeedback(null)
    try {
      if (!acquirer) {
        await api.post('/admin/acquirers', {
          name: 'NexusPag', slug: 'nexuspag',
          apiKey: apiKey.trim(), environment: 'production', priority: 2, isActive: false,
        })
      } else {
        await api.patch(`/admin/acquirers/${acquirer.id}`, { apiKey: apiKey.trim() })
      }
      setApiKey(''); setShowForm(false)
      await loadAcquirer()
      setFeedback({ ok: true, msg: 'Chave salva! Clique em "Validar credenciais" para ativar.' })
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message || 'Erro ao salvar' })
    } finally { setSaving(false) }
  }

  const validate = async () => {
    if (!acquirer?.id) return
    setValidating(true); setFeedback(null)
    try {
      const r: any = await api.post(`/admin/acquirers/${acquirer.id}/validate`, {})
      setFeedback({ ok: r.success, msg: r.message })
      await loadAcquirer()
      if (r.success) onValidated?.()
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message || 'Erro ao validar' })
    } finally { setValidating(false) }
  }

  const testPix = async () => {
    if (!acquirer?.id) return
    setTesting(true); setTestResult(null)
    try { setTestResult(await api.post(`/admin/acquirers/${acquirer.id}/test-pix`, {})) }
    catch (e: any) { setTestResult({ success: false, message: e.message }) }
    finally { setTesting(false) }
  }

  const copy = (t: string) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const isValid    = acquirer?.credentialStatus === 'VALID' || acquirer?.credentialStatus === 'UNSTABLE'
  const credStatus: CredStatus = acquirer?.credentialStatus ?? 'UNCONFIGURED'

  return (
    <AcquirerCard accent={NEXUSPAG_ACCENT} active={isValid}>
      <div className="p-5 flex flex-col gap-4 flex-1">

        {/* Logo + Nome */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[4px] flex items-center justify-center text-white font-black text-lg shrink-0"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}>N</div>
            <div>
              <p className="text-base font-black text-white">NexusPag</p>
              <p className="text-[11px] text-[#555]">PIX instantâneo</p>
            </div>
          </div>
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-[#444]" />
            : <Badge status={credStatus} />}
        </div>

        {/* Ambiente / última validação */}
        {acquirer && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border"
              style={{ color: NEXUSPAG_ACCENT, background: `${NEXUSPAG_ACCENT}18`, borderColor: `${NEXUSPAG_ACCENT}30` }}>
              produção
            </span>
            {acquirer.lastValidatedAt && (
              <span className="text-[10px] text-[#333]">
                validado {new Date(acquirer.lastValidatedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        )}

        {/* Estado vazio */}
        {!loading && !acquirer && !showForm && (
          <p className="text-xs text-[#444] leading-relaxed">
            Gateway PIX com QR Code e copia-e-cola. Cole sua API Key para ativar.
          </p>
        )}

        {/* Formulário API Key */}
        {showForm && (
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setFeedback(null) }}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="nxp_live_..."
              className="w-full h-10 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-10 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#2563EB]/50 transition-all"
            />
            <button onClick={() => setShowKey(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-white">
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div className={`flex items-center gap-2 p-2.5 rounded-[4px] border text-xs font-medium ${
            feedback.ok
              ? 'bg-[#00B37E]/10 border-[#00B37E]/20 text-[#00B37E]'
              : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
          }`}>
            {feedback.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
            {feedback.msg}
          </div>
        )}

        {/* Resultado do teste PIX */}
        {testResult && (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 p-2.5 rounded-[4px] border text-xs ${
              testResult.success
                ? 'bg-[#2563EB]/10 border-[#2563EB]/20 text-[#2563EB]'
                : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
            }`}>
              {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
              <span className="flex-1">{testResult.message}</span>
              <button onClick={() => setTestResult(null)}><X className="h-3 w-3 opacity-50 hover:opacity-100" /></button>
            </div>
            {testResult.success && (
              <>
                {testResult.qrCodeImage && (
                  <div className="flex flex-col items-center gap-2 p-4 rounded-[4px] bg-white">
                    <img src={testResult.qrCodeImage} alt="QR Code PIX" className="w-44 h-44" />
                    <p className="text-[10px] text-[#999] font-semibold">PIX R$10 — escaneie para pagar</p>
                  </div>
                )}
                {testResult.pixCode && (
                  <div>
                    <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">PIX Copia e Cola</p>
                    <div className="relative">
                      <input readOnly value={testResult.pixCode}
                        className="w-full h-8 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-9 font-mono text-[10px] text-white focus:outline-none" />
                      <button onClick={() => copy(testResult.pixCode)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#444] hover:text-white transition-colors">
                        {copied ? <Check className="h-3 w-3 text-[#2563EB]" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    {testResult.transactionId && (
                      <p className="text-[9px] text-[#333] font-mono mt-1">ID: {testResult.transactionId}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="px-5 pb-5 flex items-center gap-2">
        {!loading && (
          <>
            {!acquirer ? (
              showForm ? (
                <>
                  <button onClick={save} disabled={saving || !apiKey.trim()}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Cancelar
                  </button>
                </>
              ) : (
                <button onClick={() => setShowForm(true)}
                  className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}>
                  <ArrowRight className="h-3.5 w-3.5" /> Adicionar API Key
                </button>
              )
            ) : !isValid ? (
              showForm ? (
                <>
                  <button onClick={save} disabled={saving || !apiKey.trim()}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button onClick={validate} disabled={validating}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}>
                    {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {validating ? 'Validando...' : 'Validar credenciais'}
                  </button>
                  <button onClick={() => { setShowForm(true); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Alterar chave
                  </button>
                </>
              )
            ) : showForm ? (
              <>
                <button onClick={save} disabled={saving || !apiKey.trim()}
                  className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={() => { setShowForm(false); setFeedback(null) }}
                  className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button onClick={testPix} disabled={testing}
                  className="flex-1 h-9 rounded-[4px] border text-xs font-semibold hover:bg-[#2563EB]/10 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ borderColor: '#2563EB30', color: NEXUSPAG_ACCENT }}>
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Testar R$10
                </button>
                <button onClick={() => { setShowForm(true); setFeedback(null) }}
                  className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                  Alterar chave
                </button>
              </>
            )}
          </>
        )}
      </div>
    </AcquirerCard>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// CARD QRCODES (SULCREDI)
// ═════════════════════════════════════════════════════════════════════════════

const QRCODES_ACCENT = '#00897B'
const QRCODES2_ACCENT = '#0EA5E9'
const QRCODES3_ACCENT = '#F59E0B'

function QRCodesCard({ onValidated }: { onValidated?: () => void }) {
  const [acquirer,    setAcquirer]    = useState<any>(null)
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [clientId,    setClientId]    = useState('')
  const [clientSecret,setClientSecret] = useState('')
  const [pixChave,    setPixChave]    = useState('')
  const [environment, setEnvironment] = useState<'production' | 'sandbox'>('production')
  const [showCid,     setShowCid]     = useState(false)
  const [showCsec,    setShowCsec]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [feedback,    setFeedback]    = useState<{ ok: boolean; msg: string } | null>(null)
  const [testResult,  setTestResult]  = useState<any>(null)
  const [testing,     setTesting]     = useState(false)
  const [validating,  setValidating]  = useState(false)
  const [copied,      setCopied]      = useState(false)

  const loadAcquirer = useCallback(async () => {
    try {
      const list: any[] = await api.get('/admin/acquirers')
      setAcquirer(list.find((a: any) => a.slug === 'qrcodes') ?? null)
    } catch { setAcquirer(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAcquirer() }, [loadAcquirer])

  const canSave = clientId.trim().length > 0 && clientSecret.trim().length > 0 && pixChave.trim().length > 0

  const save = async () => {
    if (!canSave) return
    setSaving(true); setFeedback(null)
    try {
      if (!acquirer) {
        await api.post('/admin/acquirers', {
          name: 'QRCodes (Sulcredi)', slug: 'qrcodes',
          apiKey: clientId.trim(), apiSecret: clientSecret.trim(),
          endpointCreatePix: pixChave.trim(), environment,
          priority: 3, isActive: false,
        })
      } else {
        await api.patch(`/admin/acquirers/${acquirer.id}`, {
          apiKey: clientId.trim(), apiSecret: clientSecret.trim(),
          endpointCreatePix: pixChave.trim(), environment,
        })
      }
      setClientId(''); setClientSecret(''); setPixChave('')
      setShowForm(false)
      await loadAcquirer()
      setFeedback({ ok: true, msg: 'Credenciais salvas! Clique em "Validar credenciais" para ativar.' })
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message || 'Erro ao salvar' })
    } finally { setSaving(false) }
  }

  const validate = async () => {
    if (!acquirer?.id) return
    setValidating(true); setFeedback(null)
    try {
      const r: any = await api.post(`/admin/acquirers/${acquirer.id}/validate`, {})
      setFeedback({ ok: r.success, msg: r.message })
      await loadAcquirer()
      if (r.success) onValidated?.()
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message || 'Erro ao validar' })
    } finally { setValidating(false) }
  }

  const testPix = async () => {
    if (!acquirer?.id) return
    setTesting(true); setTestResult(null)
    try { setTestResult(await api.post(`/admin/acquirers/${acquirer.id}/test-pix`, {})) }
    catch (e: any) { setTestResult({ success: false, message: e.message }) }
    finally { setTesting(false) }
  }

  const copy = (t: string) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const isValid    = acquirer?.credentialStatus === 'VALID' || acquirer?.credentialStatus === 'UNSTABLE'
  const credStatus: CredStatus = acquirer?.credentialStatus ?? 'UNCONFIGURED'

  return (
    <AcquirerCard accent={QRCODES_ACCENT} active={isValid}>
      <div className="p-5 flex flex-col gap-4 flex-1">

        {/* Logo + Nome */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[4px] flex items-center justify-center text-white font-black text-lg shrink-0"
              style={{ background: 'linear-gradient(135deg, #00897B 0%, #00695C 100%)' }}>B</div>
            <div>
              <p className="text-base font-black text-white">BaassPago · Cliconbr</p>
              <p className="text-[11px] text-[#555]">PIX via BaassPago (mTLS · BCB)</p>
            </div>
          </div>
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-[#444]" />
            : <Badge status={credStatus} />}
        </div>

        {/* Ambiente / última validação */}
        {acquirer && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border"
              style={{ color: QRCODES_ACCENT, background: `${QRCODES_ACCENT}18`, borderColor: `${QRCODES_ACCENT}30` }}>
              {acquirer.environment === 'sandbox' ? 'sandbox' : 'produção'}
            </span>
            {acquirer.lastValidatedAt && (
              <span className="text-[10px] text-[#333]">
                validado {new Date(acquirer.lastValidatedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        )}

        {/* Estado vazio */}
        {!loading && !acquirer && !showForm && (
          <p className="text-xs text-[#444] leading-relaxed">
            Gateway PIX BaassPago (Cliconbr) via API BCB com mTLS. Insira Client ID e Client Secret gerados em Configurações › API qr-code no painel BaassPago, mais sua chave PIX.
          </p>
        )}

        {/* Formulário */}
        {showForm && (
          <div className="flex flex-col gap-2">
            {/* Client ID */}
            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Client ID</p>
              <div className="relative">
                <input
                  type={showCid ? 'text' : 'password'}
                  value={clientId}
                  onChange={e => { setClientId(e.target.value); setFeedback(null) }}
                  placeholder="client_id..."
                  className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-10 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#00897B]/50 transition-all"
                />
                <button onClick={() => setShowCid(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-white">
                  {showCid ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Client Secret */}
            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Client Secret</p>
              <div className="relative">
                <input
                  type={showCsec ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={e => { setClientSecret(e.target.value); setFeedback(null) }}
                  placeholder="client_secret..."
                  className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-10 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#00897B]/50 transition-all"
                />
                <button onClick={() => setShowCsec(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-white">
                  {showCsec ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Chave PIX */}
            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Chave PIX (recebimento)</p>
              <input
                type="text"
                value={pixChave}
                onChange={e => { setPixChave(e.target.value); setFeedback(null) }}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder="EVP, CPF, e-mail ou telefone..."
                className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#00897B]/50 transition-all"
              />
            </div>

            {/* Ambiente */}
            <div className="flex items-center gap-2 pt-1">
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide">Ambiente:</p>
              {(['production', 'sandbox'] as const).map(env => (
                <button key={env} onClick={() => setEnvironment(env)}
                  className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border transition-all ${
                    environment === env
                      ? 'text-white bg-[#00897B] border-[#00897B]'
                      : 'text-[#444] border-white/[0.06] hover:text-white'
                  }`}>
                  {env === 'production' ? 'Produção' : 'Sandbox'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div className={`flex items-center gap-2 p-2.5 rounded-[4px] border text-xs font-medium ${
            feedback.ok
              ? 'bg-[#00897B]/10 border-[#00897B]/20 text-[#00B37E]'
              : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
          }`}>
            {feedback.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
            {feedback.msg}
          </div>
        )}

        {/* Resultado do teste PIX */}
        {testResult && (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 p-2.5 rounded-[4px] border text-xs ${
              testResult.success
                ? 'bg-[#00897B]/10 border-[#00897B]/20 text-[#00B37E]'
                : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
            }`}>
              {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
              <span className="flex-1">{testResult.message}</span>
              <button onClick={() => setTestResult(null)}><X className="h-3 w-3 opacity-50 hover:opacity-100" /></button>
            </div>
            {testResult.success && (
              <>
                {testResult.qrCodeImage && (
                  <div className="flex flex-col items-center gap-2 p-4 rounded-[4px] bg-white">
                    <img src={testResult.qrCodeImage} alt="QR Code PIX" className="w-44 h-44" />
                    <p className="text-[10px] text-[#999] font-semibold">PIX R$10 — escaneie para pagar</p>
                  </div>
                )}
                {testResult.pixCode && (
                  <div>
                    <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">PIX Copia e Cola</p>
                    <div className="relative">
                      <input readOnly value={testResult.pixCode}
                        className="w-full h-8 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-9 font-mono text-[10px] text-white focus:outline-none" />
                      <button onClick={() => copy(testResult.pixCode)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#444] hover:text-white transition-colors">
                        {copied ? <Check className="h-3 w-3 text-[#00897B]" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    {testResult.transactionId && (
                      <p className="text-[9px] text-[#333] font-mono mt-1">ID: {testResult.transactionId}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="px-5 pb-5 flex items-center gap-2">
        {!loading && (
          <>
            {!acquirer ? (
              showForm ? (
                <>
                  <button onClick={save} disabled={saving || !canSave}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #00897B 0%, #00695C 100%)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Cancelar
                  </button>
                </>
              ) : (
                <button onClick={() => setShowForm(true)}
                  className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #00897B 0%, #00695C 100%)' }}>
                  <ArrowRight className="h-3.5 w-3.5" /> Adicionar credenciais
                </button>
              )
            ) : !isValid ? (
              showForm ? (
                <>
                  <button onClick={save} disabled={saving || !canSave}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #00897B 0%, #00695C 100%)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button onClick={validate} disabled={validating}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #00897B 0%, #00695C 100%)' }}>
                    {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {validating ? 'Validando...' : 'Validar credenciais'}
                  </button>
                  <button onClick={() => { setShowForm(true); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Alterar
                  </button>
                </>
              )
            ) : showForm ? (
              <>
                <button onClick={save} disabled={saving || !canSave}
                  className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #00897B 0%, #00695C 100%)' }}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={() => { setShowForm(false); setFeedback(null) }}
                  className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button onClick={testPix} disabled={testing}
                  className="flex-1 h-9 rounded-[4px] border text-xs font-semibold hover:bg-[#00897B]/10 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ borderColor: '#00897B30', color: QRCODES_ACCENT }}>
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Testar R$10
                </button>
                <button onClick={() => { setShowForm(true); setFeedback(null) }}
                  className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                  Alterar
                </button>
              </>
            )}
          </>
        )}
      </div>
    </AcquirerCard>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// CARD BAASSPAGO · CLICONBR 2 (segunda conta, credenciais/certificado próprios)
// ═════════════════════════════════════════════════════════════════════════════

function QRCodes2Card({ onValidated }: { onValidated?: () => void }) {
  const [acquirer,    setAcquirer]    = useState<any>(null)
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [clientId,    setClientId]    = useState('')
  const [clientSecret,setClientSecret] = useState('')
  const [pixChave,    setPixChave]    = useState('')
  const [environment, setEnvironment] = useState<'production' | 'sandbox'>('production')
  const [showCid,     setShowCid]     = useState(false)
  const [showCsec,    setShowCsec]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [feedback,    setFeedback]    = useState<{ ok: boolean; msg: string } | null>(null)
  const [testResult,  setTestResult]  = useState<any>(null)
  const [testing,     setTesting]     = useState(false)
  const [validating,  setValidating]  = useState(false)
  const [copied,      setCopied]      = useState(false)

  const loadAcquirer = useCallback(async () => {
    try {
      const list: any[] = await api.get('/admin/acquirers')
      setAcquirer(list.find((a: any) => a.slug === 'qrcodes2') ?? null)
    } catch { setAcquirer(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAcquirer() }, [loadAcquirer])

  const canSave = clientId.trim().length > 0 && clientSecret.trim().length > 0 && pixChave.trim().length > 0

  const save = async () => {
    if (!canSave) return
    setSaving(true); setFeedback(null)
    try {
      if (!acquirer) {
        await api.post('/admin/acquirers', {
          name: 'BaassPago Cliconbr 2', slug: 'qrcodes2',
          apiKey: clientId.trim(), apiSecret: clientSecret.trim(),
          endpointCreatePix: pixChave.trim(), environment,
          priority: 4, isActive: false,
        })
      } else {
        await api.patch(`/admin/acquirers/${acquirer.id}`, {
          apiKey: clientId.trim(), apiSecret: clientSecret.trim(),
          endpointCreatePix: pixChave.trim(), environment,
        })
      }
      setClientId(''); setClientSecret(''); setPixChave('')
      setShowForm(false)
      await loadAcquirer()
      setFeedback({ ok: true, msg: 'Credenciais salvas! Clique em "Validar credenciais" para ativar.' })
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message || 'Erro ao salvar' })
    } finally { setSaving(false) }
  }

  const validate = async () => {
    if (!acquirer?.id) return
    setValidating(true); setFeedback(null)
    try {
      const r: any = await api.post(`/admin/acquirers/${acquirer.id}/validate`, {})
      setFeedback({ ok: r.success, msg: r.message })
      await loadAcquirer()
      if (r.success) onValidated?.()
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message || 'Erro ao validar' })
    } finally { setValidating(false) }
  }

  const testPix = async () => {
    if (!acquirer?.id) return
    setTesting(true); setTestResult(null)
    try { setTestResult(await api.post(`/admin/acquirers/${acquirer.id}/test-pix`, {})) }
    catch (e: any) { setTestResult({ success: false, message: e.message }) }
    finally { setTesting(false) }
  }

  const copy = (t: string) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const isValid    = acquirer?.credentialStatus === 'VALID' || acquirer?.credentialStatus === 'UNSTABLE'
  const credStatus: CredStatus = acquirer?.credentialStatus ?? 'UNCONFIGURED'

  return (
    <AcquirerCard accent={QRCODES2_ACCENT} active={isValid}>
      <div className="p-5 flex flex-col gap-4 flex-1">

        {/* Logo + Nome */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[4px] flex items-center justify-center text-white font-black text-lg shrink-0"
              style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)' }}>B2</div>
            <div>
              <p className="text-base font-black text-white">BaassPago · Cliconbr 2</p>
              <p className="text-[11px] text-[#555]">PIX via BaassPago (mTLS · BCB) — 2ª conta</p>
            </div>
          </div>
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-[#444]" />
            : <Badge status={credStatus} />}
        </div>

        {/* Ambiente / última validação */}
        {acquirer && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border"
              style={{ color: QRCODES2_ACCENT, background: `${QRCODES2_ACCENT}18`, borderColor: `${QRCODES2_ACCENT}30` }}>
              {acquirer.environment === 'sandbox' ? 'sandbox' : 'produção'}
            </span>
            {acquirer.lastValidatedAt && (
              <span className="text-[10px] text-[#333]">
                validado {new Date(acquirer.lastValidatedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        )}

        {/* Estado vazio */}
        {!loading && !acquirer && !showForm && (
          <p className="text-xs text-[#444] leading-relaxed">
            Segunda conta BaassPago (Cliconbr), independente da primeira — outras credenciais e outro certificado mTLS. Insira Client ID e Client Secret gerados em Configurações › API qr-code no painel dessa conta, mais a chave PIX correspondente.
          </p>
        )}

        {/* Formulário */}
        {showForm && (
          <div className="flex flex-col gap-2">
            {/* Client ID */}
            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Client ID</p>
              <div className="relative">
                <input
                  type={showCid ? 'text' : 'password'}
                  value={clientId}
                  onChange={e => { setClientId(e.target.value); setFeedback(null) }}
                  placeholder="client_id..."
                  className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-10 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#0EA5E9]/50 transition-all"
                />
                <button onClick={() => setShowCid(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-white">
                  {showCid ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Client Secret */}
            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Client Secret</p>
              <div className="relative">
                <input
                  type={showCsec ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={e => { setClientSecret(e.target.value); setFeedback(null) }}
                  placeholder="client_secret..."
                  className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-10 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#0EA5E9]/50 transition-all"
                />
                <button onClick={() => setShowCsec(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-white">
                  {showCsec ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Chave PIX */}
            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Chave PIX (recebimento)</p>
              <input
                type="text"
                value={pixChave}
                onChange={e => { setPixChave(e.target.value); setFeedback(null) }}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder="EVP, CPF, e-mail ou telefone..."
                className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#0EA5E9]/50 transition-all"
              />
            </div>

            {/* Ambiente */}
            <div className="flex items-center gap-2 pt-1">
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide">Ambiente:</p>
              {(['production', 'sandbox'] as const).map(env => (
                <button key={env} onClick={() => setEnvironment(env)}
                  className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border transition-all ${
                    environment === env
                      ? 'text-white bg-[#0EA5E9] border-[#0EA5E9]'
                      : 'text-[#444] border-white/[0.06] hover:text-white'
                  }`}>
                  {env === 'production' ? 'Produção' : 'Sandbox'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div className={`flex items-center gap-2 p-2.5 rounded-[4px] border text-xs font-medium ${
            feedback.ok
              ? 'bg-[#0EA5E9]/10 border-[#0EA5E9]/20 text-[#38BDF8]'
              : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
          }`}>
            {feedback.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
            {feedback.msg}
          </div>
        )}

        {/* Resultado do teste PIX */}
        {testResult && (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 p-2.5 rounded-[4px] border text-xs ${
              testResult.success
                ? 'bg-[#0EA5E9]/10 border-[#0EA5E9]/20 text-[#38BDF8]'
                : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
            }`}>
              {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
              <span className="flex-1">{testResult.message}</span>
              <button onClick={() => setTestResult(null)}><X className="h-3 w-3 opacity-50 hover:opacity-100" /></button>
            </div>
            {testResult.success && (
              <>
                {testResult.qrCodeImage && (
                  <div className="flex flex-col items-center gap-2 p-4 rounded-[4px] bg-white">
                    <img src={testResult.qrCodeImage} alt="QR Code PIX" className="w-44 h-44" />
                    <p className="text-[10px] text-[#999] font-semibold">PIX R$10 — escaneie para pagar</p>
                  </div>
                )}
                {testResult.pixCode && (
                  <div>
                    <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">PIX Copia e Cola</p>
                    <div className="relative">
                      <input readOnly value={testResult.pixCode}
                        className="w-full h-8 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-9 font-mono text-[10px] text-white focus:outline-none" />
                      <button onClick={() => copy(testResult.pixCode)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#444] hover:text-white transition-colors">
                        {copied ? <Check className="h-3 w-3 text-[#0EA5E9]" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    {testResult.transactionId && (
                      <p className="text-[9px] text-[#333] font-mono mt-1">ID: {testResult.transactionId}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="px-5 pb-5 flex items-center gap-2">
        {!loading && (
          <>
            {!acquirer ? (
              showForm ? (
                <>
                  <button onClick={save} disabled={saving || !canSave}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Cancelar
                  </button>
                </>
              ) : (
                <button onClick={() => setShowForm(true)}
                  className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)' }}>
                  <ArrowRight className="h-3.5 w-3.5" /> Adicionar credenciais
                </button>
              )
            ) : !isValid ? (
              showForm ? (
                <>
                  <button onClick={save} disabled={saving || !canSave}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button onClick={validate} disabled={validating}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)' }}>
                    {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {validating ? 'Validando...' : 'Validar credenciais'}
                  </button>
                  <button onClick={() => { setShowForm(true); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Alterar
                  </button>
                </>
              )
            ) : showForm ? (
              <>
                <button onClick={save} disabled={saving || !canSave}
                  className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)' }}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={() => { setShowForm(false); setFeedback(null) }}
                  className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button onClick={testPix} disabled={testing}
                  className="flex-1 h-9 rounded-[4px] border text-xs font-semibold hover:bg-[#0EA5E9]/10 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ borderColor: '#0EA5E930', color: QRCODES2_ACCENT }}>
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Testar R$10
                </button>
                <button onClick={() => { setShowForm(true); setFeedback(null) }}
                  className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                  Alterar
                </button>
              </>
            )}
          </>
        )}
      </div>
    </AcquirerCard>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// CARD BAASSPAGO CLICONBR 3
// ═════════════════════════════════════════════════════════════════════════════

function QRCodes3Card({ onValidated }: { onValidated?: () => void }) {
  const [acquirer,    setAcquirer]    = useState<any>(null)
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [clientId,    setClientId]    = useState('')
  const [clientSecret,setClientSecret] = useState('')
  const [pixChave,    setPixChave]    = useState('')
  const [environment, setEnvironment] = useState<'production' | 'sandbox'>('production')
  const [showCid,     setShowCid]     = useState(false)
  const [showCsec,    setShowCsec]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [feedback,    setFeedback]    = useState<{ ok: boolean; msg: string } | null>(null)
  const [testResult,  setTestResult]  = useState<any>(null)
  const [testing,     setTesting]     = useState(false)
  const [validating,  setValidating]  = useState(false)
  const [copied,      setCopied]      = useState(false)

  const loadAcquirer = useCallback(async () => {
    try {
      const list: any[] = await api.get('/admin/acquirers')
      setAcquirer(list.find((a: any) => a.slug === 'qrcodes3') ?? null)
    } catch { setAcquirer(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAcquirer() }, [loadAcquirer])

  const canSave = clientId.trim().length > 0 && clientSecret.trim().length > 0 && pixChave.trim().length > 0

  const save = async () => {
    if (!canSave) return
    setSaving(true); setFeedback(null)
    try {
      if (!acquirer) {
        await api.post('/admin/acquirers', {
          name: 'BaassPago Cliconbr 3', slug: 'qrcodes3',
          apiKey: clientId.trim(), apiSecret: clientSecret.trim(),
          endpointCreatePix: pixChave.trim(), environment,
          priority: 5, isActive: false,
        })
      } else {
        await api.patch(`/admin/acquirers/${acquirer.id}`, {
          apiKey: clientId.trim(), apiSecret: clientSecret.trim(),
          endpointCreatePix: pixChave.trim(), environment,
        })
      }
      setClientId(''); setClientSecret(''); setPixChave('')
      setShowForm(false)
      await loadAcquirer()
      setFeedback({ ok: true, msg: 'Credenciais salvas! Clique em "Validar credenciais" para ativar.' })
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message || 'Erro ao salvar' })
    } finally { setSaving(false) }
  }

  const validate = async () => {
    if (!acquirer?.id) return
    setValidating(true); setFeedback(null)
    try {
      const r: any = await api.post(`/admin/acquirers/${acquirer.id}/validate`, {})
      setFeedback({ ok: r.success, msg: r.message })
      await loadAcquirer()
      if (r.success) onValidated?.()
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message || 'Erro ao validar' })
    } finally { setValidating(false) }
  }

  const testPix = async () => {
    if (!acquirer?.id) return
    setTesting(true); setTestResult(null)
    try { setTestResult(await api.post(`/admin/acquirers/${acquirer.id}/test-pix`, {})) }
    catch (e: any) { setTestResult({ success: false, message: e.message }) }
    finally { setTesting(false) }
  }

  const copy = (t: string) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const isValid    = acquirer?.credentialStatus === 'VALID' || acquirer?.credentialStatus === 'UNSTABLE'
  const credStatus: CredStatus = acquirer?.credentialStatus ?? 'UNCONFIGURED'

  return (
    <AcquirerCard accent={QRCODES3_ACCENT} active={isValid}>
      <div className="p-5 flex flex-col gap-4 flex-1">

        {/* Logo + Nome */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[4px] flex items-center justify-center text-white font-black text-lg shrink-0"
              style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)' }}>B3</div>
            <div>
              <p className="text-base font-black text-white">BaassPago · Cliconbr 3</p>
              <p className="text-[11px] text-[#555]">PIX via BaassPago (mTLS · BCB) — 3ª conta</p>
            </div>
          </div>
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-[#444]" />
            : <Badge status={credStatus} />}
        </div>

        {/* Ambiente / última validação */}
        {acquirer && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border"
              style={{ color: QRCODES3_ACCENT, background: `${QRCODES3_ACCENT}18`, borderColor: `${QRCODES3_ACCENT}30` }}>
              {acquirer.environment === 'sandbox' ? 'sandbox' : 'produção'}
            </span>
            {acquirer.lastValidatedAt && (
              <span className="text-[10px] text-[#333]">
                validado {new Date(acquirer.lastValidatedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        )}

        {/* Estado vazio */}
        {!loading && !acquirer && !showForm && (
          <p className="text-xs text-[#444] leading-relaxed">
            Terceira conta BaassPago (Cliconbr), independente das outras duas — outras credenciais e outro certificado mTLS. Insira Client ID e Client Secret gerados em Configurações › API qr-code no painel dessa conta, mais a chave PIX correspondente.
          </p>
        )}

        {/* Formulário */}
        {showForm && (
          <div className="flex flex-col gap-2">
            {/* Client ID */}
            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Client ID</p>
              <div className="relative">
                <input
                  type={showCid ? 'text' : 'password'}
                  value={clientId}
                  onChange={e => { setClientId(e.target.value); setFeedback(null) }}
                  placeholder="client_id..."
                  className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-10 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#F59E0B]/50 transition-all"
                />
                <button onClick={() => setShowCid(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-white">
                  {showCid ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Client Secret */}
            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Client Secret</p>
              <div className="relative">
                <input
                  type={showCsec ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={e => { setClientSecret(e.target.value); setFeedback(null) }}
                  placeholder="client_secret..."
                  className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-10 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#F59E0B]/50 transition-all"
                />
                <button onClick={() => setShowCsec(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-white">
                  {showCsec ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Chave PIX */}
            <div>
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">Chave PIX (recebimento)</p>
              <input
                type="text"
                value={pixChave}
                onChange={e => { setPixChave(e.target.value); setFeedback(null) }}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder="EVP, CPF, e-mail ou telefone..."
                className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 font-mono text-xs text-white placeholder:text-[#333] focus:outline-none focus:border-[#F59E0B]/50 transition-all"
              />
            </div>

            {/* Ambiente */}
            <div className="flex items-center gap-2 pt-1">
              <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide">Ambiente:</p>
              {(['production', 'sandbox'] as const).map(env => (
                <button key={env} onClick={() => setEnvironment(env)}
                  className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border transition-all ${
                    environment === env
                      ? 'text-white bg-[#F59E0B] border-[#F59E0B]'
                      : 'text-[#444] border-white/[0.06] hover:text-white'
                  }`}>
                  {env === 'production' ? 'Produção' : 'Sandbox'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div className={`flex items-center gap-2 p-2.5 rounded-[4px] border text-xs font-medium ${
            feedback.ok
              ? 'bg-[#F59E0B]/10 border-[#F59E0B]/20 text-[#FCD34D]'
              : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
          }`}>
            {feedback.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
            {feedback.msg}
          </div>
        )}

        {/* Resultado do teste PIX */}
        {testResult && (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 p-2.5 rounded-[4px] border text-xs ${
              testResult.success
                ? 'bg-[#F59E0B]/10 border-[#F59E0B]/20 text-[#FCD34D]'
                : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
            }`}>
              {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
              <span className="flex-1">{testResult.message}</span>
              <button onClick={() => setTestResult(null)}><X className="h-3 w-3 opacity-50 hover:opacity-100" /></button>
            </div>
            {testResult.success && (
              <>
                {testResult.qrCodeImage && (
                  <div className="flex flex-col items-center gap-2 p-4 rounded-[4px] bg-white">
                    <img src={testResult.qrCodeImage} alt="QR Code PIX" className="w-44 h-44" />
                    <p className="text-[10px] text-[#999] font-semibold">PIX R$10 — escaneie para pagar</p>
                  </div>
                )}
                {testResult.pixCode && (
                  <div>
                    <p className="text-[9px] text-[#444] font-bold uppercase tracking-wide mb-1">PIX Copia e Cola</p>
                    <div className="relative">
                      <input readOnly value={testResult.pixCode}
                        className="w-full h-8 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-9 font-mono text-[10px] text-white focus:outline-none" />
                      <button onClick={() => copy(testResult.pixCode)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#444] hover:text-white transition-colors">
                        {copied ? <Check className="h-3 w-3 text-[#F59E0B]" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    {testResult.transactionId && (
                      <p className="text-[9px] text-[#333] font-mono mt-1">ID: {testResult.transactionId}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="px-5 pb-5 flex items-center gap-2">
        {!loading && (
          <>
            {!acquirer ? (
              showForm ? (
                <>
                  <button onClick={save} disabled={saving || !canSave}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Cancelar
                  </button>
                </>
              ) : (
                <button onClick={() => setShowForm(true)}
                  className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)' }}>
                  <ArrowRight className="h-3.5 w-3.5" /> Adicionar credenciais
                </button>
              )
            ) : !isValid ? (
              showForm ? (
                <>
                  <button onClick={save} disabled={saving || !canSave}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button onClick={validate} disabled={validating}
                    className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)' }}>
                    {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {validating ? 'Validando...' : 'Validar credenciais'}
                  </button>
                  <button onClick={() => { setShowForm(true); setFeedback(null) }}
                    className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                    Alterar
                  </button>
                </>
              )
            ) : showForm ? (
              <>
                <button onClick={save} disabled={saving || !canSave}
                  className="flex-1 h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)' }}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={() => { setShowForm(false); setFeedback(null) }}
                  className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button onClick={testPix} disabled={testing}
                  className="flex-1 h-9 rounded-[4px] border text-xs font-semibold hover:bg-[#F59E0B]/10 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ borderColor: '#F59E0B30', color: QRCODES3_ACCENT }}>
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Testar R$10
                </button>
                <button onClick={() => { setShowForm(true); setFeedback(null) }}
                  className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white">
                  Alterar
                </button>
              </>
            )}
          </>
        )}
      </div>
    </AcquirerCard>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════

export default function AdminAdquirentesPage() {
  const [priorityKey, setPriorityKey] = useState(0)

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <QrCode className="h-6 w-6 text-[#7C3AED]" />
          Adquirentes PIX
        </h1>
        <p className="text-sm text-[#555] mt-1">
          Gateways de pagamento com fallback automático — o sistema tenta o #1, se falhar vai pro #2
        </p>
      </div>

      {/* Ordem de prioridade */}
      <PrioritySection refreshKey={priorityKey} />

      {/* Grid de cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <PodpayCard onValidated={() => setPriorityKey(k => k + 1)} />
        <PixzypayCard onValidated={() => setPriorityKey(k => k + 1)} />
        <NexusPagCard onValidated={() => setPriorityKey(k => k + 1)} />
        <QRCodesCard onValidated={() => setPriorityKey(k => k + 1)} />
        <QRCodes2Card onValidated={() => setPriorityKey(k => k + 1)} />
        <QRCodes3Card onValidated={() => setPriorityKey(k => k + 1)} />
      </div>

      {/* Info de fallback */}
      <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] p-4 flex items-start gap-3">
        <div className="w-5 h-5 rounded-[3px] bg-[#7C3AED]/15 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[9px] font-black text-[#A78BFA]">i</span>
        </div>
        <p className="text-[11px] text-[#444] leading-relaxed">
          <span className="text-[#666] font-semibold">Fallback automático:</span> quando um PIX é gerado para um lead, o sistema tenta o adquirente #1.
          Se a cobrança falhar, tenta o #2 automaticamente — garantindo máxima taxa de conversão.
        </p>
      </div>

    </div>
  )
}
