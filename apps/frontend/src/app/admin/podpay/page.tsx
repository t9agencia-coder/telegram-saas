'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle, Eye, EyeOff,
  RefreshCw, Zap, Copy, Check, ExternalLink, Wallet,
  Clock, TrendingUp, Shield, ArrowRight, Settings,
} from 'lucide-react'

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface PodpayStatus {
  configured: boolean
  id?: string
  environment?: string
  credentialStatus?: 'UNCONFIGURED' | 'VALID' | 'INVALID' | 'UNSTABLE'
  isActive?: boolean
  lastValidatedAt?: string
  lastTestedAt?: string
}

interface PodpayBalance {
  amount: number
  waitingFunds: number
  maxAntecipable: number
  reserve: number
}

interface PodpayTransaction {
  id: string
  status: string
  amount: number
  paymentMethod: string
  customer?: { name?: string; email?: string }
  createdAt: string
  paidAt?: string
}

type PixTestResult = {
  success: boolean
  transactionId?: string
  pixCode?: string
  qrCodeImage?: string
  message: string
  credentialStatus: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function centsToBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const STATUS_TX: Record<string, { label: string; color: string; bg: string }> = {
  paid:       { label: 'Pago',       color: '#00B37E', bg: '#00B37E12' },
  PAID:       { label: 'Pago',       color: '#00B37E', bg: '#00B37E12' },
  pending:    { label: 'Pendente',   color: '#F59E0B', bg: '#F59E0B12' },
  PENDING:    { label: 'Pendente',   color: '#F59E0B', bg: '#F59E0B12' },
  processing: { label: 'Processando',color: '#3B82F6', bg: '#3B82F612' },
  PROCESSING: { label: 'Processando',color: '#3B82F6', bg: '#3B82F612' },
  failed:     { label: 'Falhou',     color: '#EF4444', bg: '#EF444412' },
  FAILED:     { label: 'Falhou',     color: '#EF4444', bg: '#EF444412' },
  cancelled:  { label: 'Cancelado',  color: '#555',    bg: '#1A1A1A'   },
  CANCELLED:  { label: 'Cancelado',  color: '#555',    bg: '#1A1A1A'   },
  canceled:   { label: 'Cancelado',  color: '#555',    bg: '#1A1A1A'   },
  refunded:   { label: 'Estornado',  color: '#8B5CF6', bg: '#8B5CF612' },
  REFUNDED:   { label: 'Estornado',  color: '#8B5CF6', bg: '#8B5CF612' },
  blocked:    { label: 'Bloqueado',  color: '#EF4444', bg: '#EF444412' },
  BLOCKED:    { label: 'Bloqueado',  color: '#EF4444', bg: '#EF444412' },
}

// ─── Logo Podpay ──────────────────────────────────────────────────────────────

function PodpayLogo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-[4px] flex items-center justify-center text-white font-black shrink-0"
      style={{ width: size, height: size, background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)' }}
    >
      <span style={{ fontSize: size * 0.35 }}>P</span>
    </div>
  )
}

// ─── Tela de setup (sem chave configurada) ────────────────────────────────────

