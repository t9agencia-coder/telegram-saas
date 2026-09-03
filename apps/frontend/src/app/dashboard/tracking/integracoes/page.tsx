'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { ACCOUNT_STATUS } from '@/lib/tracking'
import { Loader2, Facebook, CheckCircle2, AlertTriangle, Plug, RefreshCw, ExternalLink, Copy, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdAccount {
  id: string
  metaConnectionId: string
  fbAdAccountId: string
  name: string | null
  currency: string | null
  status: string | null
  statusToken?: string | null
  isSelected: boolean
  lastSyncedAt: string | null
}

interface Conn {
  id: string
  metaUserId: string | null
  status: string
  connected: boolean
  lastError: string | null
  tokenSuffix: string | null
  tokenExpiresAt: string | null
  adAccounts: AdAccount[]
}

interface Status {
  configured: boolean
  connected: boolean
  connectionCount: number
  maxConnections: number
  activeAccountCount: number
  maxActiveAccounts: number
  connections: Conn[]
}

export default function TrackingIntegracoesPage() {
  const { workspaceId } = useAuthStore()
  const search = useSearchParams()
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [oauthUrl, setOauthUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(() => {
    if (!workspaceId) return
    api.get<Status>(`/workspaces/${workspaceId}/tracking/meta/status`)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  // Enquanto o painel do link está aberto, fica checando — pega a conexão feita
  // em OUTRA aba ou OUTRO navegador (multilogin/anti-detect).
  useEffect(() => {
    if (oauthUrl) pollRef.current = setInterval(load, 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [oauthUrl, load])

  const connCount = status?.connections?.length ?? 0
  const prevCountRef = useRef(connCount)
  useEffect(() => {
    // conectou um perfil novo enquanto o painel estava aberto → fecha o painel
    if (oauthUrl && connCount > prevCountRef.current) setOauthUrl(null)
    prevCountRef.current = connCount
  }, [connCount, oauthUrl])

  const metaParam = search.get('meta')

  const genLink = async () => {
    setBusy('connect')
    try {
      const { url } = await api.get<{ url: string }>(`/workspaces/${workspaceId}/tracking/meta/oauth/url`)
      setOauthUrl(url)
      setCopied(false)
    } catch (e: any) {
      alert(e.message || 'Falha ao gerar o link do Facebook')
    } finally {
      setBusy(null)
    }
  }

  const copyLink = async () => {
    if (!oauthUrl) return
    try { await navigator.clipboard.writeText(oauthUrl); setCopied(true); setTimeout(() => setCopied(false), 2500) }
    catch { /* clipboard bloqueado — o usuário copia manual do campo */ }
  }

  const refreshAccounts = async (connectionId?: string) => {
    setBusy(connectionId ? `refresh-${connectionId}` : 'refresh')
    try {
      const q = connectionId ? `?connectionId=${connectionId}` : ''
      setStatus(await api.post(`/workspaces/${workspaceId}/tracking/meta/ad-accounts/refresh${q}`))
    } catch (e: any) {
      alert(e.message || 'Falha ao atualizar as contas')
    } finally { setBusy(null) }
  }

  const toggleAcc = async (accId: string, active: boolean) => {
    setBusy(accId)
    try {
      await api.post(`/workspaces/${workspaceId}/tracking/meta/ad-accounts/${accId}/toggle`, { active })
      load()
    } catch (e: any) {
      alert(e.message || 'Falha ao mudar a conta')
    } finally { setBusy(null) }
  }

  const disconnectConn = async (connId: string) => {
    if (!confirm('Desconectar este perfil do Facebook? As contas dele param de sincronizar.')) return
    setBusy(connId)
    try { await api.delete(`/workspaces/${workspaceId}/tracking/meta/connections/${connId}`); load() }
    finally { setBusy(null) }
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-[#666]" /></div>

  const maxConns = status?.maxConnections ?? 5
  const maxAcc = status?.maxActiveAccounts ?? 20
  const activeAcc = status?.activeAccountCount ?? 0
  const canConnectMore = !!status?.configured && connCount < maxConns

  return (
    <div>
      <PageHeader title="Integrações" description="Conecte fontes de tráfego ao módulo de Tracking" />

      {metaParam === 'connected' && (
        <div className="mb-4 flex items-center gap-2 rounded-[4px] border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-2 text-sm text-[#22C55E]">
          <CheckCircle2 className="h-4 w-4" /> Perfil do Facebook conectado. Ative abaixo as contas de anúncio que quer acompanhar.
        </div>
      )}
      {metaParam === 'denied' && (
        <div className="mb-4 flex items-center gap-2 rounded-[4px] border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-sm text-[#F59E0B]">
          <AlertTriangle className="h-4 w-4" /> Autorização cancelada no Facebook.
        </div>
      )}
      {metaParam === 'limit' && (
        <div className="mb-4 flex items-center gap-2 rounded-[4px] border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-sm text-[#F59E0B]">
          <AlertTriangle className="h-4 w-4" /> Limite de {maxConns} perfis atingido. Desconecte um antes de adicionar outro.
        </div>
      )}
      {metaParam === 'error' && (
        <div className="mb-4 flex items-center gap-2 rounded-[4px] border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-sm text-[#EF4444]">
          <AlertTriangle className="h-4 w-4" /> Erro ao conectar. Gere um link novo e tente de novo.
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
                Conecte até {maxConns} perfis do Facebook e ative até {maxAcc} contas de anúncio no total.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[11px] font-medium text-[#B3B3B3] bg-white/[0.04] px-2 py-0.5 rounded-[3px]">
              {connCount}/{maxConns} perfis
            </span>
            <span className={cn(
              'text-[11px] font-medium px-2 py-0.5 rounded-[3px]',
              activeAcc >= maxAcc ? 'text-[#F59E0B] bg-[#F59E0B]/10' : 'text-[#B3B3B3] bg-white/[0.04]',
            )}>
              {activeAcc}/{maxAcc} contas ativas
            </span>
          </div>
        </div>

        {!status?.configured && (
          <p className="mt-4 text-xs text-[#F59E0B]">
            A integração Meta ainda não foi configurada no servidor (META_APP_ID / META_APP_SECRET).
          </p>
        )}

        {/* ── Lista de perfis conectados ──────────────────────────────── */}
        {(status?.connections ?? []).map((conn) => (
          <div key={conn.id} className="mt-4 border-t border-white/[0.06] pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn(
                  'text-[11px] font-medium px-2 py-0.5 rounded-[3px] shrink-0',
                  conn.connected ? 'text-[#22C55E] bg-[#22C55E]/10' : 'text-[#EF4444] bg-[#EF4444]/10',
                )}>
                  {conn.connected ? 'Conectado' : 'Token expirado'}
                </span>
                <span className="text-xs text-[#888] truncate">
                  perfil {conn.metaUserId ? `#${conn.metaUserId}` : ''} {conn.tokenSuffix ? `· ****${conn.tokenSuffix}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => refreshAccounts(conn.id)} disabled={!!busy}
                  className="inline-flex items-center gap-1 text-[11px] text-[#666] hover:text-white disabled:opacity-50">
                  <RefreshCw className={cn('h-3 w-3', busy === `refresh-${conn.id}` && 'animate-spin')} /> Atualizar
                </button>
                <button onClick={() => disconnectConn(conn.id)} disabled={!!busy}
                  className="text-[11px] text-[#666] hover:text-[#EF4444] disabled:opacity-50">Desconectar</button>
              </div>
            </div>

            {!conn.connected && conn.lastError && (
              <p className="text-xs text-[#EF4444] mb-2">{conn.lastError}</p>
            )}

            {conn.adAccounts.length === 0 ? (
              <p className="text-xs text-[#666]">Nenhuma conta de anúncios neste perfil.</p>
            ) : (
              <div className="space-y-1.5">
                {conn.adAccounts.map((acc) => {
                  const blocked = !acc.isSelected && activeAcc >= maxAcc
                  const st = ACCOUNT_STATUS[acc.statusToken || 'UNKNOWN'] ?? ACCOUNT_STATUS.UNKNOWN
                  return (
                    <div
                      key={acc.id}
                      className={cn(
                        'w-full flex items-center justify-between gap-3 rounded-[4px] border px-3 py-2',
                        acc.isSelected ? 'border-[#4496ff]/30 bg-[#4496ff]/[0.06]' : 'border-white/[0.06] bg-[#1A1A1A]',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-white truncate">{acc.name || acc.fbAdAccountId}</p>
                          {st.label !== '—' && (
                            <span className={cn('shrink-0 text-[9px] px-1.5 py-0.5 rounded-[3px] font-medium', st.tone)}>{st.label}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#666] truncate">
                          {acc.fbAdAccountId}{acc.currency ? ` · ${acc.currency}` : ''}
                          {acc.isSelected && acc.lastSyncedAt ? ' · sincronizando' : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleAcc(acc.id, !acc.isSelected)}
                        disabled={!!busy || blocked}
                        title={blocked ? `Limite de ${maxAcc} contas ativas` : undefined}
                        className={cn(
                          'relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40',
                          acc.isSelected ? 'bg-[#4496ff]' : 'bg-white/[0.12]',
                        )}
                      >
                        {busy === acc.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-white mx-auto" />
                        ) : (
                          <span className={cn(
                            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                            acc.isSelected ? 'translate-x-4' : 'translate-x-0.5',
                          )} />
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {/* ── Conectar (novo perfil) ──────────────────────────────────── */}
        {status?.configured && !oauthUrl && (
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <button
              onClick={genLink}
              disabled={!!busy || !canConnectMore}
              className="inline-flex items-center gap-2 rounded-[4px] bg-[#1877F2] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#1877F2]/90 disabled:opacity-50"
            >
              {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              {connCount === 0 ? 'Conectar perfil do Facebook' : 'Conectar outro perfil'}
            </button>
            {!canConnectMore && connCount > 0 && (
              <p className="mt-2 text-[11px] text-[#F59E0B]">Limite de {maxConns} perfis atingido.</p>
            )}
          </div>
        )}

        {oauthUrl && (
          <div className="mt-4 rounded-[4px] border border-[#1877F2]/25 bg-[#1877F2]/[0.05] p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white/80">Link de autorização do Facebook</p>
              <button onClick={() => setOauthUrl(null)} className="text-[#666] hover:text-white"><X className="h-3.5 w-3.5" /></button>
            </div>
            <p className="text-[11px] text-[#999] mb-3 leading-relaxed">
              Abra este link <strong className="text-white/80">no navegador/perfil onde você está logado na conta certa do Facebook</strong>
              {' '}(ex.: seu perfil do Multilogin/anti-detect). Autorize as permissões e pode fechar a aba do Facebook —
              esta tela detecta a conexão sozinha. Use o link em até ~10 min (depois é só gerar um novo).
            </p>

            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={oauthUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 rounded-[4px] border border-white/[0.08] bg-[#0D0D0D] px-2.5 py-1.5 text-[11px] text-[#999] font-mono"
              />
              <button
                onClick={copyLink}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-[4px] border border-white/[0.1] bg-[#1A1A1A] px-3 text-xs font-medium text-white/80 hover:bg-white/[0.06]"
              >
                {copied ? <><Check className="h-3.5 w-3.5 text-[#22C55E]" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar</>}
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <a
                href={oauthUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#1877F2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1877F2]/90"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
              </a>
              <button onClick={genLink} disabled={!!busy}
                className="inline-flex items-center gap-1.5 text-[11px] text-[#666] hover:text-white disabled:opacity-50">
                <RefreshCw className={cn('h-3 w-3', busy === 'connect' && 'animate-spin')} /> Gerar link novo
              </button>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#666] ml-auto">
                <Loader2 className="h-3 w-3 animate-spin" /> aguardando autorização…
              </span>
            </div>
          </div>
        )}

        {connCount > 0 && (
          <p className="mt-4 text-[11px] text-[#555]">
            A sincronização roda em background a cada ~15 min. O painel lê sempre do banco local — nunca chama a Meta a cada acesso.
          </p>
        )}
      </div>
    </div>
  )
}
