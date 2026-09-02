'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { fmtMoney } from '@/lib/tracking'
import { Loader2, Check, Percent } from 'lucide-react'

export default function TrackingTaxasPage() {
  const { workspaceId } = useAuthStore()
  const [percentFee, setPercentFee] = useState('')
  const [fixedFee, setFixedFee] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    api.get<{ percentFee: number; fixedFee: number }>(`/workspaces/${workspaceId}/tracking/fees`)
      .then((f) => { setPercentFee(String(f.percentFee ?? 0)); setFixedFee(String(f.fixedFee ?? 0)) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workspaceId])

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      await api.post(`/workspaces/${workspaceId}/tracking/fees`, {
        percentFee: Number(percentFee.replace(',', '.')) || 0,
        fixedFee: Number(fixedFee.replace(',', '.')) || 0,
      })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      alert(e.message || 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-[#666]" /></div>

  const pct = Number(percentFee.replace(',', '.')) || 0
  const fix = Number(fixedFee.replace(',', '.')) || 0
  const exemplo = 100 * (pct / 100) + fix

  return (
    <div>
      <PageHeader title="Taxas" description="Taxa geral de pagamento — usada pra calcular o faturamento líquido e o lucro" />

      <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-5 max-w-lg">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-[4px] bg-[#4496ff]/10 border border-[#4496ff]/20 flex items-center justify-center shrink-0">
            <Percent className="h-5 w-5 text-[#4496ff]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Taxa geral</p>
            <p className="text-xs text-[#666] mt-0.5">Aplicada a todas as vendas. O dashboard desconta isso do bruto pra mostrar o líquido.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-white/70 mb-1.5 block">Percentual sobre a venda (%)</label>
            <div className="relative">
              <input
                type="text" inputMode="decimal" value={percentFee}
                onChange={(e) => setPercentFee(e.target.value)}
                placeholder="0"
                className="w-full rounded-[4px] border border-white/[0.08] bg-[#0D0D0D] px-3 py-2 text-sm text-white pr-8 focus:border-[#4496ff]/40 outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#666]">%</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-white/70 mb-1.5 block">Valor fixo por venda (R$)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#666]">R$</span>
              <input
                type="text" inputMode="decimal" value={fixedFee}
                onChange={(e) => setFixedFee(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-[4px] border border-white/[0.08] bg-[#0D0D0D] px-3 py-2 text-sm text-white pl-9 focus:border-[#4496ff]/40 outline-none"
              />
            </div>
          </div>

          <div className="rounded-[4px] bg-[#0D0D0D] border border-white/[0.06] px-3 py-2 text-xs text-[#999]">
            Numa venda de <span className="text-white/80">{fmtMoney(100)}</span> a taxa seria{' '}
            <span className="text-[#4496ff] font-medium">{fmtMoney(exemplo)}</span> — líquido {fmtMoney(100 - exemplo)}.
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-[4px] bg-[#4496ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#4496ff]/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? 'Salvo' : 'Salvar'}
          </button>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-[#555] max-w-lg">
        Config por adquirente (goldrex, pixzypay…), impostos e custos fixos entram numa próxima iteração.
      </p>
    </div>
  )
}