function SetupScreen({ onConnected }: { onConnected: () => void }) {
  const [apiKey,   setApiKey]   = useState('')
  const [showKey,  setShowKey]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [result,   setResult]   = useState<null | { success: boolean; message: string; environment: string }>(null)

  // Auto-detecta ambiente
  const env = apiKey.startsWith('sk_test') ? 'sandbox' : apiKey.startsWith('sk_live') ? 'production' : null

  const connect = async () => {
    if (!apiKey.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res: any = await api.post('/admin/podpay/setup', { apiKey: apiKey.trim() })
      setResult(res)
      if (res.success) {
        setTimeout(onConnected, 1200)
      }
    } catch (e: any) {
      setError(e?.message || 'Erro ao conectar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="w-full max-w-md space-y-8">

        {/* Header */}
        <div className="flex flex-col items-center gap-4 text-center">
          <PodpayLogo size={64} />
          <div>
            <h1 className="text-2xl font-black text-white">Conectar Podpay</h1>
            <p className="text-sm text-[#555] mt-1.5">
              Cole sua API Key do dashboard Podpay e comece a receber pagamentos
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] p-6 space-y-5">

          {/* Campo API Key */}
          <div>
            <label className="text-[10px] font-bold text-[#555] uppercase tracking-wide block mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setResult(null); setError('') }}
                onKeyDown={e => e.key === 'Enter' && connect()}
                placeholder="sk_live_... ou sk_test_..."
                className="w-full h-11 rounded-[4px] border border-white/[0.06] bg-[#141414] px-4 pr-11 font-mono text-sm text-white placeholder:text-[#2A2A2A] focus:outline-none focus:border-[#7C3AED]/50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-white transition-colors"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Badge de ambiente auto-detectado */}
            {env && (
              <div className="mt-2 flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${env === 'sandbox' ? 'bg-[#F59E0B]' : 'bg-[#00B37E]'}`} />
                <span className={`text-[11px] font-semibold ${env === 'sandbox' ? 'text-[#F59E0B]' : 'text-[#00B37E]'}`}>
                  Ambiente {env === 'sandbox' ? 'Sandbox (testes)' : 'Produção'} detectado automaticamente
                </span>
              </div>
            )}
          </div>

          {/* Feedback */}
          {result && (
            <div className={`flex items-start gap-3 p-3 rounded-[4px] border text-sm ${
              result.success
                ? 'bg-[#00B37E]/10 border-[#00B37E]/20 text-[#00B37E]'
                : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
            }`}>
              {result.success
                ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              }
              {result.message}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-3 rounded-[4px] bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-sm">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Botão */}
          <button
            onClick={connect}
            disabled={loading || !apiKey.trim()}
            className="w-full h-11 rounded-[4px] font-semibold text-sm text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)' }}
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Validando...</>
              : <><Shield className="h-4 w-4" /> Conectar Podpay</>
            }
          </button>
        </div>

        {/* Dicas */}
        <div className="space-y-2">
          {[
            'Acesse app.podpay.app → Configurações → API Keys',
            'Use sk_live_... para produção ou sk_test_... para testes',
            'A chave é validada automaticamente antes de ser salva',
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-md bg-[#7C3AED]/10 border border-[#7C3AED]/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[9px] font-black text-[#7C3AED]">{i + 1}</span>
              </div>
              <p className="text-[12px] text-[#444]">{tip}</p>
            </div>
          ))}
        </div>

        <a
          href="https://app.podpay.app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-[12px] text-[#555] hover:text-[#7C3AED] transition-colors"
        >
          Ir para o dashboard Podpay
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}

// ─── Tela de dashboard (conectado) ────────────────────────────────────────────

function Dashboard({ status, onDisconnect }: { status: PodpayStatus; onDisconnect: () => void }) {
  const [balance,      setBalance]      = useState<PodpayBalance | null>(null)
  const [transactions, setTransactions] = useState<PodpayTransaction[]>([])
  const [loadingBal,   setLoadingBal]   = useState(true)
  const [loadingTx,    setLoadingTx]    = useState(true)
  const [testResult,   setTestResult]   = useState<PixTestResult | null>(null)
  const [testing,      setTesting]      = useState(false)
  const [showChange,   setShowChange]   = useState(false)
  const [newKey,       setNewKey]       = useState('')
  const [showNewKey,   setShowNewKey]   = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [copied,       setCopied]       = useState(false)

  const loadBalance = useCallback(async () => {
    setLoadingBal(true)
    try { setBalance(await api.get('/admin/podpay/balance') as PodpayBalance) }
    catch { setBalance(null) }
    finally { setLoadingBal(false) }
  }, [])

  const loadTransactions = useCallback(async () => {
    setLoadingTx(true)
    try {
      const res: any = await api.get('/admin/podpay/transactions?page=1&pageSize=15')
      setTransactions(res?.transactions ?? [])
    }
    catch { setTransactions([]) }
    finally { setLoadingTx(false) }
  }, [])

  useEffect(() => {
    loadBalance()
    loadTransactions()
  }, [loadBalance, loadTransactions])

  const testPix = async () => {
    if (!status.id) return
    setTesting(true)
    setTestResult(null)
    try {
      const res: any = await api.post(`/admin/acquirers/${status.id}/test-pix`, {})
      setTestResult(res)
    } catch (e: any) {
      setTestResult({ success: false, message: e?.message || 'Erro', credentialStatus: 'UNSTABLE' })
    } finally { setTesting(false) }
  }

  const saveNewKey = async () => {
    if (!newKey.trim()) return
    setSaving(true)
    try {
      const res: any = await api.post('/admin/podpay/setup', { apiKey: newKey.trim() })
      if (res.success) { setShowChange(false); setNewKey(''); onDisconnect() }
    } finally { setSaving(false) }
  }

  const copyPix = (code: string) => {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const isSandbox   = status.environment === 'sandbox'
  const isValid     = status.credentialStatus === 'VALID'

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PodpayLogo size={44} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">Podpay</h1>
              {isValid
                ? <span className="text-[10px] font-semibold text-[#00B37E] bg-[#00B37E]/10 border border-[#00B37E]/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Conectado
                  </span>
                : <span className="text-[10px] font-semibold text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <XCircle className="h-2.5 w-2.5" /> Desconectado
                  </span>
              }
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                isSandbox
                  ? 'text-[#F59E0B] bg-[#F59E0B]/8 border-[#F59E0B]/20'
                  : 'text-[#00B37E] bg-[#00B37E]/8 border-[#00B37E]/20'
              }`}>
                {isSandbox ? 'sandbox' : 'produção'}
              </span>
            </div>
            <p className="text-xs text-[#444] mt-0.5">
              Última validação: {fmtDate(status.lastValidatedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowChange(s => !s); setTestResult(null) }}
            className="h-9 px-4 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white hover:bg-[#1E1E1E] transition-all flex items-center gap-1.5"
          >
            <Settings className="h-3.5 w-3.5" />
            Trocar chave
          </button>
          <button
            onClick={testPix}
            disabled={testing || !isValid}
            className="h-9 px-4 rounded-[4px] border border-[#F59E0B]/30 text-xs font-semibold text-[#F59E0B] hover:bg-[#F59E0B]/10 transition-all disabled:opacity-40 flex items-center gap-1.5"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Testar R$10
          </button>
          <button
            onClick={() => { loadBalance(); loadTransactions() }}
            className="h-9 w-9 rounded-[4px] border border-white/[0.06] flex items-center justify-center text-[#555] hover:text-white hover:bg-[#1E1E1E] transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Trocar chave */}
      {showChange && (
        <div className="bg-[#141414] border border-[#7C3AED]/20 rounded-[4px] p-4 flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type={showNewKey ? 'text' : 'password'}
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              placeholder="Nova API Key (sk_live_... ou sk_test_...)"
              className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-10 font-mono text-xs text-white placeholder:text-[#2A2A2A] focus:outline-none focus:border-[#7C3AED]/40 transition-all"
            />
            <button onClick={() => setShowNewKey(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-white">
              {showNewKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button
            onClick={saveNewKey}
            disabled={saving || !newKey.trim()}
            className="h-9 px-4 rounded-[4px] font-semibold text-xs text-white transition-all disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)' }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            Salvar
          </button>
          <button onClick={() => setShowChange(false)} className="h-9 w-9 rounded-[4px] border border-white/[0.06] flex items-center justify-center text-[#444] hover:text-white transition-all">
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Resultado do teste PIX */}
      {testResult && (
        <div className={`rounded-[4px] border p-4 flex flex-col gap-3 ${
          testResult.success
            ? 'bg-[#00B37E]/8 border-[#00B37E]/20'
            : 'bg-[#EF4444]/8 border-[#EF4444]/20'
        }`}>
          <div className="flex items-center gap-2">
            {testResult.success
              ? <CheckCircle2 className="h-4 w-4 text-[#00B37E]" />
              : <XCircle className="h-4 w-4 text-[#EF4444]" />
            }
            <p className={`text-sm font-semibold ${testResult.success ? 'text-[#00B37E]' : 'text-[#EF4444]'}`}>
              {testResult.message}
            </p>
          </div>

          {testResult.success && testResult.pixCode && (
            <div className="space-y-2">
              {testResult.qrCodeImage && (
                <div className="flex justify-center">
                  <img src={testResult.qrCodeImage} alt="QR Code" className="w-36 h-36 rounded-[3px] border border-white/[0.06]"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </div>
              )}
              <div className="relative">
                <input readOnly value={testResult.pixCode}
                  className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] px-3 pr-10 font-mono text-[11px] text-white focus:outline-none" />
                <button onClick={() => copyPix(testResult.pixCode!)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#444] hover:text-white transition-colors">
                  {copied ? <Check className="h-3.5 w-3.5 text-[#00B37E]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              {testResult.transactionId && (
                <p className="text-[10px] text-[#333] font-mono">ID: {testResult.transactionId}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Saldo */}
      <div>
        <h2 className="text-xs font-bold text-[#444] uppercase tracking-wide mb-3">Saldo da conta</h2>
        {loadingBal ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#7C3AED]" /></div>
        ) : balance ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Disponível',    value: balance.amount,         icon: Wallet,     color: '#00B37E' },
              { label: 'Em liberação',  value: balance.waitingFunds,   icon: Clock,      color: '#F59E0B' },
              { label: 'Antecipável',   value: balance.maxAntecipable, icon: TrendingUp, color: '#3B82F6' },
              { label: 'Reserva',       value: balance.reserve,        icon: Shield,     color: '#8B5CF6' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-[#141414] border border-white/[0.06] rounded-[4px] p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-[#444] uppercase tracking-wide">{label}</p>
                  <div className="w-7 h-7 rounded-[3px] flex items-center justify-center" style={{ background: `${color}15` }}>
                    <Icon className="h-3.5 w-3.5" style={{ color }} />
                  </div>
                </div>
                <p className="text-lg font-black text-white">{centsToBRL(value)}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] p-6 text-center">
            <p className="text-sm text-[#555]">Não foi possível carregar o saldo</p>
          </div>
        )}
      </div>

      {/* Transações recentes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-[#444] uppercase tracking-wide">Transações recentes</h2>
          <button onClick={loadTransactions} className="text-[10px] text-[#444] hover:text-white transition-colors flex items-center gap-1">
            <RefreshCw className="h-2.5 w-2.5" /> Atualizar
          </button>
        </div>

        <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden">
          {loadingTx ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#7C3AED]" /></div>
          ) : transactions.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-[#555]">Nenhuma transação encontrada</p>
              {isSandbox && <p className="text-xs text-[#333] mt-1">Você está no modo sandbox</p>}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['ID', 'Cliente', 'Valor', 'Método', 'Status', 'Data'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-[#333] uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, i) => {
                  const st = STATUS_TX[tx.status] ?? { label: tx.status, color: '#555', bg: '#1A1A1A' }
                  return (
                    <tr key={tx.id} className={`border-b border-[#0D0D0D] hover:bg-[#141414] transition-colors ${i === transactions.length - 1 ? 'border-0' : ''}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[11px] text-[#444]">{tx.id.slice(0, 16)}…</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-white font-medium">{tx.customer?.name || '—'}</p>
                        <p className="text-[10px] text-[#444]">{tx.customer?.email || ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-white">{centsToBRL(tx.amount)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-mono text-[#555] uppercase">{tx.paymentMethod}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: st.color, background: st.bg }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] text-[#444]">{fmtDate(tx.createdAt)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AdminPodpayPage() {
  const [status,  setStatus]  = useState<PodpayStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try { setStatus(await api.get('/admin/podpay') as PodpayStatus) }
    catch { setStatus({ configured: false }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-7 w-7 animate-spin text-[#7C3AED]" />
      </div>
    )
  }

  if (!status?.configured || status.credentialStatus === 'INVALID' || !status.isActive) {
    return <SetupScreen onConnected={loadStatus} />
  }

  return <Dashboard status={status} onDisconnect={loadStatus} />
}
