'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Search, Check, Clock, Receipt, Loader2, QrCode, Copy, X, ShoppingCart, MessageCircle, Tag
} from 'lucide-react'

interface Payment {
  id: string
  transactionId: string
  amount: number
  status: 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REFUNDED' | 'CANCELLED' | 'EXPIRED'
  gateway: string
  pixQrCode?: string | null
  pixCopyPaste?: string | null
  metadata?: any
  createdAt: string
  paidAt?: string | null
  lead: {
    id: string
    name?: string | null
    leadUid: string
    telegramId?: string | null
    bot?: { id: string; username: string } | null
    tracking?: {
      utmSource?: string | null
      utmMedium?: string | null
      utmCampaign?: string | null
      utmContent?: string | null
      utmTerm?: string | null
      fbclid?: string | null
      gclid?: string | null
      ttclid?: string | null
      kwaiClickid?: string | null
    } | null
  }
  product: { id: string; name: string } | null
}

const statusConfig: Record<string, { label: string; icon: any; class: string }> = {
  APPROVED: { label: 'Aprovado', icon: Check, class: 'text-[#22C55E] bg-[#22C55E]/10' },
  PENDING: { label: 'Pendente', icon: Clock, class: 'text-[#F59E0B] bg-[#F59E0B]/10' },
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function PixModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="        bg-[#141414] border border-white/[0.06] rounded-[4px] p-6 max-w-md w-full mx-4 shadow-2xl card-glow-premium"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">PIX da Venda</h3>
          <button onClick={onClose} className="text-[#666666] hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        {payment.pixQrCode ? (
          <div className="flex justify-center mb-4">
            <img
              src={payment.pixQrCode}
              alt="QR Code PIX"
              className="w-48 h-48 object-contain"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-[#666666]">
            <QrCode className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">QR Code não disponível</p>
          </div>
        )}
        {payment.pixCopyPaste && (
          <div className="space-y-2">
            <p className="text-xs text-[#666666] font-medium uppercase tracking-wide">Código PIX</p>
            <div className="flex items-center gap-2 bg-[#0f0f0f] rounded-lg p-3">
              <code className="text-xs text-[#B3B3B3] truncate flex-1 select-all">
                {payment.pixCopyPaste}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(payment.pixCopyPaste!)}
                className="text-[#E50914] hover:text-white transition-colors shrink-0"
                title="Copiar"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-[#2A2A2A] space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-[#666666]">Cliente</span>
            <span className="text-white">{payment.lead.name || payment.lead.leadUid}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#666666]">Valor</span>
            <span className="text-white font-medium">{formatCurrency(payment.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#666666]">Transação</span>
            <span className="text-[#B3B3B3] text-xs font-mono">{payment.transactionId.slice(0, 16)}...</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function UtmModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const fields: { label: string; value?: string | null }[] = [
    { label: 'UTM Source',   value: payment.lead.tracking?.utmSource },
    { label: 'UTM Medium',   value: payment.lead.tracking?.utmMedium },
    { label: 'UTM Campaign', value: payment.lead.tracking?.utmCampaign },
    { label: 'UTM Content',  value: payment.lead.tracking?.utmContent },
    { label: 'UTM Term',     value: payment.lead.tracking?.utmTerm },
    { label: 'Facebook Click ID (fbclid)', value: payment.lead.tracking?.fbclid },
    { label: 'Google Click ID (gclid)',    value: payment.lead.tracking?.gclid },
    { label: 'TikTok Click ID (ttclid)',   value: payment.lead.tracking?.ttclid },
    { label: 'Kwai Click ID',              value: payment.lead.tracking?.kwaiClickid },
  ].filter((f) => f.value)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#141414] border border-white/[0.06] rounded-[4px] p-6 max-w-lg w-full shadow-2xl card-glow-premium"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[4px] bg-[#3B82F6]/10 flex items-center justify-center shrink-0">
              <Tag className="h-4 w-4 text-[#3B82F6]" />
            </div>
            <div>
              <h3 className="text-white font-semibold">UTM da Venda</h3>
              <p className="text-xs text-[#666666]">{payment.lead.name || payment.lead.leadUid}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#666666] hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {fields.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-[#666666]">
            <Tag className="h-10 w-10 mb-2 opacity-50" />
            <p className="text-sm">Nenhuma UTM registrada pra essa venda</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {fields.map((f) => (
              <div
                key={f.label}
                className="flex items-center justify-between gap-4 px-3 py-2.5 rounded-[3px] bg-white/[0.02] border border-white/[0.04]"
              >
                <span className="text-xs text-[#666666] shrink-0">{f.label}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-white font-mono truncate text-right" title={f.value!}>
                    {f.value}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(f.value!)}
                    className="text-[#666666] hover:text-white transition-colors shrink-0"
                    title="Copiar"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function VendasPage() {
  const { workspaceId } = useAuthStore()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pixModal, setPixModal] = useState<Payment | null>(null)
  const [utmModal, setUtmModal] = useState<Payment | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    api.get<Payment[]>(`/workspaces/${workspaceId}/payments`)
      .then(setPayments)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [workspaceId])

  const filtered = payments.filter((p) =>
    (p.lead?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    p.transactionId.toLowerCase().includes(search.toLowerCase()) ||
    (p.lead?.bot?.username || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalRevenue = filtered.reduce((acc, p) => acc + (p.status === 'APPROVED' ? Number(p.amount) : 0), 0)
  const approvedCount = filtered.filter((p) => p.status === 'APPROVED').length
  const pendingCount = filtered.filter((p) => p.status === 'PENDING').length

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#666666]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Vendas" description="Histórico completo de vendas com UTM e PIX" />

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 card-glow-premium">
          <p className="text-xs text-[#666666] font-medium uppercase tracking-wide mb-1">Total em Vendas</p>
          <p className="text-xl font-semibold text-white">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 card-glow-premium">
          <p className="text-xs text-[#666666] font-medium uppercase tracking-wide mb-1">Aprovadas</p>
          <p className="text-xl font-semibold text-[#22C55E]">{approvedCount}</p>
        </div>
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 card-glow-premium">
          <p className="text-xs text-[#666666] font-medium uppercase tracking-wide mb-1">Pendentes</p>
          <p className="text-xl font-semibold text-[#F59E0B]">{pendingCount}</p>
        </div>
      </div>

      <Card className="rounded-[4px] border-white/[0.06] bg-[#141414] card-glow-premium">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Histórico de Vendas</CardTitle>
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#666666]" />
              <Input
                placeholder="Buscar vendas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Cliente</th>
                <th className="text-left text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Bot</th>
                <th className="text-right text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Valor</th>
                <th className="text-center text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">UTM</th>
                <th className="text-center text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">PIX</th>
                <th className="text-left text-[10px] text-[#666666] font-medium uppercase tracking-wider px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const status = statusConfig[p.status] || statusConfig.PENDING
                const StatusIcon = status.icon
                const utmTags: { label: string; value?: string | null }[] = [
                  { label: 'src', value: p.lead.tracking?.utmSource },
                  { label: 'med', value: p.lead.tracking?.utmMedium },
                  { label: 'cmp', value: p.lead.tracking?.utmCampaign },
                  { label: 'ctn', value: p.lead.tracking?.utmContent },
                  { label: 'trm', value: p.lead.tracking?.utmTerm },
                  { label: 'fb', value: p.lead.tracking?.fbclid },
                  { label: 'gl', value: p.lead.tracking?.gclid },
                  { label: 'tt', value: p.lead.tracking?.ttclid },
                  { label: 'kw', value: p.lead.tracking?.kwaiClickid },
                ].filter((t) => t.value)
                const botUsername = p.lead.bot?.username
                return (
                  <tr
                    key={p.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-white font-medium">{p.lead.name || '—'}</span>
                        <span className="text-[11px] text-[#666666] font-mono">{p.lead.leadUid}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {botUsername ? (
                        <div className="flex items-center gap-1.5">
                          <MessageCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0" />
                          <span className="text-sm text-[#B3B3B3]">@{botUsername}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-[#666666]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right font-medium tabular-nums">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', status.class)}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {utmTags.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-[#999999] max-w-[110px] truncate"
                            title={utmTags.map(t => `${t.label}=${t.value}`).join(' · ')}
                          >
                            {p.lead.tracking?.utmSource || `${utmTags.length} campo${utmTags.length > 1 ? 's' : ''}`}
                          </span>
                          <button
                            onClick={() => setUtmModal(p)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] text-xs font-medium text-[#3B82F6] bg-[#3B82F6]/10 hover:bg-[#3B82F6]/20 transition-all duration-200 shrink-0"
                          >
                            <Tag className="h-3 w-3" />
                            Ver
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[#666666]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setPixModal(p)}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded-[4px] text-xs font-medium transition-all duration-200',
                          p.pixQrCode || p.pixCopyPaste
                            ? 'text-[#22C55E] bg-[#22C55E]/10 hover:bg-[#22C55E]/20'
                            : 'text-[#666666] bg-white/[0.04] cursor-not-allowed'
                        )}
                        disabled={!p.pixQrCode && !p.pixCopyPaste}
                      >
                        <QrCode className="h-3 w-3" />
                        Ver
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666666] whitespace-nowrap">
                      {formatDate(p.createdAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 text-[#666666]">
              <ShoppingCart className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">Nenhuma venda encontrada</p>
            </div>
          )}
        </CardContent>
      </Card>

      {pixModal && <PixModal payment={pixModal} onClose={() => setPixModal(null)} />}
      {utmModal && <UtmModal payment={utmModal} onClose={() => setUtmModal(null)} />}
    </div>
  )
}
