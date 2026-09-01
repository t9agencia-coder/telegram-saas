'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { isPushSupported, getActiveSubscription, subscribeToPush } from '@/lib/push'
import {
  User as UserIcon, Building2, CheckCircle2, Circle, Loader2, Save,
  Bot, Users as UsersIcon, Package, Workflow,
  Bell, Check, Send,
} from 'lucide-react'

const ACCENT = '#E50914'

const NOTIFICATION_EVENTS: { key: string; label: string; desc: string }[] = [
  { key: 'sale_pending',  label: 'Vendas pendentes', desc: 'PIX gerado, aguardando pagamento' },
  { key: 'sale_approved', label: 'Vendas aprovadas', desc: 'Pagamento confirmado e aprovado' },
]

interface WorkspaceDetail {
  id: string
  name: string
  createdAt: string
  _count: { bots: number; leads: number; products: number; flows: number }
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function StatPill({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-white/[0.02] p-2.5 text-center">
      <Icon className="h-3.5 w-3.5 text-[#666666] mx-auto mb-1" />
      <p className="text-sm font-semibold text-white">{value}</p>
      <p className="text-[9px] text-[#666666] uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}

export default function ConfiguracoesPage() {
  const { user, workspaceId, setUser } = useAuthStore()

  const [name, setName] = useState(user?.name || '')
  const [avatar, setAvatar] = useState(user?.avatar || '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null)
  const [workspaceName, setWorkspaceName] = useState('')
  const [loadingWorkspace, setLoadingWorkspace] = useState(true)
  const [savingWorkspace, setSavingWorkspace] = useState(false)

  const [notifEvents, setNotifEvents] = useState<string[]>(['sale_pending', 'sale_approved'])
  const [notifDeviceCount, setNotifDeviceCount] = useState(0)
  const [notifDeviceActive, setNotifDeviceActive] = useState(false)
  const [loadingNotif, setLoadingNotif] = useState(true)
  const [savingNotif, setSavingNotif] = useState(false)
  const [reactivating, setReactivating] = useState(false)
  const [testingNotif, setTestingNotif] = useState(false)
  const [notifBanner, setNotifBanner] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    setName(user?.name || '')
    setAvatar(user?.avatar || '')
  }, [user])

  useEffect(() => {
    if (!workspaceId) return
    api.get(`/workspaces/${workspaceId}`)
      .then(w => { setWorkspace(w); setWorkspaceName(w.name) })
      .catch(() => {})
      .finally(() => setLoadingWorkspace(false))
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    ;(async () => {
      try {
        const s = await api.get(`/workspaces/${workspaceId}/push/settings`)
        setNotifEvents(s.enabledEvents?.length ? s.enabledEvents : ['sale_pending', 'sale_approved'])
        setNotifDeviceCount(s.deviceCount ?? 0)
      } catch (e) { console.error(e) }
      finally { setLoadingNotif(false) }

      // Status é sempre conferido ao vivo (permissão pode ter sido revogada fora
      // do app) — nunca confia só numa flag salva localmente.
      if (isPushSupported()) {
        const sub = await getActiveSubscription().catch(() => null)
        setNotifDeviceActive(!!sub && Notification.permission === 'granted')
      }
    })()
  }, [workspaceId])

  const toggleNotifEvent = (key: string) => {
    setNotifEvents(prev => prev.includes(key) ? prev.filter(e => e !== key) : [...prev, key])
  }

  const saveNotifSettings = async () => {
    if (!workspaceId) return
    setNotifBanner(null)
    setSavingNotif(true)
    try {
      const s = await api.put(`/workspaces/${workspaceId}/push/settings`, { enabledEvents: notifEvents })
      setNotifEvents(s.enabledEvents)
      setNotifBanner({ ok: true, msg: 'Preferências salvas com sucesso' })
    } catch (e: any) {
      setNotifBanner({ ok: false, msg: e.message || 'Falha ao salvar' })
    } finally {
      setSavingNotif(false)
    }
  }

  const reactivateNotifications = async () => {
    if (!workspaceId) return
    setNotifBanner(null)
    setReactivating(true)
    try {
      await subscribeToPush(workspaceId)
      setNotifDeviceActive(true)
      setNotifDeviceCount(c => c + 1)
      setNotifBanner({ ok: true, msg: 'Notificações ativadas neste dispositivo' })
    } catch (e: any) {
      setNotifBanner({ ok: false, msg: e.message || 'Não foi possível ativar — verifique a permissão do navegador' })
    } finally {
      setReactivating(false)
    }
  }

  const testNotification = async () => {
    if (!workspaceId) return
    setNotifBanner(null)
    setTestingNotif(true)
    try {
      const r = await api.post(`/workspaces/${workspaceId}/push/test`)
      setNotifBanner({ ok: true, msg: `Notificação de teste enviada pra ${r.devices} dispositivo(s)` })
    } catch (e: any) {
      setNotifBanner({ ok: false, msg: e.message || 'Falha ao enviar teste' })
    } finally {
      setTestingNotif(false)
    }
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      const updated = await api.patch('/users/me', { name, avatar })
      setUser({ ...user!, name: updated.name, avatar: updated.avatar })
    } catch (err) {
      console.error(err)
    } finally {
      setSavingProfile(false)
    }
  }

  const saveWorkspace = async () => {
    if (!workspaceId) return
    setSavingWorkspace(true)
    try {
      const updated = await api.patch(`/workspaces/${workspaceId}`, { name: workspaceName })
      setWorkspace(w => (w ? { ...w, name: updated.name } : w))
    } catch (err) {
      console.error(err)
    } finally {
      setSavingWorkspace(false)
    }
  }

  const initials = (name || user?.email || '?').trim().slice(0, 2).toUpperCase()

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Configurações" description="Gerencie sua conta, workspace e preferências" />

      {/* Perfil */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-[#E50914]" />
            <p className="text-sm font-bold text-white">Perfil</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-[#141414] border border-white/[0.06]">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <span className="text-sm font-bold text-[#666666]">{initials}</span>
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-bold text-[#444] uppercase tracking-widest block">URL do avatar</label>
              <input
                value={avatar}
                onChange={e => setAvatar(e.target.value)}
                placeholder="https://..."
                className="w-full h-9 rounded-[3px] border border-white/[0.06] bg-[#141414] px-3 text-xs text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#E50914]/30 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#444] uppercase tracking-widest block mb-1.5">Nome</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full h-9 rounded-[3px] border border-white/[0.06] bg-[#141414] px-3 text-xs text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#E50914]/30 transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#444] uppercase tracking-widest block mb-1.5">E-mail</label>
            <div className="flex items-center gap-2">
              <input
                value={user?.email || ''}
                disabled
                className="w-full h-9 rounded-[3px] border border-white/[0.06] bg-[#0D0D0D] px-3 text-xs text-[#666666] outline-none"
              />
              <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap ${
                user?.emailVerified ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'
              }`}>
                {user?.emailVerified ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                {user?.emailVerified ? 'Verificado' : 'Não verificado'}
              </span>
            </div>
          </div>

          {user?.createdAt && (
            <p className="text-[11px] text-[#444]">Membro desde {formatDate(user.createdAt)}</p>
          )}

          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="h-9 px-4 rounded-[4px] text-sm font-semibold transition-all flex items-center justify-center gap-2 text-white"
            style={{ background: savingProfile ? '#E5091466' : '#E50914' }}
          >
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingProfile ? 'Salvando...' : 'Salvar perfil'}
          </button>
        </CardContent>
      </Card>

      {/* Workspace */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#E50914]" />
            <p className="text-sm font-bold text-white">Workspace</p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#444] uppercase tracking-widest block mb-1.5">Nome do workspace</label>
            <input
              value={workspaceName}
              onChange={e => setWorkspaceName(e.target.value)}
              disabled={loadingWorkspace}
              className="w-full h-9 rounded-[3px] border border-white/[0.06] bg-[#141414] px-3 text-xs text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#E50914]/30 transition-all disabled:opacity-50"
            />
          </div>

          {workspace && (
            <>
              <div className="grid grid-cols-4 gap-2">
                <StatPill icon={Bot} label="Bots" value={workspace._count.bots} />
                <StatPill icon={UsersIcon} label="Leads" value={workspace._count.leads} />
                <StatPill icon={Package} label="Produtos" value={workspace._count.products} />
                <StatPill icon={Workflow} label="Fluxos" value={workspace._count.flows} />
              </div>
              <p className="text-[11px] text-[#444]">Criado em {formatDate(workspace.createdAt)}</p>
            </>
          )}

          <button
            onClick={saveWorkspace}
            disabled={savingWorkspace || loadingWorkspace}
            className="h-9 px-4 rounded-[4px] text-sm font-semibold transition-all flex items-center justify-center gap-2 text-white"
            style={{ background: savingWorkspace ? '#E5091466' : '#E50914' }}
          >
            {savingWorkspace ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingWorkspace ? 'Salvando...' : 'Salvar workspace'}
          </button>
        </CardContent>
      </Card>

      {/* Notificações */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#E50914]" />
              <p className="text-sm font-bold text-white">🔔 Notificações</p>
            </div>
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap',
              notifDeviceActive ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500',
            )}>
              {notifDeviceActive ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
              {notifDeviceActive ? 'Notificações Ativadas' : 'Desativadas neste dispositivo'}
            </span>
          </div>

          <p className="text-[11px] text-[#666666]">
            {notifDeviceCount > 0
              ? `${notifDeviceCount} dispositivo(s) inscrito(s) neste workspace.`
              : 'Nenhum dispositivo inscrito ainda — ative pra receber notificações em tempo real.'}
          </p>

          {!notifDeviceActive && (
            <button
              onClick={reactivateNotifications}
              disabled={reactivating}
              className="h-9 px-4 rounded-[4px] text-sm font-semibold transition-all flex items-center justify-center gap-2 text-white disabled:opacity-60"
              style={{ background: '#E50914' }}
            >
              {reactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              {reactivating ? 'Ativando...' : 'Reativar notificações'}
            </button>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[#444] uppercase tracking-widest block">Quais notificações receber</label>
            {NOTIFICATION_EVENTS.map((ev) => {
              const on = notifEvents.includes(ev.key)
              return (
                <button
                  key={ev.key}
                  type="button"
                  onClick={() => toggleNotifEvent(ev.key)}
                  disabled={loadingNotif}
                  className={cn(
                    'w-full flex items-start gap-3 rounded-[4px] border p-3 text-left transition-colors disabled:opacity-50',
                    on ? 'border-white/[0.12] bg-white/[0.03]' : 'border-white/[0.06] bg-transparent hover:bg-white/[0.02]',
                  )}
                >
                  <div className={cn(
                    'mt-0.5 h-4 w-4 rounded-[3px] border flex items-center justify-center shrink-0',
                    on ? 'border-transparent' : 'border-white/20',
                  )} style={on ? { background: ACCENT } : {}}>
                    {on && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div>
                    <p className="text-sm text-white">{ev.label}</p>
                    <p className="text-[11px] text-[#666666]">{ev.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {notifBanner && (
            <div className={cn(
              'flex items-center gap-2 p-2.5 rounded-[4px] border text-xs font-medium',
              notifBanner.ok
                ? 'bg-green-500/10 border-green-500/20 text-green-500'
                : 'bg-red-500/10 border-red-500/20 text-red-500',
            )}>
              {notifBanner.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3.5 w-3.5 shrink-0" />}
              {notifBanner.msg}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={saveNotifSettings}
              disabled={savingNotif || loadingNotif}
              className="h-9 px-4 rounded-[4px] text-sm font-semibold transition-all flex items-center justify-center gap-2 text-white disabled:opacity-60"
              style={{ background: savingNotif ? '#E5091466' : '#E50914' }}
            >
              {savingNotif ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingNotif ? 'Salvando...' : 'Salvar preferências'}
            </button>
            <button
              onClick={testNotification}
              disabled={testingNotif || notifDeviceCount === 0}
              className="h-9 px-4 rounded-[4px] border border-white/[0.08] text-sm font-medium text-white/70 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {testingNotif ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {testingNotif ? 'Enviando...' : 'Enviar teste'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
