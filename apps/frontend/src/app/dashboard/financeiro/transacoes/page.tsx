'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Receipt, Loader2, Wallet, TrendingUp, ArrowDownToLine, ShoppingCart,
  X, CheckCircle2, Clock, XCircle, AlertCircle, Info, ArrowRight, ShieldCheck,
} from 'lucide-react'

interface BalanceSummary {
  available: number
  totalReceived: number
  totalWithdrawn: number
  salesCount: number
  withdrawalFee: number
}

interface BalanceTransaction {
  id: string
  type: 'SALE' | 'WITHDRAWAL' | 'ADJUSTMENT'
  grossAmount: number
  feeAmount: number
  netAmount: number
  status: 'COMPLETED' | 'PENDING' | 'REJECTED'
  createdAt: string
}

interface Withdrawal {
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
}

type PixKeyType = 'CPF' | 'CNPJ' | 'PHONE' | 'EVP'

const PIX_KEY_LABELS: Record<PixKeyType, string> = {
  CPF: 'CPF', CNPJ: 'CNPJ', PHONE: 'Telefone', EVP: 'Chave aleatória',
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const txTypeLabel: Record<string, string> = { SALE: 'Venda', WITHDRAWAL: 'Saque', ADJUSTMENT: 'Ajuste' }

const withdrawalStatusConfig: Record<string, { label: string; icon: any; class: string }> = {
  PENDING:  { label: 'Pendente',  icon: Clock,       class: 'text-[#F59E0B] bg-[#F59E0B]/10' },
  APPROVED: { label: 'Aprovado',  icon: CheckCircle2, class: 'text-[#22C55E] bg-[#22C55E]/10' },
  REJECTED: { label: 'Rejeitado', icon: XCircle,      class: 'text-[#EF4444] bg-[#EF4444]/10' },
}

export default function FinanceiroPage() {
  const { workspaceId } = useAuthStore()
  const [summary,      setSummary]      = useState<BalanceSummary | null>(null)
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([])
  const [withdrawals,  setWithdrawals]  = useState<Withdrawal[]>([])
  const [loading,      setLoading]      = useState(true)

  const [showModal,   setShowModal]   = useState(false)
  const [pixKeyType,  setPixKeyType]  = useState<PixKeyType>('CPF')
  const [pixKey,      setPixKey]      = useState('')
  const [amount,      setAmount]      = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [formError,   setFormError]   = useState<string | null>(null)
  const [toast,       setToast]       = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) return
    try {
      const [s, t, w] = await Promise.all([
        api.get<BalanceSummary>(`/workspaces/${workspaceId}/balance`),
        api.get(`/workspaces/${workspaceId}/balance/transactions?limit=15`),
        api.get<Withdrawal[]>(`/workspaces/${workspaceId}/balance/withdrawals`),
      ])
      setSummary(s)
      setTransactions(t.transactions ?? [])
      setWithdrawals(w)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const openModal = () => {
    setPixKeyType('CPF'); setPixKey(''); setAmount(''); setFormError(null)
    setShowModal(true)
  }

  const withdrawalFee = summary?.withdrawalFee ?? 0
  const amountNum = parseFloat(amount.replace(',', '.'))
  const validAmount = !isNaN(amountNum) && amountNum > 0
  const netToReceive = validAmount ? Math.max(0, Math.round((amountNum - withdrawalFee) * 100) / 100) : 0
  const amountTooLow = validAmount && amountNum <= withdrawalFee

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspaceId) return
    if (!pixKey.trim() || !validAmount) return
    if (amountTooLow) {
      setFormError(`O valor do saque deve ser maior que a taxa de saque (${formatCurrency(withdrawalFee)})`)
      return
    }

    setSubmitting(true)
    setFormError(null)
    try {
      await api.post(`/workspaces/${workspaceId}/balance/withdrawals`, {
        amount: amountNum,
        pixKeyType,
        pixKey: pixKey.trim(),
      })
      setToast({ type: 'success', message: `Saque de ${formatCurrency(amountNum)} solicitado!` })
      setShowModal(false)
      await load()
    } catch (e: any) {
      setFormError(e.message || 'Erro ao solicitar saque')
    } finally {
      setSubmitting(false)
    }
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
      <PageHeader title="Financeiro" description="Saldo, extrato e saques" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 card-glow-premium">
          <p className="text-xs text-[#666666] font-medium uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <Wallet className="h-3 w-3" /> Saldo disponível
          </p>
          <p className="text-xl font-semibold text-white">{formatCurrency(summary?.available ?? 0)}</p>
        </div>
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 card-glow-premium">
          <p className="text-xs text-[#666666] font-medium uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" /> Saldo recebido
          </p>
          <p className="text-xl font-semibold text-[#22C55E]">{formatCurrency(summary?.totalReceived ?? 0)}</p>
        </div>
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 card-glow-premium">
          <p className="text-xs text-[#666666] font-medium uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <ArrowDownToLine className="h-3 w-3" /> Total sacado
          </p>
          <p className="text-xl font-semibold text-white">{formatCurrency(summary?.totalWithdrawn ?? 0)}</p>
        </div>
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 card-glow-premium">
          <p className="text-xs text-[#666666] font-medium uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <ShoppingCart className="h-3 w-3" /> Nº de vendas
          </p>
          <p className="text-xl font-semibold text-white">{summary?.salesCount ?? 0}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-[#666666]">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Taxa de saque: <span className="text-white font-medium">{formatCurrency(withdrawalFee)}</span> por solicitação
        </p>
        <button
          onClick={openModal}
          disabled={!summary || summary.available <= 0}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-[#E50914] hover:bg-[#c8070f] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-[4px] transition-colors"
        >
          <ArrowDownToLine className="h-4 w-4" />
          Solicitar Saque
        </button>
      </div>

      <Card className="rounded-[4px] border-white/[0.06] bg-[#141414] card-glow-premium">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Extrato</CardTitle>
            <span className="text-[11px] text-[#666666]">Últimas 15 movimentações</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop: tabela (comportamento de sempre, intocado) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Data</th>
                  <th className="text-left text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Tipo</th>
                  <th className="text-right text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Bruto</th>
                  <th className="text-right text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Taxa</th>
                  <th className="text-right text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Líquido</th>
                  <th className="text-center text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm text-[#666666] whitespace-nowrap">{formatDate(t.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-white">{txTypeLabel[t.type] ?? t.type}</td>
                    <td className="px-4 py-3 text-sm text-[#B3B3B3] text-right tabular-nums">{formatCurrency(t.grossAmount)}</td>
                    <td className="px-4 py-3 text-sm text-[#666666] text-right tabular-nums">{t.feeAmount > 0 ? formatCurrency(t.feeAmount) : '—'}</td>
                    <td className={cn(
                      'px-4 py-3 text-sm text-right font-medium tabular-nums',
                      t.netAmount >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]',
                    )}>
                      {t.netAmount >= 0 ? '+' : ''}{formatCurrency(t.netAmount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        t.status === 'COMPLETED' ? 'text-[#22C55E] bg-[#22C55E]/10'
                          : t.status === 'PENDING' ? 'text-[#F59E0B] bg-[#F59E0B]/10'
                          : 'text-[#EF4444] bg-[#EF4444]/10',
                      )}>
                        {t.status === 'COMPLETED' ? 'Concluído' : t.status === 'PENDING' ? 'Pendente' : 'Rejeitado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards empilhados, mesmos dados da tabela */}
          <div className="md:hidden divide-y divide-white/[0.04]">
            {transactions.map(t => (
              <div key={t.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{txTypeLabel[t.type] ?? t.type}</span>
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                    t.status === 'COMPLETED' ? 'text-[#22C55E] bg-[#22C55E]/10'
                      : t.status === 'PENDING' ? 'text-[#F59E0B] bg-[#F59E0B]/10'
                      : 'text-[#EF4444] bg-[#EF4444]/10',
                  )}>
                    {t.status === 'COMPLETED' ? 'Concluído' : t.status === 'PENDING' ? 'Pendente' : 'Rejeitado'}
                  </span>
                </div>
                <p className="text-xs text-[#666666]">{formatDate(t.createdAt)}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#666666]">Bruto: <span className="text-[#B3B3B3] tabular-nums">{formatCurrency(t.grossAmount)}</span></span>
                  {t.feeAmount > 0 && (
                    <span className="text-[#666666]">Taxa: <span className="text-[#666666] tabular-nums">{formatCurrency(t.feeAmount)}</span></span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                  <span className="text-xs text-[#666666]">Líquido</span>
                  <span className={cn('text-sm font-medium tabular-nums', t.netAmount >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]')}>
                    {t.netAmount >= 0 ? '+' : ''}{formatCurrency(t.netAmount)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {transactions.length === 0 && (
            <div className="flex flex-col items-center py-16 text-[#666666]">
              <Receipt className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">Nenhuma movimentação ainda</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[4px] border-white/[0.06] bg-[#141414] card-glow-premium">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Solicitações de Saque</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop: tabela (comportamento de sempre, intocado) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Data</th>
                  <th className="text-left text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Chave PIX</th>
                  <th className="text-right text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Valor pedido</th>
                  <th className="text-right text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Taxa</th>
                  <th className="text-right text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Você recebe</th>
                  <th className="text-center text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map(w => {
                  const st = withdrawalStatusConfig[w.status]
                  const StIcon = st.icon
                  return (
                    <tr key={w.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-sm text-[#666666] whitespace-nowrap">{formatDate(w.requestedAt)}</td>
                      <td className="px-4 py-3 text-sm text-[#B3B3B3]">{w.pixKeyType} · {w.pixKey}</td>
                      <td className="px-4 py-3 text-sm text-[#B3B3B3] text-right tabular-nums">{formatCurrency(w.amount)}</td>
                      <td className="px-4 py-3 text-sm text-[#666666] text-right tabular-nums">-{formatCurrency(w.feeAmount)}</td>
                      <td className="px-4 py-3 text-sm text-white text-right font-medium tabular-nums">{formatCurrency(w.netAmount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', st.class)}>
                          <StIcon className="h-3 w-3" />
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards empilhados, mesmos dados da tabela */}
          <div className="md:hidden divide-y divide-white/[0.04]">
            {withdrawals.map(w => {
              const st = withdrawalStatusConfig[w.status]
              const StIcon = st.icon
              return (
                <div key={w.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{w.pixKeyType} · {w.pixKey}</span>
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0', st.class)}>
                      <StIcon className="h-3 w-3" />
                      {st.label}
                    </span>
                  </div>
                  <p className="text-xs text-[#666666]">{formatDate(w.requestedAt)}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#666666]">Pedido: <span className="text-[#B3B3B3] tabular-nums">{formatCurrency(w.amount)}</span></span>
                    <span className="text-[#666666]">Taxa: <span className="tabular-nums">-{formatCurrency(w.feeAmount)}</span></span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                    <span className="text-xs text-[#666666]">Você recebe</span>
                    <span className="text-sm font-medium text-white tabular-nums">{formatCurrency(w.netAmount)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {withdrawals.length === 0 && (
            <div className="flex flex-col items-center py-16 text-[#666666]">
              <ArrowDownToLine className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">Nenhum saque solicitado ainda</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Modal Solicitar Saque ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-[#141414] border border-white/[0.06] rounded-[6px] max-w-md w-full shadow-2xl card-glow-premium overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[4px] bg-[#E50914]/10 flex items-center justify-center shrink-0">
                  <ArrowDownToLine className="h-4 w-4 text-[#E50914]" />
                </div>
                <h3 className="text-white font-semibold">Solicitar Saque</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-[#666666] hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 pt-5 pb-1">
              <div className="flex items-center justify-between rounded-[4px] border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <span className="text-xs text-[#666666]">Saldo disponível</span>
                <span className="text-sm font-semibold text-white">{formatCurrency(summary?.available ?? 0)}</span>
              </div>
            </div>

            <form onSubmit={handleWithdraw} className="px-6 pb-6 pt-4 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs text-[#555] font-medium">Tipo de chave PIX</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(PIX_KEY_LABELS) as PixKeyType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setPixKeyType(type); setPixKey('') }}
                      className={`py-2 rounded-[4px] text-xs font-medium border transition-all ${
                        pixKeyType === type
                          ? 'bg-[#E50914]/10 border-[#E50914]/40 text-[#E50914]'
                          : 'bg-[#0a0a0a] border-white/[0.06] text-[#555] hover:text-white hover:border-white/20'
                      }`}
                    >
                      {PIX_KEY_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-[#555] font-medium">Chave PIX ({PIX_KEY_LABELS[pixKeyType]})</label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={e => setPixKey(e.target.value)}
                  required
                  className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-[4px] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#E50914]/40 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-[#555] font-medium">Valor do saque (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => { setAmount(e.target.value.replace(/[^\d,.]/, '')); setFormError(null) }}
                  placeholder="0,00"
                  required
                  className={cn(
                    'w-full bg-[#0a0a0a] border rounded-[4px] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:outline-none transition-colors',
                    amountTooLow ? 'border-[#EF4444]/40 focus:border-[#EF4444]/60' : 'border-white/[0.08] focus:border-[#E50914]/40',
                  )}
                />
              </div>

              {/* Resumo do saque — deixa explícita a taxa cobrada e o valor líquido */}
              <div className="rounded-[4px] border border-white/[0.06] bg-[#0a0a0a] p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#666666]">Valor solicitado</span>
                  <span className="text-white tabular-nums">{validAmount ? formatCurrency(amountNum) : '—'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#666666] flex items-center gap-1">
                    Taxa de saque
                  </span>
                  <span className="text-[#EF4444] tabular-nums">- {formatCurrency(withdrawalFee)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <span className="text-xs font-medium text-white flex items-center gap-1.5">
                    <ArrowRight className="h-3 w-3 text-[#22C55E]" />
                    Você vai receber
                  </span>
                  <span className="text-base font-bold text-[#22C55E] tabular-nums">
                    {validAmount ? formatCurrency(netToReceive) : '—'}
                  </span>
                </div>
              </div>

              <p className="flex items-start gap-1.5 text-[11px] text-[#666666] leading-relaxed">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Toda solicitação de saque cobra uma taxa fixa de {formatCurrency(withdrawalFee)}. O valor total pedido sai
                do seu saldo disponível e o valor líquido acima é o que você recebe via PIX após a aprovação.
              </p>

              {(formError || amountTooLow) && (
                <div className="flex items-center gap-2 text-[#EF4444] text-xs">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {formError ?? `O valor deve ser maior que a taxa de saque (${formatCurrency(withdrawalFee)})`}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !pixKey.trim() || !validAmount || amountTooLow}
                className="w-full flex items-center justify-center gap-2 bg-[#E50914] hover:bg-[#c8070f] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-[4px] transition-colors"
              >
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : <><ArrowDownToLine className="h-4 w-4" /> Confirmar Saque</>}
              </button>

              <p className="flex items-center justify-center gap-1.5 text-[10px] text-[#444]">
                <ShieldCheck className="h-3 w-3" />
                Solicitações passam por aprovação manual antes do pagamento
              </p>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 flex items-center gap-3 px-4 py-3 rounded-[6px] shadow-lg text-sm font-medium z-50 border ${
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
