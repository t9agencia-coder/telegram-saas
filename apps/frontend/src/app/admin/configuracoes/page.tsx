'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Settings, Loader2, CheckCircle2, XCircle, Link2, Tag } from 'lucide-react'

const DOMAIN_OPTIONS = [
  { value: 't.me',        label: 't.me',        hint: 'Padrão do Telegram' },
  { value: 'telegram.me', label: 'telegram.me', hint: 'Alternativa em caso de instabilidade' },
] as const

export default function AdminConfiguracoesPage() {
  const [current,   setCurrent]   = useState<string | null>(null)
  const [selected,  setSelected]  = useState<string>('t.me')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [feedback,  setFeedback]  = useState<{ ok: boolean; msg: string } | null>(null)

  const [productNameCurrent, setProductNameCurrent] = useState<string | null>(null)
  const [productName,        setProductName]        = useState('')
  const [savingProductName,  setSavingProductName]  = useState(false)
  const [productNameFeedback, setProductNameFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const settings: any = await api.get('/admin/settings/platform')
      setCurrent(settings.telegramLinkDomain)
      setSelected(settings.telegramLinkDomain)
      setProductNameCurrent(settings.pixDefaultProductName)
      setProductName(settings.pixDefaultProductName || '')
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true); setFeedback(null)
    try {
      await api.put('/admin/settings/platform/telegram-link-domain', { domain: selected })
      setCurrent(selected)
      setFeedback({ ok: true, msg: 'Domínio atualizado! Novos redirecionamentos já usam essa opção.' })
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message || 'Erro ao salvar' })
    } finally { setSaving(false) }
  }

  const saveProductName = async () => {
    setSavingProductName(true); setProductNameFeedback(null)
    try {
      await api.put('/admin/settings/platform/pix-default-product-name', { name: productName })
      setProductNameCurrent(productName)
      setProductNameFeedback({ ok: true, msg: 'Nome atualizado! Novas cobranças PIX já usam esse nome.' })
    } catch (e: any) {
      setProductNameFeedback({ ok: false, msg: e.message || 'Erro ao salvar' })
    } finally { setSavingProductName(false) }
  }

  return (
    <div className="p-8 space-y-6 max-w-2xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <Settings className="h-6 w-6 text-[#E50914]" />
          Configurações
        </h1>
        <p className="text-sm text-[#555] mt-1">
          Ajustes globais que afetam toda a plataforma
        </p>
      </div>

      {/* Card: domínio do link do Telegram */}
      <div className="rounded-[4px] border border-white/[0.06] bg-[#0F0F14] overflow-hidden">
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[4px] flex items-center justify-center bg-[#E50914]/10 shrink-0">
              <Link2 className="h-4.5 w-4.5 text-[#E50914]" />
            </div>
            <div>
              <p className="text-base font-black text-white">Domínio do link do Telegram</p>
              <p className="text-[11px] text-[#555]">
                Usado pelos redirecionadores para montar o link final (ex: https://{selected}/seubot)
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-[#555] text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {DOMAIN_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setSelected(opt.value); setFeedback(null) }}
                    className={`flex items-center justify-between text-left px-4 py-3 rounded-[4px] border transition-all ${
                      selected === opt.value
                        ? 'border-[#E50914]/40 bg-[#E50914]/10'
                        : 'border-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-white font-mono">{opt.label}</p>
                      <p className="text-[11px] text-[#555]">{opt.hint}</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selected === opt.value ? 'border-[#E50914]' : 'border-[#333]'
                    }`}>
                      {selected === opt.value && <div className="w-2 h-2 rounded-full bg-[#E50914]" />}
                    </div>
                  </button>
                ))}
              </div>

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

              <button
                onClick={save}
                disabled={saving || selected === current}
                className="h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-40 flex items-center justify-center gap-1.5 bg-[#E50914] hover:bg-[#c40812] transition-all"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Card: nome de produto padrão enviado às adquirentes PIX */}
      <div className="rounded-[4px] border border-white/[0.06] bg-[#0F0F14] overflow-hidden">
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[4px] flex items-center justify-center bg-[#E50914]/10 shrink-0">
              <Tag className="h-4.5 w-4.5 text-[#E50914]" />
            </div>
            <div>
              <p className="text-base font-black text-white">Nome do produto nas cobranças PIX</p>
              <p className="text-[11px] text-[#555]">
                Enviado às adquirentes quando a cobrança não tem produto de catálogo vinculado
                (botões de plano do fluxo, upsells). Só muda o que é enviado pro gateway —
                não afeta o funcionamento do fluxo nem do pagamento.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-[#555] text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              <input
                value={productName}
                onChange={(e) => { setProductName(e.target.value); setProductNameFeedback(null) }}
                placeholder="Ex: Produto 1"
                maxLength={100}
                className="h-9 rounded-[4px] border border-white/[0.08] bg-[#141414] px-3 text-sm text-white placeholder:text-[#444] outline-none focus:border-[#E50914]/40 transition-all"
              />

              {productNameFeedback && (
                <div className={`flex items-center gap-2 p-2.5 rounded-[4px] border text-xs font-medium ${
                  productNameFeedback.ok
                    ? 'bg-[#00B37E]/10 border-[#00B37E]/20 text-[#00B37E]'
                    : 'bg-[#EF4444]/10 border-[#EF4444]/20 text-[#EF4444]'
                }`}>
                  {productNameFeedback.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                  {productNameFeedback.msg}
                </div>
              )}

              <button
                onClick={saveProductName}
                disabled={savingProductName || !productName.trim() || productName === productNameCurrent}
                className="h-9 rounded-[4px] font-semibold text-xs text-white disabled:opacity-40 flex items-center justify-center gap-1.5 bg-[#E50914] hover:bg-[#c40812] transition-all"
              >
                {savingProductName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {savingProductName ? 'Salvando...' : 'Salvar'}
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  )
}
