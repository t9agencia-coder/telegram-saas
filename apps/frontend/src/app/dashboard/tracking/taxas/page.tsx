'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { fmtMoney } from '@/lib/tracking'
import { Loader2, Check, Plus, Trash2, Percent, DollarSign, Facebook } from 'lucide-react'
import { cn } from '@/lib/utils'

type FeeKind = 'percent' | 'fixed'
interface Fee {
  id?: string
  name: string
  kind: FeeKind
  value: string   // string no form; parse no save
  enabled: boolean
}

const parseNum = (s: string) => Number(String(s).replace(',', '.')) || 0

export default function TrackingTaxasPage() {
  const { workspaceId } = useAuthStore()
  const [fees, setFees] = useState<Fee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  type MetaSide = { enabled: boolean; percent: string }
  type MetaFeeState = { br: MetaSide; intl: MetaSide }
  const [metaFee, setMetaFee] = useState<MetaFeeState>({
    br: { enabled: false, percent: '13' },
    intl: { enabled: false, percent: '13' },
  })
  const [metaSaving, setMetaSaving] = useState(false)

  type MetaFeeApi = { br?: { enabled: boolean; percent: number }; intl?: { enabled: boolean; percent: number } }
  const fromApi = (mf: MetaFeeApi): MetaFeeState => ({
    br: { enabled: mf.br?.enabled ?? false, percent: String(mf.br?.percent ?? 13).replace('.', ',') },
    intl: { enabled: mf.intl?.enabled ?? false, percent: String(mf.intl?.percent ?? 13).replace('.', ',') },
  })

  useEffect(() => {
    if (!workspaceId) return
    Promise.all([
      api.get<Array<{ id: string; name: string; kind: FeeKind; value: number; enabled: boolean }>>(`/workspaces/${workspaceId}/tracking/fees`),
      api.get<MetaFeeApi>(`/workspaces/${workspaceId}/tracking/meta-fee`),
    ])
      .then(([rows, mf]) => {
        setFees(rows.map((r) => ({ ...r, value: String(r.value ?? 0) })))
        setMetaFee(fromApi(mf))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workspaceId])

  const saveMetaFee = async (next: MetaFeeState) => {
    setMetaFee(next)
    setMetaSaving(true)
    try {
      const mf = await api.put<MetaFeeApi>(
        `/workspaces/${workspaceId}/tracking/meta-fee`,
        {
          br: { enabled: next.br.enabled, percent: parseNum(next.br.percent) },
          intl: { enabled: next.intl.enabled, percent: parseNum(next.intl.percent) },
        },
      )
      setMetaFee(fromApi(mf))
    } catch (e: any) { alert(e.message || 'Falha ao salvar a taxa Meta') }
    finally { setMetaSaving(false) }
  }
  const patchMeta = (side: 'br' | 'intl', p: Partial<MetaSide>) =>
    setMetaFee((m) => ({ ...m, [side]: { ...m[side], ...p } }))

  const patch = (i: number, p: Partial<Fee>) => setFees((f) => f.map((x, idx) => idx === i ? { ...x, ...p } : x))
  const remove = (i: number) => setFees((f) => f.filter((_, idx) => idx !== i))
  const add = (kind: FeeKind) => setFees((f) => [...f, { name: '', kind, value: '', enabled: true }])

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      const payload = fees.map((f) => ({
        name: f.name.trim() || (f.kind === 'percent' ? 'Taxa (%)' : 'Taxa fixa'),
        kind: f.kind,
        value: parseNum(f.value),
        enabled: f.enabled,
      }))
      const rows = await api.put<Array<{ id: string; name: string; kind: FeeKind; value: number; enabled: boolean }>>(
        `/workspaces/${workspaceId}/tracking/fees`, { fees: payload },
      )
      setFees(rows.map((r) => ({ ...r, value: String(r.value ?? 0) })))
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      alert(e.message || 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-[#666]" /></div>

  // preview numa venda de R$ 100
  const base = 100
  const enabled = fees.filter((f) => f.enabled)
  const pctTotal = enabled.filter((f) => f.kind === 'percent').reduce((s, f) => s + parseNum(f.value), 0)
  const fixTotal = enabled.filter((f) => f.kind === 'fixed').reduce((s, f) => s + parseNum(f.value), 0)
  const totalTax = base * (pctTotal / 100) + fixTotal

  return (
    <div>
      <PageHeader title="Taxas" description="Taxas de pagamento e plataforma — descontadas do bruto pra calcular líquido e lucro" />

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* ── lista de taxas ─────────────────────────────────────────── */}
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <p className="text-xs font-medium text-white/70">Taxas configuradas</p>
            <span className="text-[11px] text-[#666]">{fees.length} {fees.length === 1 ? 'taxa' : 'taxas'}</span>
          </div>

          {fees.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-[#666]">
              Nenhuma taxa. Adicione uma taxa percentual (ex.: 4,99% da adquirente) ou fixa (ex.: R$ 1,00 por PIX).
            </p>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {fees.map((f, i) => (
                <div key={f.id ?? `new-${i}`} className={cn('flex items-center gap-2 px-3 py-2.5', !f.enabled && 'opacity-45')}>
                  {/* toggle ativa */}
                  <button
                    onClick={() => patch(i, { enabled: !f.enabled })}
                    title={f.enabled ? 'Ativa' : 'Inativa'}
                    className={cn(
                      'relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors',
                      f.enabled ? 'bg-[#4496ff]' : 'bg-white/[0.12]',
                    )}
                  >
                    <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', f.enabled ? 'translate-x-4' : 'translate-x-0.5')} />
                  </button>

                  {/* nome */}
                  <input
                    value={f.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                    placeholder="Nome da taxa"
                    className="flex-1 min-w-0 rounded-[4px] border border-white/[0.08] bg-[#0D0D0D] px-2.5 py-1.5 text-sm text-white focus:border-[#4496ff]/40 outline-none"
                  />

                  {/* tipo */}
                  <div className="flex shrink-0 rounded-[4px] border border-white/[0.08] overflow-hidden">
                    <button
                      onClick={() => patch(i, { kind: 'percent' })}
                      className={cn('px-2 py-1.5', f.kind === 'percent' ? 'bg-[#4496ff]/15 text-[#4496ff]' : 'text-[#666] hover:text-white')}
                    ><Percent className="h-3.5 w-3.5" /></button>
                    <button
                      onClick={() => patch(i, { kind: 'fixed' })}
                      className={cn('px-2 py-1.5 border-l border-white/[0.08]', f.kind === 'fixed' ? 'bg-[#4496ff]/15 text-[#4496ff]' : 'text-[#666] hover:text-white')}
                    ><DollarSign className="h-3.5 w-3.5" /></button>
                  </div>

                  {/* valor */}
                  <div className="relative shrink-0 w-28">
                    {f.kind === 'fixed' && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#666]">R$</span>}
                    <input
                      value={f.value}
                      inputMode="decimal"
                      onChange={(e) => patch(i, { value: e.target.value })}
                      placeholder={f.kind === 'percent' ? '0,00' : '0,00'}
                      className={cn(
                        'w-full rounded-[4px] border border-white/[0.08] bg-[#0D0D0D] py-1.5 text-sm text-white text-right focus:border-[#4496ff]/40 outline-none',
                        f.kind === 'fixed' ? 'pl-9 pr-2.5' : 'px-2.5 pr-6',
                      )}
                    />
                    {f.kind === 'percent' && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#666]">%</span>}
                  </div>

                  <button onClick={() => remove(i)} className="shrink-0 text-[#666] hover:text-[#EF4444] p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="px-3 py-3 border-t border-white/[0.06] flex items-center gap-2">
            <button onClick={() => add('percent')} className="inline-flex items-center gap-1.5 rounded-[4px] border border-white/[0.1] bg-[#1A1A1A] px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/[0.06]">
              <Plus className="h-3.5 w-3.5" /> Taxa %
            </button>
            <button onClick={() => add('fixed')} className="inline-flex items-center gap-1.5 rounded-[4px] border border-white/[0.1] bg-[#1A1A1A] px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/[0.06]">
              <Plus className="h-3.5 w-3.5" /> Taxa fixa
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="ml-auto inline-flex items-center gap-2 rounded-[4px] bg-[#4496ff] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#4496ff]/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
              {saved ? 'Salvo' : 'Salvar'}
            </button>
          </div>
        </div>

        {/* ── preview ────────────────────────────────────────────────── */}
        <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4">
          <p className="text-xs font-medium text-white/70 mb-3">Simulação — venda de {fmtMoney(base)}</p>
          <div className="space-y-1.5 text-xs">
            {enabled.length === 0 && <p className="text-[#666]">Nenhuma taxa ativa — líquido = bruto.</p>}
            {enabled.map((f, i) => {
              const v = f.kind === 'percent' ? base * (parseNum(f.value) / 100) : parseNum(f.value)
              return (
                <div key={i} className="flex justify-between text-[#999]">
                  <span className="truncate pr-2">{f.name || (f.kind === 'percent' ? 'Taxa %' : 'Taxa fixa')} {f.kind === 'percent' ? `(${f.value || 0}%)` : ''}</span>
                  <span className="text-[#EF4444] tabular-nums shrink-0">− {fmtMoney(v)}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5 text-xs">
            <div className="flex justify-between text-[#999]"><span>Total de taxas</span><span className="text-[#EF4444] font-medium tabular-nums">− {fmtMoney(totalTax)}</span></div>
            <div className="flex justify-between text-white/80"><span>Líquido</span><span className="text-[#22C55E] font-medium tabular-nums">{fmtMoney(base - totalTax)}</span></div>
          </div>
          <p className="mt-3 text-[10px] text-[#555] leading-relaxed">
            Percentuais somam sobre o valor da venda; fixas somam por venda aprovada.
            Aplicado no cálculo de líquido e lucro da Visão geral.
          </p>
        </div>
      </div>

      {/* ── Taxa Meta Ads ───────────────────────────────────────────── */}
      <div className="mt-4 rounded-[4px] border border-white/[0.06] bg-[#141414] p-5 max-w-2xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[4px] bg-[#1877F2]/10 border border-[#1877F2]/20 flex items-center justify-center shrink-0">
            <Facebook className="h-5 w-5 text-[#1877F2]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              Taxa Meta Ads
              {metaSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#666]" />}
            </p>
            <p className="text-xs text-[#666] mt-0.5 max-w-md">
              % sobre o <strong className="text-white/70">gasto de anúncios</strong>. Ative por lado — contas
              faturadas em real usam a taxa Brasil, as demais (dólar/euro) usam a Internacional.
              Entra no lucro, ROI, ROAS e margem.
            </p>
          </div>
        </div>

        <div className="divide-y divide-white/[0.05] border border-white/[0.06] rounded-[4px]">
          {([
            { key: 'br' as const, flag: '🇧🇷', label: 'Brasil', hint: 'contas em BRL' },
            { key: 'intl' as const, flag: '🌎', label: 'Internacional', hint: 'contas em dólar / euro' },
          ]).map((s) => {
            const side = metaFee[s.key]
            return (
              <div key={s.key} className="flex items-center gap-3 px-3 py-3">
                <button
                  onClick={() => saveMetaFee({ ...metaFee, [s.key]: { ...side, enabled: !side.enabled } })}
                  disabled={metaSaving}
                  title={side.enabled ? 'Ativa' : 'Inativa'}
                  className={cn(
                    'relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50',
                    side.enabled ? 'bg-[#4496ff]' : 'bg-white/[0.12]',
                  )}
                >
                  <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', side.enabled ? 'translate-x-4' : 'translate-x-0.5')} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{s.flag} {s.label}</p>
                  <p className="text-[10px] text-[#666]">{s.hint}</p>
                </div>
                <div className={cn('relative w-24 shrink-0', !side.enabled && 'opacity-40')}>
                  <input
                    value={side.percent}
                    inputMode="decimal"
                    disabled={!side.enabled}
                    onChange={(e) => patchMeta(s.key, { percent: e.target.value })}
                    onBlur={() => saveMetaFee(metaFee)}
                    className="w-full rounded-[4px] border border-white/[0.08] bg-[#0D0D0D] px-3 py-1.5 pr-6 text-sm text-white text-right focus:border-[#4496ff]/40 outline-none disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#666]">%</span>
                </div>
                <span className={cn('text-xs font-medium tabular-nums w-16 text-right shrink-0', side.enabled ? 'text-[#EF4444]' : 'text-[#555]')}>
                  {side.enabled ? `+${parseNum(side.percent)}%` : '—'}
                </span>
              </div>
            )
          })}
        </div>

        <p className="mt-3 text-[10px] text-[#555] leading-relaxed">
          O Facebook cobra impostos (PIS/Cofins/ISS ~12–13%) nas contas faturadas em real; alguns BMs
          também têm encargo nas internacionais. Ex.: gasto de {fmtMoney(10000)} numa conta BR com{' '}
          {parseNum(metaFee.br.percent)}% → custo considerado {fmtMoney(10000 * (1 + parseNum(metaFee.br.percent) / 100))}.
        </p>
      </div>
    </div>
  )
}
