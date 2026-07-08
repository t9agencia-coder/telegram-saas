'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { QrCode, CheckCircle2, X } from 'lucide-react'

const POLL_INTERVAL_MS = 20_000
const TOAST_DURATION_MS = 30_000

type PaymentStatus = 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REFUNDED' | 'CANCELLED' | 'EXPIRED'

interface Payment {
  id:     string
  amount: string | number
  status: PaymentStatus
}

interface ActivityToast {
  id:     string
  kind:   'generated' | 'paid'
  amount: number
}

function formatBRL(amount: number): string {
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Espelho ao vivo de PIX gerado/pago — monta uma vez no layout do dashboard
// (fora de qualquer página específica), faz polling leve do mesmo endpoint já
// usado em Vendas/Financeiro, e mostra um toast que some sozinho depois de 30s.
// Não dispara nada no primeiro carregamento — só a partir de mudanças reais
// detectadas nas consultas seguintes, pra não inundar de toasts ao abrir a tela.
export function PixActivityToasts() {
  const { workspaceId } = useAuthStore()
  const [toasts, setToasts] = useState<ActivityToast[]>([])
  const seenStatus = useRef<Map<string, PaymentStatus>>(new Map())
  const isFirstLoad = useRef(true)

  useEffect(() => {
    if (!workspaceId) return

    const poll = async () => {
      try {
        const payments = await api.get<Payment[]>(`/workspaces/${workspaceId}/payments`)
        const prev = seenStatus.current
        const next = new Map<string, PaymentStatus>()
        const newToasts: ActivityToast[] = []

        for (const p of payments) {
          const amount = typeof p.amount === 'string' ? parseFloat(p.amount) : p.amount
          const prevStatus = prev.get(p.id)
          next.set(p.id, p.status)

          if (isFirstLoad.current) continue

          if (prevStatus === undefined && p.status === 'PENDING') {
            newToasts.push({ id: `${p.id}-gen-${Date.now()}`, kind: 'generated', amount })
          } else if (prevStatus && prevStatus !== 'APPROVED' && p.status === 'APPROVED') {
            newToasts.push({ id: `${p.id}-paid-${Date.now()}`, kind: 'paid', amount })
          }
        }

        seenStatus.current = next
        isFirstLoad.current = false

        if (newToasts.length > 0) {
          setToasts(t => [...newToasts, ...t].slice(0, 8))
          newToasts.forEach(nt => {
            setTimeout(() => setToasts(t => t.filter(x => x.id !== nt.id)), TOAST_DURATION_MS)
          })
        }
      } catch {
        // silencioso — não deve nunca quebrar a dashboard por causa disso
      }
    }

    poll()
    const timer = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [workspaceId])

  const dismiss = (id: string) => setToasts(t => t.filter(x => x.id !== id))

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 w-80 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-3 p-3.5 rounded-[4px] border shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur bg-[#141414]/95 animate-scale-in"
          style={{
            borderColor: t.kind === 'paid' ? 'rgba(34,197,94,0.25)' : 'rgba(220,38,38,0.25)',
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: t.kind === 'paid' ? 'rgba(34,197,94,0.12)' : 'rgba(220,38,38,0.12)' }}
          >
            {t.kind === 'paid'
              ? <CheckCircle2 className="h-4 w-4 text-green-400" />
              : <QrCode className="h-4 w-4 text-[#dc2626]" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">
              {t.kind === 'paid' ? 'PIX pago' : 'PIX gerado'}
            </p>
            <p className="text-xs text-white/50 mt-0.5">{formatBRL(t.amount)}</p>
          </div>
          <button onClick={() => dismiss(t.id)} className="text-white/30 hover:text-white/70 transition-colors shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
