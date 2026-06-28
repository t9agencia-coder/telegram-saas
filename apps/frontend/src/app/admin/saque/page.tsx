'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowDownToLine, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

type PixKeyType = 'CPF' | 'CNPJ' | 'PHONE' | 'EVP'

interface Toast {
  type: 'success' | 'error'
  message: string
}

const PIX_KEY_LABELS: Record<PixKeyType, string> = {
  CPF:   'CPF',
  CNPJ:  'CNPJ',
  PHONE: 'Telefone',
  EVP:   'Chave aleatória',
}

const PIX_KEY_PLACEHOLDERS: Record<PixKeyType, string> = {
  CPF:   '000.000.000-00',
  CNPJ:  '00.000.000/0001-00',
  PHONE: '+5511999999999',
  EVP:   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
}

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function SaquePage() {
  const [balance, setBalance]         = useState<number | null>(null)
  const [balanceLoading, setBalLoading] = useState(true)
  const [balanceError, setBalError]   = useState<string | null>(null)

  const [pixKeyType, setPixKeyType]   = useState<PixKeyType>('CPF')
  const [pixKey, setPixKey]           = useState('')
  const [amount, setAmount]           = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [toast, setToast]             = useState<Toast | null>(null)

  const loadBalance = useCallback(async () => {
    setBalLoading(true)
    setBalError(null)
    try {
      const data = await api.get<{ balance: number }>('/admin/cashout/balance')
      setBalance(data.balance)
    } catch (e: any) {
      setBalError(e.message ?? 'Erro ao consultar saldo')
    } finally {
      setBalLoading(false)
    }
  }, [])

  useEffect(() => { loadBalance() }, [loadBalance])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault()
    const amountNum = parseFloat(amount.replace(',', '.'))
    if (!pixKey.trim() || isNaN(amountNum) || amountNum <= 0) return

    setSubmitting(true)
    try {
      await api.post('/admin/cashout/withdraw', {
        pixKeyType,
        pixKey: pixKey.trim(),
        amount: amountNum,
        description: description.trim() || undefined,
      })
      setToast({ type: 'success', message: `Saque de ${formatBRL(amountNum)} solicitado com sucesso!` })
      setPixKey('')
      setAmount('')
      setDescription('')
      loadBalance()
    } catch (e: any) {
      setToast({ type: 'error', message: e.message ?? 'Erro ao solicitar saque' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[4px] bg-[#E50914]/10 flex items-center justify-center">
          <ArrowDownToLine className="h-4 w-4 text-[#E50914]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Saque</h1>
          <p className="text-xs text-[#555]">BaassPago Cash-out</p>
        </div>
      </div>

      {/* Card de saldo */}
      <div className="rounded-[6px] bg-[#141414] border border-white/[0.06] p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-[#555] uppercase tracking-wide">Saldo disponível</p>
          <button
            onClick={loadBalance}
            disabled={balanceLoading}
            className="flex items-center gap-1.5 text-xs text-[#555] hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${balanceLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {balanceLoading ? (
          <div className="flex items-center gap-2 text-[#444]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Consultando...</span>
          </div>
        ) : balanceError ? (
          <div className="flex items-center gap-2 text-[#E50914]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{balanceError}</span>
          </div>
        ) : (
          <p className="text-3xl font-bold text-white">
            {balance !== null ? formatBRL(balance) : '—'}
          </p>
        )}
      </div>

      {/* Formulário de saque */}
      <div className="rounded-[6px] bg-[#141414] border border-white/[0.06] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">Solicitar saque</h2>

        <form onSubmit={handleWithdraw} className="space-y-4">
          {/* Tipo de chave */}
          <div className="space-y-1.5">
            <label className="block text-xs text-[#555] font-medium">Tipo de chave PIX</label>
            <div className="grid grid-cols-4 gap-2">
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

          {/* Chave PIX */}
          <div className="space-y-1.5">
            <label className="block text-xs text-[#555] font-medium">
              Chave PIX ({PIX_KEY_LABELS[pixKeyType]})
            </label>
            <input
              type="text"
              value={pixKey}
              onChange={e => setPixKey(e.target.value)}
              placeholder={PIX_KEY_PLACEHOLDERS[pixKeyType]}
              required
              className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-[4px] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#E50914]/40 transition-colors"
            />
          </div>

          {/* Valor */}
          <div className="space-y-1.5">
            <label className="block text-xs text-[#555] font-medium">Valor (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^\d,.]/, ''))}
              placeholder="0,00"
              required
              className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-[4px] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#E50914]/40 transition-colors"
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <label className="block text-xs text-[#555] font-medium">Descrição (opcional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Saque mensal"
              maxLength={140}
              className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-[4px] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#E50914]/40 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !pixKey.trim() || !amount}
            className="w-full flex items-center justify-center gap-2 bg-[#E50914] hover:bg-[#c8070f] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-[4px] transition-colors"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
            ) : (
              <><ArrowDownToLine className="h-4 w-4" /> Solicitar Saque</>
            )}
          </button>
        </form>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-[6px] shadow-lg text-sm font-medium z-50 border ${
          toast.type === 'success'
            ? 'bg-green-950/90 border-green-800/40 text-green-300'
            : 'bg-red-950/90 border-red-800/40 text-red-300'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : <AlertCircle className="h-4 w-4 shrink-0" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}
