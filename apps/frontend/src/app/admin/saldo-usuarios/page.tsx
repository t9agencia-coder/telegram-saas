'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  Wallet, Loader2, Percent, DollarSign, Check, X, Clock,
  CheckCircle2, XCircle, AlertCircle, ArrowDownToLine,
} from 'lucide-react'

type FeeType = 'FIXED' | 'PERCENTAGE'

interface BalanceConfig {
  feeType: FeeType
  feeValue: number
  withdrawalFee: number
}

interface WithdrawalRow {
  id: string
  amount: number
  feeAmount: number
  netAmount: number
  pixKeyType: string
  pixKey: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejectReason?: string | null
  requestedAt: string
  resolvedAt?: string | null
  workspace: { id: string; name: string }
}

interface Toast {
  type: 'success' | 'error'
  message: string
}

const statusConfig: Record<string, { label: string; icon: any; class: string }> = {
  PENDING:  { label: 'Pendente',  icon: Clock,        class: 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20' },
  APPROVED: { label: 'Aprovado',  icon: CheckCircle2, class: 'bg-green-500/10 text-green-400 border border-green-500/15' },
  REJECTED: { label: 'Rejeitado', icon: XCircle,      class: 'bg-[#E50914]/10 text-[#E50914] border border-[#E50914]/20' },
}

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function AdminSaldoUsuariosPage() {
  const [config,        setConfig]        = useState<BalanceConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [editingConfig, setEditingConfig] = useState(false)
  const [feeType,       setFeeType]       = useState<FeeType>('FIXED')
  const [feeValue,      setFeeValue]      = useState('')
  const [withdrawalFee, setWithdrawalFee] = useState('')
  const [savingConfig,  setSavingConfig]  = useState(false)

  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
  const [wLoading,    setWLoading]    = useState(true)
  const [acting,      setActing]      = useState<string | null>(null)
  const [toast,       setToast]       = useState<Toast | null>(null)

  const loadConfig = useCallback(async () => {
    setConfigLoading(true)
    try {
      const d: BalanceConfig = await api.get('/admin/balance/config')
      setConfig(d)
      setFeeType(d.feeType)
      setFeeValue(String(d.feeValue))
      setWithdrawalFee(String(d.withdrawalFee))
    } catch (e) { console.error(e) }
    finally { setConfigLoading(false) }
  }, [])

  const loadWithdrawals = useCallback(async () => {
    setWLoading(true)
    try {
      const d: WithdrawalRow[] = await api.get('/admin/balance/withdrawals')
      setWithdrawals(d)
    } catch (e) { console.error(e) }
    finally { setWLoading(false) }
  }, [])

  useEffect(() => { loadConfig(); loadWithdrawals() }, [loadConfig, loadWithdrawals])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const saveConfig = async () => {
    const value = parseFloat(feeValue.replace(',', '.'))
    const wValue = parseFloat(withdrawalFee.replace(',', '.'))
    if (isNaN(value) || value < 0 || isNaN(wValue) || wValue < 0) return
    setSavingConfig(true)
    try {
      const d: BalanceConfig = await api.put('/admin/balance/config', {
        feeType, feeValue: value, withdrawalFee: wValue,
      })
      setConfig(d)
      setEditingConfig(false)
      setToast({ type: 'success', message: 'Configuração atualizada!' })
    } catch (e: any) {
      setToast({ type: 'error', message: e.message ?? 'Erro ao salvar configuração' })
    } finally {
      setSavingConfig(false)
    }
  }

  const approve = async (id: string) => {
    setActing(id)
    try {
      await api.post(`/admin/balance/withdrawals/${id}/approve`, {})
      setToast({ type: 'success', message: 'Saque aprovado!' })
      await loadWithdrawals()
    } catch (e: any) {
      setToast({ type: 'error', message: e.message ?? 'Erro ao aprovar' })
    } finally {
      setActing(null)
    }
  }

  const reject = async (id: string) => {
    setActing(id)
    try {
      await api.post(`/admin/balance/withdrawals/${id}/reject`, {})
      setToast({ type: 'success', message: 'Saque rejeitado.' })
      await loadWithdrawals()
    } catch (e: any) {
      setToast({ type: 'error', message: e.message ?? 'Erro ao rejeitar' })
    } finally {
      setActing(null)
    }
  }

  const pending = withdrawals.filter(w => w.status === 'PENDING')
  const resolved = withdrawals.filter(w => w.status !== 'PENDING')

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[4px] bg-[#F59E0B]/10 flex items-center justify-center">
          <Wallet className="h-4 w-4 text-[#F59E0B]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Saldo de Usuários</h1>
          <p className="text-xs text-[#555]">Taxa de vendas e aprovação de saques</p>
        </div>
      </div>

      {/* Config das taxas */}
      <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-[#555] uppercase tracking-wide">Taxas da plataforma</p>
          {!editingConfig && (
            <button
              onClick={() => setEditingConfig(true)}
              className="text-xs text-[#555] hover:text-white transition-colors"
            >
              Editar
            </button>
          )}
        </div>

        {configLoading ? (
          <div className="flex items-center gap-2 text-[#444]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : !editingConfig ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {config?.feeType === 'PERCENTAGE'
                ? <Percent className="h-4 w-4 text-[#F59E0B] shrink-0" />
                : <DollarSign className="h-4 w-4 text-[#F59E0B] shrink-0" />}
              <p className="text-lg font-semibold text-white">
                {config?.feeType === 'PERCENTAGE' ? `${config.feeValue}%` : formatBRL(config?.feeValue ?? 0)}
              </p>
              <span className="text-xs text-[#555]">
                {config?.feeType === 'PERCENTAGE' ? 'sobre o valor de cada venda' : 'fixo, descontado de cada venda'}
              </span>
            </div>
            <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
              <ArrowDownToLine className="h-4 w-4 text-[#F59E0B] shrink-0" />
              <p className="text-lg font-semibold text-white">{formatBRL(config?.withdrawalFee ?? 0)}</p>
              <span className="text-xs text-[#555]">taxa de saque, cobrada a cada solicitação</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-[#666] uppercase tracking-wide">Taxa sobre vendas</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFeeType('FIXED')}
                  className={`py-2 rounded-[4px] text-xs font-medium border transition-all ${
                    feeType === 'FIXED'
                      ? 'bg-[#F59E0B]/10 border-[#F59E0B]/40 text-[#F59E0B]'
                      : 'bg-[#0a0a0a] border-white/[0.06] text-[#555] hover:text-white hover:border-white/20'
                  }`}
                >
                  Fixa (R$)
                </button>
                <button
                  onClick={() => setFeeType('PERCENTAGE')}
                  className={`py-2 rounded-[4px] text-xs font-medium border transition-all ${
                    feeType === 'PERCENTAGE'
                      ? 'bg-[#F59E0B]/10 border-[#F59E0B]/40 text-[#F59E0B]'
                      : 'bg-[#0a0a0a] border-white/[0.06] text-[#555] hover:text-white hover:border-white/20'
                  }`}
                >
                  Percentual (%)
                </button>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={feeValue}
                onChange={e => setFeeValue(e.target.value.replace(/[^\d,.]/, ''))}
                placeholder={feeType === 'FIXED' ? '0.30' : '5'}
                className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-[4px] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#F59E0B]/40 transition-colors"
              />
            </div>

            <div className="space-y-2 pt-1 border-t border-white/[0.06]">
              <label className="block text-[10px] font-bold text-[#666] uppercase tracking-wide pt-3">
                Taxa de saque (R$) — cobrada a cada solicitação
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={withdrawalFee}
                onChange={e => setWithdrawalFee(e.target.value.replace(/[^\d,.]/, ''))}
                placeholder="5.00"
                className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-[4px] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#F59E0B]/40 transition-colors"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setEditingConfig(false)}
                className="flex-1 px-4 py-2 text-xs text-[#555] border border-white/[0.06] hover:text-white hover:border-white/15 rounded-[3px] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={saveConfig}
                disabled={savingConfig || !feeValue || !withdrawalFee}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#F59E0B] hover:bg-[#D97706] rounded-[3px] transition-colors disabled:opacity-50"
              >
                {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Salvar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Saques pendentes */}
      <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">Saques Pendentes</h2>
          <p className="text-xs text-[#555] mt-0.5">{pending.length} solicitação{pending.length !== 1 ? 'ões' : ''} aguardando aprovação</p>
        </div>
        {wLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-[#E50914]" />
          </div>
        ) : pending.length === 0 ? (
          <p className="text-xs text-[#555] text-center py-8">Nenhum saque pendente.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Usuário', 'Valor pedido', 'Taxa', 'Pagar via PIX', 'Chave PIX', 'Solicitado em', 'Ações'].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold text-[#444] uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {pending.map(w => (
                <tr key={w.id} className="hover:bg-[#151515] transition-colors">
                  <td className="px-4 py-3 text-sm text-white">{w.workspace.name}</td>
                  <td className="px-4 py-3 text-sm text-[#888]">{formatBRL(w.amount)}</td>
                  <td className="px-4 py-3 text-xs text-[#666]">-{formatBRL(w.feeAmount)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-[#22C55E]">{formatBRL(w.netAmount)}</td>
                  <td className="px-4 py-3 text-xs text-[#888]">{w.pixKeyType} · {w.pixKey}</td>
                  <td className="px-4 py-3 text-xs text-[#555]">{new Date(w.requestedAt).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => approve(w.id)}
                        disabled={acting === w.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-[3px] text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/15 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                      >
                        {acting === w.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Aprovar
                      </button>
                      <button
                        onClick={() => reject(w.id)}
                        disabled={acting === w.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-[3px] text-xs font-medium bg-[#E50914]/10 text-[#E50914] border border-[#E50914]/20 hover:bg-[#E50914]/20 transition-colors disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        Rejeitar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Histórico resolvido */}
      {resolved.length > 0 && (
        <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold text-white">Histórico</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Usuário', 'Valor pedido', 'Taxa', 'Pago via PIX', 'Chave PIX', 'Status', 'Resolvido em'].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold text-[#444] uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {resolved.map(w => {
                const st = statusConfig[w.status]
                const StIcon = st.icon
                return (
                  <tr key={w.id} className="hover:bg-[#151515] transition-colors">
                    <td className="px-4 py-3 text-sm text-white">{w.workspace.name}</td>
                    <td className="px-4 py-3 text-sm text-[#888]">{formatBRL(w.amount)}</td>
                    <td className="px-4 py-3 text-xs text-[#666]">-{formatBRL(w.feeAmount)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-white">{formatBRL(w.netAmount)}</td>
                    <td className="px-4 py-3 text-xs text-[#888]">{w.pixKeyType} · {w.pixKey}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${st.class}`}>
                        <StIcon className="h-3 w-3" />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#555]">{w.resolvedAt ? new Date(w.resolvedAt).toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-[6px] shadow-lg text-sm font-medium z-50 border ${
          toast.type === 'success'
            ? 'bg-green-950/90 border-green-800/40 text-green-300'
            : 'bg-red-950/90 border-red-800/40 text-red-300'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}
