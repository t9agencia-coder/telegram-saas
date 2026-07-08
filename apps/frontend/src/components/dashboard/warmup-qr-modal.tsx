'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { X, Zap, Loader2, CheckCircle, Copy, Check } from 'lucide-react'

interface WarmupQrModalProps {
  workspaceId: string
  bot: { id: string; username: string }
  onClose: () => void
}

// Modal do QR code de "chat de aquecimento" (pré-cache proativo de mídia) —
// compartilhado entre a tela de Robôs e a de Fluxos, pra não precisar navegar
// entre páginas pra configurar isso.
export function WarmupQrModal({ workspaceId, bot, onClose }: WarmupQrModalProps) {
  const [data, setData] = useState<{ qrCodeImage: string; deepLink: string; configured: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.get(`/workspaces/${workspaceId}/bots/${bot.id}/warmup-qr`)
      setData(d)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, bot.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (data?.configured) return
    const timer = setInterval(load, 3000)
    return () => clearInterval(timer)
  }, [data?.configured, load])

  const copyLink = () => {
    if (!data) return
    navigator.clipboard.writeText(data.deepLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#141414] border border-white/[0.06] rounded-[4px] p-6 max-w-sm w-full shadow-2xl card-glow-premium"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[4px] bg-[#E50914]/10 flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-[#E50914]" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Pré-Cache de Mídia</h3>
              <p className="text-[11px] text-[#666666]">@{bot.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#666666] hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#666666]" />
          </div>
        ) : data?.configured ? (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
              <CheckCircle className="h-7 w-7 text-green-500" />
            </div>
            <p className="text-sm font-medium text-white mb-1">Já configurado!</p>
            <p className="text-xs text-[#666666] max-w-[240px]">
              Toda mídia nova salva nos fluxos desse bot é testada e cacheada automaticamente, antes de qualquer envio real.
            </p>
          </div>
        ) : data ? (
          <div className="space-y-4">
            <p className="text-xs text-[#666666] leading-relaxed">
              Escaneie o QR code com o Telegram do celular pra abrir uma conversa com o próprio bot. Isso cria um chat exclusivo pra testar mídias novas automaticamente — sem depender de leads reais.
            </p>
            <div className="flex justify-center">
              <div className="p-3 bg-white rounded-[4px]">
                <img src={data.qrCodeImage} alt="QR code" className="w-48 h-48" />
              </div>
            </div>
            <div className="flex items-center gap-2 bg-[#0D0D0D] rounded-[4px] px-3 py-2.5 border border-white/[0.06]">
              <code className="text-[11px] text-[#B3B3B3] truncate flex-1">{data.deepLink}</code>
              <button
                onClick={copyLink}
                className="text-[#666666] hover:text-white transition-colors shrink-0"
                title="Copiar link"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#555555]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Aguardando você escanear...
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
