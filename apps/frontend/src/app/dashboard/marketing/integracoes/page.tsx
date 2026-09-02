'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { Loader2, Facebook, CheckCircle2, AlertTriangle, Plug, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdAccount {
  id: string
  fbAdAccountId: string
  name: string | null
  currency: string | null
  status: string | null
  isSelected: boolean
  lastSyncedAt: string | null
}

interface Status {
  configured: boolean
  connected: boolean
  status?: string
  lastError?: string | null
  tokenSuffix?: string | null
  tokenExpiresAt?: string | null
  adAccounts?: AdAccount[]
}

export default function MarketingIntegracoesPage() {
  const { workspaceId } = useAuthStore()
  const search = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!workspaceId) return
    api.get<Status>(`/workspaces/${workspaceId}/marketing/meta/status`)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  const metaParam = search.get('meta')

  const connect = async () => {
    setBusy('connect')
    try {
      const { url } = await api.get<{ url: string }>(`/workspaces/${workspaceId}/marketing/meta/oauth/url`)
      window.location.href = url
    } catch (e: any) {
      alert(e.message || 'Falha ao gerar link do Facebook')
      setBusy(null)
    }
  }

  const refreshAccounts = async () => {
    setBusy('refresh')
    try { setStatus(await api.post(`/workspaces/${workspaceId}/marketing/meta/ad-accounts/refresh`)) }
    finally { setBusy(null) }
  }

  const select = async (adAccountId: string) => {
    setBusy(adAccountId)
    try {
      await api.post(`/workspaces/${workspaceId}/marketing/meta/ad-accounts/${adAccountId}/select`)
      load()
    } finally { setBusy(null) }
  }

  const disconnect = async () => {
    if (!confirm('Desconectar a conta do Facebook Ads deste workspace?')) return
    setBusy('disconnect')
    try { await api.delete(`/workspaces/${workspaceId}/marketing/meta/connection`); load() }
    finally { setBusy(null) }
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-[#666]" /></div>

  return (
    <div>
      <PageHeader title="Integrações" description="Conecte fontes de tráfego ao módulo de Marketing" />

      {metaParam === 'connected' && (
        <div className="mb-4 flex items-center gap-2 rounded-[4px] border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-2 text-sm text-[#22C55E]">
          <CheckCircle2 className="h-4 w-4" /> Facebook Ads conectado. Escolha a conta de anúncios abaixo.
        </div>
      )}
      {metaParam === 'denied' && (
        <div className="mb-4 flex items-center gap-2 rounded-[4px] border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-sm text-[#F59E0B]">
          <AlertTriangle className="h-4 w-4" /> Autorização cancelada no Facebook.
        </div>
      )}
      {metaParam === 'error' && (
        <div className="mb-4 flex items-center gap-2 rounded-[4px] border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-sm text-[#EF4444]">
          <AlertTriangle className="h-4 w-4" /> Erro ao conectar. Tente novamente.
        </div>
      )}

      <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-5 max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-[4px] bg-[#1877F2]/10 border border-[#1877F2]/20 flex items-center justify-center shrink-0">
              <Facebook className="h-5 w-5 text-[#1877F2]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Facebook / Meta Ads</p>
              <p className="text-xs text-[#666666] mt-0.5 max-w-md">
                Conecte sua conta de anúncios para visualizar campanhas, gastos, anúncios e resultados.
              </p>
            </div>
          </div>
          {status?.connected
            ? <span className="text-[11px] font-medium text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-[3px] shrink-0">Conectado</span>
            : status?.status === 'expired'
              ? <span className="text-[11px] font-medium text-[#EF4444] bg-[#EF4444]/10 px-2 py-0.5 rounded-[3px] shrink-0">Token expirado</span>
              : <span className="text-[11px] font-medium text-[#666] bg-white/[0.04] px-2 py-0.5 rounded-[3px] shrink-0">Desconectado</span>}
        </div>

        {!status?.configured && (
          <p className="mt-4 text-xs text-[#F59E0B]">
            A integração Meta ainda não foi configurada no servidor (META_APP_ID / META_APP_SECRET).
          </p>
        )}

        {status?.configured && !status?.connected && status?.status !== 'expired' && (
          <button
            onClick={connect}
            disabled={!!busy}
            className="mt-4 inline-flex items-center gap-2 rounded-[4px] bg-[#1877F2] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#1877F2]/90 disabled:opacity-50"
          >
            {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Conectar Facebook Ads
          </button>
        )}

        {status?.status === 'expired' && (
          <div className="mt-4">
            <p className="text-xs text-[#EF4444] mb-2">{status.lastError || 'O token de acesso expirou ou foi revogado.'}</p>
            <button onClick={connect} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-[4px] bg-[#1877F2] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#1877F2]/90 disabled:opacity-50">
              {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Reconectar
            </button>
          </div>
        )}

        {status?.connected && (
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-white/70">Conta de anúncios</p>
              <div className="flex items-center gap-2">
                <button onClick={refreshAccounts} disabled={!!busy}
                  className="inline-flex items-center gap-1 text-[11px] text-[#666] hover:text-white disabled:opacity-50">
                  <RefreshCw className={cn('h-3 w-3', busy === 'refresh' && 'animate-spin')} /> Atualizar lista
                </button>
                <button onClick={disconnect} disabled={!!busy}
                  className="text-[11px] text-[#666] hover:text-[#EF4444] disabled:opacity-50">Desconectar</button>
              </div>
            </div>

            {(status.adAccounts ?? []).length === 0 && (
              <p className="text-xs text-[#666]">Nenhuma conta de anúncios encontrada nesta conexão.</p>
            )}

            <div className="space-y-1.5">
              {(status.adAccounts ?? []).map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => select(acc.id)}
                  disabled={!!busy || acc.isSelected}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 rounded-[4px] border px-3 py-2 text-left transition-colors',
                    acc.isSelected
                      ? 'border-[#E50914]/30 bg-[#E50914]/[0.06]'
                      : 'border-white/[0.06] hover:border-white/[0.12] bg-[#1A1A1A]',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{acc.name || acc.fbAdAccountId}</p>
                    <p className="text-[11px] text-[#666] truncate">{acc.fbAdAccountId}{acc.currency ? ` · ${acc.currency}` : ''}</p>
                  </div>
                  {busy === acc.id
                    ? <Loader2 className="h-4 w-4 animate-spin text-[#666] shrink-0" />
                    : acc.isSelected
                      ? <span className="text-[11px] font-medium text-[#E50914] shrink-0">Sincronizando</span>
                      : <span className="text-[11px] text-[#666] shrink-0">Selecionar</span>}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-[#555]">
              A sincronização roda em background a cada ~15 min. O painel lê sempre do banco local — nunca chama a Meta a cada acesso.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
