'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle, HelpCircle,
  Eye, EyeOff, Shield, ArrowRight, X, Zap, Copy, Check,
  Wallet, Clock, TrendingUp, RefreshCw, QrCode, Plus, ArrowUpDown,
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
            ) : (
              <>
                <button onClick={testPix} disabled={testing}
                  className="flex-1 h-9 rounded-[4px] border border-[#10B981]/30 text-xs font-semibold text-[#10B981] hover:bg-[#10B981]/10 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Testar R$10
                </button>
                <button onClick={() => { setShowForm(s => !s); setFeedback(null) }}
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
// SEÇÃO DE PRIORIDADE
// ═════════════════════════════════════════════════════════════════════════════

function PrioritySection({ refreshKey }: { refreshKey: number }) {
  const [acquirers, setAcquirers] = useState<any[]>([])
  const [swapping,  setSwapping]  = useState(false)
  const [done,      setDone]      = useState(false)

  const load = useCallback(async () => {
    try {
      const list: any[] = await api.get('/admin/acquirers')
      setAcquirers(list.sort((a, b) => a.priority - b.priority))
    } catch {}
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const swap = async () => {
    if (acquirers.length < 2) return
    setSwapping(true)
    try {
      const reversed = [...acquirers].reverse()
      await api.post('/admin/acquirers/reorder', { ids: reversed.map((a: any) => a.id) })
      setDone(true)
      setTimeout(() => setDone(false), 2000)
      await load()
    } catch {}
    finally { setSwapping(false) }
  }

  if (acquirers.length === 0) return null

  const ACCENT: Record<string, string> = { podpay: '#7C3AED', pixzypay: '#10B981', nexuspag: '#2563EB' }

  return (
    <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold text-[#444] uppercase tracking-wider">Ordem de falllback</span>
        {acquirers.map((a, i) => {
          const color = ACCENT[a.slug] ?? '#888'
          const active = a.credentialStatus === 'VALID' && a.isActive
          return (
            <div key={a.id} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="h-3 w-3 text-[#333]" />}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border"
                style={{
                  borderColor: active ? `${color}30` : '#222',
                  background:  active ? `${color}08` : '#0F0F0F',
                }}>
                <span className="text-[9px] font-black" style={{ color: active ? color : '#444' }}>#{i + 1}</span>
                <span className="text-[11px] font-semibold" style={{ color: active ? '#ddd' : '#444' }}>{a.name}</span>
                <span className="text-[9px]" style={{ color: active ? color : '#333' }}>
                  {active ? '● ativo' : '○ inativo'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {acquirers.length >= 2 && (
        <button
          onClick={swap}
          disabled={swapping}
          className="shrink-0 h-8 px-3 rounded-[4px] border border-white/[0.06] text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
          style={{ color: done ? '#00B37E' : '#555' }}
        >
          {swapping
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : done
              ? <CheckCircle2 className="h-3 w-3" />
              : <ArrowUpDown className="h-3 w-3" />
          }
          {done ? 'Ordem salva!' : 'Inverter ordem'}
        </button>
      )}
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
            ) : (
              <>
                <button onClick={testPix} disabled={testing}
                  className="flex-1 h-9 rounded-[4px] border text-xs font-semibold hover:bg-[#2563EB]/10 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ borderColor: '#2563EB30', color: NEXUSPAG_ACCENT }}>
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Testar R$10
                </button>
                <button onClick={() => { setShowForm(s => !s); setFeedback(null) }}
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
