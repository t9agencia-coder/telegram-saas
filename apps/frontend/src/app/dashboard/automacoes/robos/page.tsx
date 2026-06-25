'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { Bot, Plus, Check, X, Loader2, ExternalLink, Settings, Edit3, Power, Trash2, AlertTriangle, ArrowLeft, GitBranch, CheckCircle } from 'lucide-react'

type BotData = {
  id: string
  username: string
  isActive: boolean
  status: string
  createdAt: string
  webhookUrl?: string
}

type ValidatedBot = {
  id: number
  name: string
  username: string
  isBot: boolean
}

export default function RobosPage() {
  const router = useRouter()
  const { workspaceId } = useAuthStore()
  const [bots, setBots] = useState<BotData[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [token, setToken] = useState('')
  const [validating, setValidating] = useState(false)
  const [validated, setValidated] = useState<ValidatedBot | null>(null)
  const [tokenError, setTokenError] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionMenu, setActionMenu] = useState<string | null>(null)
  const [justCreatedBotId, setJustCreatedBotId] = useState<string | null>(null)

  const loadBots = async () => {
    if (!workspaceId) return
    try {
      const data = await api.get(`/workspaces/${workspaceId}/bots`)
      setBots(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBots() }, [workspaceId])

  const validateToken = useCallback(async (t: string) => {
    if (!t.trim()) return
    setValidating(true)
    setTokenError('')
    setValidated(null)
    try {
      const res = await fetch('/action/tg-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTokenError(data.error || 'Token inválido')
        return
      }
      setValidated(data)
    } catch {
      setTokenError('Erro de conexão. Verifique o token.')
    } finally {
      setValidating(false)
    }
  }, [])

  useEffect(() => {
    if (!token.trim()) {
      setValidated(null)
      setTokenError('')
      return
    }
    const timer = setTimeout(() => validateToken(token), 500)
    return () => clearTimeout(timer)
  }, [token, validateToken])

  const createBot = async () => {
    if (!workspaceId || !token.trim() || !validated) return
    setSaving(true)
    try {
      const result = await api.post(`/workspaces/${workspaceId}/bots`, { botToken: token.trim() })
      setCreating(false)
      setToken('')
      setValidated(null)
      setTokenError('')
      await loadBots()
      // Redireciona direto para criar fluxo com o bot pré-selecionado
      router.push(`/dashboard/automacoes/fluxos?botId=${result.id}`)
    } catch (err: any) {
      setTokenError(err.message || 'Erro ao criar bot')
    } finally {
      setSaving(false)
    }
  }

  const toggleBot = async (id: string, active: boolean) => {
    await api.patch(`/workspaces/${workspaceId}/bots/${id}`, { isActive: active })
    loadBots()
  }

  const deleteBot = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este bot?')) return
    await api.delete(`/workspaces/${workspaceId}/bots/${id}`)
    loadBots()
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-[#E50914]" /></div>

  if (creating) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <button onClick={() => { setCreating(false); setToken(''); setValidated(null); setTokenError('') }}
          className="inline-flex items-center gap-1.5 text-sm text-[#B3B3B3] hover:text-white transition-colors group">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Voltar
        </button>

        <PageHeader title="Criar Novo Bot" description="Configure seu bot do Telegram para começar a automatizar conversas" />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-[#141414] rounded-[4px] border border-white/[0.06] p-6 space-y-6">
              <div>
                <label className="text-sm font-medium text-[#B3B3B3] block mb-1.5">
                  Token do Bot <span className="text-[#E50914]">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                    value={token}
                    onChange={(e) => { setToken(e.target.value); setValidated(null); setTokenError('') }}
                    className={`w-full h-11 rounded-[4px] border bg-[#1E1E1E] pl-3 pr-11 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:ring-1 transition-all font-mono ${
                      validated
                        ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20'
                        : tokenError
                          ? 'border-[#EF4444]/50 focus:border-[#EF4444] focus:ring-[#EF4444]/20'
                          : 'border-white/[0.06] focus:border-[#E50914]/50 focus:ring-[#E50914]/20'
                    }`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {validating ? (
                      <Loader2 className="h-5 w-5 animate-spin text-[#B3B3B3]" />
                    ) : validated ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : tokenError ? (
                      <X className="h-5 w-5 text-[#EF4444]" />
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-[#666666] mt-1.5">Token fornecido pelo BotFather.</p>
                {tokenError && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-[#EF4444] bg-[#EF4444]/10 rounded-[4px] px-4 py-3">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{tokenError}</span>
                  </div>
                )}
              </div>

              {validated && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center gap-2 text-sm text-green-500 bg-green-500/10 rounded-[4px] px-4 py-3">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    Bot validado com sucesso!
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#B3B3B3] block mb-1.5">Nome do Bot</label>
                    <input
                      type="text"
                      value={validated.name}
                      readOnly
                      className="w-full h-11 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] px-3 text-sm text-white/60 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#B3B3B3] block mb-1.5">Username do Bot</label>
                    <input
                      type="text"
                      value={`@${validated.username}`}
                      readOnly
                      className="w-full h-11 rounded-[4px] border border-white/[0.06] bg-[#0D0D0D] px-3 text-sm text-white/60 cursor-not-allowed"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 bg-yellow-500/5 border border-yellow-500/10 rounded-[4px] p-4">
                <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white">Mantenha seu token seguro</p>
                  <p className="text-xs text-[#666666] mt-0.5">Nunca compartilhe o token do seu bot com terceiros. Com ele, qualquer pessoa pode controlar completamente seu bot.</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => { setCreating(false); setToken(''); setValidated(null); setTokenError('') }}
                  className="h-11 px-6 rounded-[4px] border border-white/[0.06] text-sm text-[#B3B3B3] hover:text-white hover:bg-[#1E1E1E] transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={createBot}
                  disabled={!validated || saving}
                  className="flex-1 h-11 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? 'Conectando...' : 'Criar Bot'}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-[#141414] rounded-[4px] border border-white/[0.06] p-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-white">Tutorial para criar um bot no Telegram</h3>
                <p className="text-xs text-[#666666] mt-1">Siga os passos abaixo para criar um novo bot usando o BotFather.</p>
              </div>

              <div className="space-y-5">
                <Step number={1} title="Abra o BotFather" desc="Acesse o BotFather pelo Telegram.">
                  <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[#E50914] hover:text-[#FF1F2D] transition-colors font-medium">
                    <ExternalLink className="h-3 w-3" />
                    Abrir BotFather
                  </a>
                </Step>

                <Step number={2} title="Crie um novo bot" desc="No chat com o BotFather envie:" code="/newbot" />

                <Step number={3} title="Defina o nome" desc='Quando solicitado, informe o nome que será exibido para os usuários.' example="Meu Bot de Vendas" />

                <Step number={4} title="Escolha um username" desc='Defina um username exclusivo terminando com "bot". Exemplos:'>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {['empresa_bot', 'vendas_bot', 'suporte_bot'].map((u) => (
                      <code key={u} className="text-[11px] bg-[#0D0D0D] px-2 py-0.5 rounded text-[#B3B3B3]">{u}</code>
                    ))}
                  </div>
                </Step>

                <Step number={5} title="Copie o Token" desc="O BotFather enviará uma mensagem contendo o token de acesso. Copie o token e cole no campo ao lado." />

                <Step number={6} title="Conecte ao sistema" desc="Após inserir o token:">
                  <div className="space-y-1 mt-1.5">
                    {['O sistema validará automaticamente o bot', 'O nome será preenchido automaticamente', 'O username será preenchido automaticamente', 'Seu bot estará pronto para uso'].map((t) => (
                      <div key={t} className="flex items-center gap-1.5 text-xs text-green-500">
                        <Check className="h-3 w-3" />
                        {t}
                      </div>
                    ))}
                  </div>
                </Step>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (bots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 max-w-lg mx-auto text-center">
        <div className="w-24 h-24 rounded-[4px] bg-[#E50914]/10 flex items-center justify-center mb-6">
          <Bot className="h-12 w-12 text-[#E50914]" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Crie seu primeiro bot</h2>
        <p className="text-sm text-[#666666] mb-8 max-w-sm">
          Conecte um bot do Telegram para começar a automatizar atendimentos, capturar leads e interagir com seus clientes.
        </p>
        <button
          onClick={() => setCreating(true)}
          className="h-12 px-8 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white text-sm font-medium transition-all flex items-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Criar Primeiro Bot
        </button>
        <div className="grid grid-cols-2 gap-4 mt-10 w-full">
          {['Configuração em menos de 2 minutos', 'Processo guiado passo a passo', 'Integração oficial com Telegram', 'Nome e username preenchidos automaticamente'].map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs text-[#666666] bg-[#141414] rounded-[4px] px-4 py-3 border border-white/[0.06]">
              <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Meus Bots" description="Gerencie todos os bots conectados à sua conta.">
        <button
          onClick={() => setCreating(true)}
          className="h-10 px-5 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white text-sm font-medium transition-all flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Novo Bot
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bots.map((bot) => (
          <div key={bot.id} className="bg-[#141414] rounded-[4px] border border-white/[0.06] p-5 hover:border-[#E50914]/30 transition-all group relative">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[4px] bg-[#E50914]/10 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-[#E50914]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{bot.username}</p>
                  <p className="text-xs text-[#666666]">@{bot.username}</p>
                </div>
              </div>
              <div className="relative">
                <button
                  onClick={() => setActionMenu(actionMenu === bot.id ? null : bot.id)}
                  className="w-8 h-8 rounded-[3px] hover:bg-[#2A2A2A] flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                >
                  <svg className="w-4 h-4 text-[#666666]" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
                  </svg>
                </button>
                {actionMenu === bot.id && (
                  <div className="absolute right-0 top-10 w-44 bg-[#1E1E1E] border border-white/[0.06] rounded-[4px] shadow-2xl z-10 overflow-hidden animate-scale-in">
                    {[
                      { icon: GitBranch, label: 'Criar Fluxo', onClick: () => router.push(`/dashboard/automacoes/fluxos?botId=${bot.id}`) },
                      { icon: Power, label: bot.isActive ? 'Desativar' : 'Ativar', onClick: () => toggleBot(bot.id, !bot.isActive) },
                      { icon: Trash2, label: 'Excluir', onClick: () => deleteBot(bot.id), danger: true },
                    ].map((action) => (
                      <button
                        key={action.label}
                        onClick={() => { setActionMenu(null); action.onClick() }}
                        className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm transition-colors ${
                          action.danger ? 'text-[#EF4444] hover:bg-[#EF4444]/10' : 'text-[#B3B3B3] hover:text-white hover:bg-[#2A2A2A]'
                        }`}
                      >
                        <action.icon className="h-4 w-4" />
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${bot.isActive ? 'bg-green-500/10 text-green-500' : 'bg-[#2A2A2A] text-[#666666]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${bot.isActive ? 'bg-green-500' : 'bg-[#666666]'}`} />
                {bot.isActive ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/automacoes/fluxos?botId=${bot.id}`) }}
              className="flex items-center gap-1.5 text-xs text-[#E50914] hover:text-[#FF1F2D] transition-colors font-medium mb-3"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Criar Fluxo
            </button>

            <p className="text-xs text-[#666666]">
              Criado em {new Date(bot.createdAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Step({ number, title, desc, code, example, children }: {
  number: number
  title: string
  desc: string
  code?: string
  example?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-[#E50914]/10 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-[#E50914]">{number}</span>
      </div>
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-[#666666] mt-0.5">{desc}</p>
        {code && <code className="inline-block text-xs bg-[#0D0D0D] px-2 py-1 rounded mt-1 text-[#E50914] font-mono">{code}</code>}
        {example && <p className="text-xs text-[#B3B3B3] mt-1">Exemplo: <span className="text-white">{example}</span></p>}
        {children}
      </div>
    </div>
  )
}
