'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/dashboard/page-header'
import {
  Globe, Plus, Loader2, Trash2, Check, Copy, X, AlertCircle,
  RefreshCw, ShieldCheck, Clock, AlertTriangle, ChevronDown, ChevronUp, Lock,
} from 'lucide-react'

// Versão enxuta de admin/dominios/page.tsx, pra domínio PRÓPRIO de conta —
// sem domínio padrão, sem toggle manual ativar/desativar, sem ocultar-de-picker
// (nenhum desses conceitos se aplica aqui). Máximo 3 domínios por conta.

const MAX_DOMAINS = 3

// ── Tipos ─────────────────────────────────────────────────────────────────────

type StatusVal = 'pending' | 'active' | 'failed'

interface Domain {
  id:          string
  domain:      string
  isActive:    boolean
  dnsStatus:   StatusVal
  sslStatus:   StatusVal
  verifiedAt:  string | null
  sslIssuedAt: string | null
  createdAt:   string
  linksCount:  number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dnsHost(domain: string): string {
  const parts = domain.split('.')
  return parts.length <= 2 ? '@' : parts[0]
}

function StatusBadge({ type, status }: { type: 'dns' | 'ssl'; status: StatusVal }) {
  const labels = {
    dns: { pending: 'DNS Pendente', active: 'DNS OK', failed: 'DNS Falhou' },
    ssl: { pending: 'SSL Pendente', active: 'SSL Ativo', failed: 'SSL Falhou' },
  }
  const icons  = { pending: Clock, active: type === 'ssl' ? Lock : ShieldCheck, failed: AlertTriangle }
  const colors = {
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    active:  'bg-green-500/10 text-green-400 border-green-500/20',
    failed:  'bg-red-500/10 text-red-400 border-red-500/20',
  }
  const Icon = icons[status]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colors[status]}`}>
      <Icon className="h-2.5 w-2.5" />
      {labels[type][status]}
    </span>
  )
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button onClick={copy} className="ml-1.5 text-[#555] hover:text-white transition-colors">
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

// Painel expandível com instruções DNS + status SSL
function SetupInstructions({ domain, serverIp, onVerify, verifying }: {
  domain:    Domain
  serverIp:  string
  onVerify:  () => void
  verifying: boolean
}) {
  const host = dnsHost(domain.domain)
  const [open, setOpen] = useState(true)

  const dnsOk  = domain.dnsStatus === 'active'
  const sslOk  = domain.sslStatus === 'active'
  const sslFail = domain.sslStatus === 'failed'

  return (
    <div className={`mt-2 rounded-[4px] border overflow-hidden ${
      dnsOk && !sslOk
        ? 'border-blue-500/20 bg-blue-500/[0.03]'
        : 'border-amber-500/20 bg-amber-500/[0.04]'
    }`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <span className={`text-xs font-semibold flex items-center gap-2 ${dnsOk && !sslOk ? 'text-blue-400' : 'text-amber-400'}`}>
          {dnsOk && !sslOk
            ? <><Lock className="h-3.5 w-3.5" />Provisionando SSL…</>
            : <><Globe className="h-3.5 w-3.5" />Configure o DNS do domínio</>
          }
        </span>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 text-[#444]" />
          : <ChevronDown className="h-3.5 w-3.5 text-[#444]" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Etapa 1 — DNS */}
          <div className={`space-y-2 ${dnsOk ? 'opacity-50' : ''}`}>
            <p className="text-[11px] font-semibold text-[#888] flex items-center gap-1.5">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border ${dnsOk ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-amber-500/20 border-amber-500/30 text-amber-400'}`}>
                {dnsOk ? '✓' : '1'}
              </span>
              Adicione o registro DNS no seu provedor
            </p>

            <div className="rounded-[3px] border border-white/[0.06] overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.06]">
                    <th className="text-left px-3 py-1.5 text-[#444] font-medium">Tipo</th>
                    <th className="text-left px-3 py-1.5 text-[#444] font-medium">Nome / Host</th>
                    <th className="text-left px-3 py-1.5 text-[#444] font-medium">Aponta para</th>
                    <th className="text-left px-3 py-1.5 text-[#444] font-medium">TTL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 text-white font-mono font-semibold">A</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-white">{host}</span>
                      <CopyBtn value={host} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-white">{serverIp || '—'}</span>
                      {serverIp && <CopyBtn value={serverIp} />}
                    </td>
                    <td className="px-3 py-2 text-[#555]">Auto / 3600</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {domain.dnsStatus === 'failed' && (
              <div className="flex items-start gap-2 p-2.5 rounded-[3px] bg-red-500/[0.06] border border-red-500/15">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-400">
                  DNS não resolveu para <span className="font-mono font-bold">{serverIp}</span>. Verifique o registro e aguarde a propagação.
                </p>
              </div>
            )}
          </div>

          {/* Etapa 2 — SSL */}
          <div className={`space-y-2 pt-2 border-t border-white/[0.04] ${!dnsOk ? 'opacity-40 pointer-events-none' : ''}`}>
            <p className="text-[11px] font-semibold text-[#888] flex items-center gap-1.5">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border ${sslOk ? 'bg-green-500/20 border-green-500/30 text-green-400' : sslFail ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-[#222] border-[#333] text-[#555]'}`}>
                {sslOk ? '✓' : sslFail ? '!' : '2'}
              </span>
              Certificado SSL (Let's Encrypt)
            </p>

            {sslOk ? (
              <p className="text-[11px] text-green-400">
                SSL provisionado automaticamente. O domínio está ativo com HTTPS.
              </p>
            ) : sslFail ? (
              <div className="flex items-start gap-2 p-2.5 rounded-[3px] bg-red-500/[0.06] border border-red-500/15">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-400">
                  Falha ao emitir certificado SSL. Certifique-se de que o DNS propagou e tente novamente.
                </p>
              </div>
            ) : dnsOk ? (
              <p className="text-[11px] text-[#555]">
                O SSL será provisionado automaticamente ao clicar em "Verificar DNS".
              </p>
            ) : (
              <p className="text-[11px] text-[#555]">
                Configure o DNS primeiro. O SSL é emitido automaticamente após a verificação.
              </p>
            )}
          </div>

          <p className="text-[10px] text-[#444]">
            A propagação DNS pode levar até 24h. Após configurar, clique em "Verificar DNS".
          </p>

          <button
            onClick={onVerify}
            disabled={verifying}
            className={`flex items-center gap-2 h-8 px-4 rounded-[3px] text-xs font-semibold transition-colors disabled:opacity-50 border ${
              dnsOk
                ? 'bg-blue-500/15 hover:bg-blue-500/25 border-blue-500/25 text-blue-400'
                : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/25 text-amber-400'
            }`}
          >
            {verifying
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{dnsOk ? 'Provisionando SSL…' : 'Verificando…'}</>
              : <><RefreshCw className="h-3.5 w-3.5" />{dnsOk && sslFail ? 'Tentar SSL novamente' : 'Verificar DNS'}</>
            }
          </button>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MeusDominiosPage() {
  const { workspaceId } = useAuthStore()
  const [domains,   setDomains]   = useState<Domain[]>([])
  const [serverIp,  setServerIp]  = useState('')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [verifying, setVerifying] = useState<Record<string, boolean>>({})
  const [error,     setError]     = useState('')
  const [modal,     setModal]     = useState(false)
  const [input,     setInput]     = useState('')
  const [confirm,   setConfirm]   = useState<Domain | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) return
    try {
      const [domainsRes, infoRes] = await Promise.all([
        api.get<Domain[]>(`/workspaces/${workspaceId}/domains`),
        api.get<{ serverIp: string }>(`/workspaces/${workspaceId}/domains/server-info`),
      ])
      setDomains(domainsRes)
      setServerIp(infoRes.serverIp)
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setInput(''); setError(''); setModal(true) }
  const closeModal = () => { setModal(false); setInput(''); setError('') }

  const save = async () => {
    if (!input.trim() || !workspaceId) return
    setSaving(true)
    setError('')
    try {
      const created = await api.post<Domain>(`/workspaces/${workspaceId}/domains`, { domain: input.trim() })
      setDomains(prev => [created, ...prev])
      closeModal()
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const verify = async (d: Domain) => {
    if (!workspaceId) return
    setVerifying(prev => ({ ...prev, [d.id]: true }))
    try {
      const res = await api.post<{
        verified:   boolean
        dnsStatus:  string
        sslStatus:  string
        addresses:  string[]
        expected:   string
        error?:     string
        sslError?:  string
      }>(`/workspaces/${workspaceId}/domains/${d.id}/verify`)

      setDomains(prev => prev.map(x =>
        x.id === d.id
          ? {
              ...x,
              dnsStatus:   res.dnsStatus as StatusVal,
              sslStatus:   res.sslStatus as StatusVal,
              isActive:    res.verified && res.sslStatus === 'active',
              verifiedAt:  res.verified ? new Date().toISOString() : null,
              sslIssuedAt: res.sslStatus === 'active' ? new Date().toISOString() : null,
            }
          : x
      ))

      if (res.sslError) {
        setError(`DNS verificado, mas SSL falhou: ${res.sslError}`)
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao verificar')
    } finally {
      setVerifying(prev => ({ ...prev, [d.id]: false }))
    }
  }

  const remove = async (d: Domain) => {
    if (!workspaceId) return
    try {
      await api.delete(`/workspaces/${workspaceId}/domains/${d.id}`)
      setDomains(prev => prev.filter(x => x.id !== d.id))
      setConfirm(null)
    } catch (e: any) {
      setError(e.message || 'Erro ao excluir')
      setConfirm(null)
    }
  }

  const needsSetup = (d: Domain) =>
    d.dnsStatus !== 'active' || d.sslStatus !== 'active'

  const atLimit = domains.length >= MAX_DOMAINS

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meus Domínios"
        description="Cadastre até 3 domínios próprios pra usar nos seus redirecionadores, com SSL automático."
      >
        <button
          onClick={openCreate}
          disabled={atLimit}
          title={atLimit ? `Limite de ${MAX_DOMAINS} domínios atingido` : undefined}
          className="h-10 px-5 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          Novo Domínio
        </button>
      </PageHeader>

      <p className="text-xs text-[#555]">{domains.length}/{MAX_DOMAINS} domínios usados</p>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-[4px] bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-[#E50914]" />
        </div>
      ) : domains.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Globe className="h-10 w-10 text-[#333] mb-3" />
          <p className="text-sm text-[#555]">Nenhum domínio próprio cadastrado</p>
          <button onClick={openCreate} className="mt-4 text-xs text-[#E50914] hover:underline">
            Cadastrar primeiro domínio
          </button>
        </div>
      ) : (
        <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-[11px] font-semibold text-[#444] uppercase tracking-wide px-5 py-3">Domínio</th>
                <th className="text-left text-[11px] font-semibold text-[#444] uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-left text-[11px] font-semibold text-[#444] uppercase tracking-wide px-4 py-3">Links</th>
                <th className="text-left text-[11px] font-semibold text-[#444] uppercase tracking-wide px-4 py-3">Cadastrado</th>
                <th className="text-right text-[11px] font-semibold text-[#444] uppercase tracking-wide px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <React.Fragment key={d.id}>
                  <tr className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.01] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Globe className="h-3.5 w-3.5 text-[#444] shrink-0" />
                        <span className="text-sm font-medium text-white font-mono">{d.domain}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        <StatusBadge type="dns" status={d.dnsStatus} />
                        <StatusBadge type="ssl" status={d.sslStatus} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-[#666]">{d.linksCount}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-[#555]">
                        {new Date(d.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {/* Verificar — para pending/failed em DNS ou SSL */}
                        {needsSetup(d) && (
                          <button onClick={() => verify(d)} disabled={verifying[d.id]}
                            title="Verificar DNS / Provisionar SSL"
                            className="h-7 px-2 flex items-center gap-1 rounded-[3px] text-[10px] font-semibold text-amber-400 hover:bg-amber-400/5 border border-amber-500/20 hover:border-amber-500/40 transition-colors disabled:opacity-40">
                            {verifying[d.id]
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <RefreshCw className="h-3 w-3" />
                            }
                            {verifying[d.id] ? 'Aguarde…' : 'Verificar'}
                          </button>
                        )}
                        {/* Excluir */}
                        <button onClick={() => setConfirm(d)} title="Excluir"
                          className="h-7 w-7 flex items-center justify-center rounded-[3px] text-[#444] hover:text-red-400 hover:bg-red-400/5 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Painel de setup para domínios não totalmente ativos */}
                  {needsSetup(d) && (
                    <tr className="border-b border-white/[0.04] last:border-0 bg-[#0e0e0e]">
                      <td colSpan={5} className="px-5 pb-4">
                        <SetupInstructions
                          domain={d}
                          serverIp={serverIp}
                          onVerify={() => verify(d)}
                          verifying={!!verifying[d.id]}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal criar */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#141414] border border-white/[0.08] rounded-[6px] w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-white">Novo Domínio</h2>
              <button onClick={closeModal} className="text-[#444] hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#888] mb-1.5">Domínio</label>
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && save()}
                  placeholder="ex: meulink.com"
                  className="w-full h-9 bg-[#0A0A0A] border border-white/[0.08] rounded-[4px] px-3 text-sm text-white placeholder:text-[#333] focus:outline-none focus:border-[#E50914]/50"
                  autoFocus
                />
                <p className="text-[10px] text-[#444] mt-1.5">
                  Após cadastrar: configure o DNS e o SSL será emitido automaticamente via Let's Encrypt. Ele só fica disponível pros seus redirecionadores depois de verificado.
                </p>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={closeModal}
                className="flex-1 h-9 rounded-[4px] border border-white/[0.08] text-sm text-[#666] hover:text-white hover:border-white/20 transition-colors">
                Cancelar
              </button>
              <button onClick={save} disabled={saving || !input.trim()}
                className="flex-1 h-9 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] text-white text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Cadastrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar exclusão */}
      {confirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#141414] border border-white/[0.08] rounded-[6px] w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-[4px] bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Excluir domínio</p>
                <p className="text-xs text-[#555] mt-0.5 font-mono">{confirm.domain}</p>
              </div>
            </div>
            <p className="text-xs text-[#666] mb-5">
              {confirm.linksCount > 0
                ? `Este domínio possui ${confirm.linksCount} link${confirm.linksCount > 1 ? 's' : ''} associado${confirm.linksCount > 1 ? 's' : ''}. Os links existentes não serão afetados.`
                : 'A configuração nginx e o certificado SSL serão removidos. Esta ação não pode ser desfeita.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirm(null)}
                className="flex-1 h-9 rounded-[4px] border border-white/[0.08] text-sm text-[#666] hover:text-white transition-colors">
                Cancelar
              </button>
              <button onClick={() => remove(confirm)}
                className="flex-1 h-9 rounded-[4px] bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium transition-colors">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
