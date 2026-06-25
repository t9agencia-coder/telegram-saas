'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/dashboard/page-header'
import {
  Plus, Copy, Check, ExternalLink, Trash2, Pencil, Link2,
  Facebook, Smartphone, Monitor, Clock, ToggleLeft, ToggleRight,
  Bot, GitBranch, MousePointerClick, ChevronRight, X,
} from 'lucide-react'

// ─── Facebook UTM template ────────────────────────────────────────────────────

const FB_UTM_PARAMS   = 'utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}'
const KWAI_UTM_PARAMS = 'utm_source=kwai&utm_campaign=__CMPNID__&utm_medium=__ADSETID__&utm_content=__ADID__&pixel_id=__KS_PIXELID__&click_id=__CALLBACK__'

// ─── Types ────────────────────────────────────────────────────────────────────

type Rules = {
  sources: { facebook: boolean; tiktok: boolean; kwai: boolean; google: boolean }
  devices: string[]
  os: string[]
  countries: string[]
  languages: string[]
  schedule: { enabled: boolean; start: string; end: string }
  deviceFilter?: 'all' | 'mobile_only'
}

type Redirector = {
  id: string
  name: string
  slug: string
  flowId: string | null
  alternativeUrl: string
  rules: Rules
  isActive: boolean
  totalClicks: number
  telegramClicks: number
  alternativeClicks: number
  createdAt: string
  flow?: { id: string; name: string; bot?: { username: string } | null } | null
}

type Flow = {
  id: string
  name: string
  isActive: boolean
  bot?: { username: string } | null
}

// ─── Default form state ────────────────────────────────────────────────────────

const defaultRules = (): Rules => ({
  sources: { facebook: false, tiktok: false, kwai: false, google: false },
  devices: [],
  os: [],
  countries: [],
  languages: [],
  schedule: { enabled: false, start: '08:00', end: '22:00' },
  deviceFilter: 'all',
})

type FormData = {
  name: string
  flowId: string
  alternativeUrl: string
  rules: Rules
}

const defaultForm = (): FormData => ({
  name: '',
  flowId: '',
  alternativeUrl: '',
  rules: defaultRules(),
})

// ─── Toggle chip ──────────────────────────────────────────────────────────────

function Chip({
  label,
  active,
  disabled,
  badge,
  onClick,
}: {
  label: string
  active: boolean
  disabled?: boolean
  badge?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'px-3 py-1.5 rounded-[3px] text-xs font-medium border transition-all flex items-center gap-1.5',
        active
          ? 'bg-[#dc2626]/15 border-[#dc2626]/60 text-[#dc2626]'
          : 'bg-white/[0.03] border-white/10 text-white/40',
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-white/25 cursor-pointer',
      ].join(' ')}
    >
      {label}
      {badge && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/30">{badge}</span>
      )}
    </button>
  )
}

// ─── Platform logos ────────────────────────────────────────────────────────────

const FacebookLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#1877F2" />
    <path
      d="M22 16h-4v-2c0-.9.7-1 1.3-1H22v-4h-3.2C15.4 9 14 11 14 13.5V16h-3v4h3v9h4v-9h2.7L22 16z"
      fill="white"
    />
  </svg>
)

const TikTokLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#010101" />
    <path
      d="M22.5 9.5c-.9-1-1.4-2.3-1.5-3.5h-3v13.2c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5c.3 0 .5 0 .8.1V13c-.3 0-.5-.1-.8-.1-3 0-5.5 2.5-5.5 5.5s2.5 5.5 5.5 5.5 5.5-2.5 5.5-5.5V13c1.1.8 2.5 1.3 3.9 1.3v-3c-.7 0-1.4-.3-1.9-.8z"
      fill="white"
    />
    <path
      d="M22.5 9.5c-.9-1-1.4-2.3-1.5-3.5h-3v13.2c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5c.3 0 .5 0 .8.1V13c-.3 0-.5-.1-.8-.1-3 0-5.5 2.5-5.5 5.5s2.5 5.5 5.5 5.5 5.5-2.5 5.5-5.5V13c1.1.8 2.5 1.3 3.9 1.3v-3c-.7 0-1.4-.3-1.9-.8z"
      fill="#FE2C55"
      opacity="0.4"
    />
    <path
      d="M14 16.9V13c-.3 0-.5-.1-.8-.1-3 0-5.5 2.5-5.5 5.5s2.5 5.5 5.5 5.5 5.5-2.5 5.5-5.5V6h-3v13.2c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5 1-2.4 2.3-2.3z"
      fill="#25F4EE"
      opacity="0.6"
    />
  </svg>
)

const KwaiLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#FF6600" />
    <path
      d="M9 8h3.5v7.2l5.8-7.2H22l-6.3 7.8L22.5 24H18l-5.5-7.5V24H9V8z"
      fill="white"
    />
  </svg>
)

const GoogleAdsLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#FAFAFA" />
    <path
      d="M20.5 9l-7 12.1 3 1.7 7-12.1-3-1.7z"
      fill="#FBBC04"
    />
    <path
      d="M13.5 9l-7 12.1 3 1.7 7-12.1-3-1.7z"
      fill="#4285F4"
    />
    <circle cx="9" cy="22" r="2.5" fill="#34A853" />
    <circle cx="23" cy="9.5" r="2.5" fill="#EA4335" />
  </svg>
)

const PLATFORM_LOGOS: Record<string, React.ReactNode> = {
  facebook: <FacebookLogo size={28} />,
  tiktok: <TikTokLogo size={28} />,
  kwai: <KwaiLogo size={28} />,
  google: <GoogleAdsLogo size={28} />,
}

const PLATFORM_MINI: Record<string, React.ReactNode> = {
  facebook: <FacebookLogo size={14} />,
  tiktok: <TikTokLogo size={14} />,
  kwai: <KwaiLogo size={14} />,
  google: <GoogleAdsLogo size={14} />,
}

const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook Ads',
  tiktok: 'TikTok Ads',
  kwai: 'Kwai Ads',
  google: 'Google Ads',
}

const PLATFORM_DETECT: Record<string, string> = {
  facebook: 'fbclid',
  tiktok: 'ttclid',
  kwai: 'click_id',
  google: 'gclid',
}

function SourceCard({
  platform,
  active,
  locked,
  onClick,
}: {
  platform: keyof typeof PLATFORM_NAMES
  active: boolean
  locked?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      className={[
        'relative flex items-center gap-3 px-3.5 py-3 rounded-[4px] border transition-all text-left w-full',
        active
          ? 'bg-[#dc2626]/10 border-[#dc2626]/50 shadow-[0_0_0_1px_rgba(220,38,38,0.2)]'
          : 'bg-white/[0.03] border-white/[0.07] hover:border-white/20 hover:bg-white/[0.05]',
        locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {/* Logo */}
      <div className="shrink-0 rounded-[3px] overflow-hidden">
        {PLATFORM_LOGOS[platform]}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold leading-none mb-0.5 ${active ? 'text-white' : 'text-white/60'}`}>
          {PLATFORM_NAMES[platform]}
        </p>
        <p className="text-[10px] text-white/25 font-mono leading-none">
          ?{PLATFORM_DETECT[platform]}=…
        </p>
      </div>

      {/* State indicator */}
      <div className="shrink-0">
        {locked ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/30 font-medium">
            Em breve
          </span>
        ) : active ? (
          <div className="w-2 h-2 rounded-full bg-[#dc2626] shadow-[0_0_6px_rgba(220,38,38,0.8)]" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-white/10" />
        )}
      </div>
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RedirecionadoresPage() {
  const { workspaceId } = useAuthStore()
  const [redirectors, setRedirectors] = useState<Redirector[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; editing: Redirector | null }>({
    open: false,
    editing: null,
  })
  const [form, setForm] = useState<FormData>(defaultForm())
  const [saving, setSaving] = useState(false)
  const [copiedId,       setCopiedId]       = useState<string | null>(null)
  const [copiedFbSlug,   setCopiedFbSlug]   = useState<string | null>(null)
  const [copiedFbModal,  setCopiedFbModal]  = useState(false)
  const [copiedKwaiSlug, setCopiedKwaiSlug] = useState<string | null>(null)
  const [copiedKwaiModal,setCopiedKwaiModal]= useState(false)
  const [error, setError] = useState('')
  const [newLink, setNewLink] = useState<{ slug: string; name: string } | null>(null)

  const loadData = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const [rData, fData] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/redirectors`),
        api.get(`/workspaces/${workspaceId}/flows`),
      ])
      setRedirectors(rData)
      setFlows((fData as Flow[]).filter((f) => f.isActive && f.bot))
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openCreate = () => {
    setForm(defaultForm())
    setError('')
    setModal({ open: true, editing: null })
  }

  const openEdit = (r: Redirector) => {
    setForm({
      name: r.name,
      flowId: r.flowId || '',
      alternativeUrl: r.alternativeUrl,
      rules: r.rules ?? defaultRules(),
    })
    setError('')
    setModal({ open: true, editing: r })
  }

  const closeModal = () => setModal({ open: false, editing: null })

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    if (!form.alternativeUrl.trim()) { setError('Link alternativo é obrigatório'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        flowId: form.flowId || undefined,
        alternativeUrl: form.alternativeUrl.trim(),
        rules: form.rules,
      }
      if (modal.editing) {
        const updated = await api.patch(
          `/workspaces/${workspaceId}/redirectors/${modal.editing.id}`,
          payload,
        )
        // Atualiza item na lista sem recarregar tudo
        setRedirectors((prev) =>
          prev.map((r) => (r.id === modal.editing!.id ? { ...r, ...updated } : r)),
        )
      } else {
        const created = await api.post(`/workspaces/${workspaceId}/redirectors`, payload)
        // Adiciona no início da lista
        setRedirectors((prev) => [created, ...prev])
        // Exibe banner com o link gerado
        setNewLink({ slug: created.slug, name: created.name })
      }
      closeModal()
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este redirecionador?')) return
    try {
      await api.delete(`/workspaces/${workspaceId}/redirectors/${id}`)
      setRedirectors((prev) => prev.filter((r) => r.id !== id))
    } catch { /* silent */ }
  }

  const handleToggleActive = async (r: Redirector) => {
    try {
      const updated = await api.patch(
        `/workspaces/${workspaceId}/redirectors/${r.id}`,
        { isActive: !r.isActive },
      )
      setRedirectors((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: updated.isActive } : x)))
    } catch { /* silent */ }
  }

  const copyFbUrl = (slug: string) => {
    navigator.clipboard.writeText(FB_UTM_PARAMS).then(() => {
      setCopiedFbSlug(slug)
      setTimeout(() => setCopiedFbSlug(null), 1800)
    })
  }

  const copyFbModalParams = () => {
    navigator.clipboard.writeText(FB_UTM_PARAMS).then(() => {
      setCopiedFbModal(true)
      setTimeout(() => setCopiedFbModal(false), 1800)
    })
  }

  const copyKwaiUrl = (slug: string) => {
    navigator.clipboard.writeText(KWAI_UTM_PARAMS).then(() => {
      setCopiedKwaiSlug(slug)
      setTimeout(() => setCopiedKwaiSlug(null), 1800)
    })
  }

  const copyKwaiModalParams = () => {
    navigator.clipboard.writeText(KWAI_UTM_PARAMS).then(() => {
      setCopiedKwaiModal(true)
      setTimeout(() => setCopiedKwaiModal(false), 1800)
    })
  }

  const copyLink = (slug: string, fromBanner = false) => {
    const link = `${window.location.origin}/r/${slug}`
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(fromBanner ? `banner_${slug}` : slug)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  const getLink = (slug: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${slug}`

  const convRate = (r: Redirector) =>
    r.totalClicks > 0 ? ((r.telegramClicks / r.totalClicks) * 100).toFixed(0) + '%' : '—'

  const activeSources = (rules: Rules) =>
    Object.entries(rules?.sources || {}).filter(([, v]) => v).map(([k]) => k)

  // ── Form helpers ─────────────────────────────────────────────────────────────

  const toggleSource = (key: keyof Rules['sources']) => {
    if (key !== 'facebook' && key !== 'kwai') return // others locked
    setForm((f) => ({
      ...f,
      rules: {
        ...f.rules,
        sources: { ...f.rules.sources, [key]: !f.rules.sources[key] },
      },
    }))
  }

  const toggleDevice = (d: string) =>
    setForm((f) => ({
      ...f,
      rules: {
        ...f.rules,
        devices: f.rules.devices.includes(d)
          ? f.rules.devices.filter((x) => x !== d)
          : [...f.rules.devices, d],
      },
    }))

  const toggleOS = (o: string) =>
    setForm((f) => ({
      ...f,
      rules: {
        ...f.rules,
        os: f.rules.os.includes(o)
          ? f.rules.os.filter((x) => x !== o)
          : [...f.rules.os, o],
      },
    }))

  const OS_OPTIONS = ['android', 'ios', 'windows', 'macos', 'other'] as const
  const OS_LABELS: Record<string, string> = {
    android: 'Android', ios: 'iOS', windows: 'Windows', macos: 'MacOS', other: 'Outros',
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader title="Redirecionadores" description="Links inteligentes com segmentação de tráfego">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-semibold rounded-[3px] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Criar Redirecionador
        </button>
      </PageHeader>

      {/* ── Banner link gerado ─────────────────────────────────────────── */}
      {newLink && (
        <div className="relative flex items-center gap-4 px-5 py-4 rounded-[4px] border border-green-500/30 bg-green-500/[0.07] shadow-[0_0_24px_rgba(34,197,94,0.08)]">
          {/* ícone */}
          <div className="flex-shrink-0 w-9 h-9 rounded-[3px] bg-green-500/15 flex items-center justify-center">
            <Check className="h-5 w-5 text-green-400" />
          </div>

          {/* texto + link */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-400 leading-none mb-1">
              Redirecionador criado!
            </p>
            <p className="text-xs text-white/40 truncate">
              <span className="text-white/25">Seu link: </span>
              <span className="font-mono text-white/70">
                {typeof window !== 'undefined' ? window.location.origin : ''}/r/{newLink.slug}
              </span>
            </p>
          </div>

          {/* botão copiar */}
          <button
            onClick={() => copyLink(newLink.slug, true)}
            className="flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-[3px] bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 text-green-400 text-xs font-semibold transition-all"
          >
            {copiedId === `banner_${newLink.slug}` ? (
              <><Check className="h-3.5 w-3.5" /> Copiado!</>
            ) : (
              <><Copy className="h-3.5 w-3.5" /> Copiar link</>
            )}
          </button>

          {/* fechar */}
          <button
            onClick={() => setNewLink(null)}
            className="flex-shrink-0 p-1.5 rounded-[3px] hover:bg-white/[0.06] text-white/30 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-white/30 text-sm">Carregando...</div>
        ) : redirectors.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <Link2 className="h-10 w-10 text-white/10" />
            <p className="text-white/30 text-sm">Nenhum redirecionador criado ainda</p>
            <button
              onClick={openCreate}
              className="mt-2 px-4 py-2 bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-semibold rounded-[3px] transition-colors"
            >
              Criar primeiro redirecionador
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-[10px] uppercase tracking-wider text-white/30 font-medium px-5 py-3">Nome</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-white/30 font-medium px-4 py-3">Fluxo</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-white/30 font-medium px-4 py-3">Link gerado</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-white/30 font-medium px-4 py-3">Origem</th>
                <th className="text-center text-[10px] uppercase tracking-wider text-white/30 font-medium px-4 py-3">Cliques</th>
                <th className="text-center text-[10px] uppercase tracking-wider text-white/30 font-medium px-4 py-3">Telegram</th>
                <th className="text-center text-[10px] uppercase tracking-wider text-white/30 font-medium px-4 py-3">Conv.</th>
                <th className="text-center text-[10px] uppercase tracking-wider text-white/30 font-medium px-4 py-3">Status</th>
                <th className="text-center text-[10px] uppercase tracking-wider text-white/30 font-medium px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {redirectors.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-3.5 w-3.5 text-[#dc2626] shrink-0" />
                      <span className="text-white font-medium truncate max-w-[180px]">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {r.flow ? (
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="h-3 w-3 text-white/30 shrink-0" />
                        <span className="text-white/60 text-xs truncate max-w-[120px]">{r.flow.name}</span>
                        {r.flow.bot && (
                          <span className="text-[10px] text-white/25">@{r.flow.bot.username}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-white/20 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-stretch rounded-[3px] border border-white/[0.08] overflow-hidden bg-white/[0.03] max-w-[230px]">
                      <div className="flex-1 min-w-0 px-2.5 py-2 flex items-center gap-1.5">
                        <Link2 className="h-3 w-3 text-white/20 shrink-0" />
                        <span className="text-[11px] font-mono text-white/45 truncate">
                          {typeof window !== 'undefined' ? window.location.origin : ''}/r/{r.slug}
                        </span>
                      </div>
                      <button
                        onClick={() => copyLink(r.slug)}
                        title="Copiar link"
                        className={[
                          'px-2.5 flex items-center gap-1.5 border-l border-white/[0.07] text-xs font-medium shrink-0 transition-all',
                          copiedId === r.slug
                            ? 'bg-green-500/10 text-green-400'
                            : 'hover:bg-white/[0.06] text-white/30 hover:text-white/80',
                        ].join(' ')}
                      >
                        {copiedId === r.slug
                          ? <><Check className="h-3 w-3" /><span>Copiado</span></>
                          : <><Copy className="h-3 w-3" /><span>Copiar</span></>}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {activeSources(r.rules).length === 0 && r.rules?.deviceFilter !== 'mobile_only' && (
                        <span className="text-xs text-white/25">Todas</span>
                      )}
                      {activeSources(r.rules).map((src) => (
                        <div key={src} title={PLATFORM_NAMES[src]} className="rounded-md overflow-hidden">
                          {PLATFORM_MINI[src]}
                        </div>
                      ))}
                      {r.rules?.deviceFilter === 'mobile_only' && (
                        <span
                          title="Somente celular real (anti-emulação)"
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-400"
                        >
                          <Smartphone className="h-2.5 w-2.5" />
                          Mobile
                        </span>
                      )}
                      {activeSources(r.rules).includes('facebook') && (
                        <button
                          onClick={() => copyFbUrl(r.slug)}
                          title="Copiar parâmetros UTM para Facebook Ads"
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium transition-all ${
                            copiedFbSlug === r.slug
                              ? 'bg-green-500/10 border-green-500/20 text-green-400'
                              : 'bg-[#1877F2]/8 border-[#1877F2]/20 text-[#1877F2]/70 hover:bg-[#1877F2]/15 hover:text-[#1877F2]'
                          }`}
                        >
                          {copiedFbSlug === r.slug
                            ? <><Check className="h-2.5 w-2.5" />Copiado</>
                            : <><Copy className="h-2.5 w-2.5" />URL FB</>}
                        </button>
                      )}
                      {activeSources(r.rules).includes('kwai') && (
                        <button
                          onClick={() => copyKwaiUrl(r.slug)}
                          title="Copiar parâmetros UTM para Kwai Ads"
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium transition-all ${
                            copiedKwaiSlug === r.slug
                              ? 'bg-green-500/10 border-green-500/20 text-green-400'
                              : 'bg-[#FF6600]/8 border-[#FF6600]/20 text-[#FF6600]/70 hover:bg-[#FF6600]/15 hover:text-[#FF6600]'
                          }`}
                        >
                          {copiedKwaiSlug === r.slug
                            ? <><Check className="h-2.5 w-2.5" />Copiado</>
                            : <><Copy className="h-2.5 w-2.5" />URL KW</>}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-white font-semibold">{r.totalClicks.toLocaleString('pt-BR')}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-white/70">{r.telegramClicks.toLocaleString('pt-BR')}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`text-xs font-medium ${r.totalClicks > 0 ? 'text-green-400' : 'text-white/20'}`}>
                      {convRate(r)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => handleToggleActive(r)}
                      className={`transition-colors ${r.isActive ? 'text-green-400 hover:text-green-300' : 'text-white/25 hover:text-white/50'}`}
                      title={r.isActive ? 'Desativar' : 'Ativar'}
                    >
                      {r.isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1.5 rounded-[3px] hover:bg-white/[0.06] text-white/30 hover:text-white transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <a
                        href={getLink(r.slug)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-[3px] hover:bg-white/[0.06] text-white/30 hover:text-white transition-colors"
                        title="Abrir link"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 rounded-[3px] hover:bg-[#dc2626]/10 text-white/30 hover:text-[#dc2626] transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal ───────────────────────────────────────────────────────── */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Card */}
          <div className="relative w-full max-w-xl bg-[#141414] border border-white/[0.08] rounded-[4px] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <h2 className="text-white font-semibold text-base">
                {modal.editing ? 'Editar Redirecionador' : 'Criar Redirecionador'}
              </h2>
              <button onClick={closeModal} className="p-1.5 rounded-[3px] hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

              {/* Nome */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50 font-medium">Nome <span className="text-[#dc2626]">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Campanha Facebook Produto A"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-[3px] px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#dc2626]/50 transition-colors"
                />
              </div>

              {/* Fluxo vinculado */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50 font-medium">Fluxo Vinculado</label>
                {flows.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.02] border border-white/[0.06] rounded-[3px]">
                    <GitBranch className="h-4 w-4 text-white/20" />
                    <span className="text-xs text-white/25">Nenhum fluxo ativo com bot encontrado</span>
                  </div>
                ) : (
                  <select
                    value={form.flowId}
                    onChange={(e) => setForm({ ...form, flowId: e.target.value })}
                    className="w-full bg-[#141414] border border-white/[0.08] rounded-[3px] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#dc2626]/50 transition-colors appearance-none"
                  >
                    <option value="">Selecionar fluxo...</option>
                    {flows.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}{f.bot ? ` (@${f.bot.username})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-white/25">Apenas fluxos ativos com bot vinculado são exibidos</p>
              </div>

              {/* Link alternativo */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50 font-medium">Link Alternativo <span className="text-[#dc2626]">*</span></label>
                <input
                  type="url"
                  value={form.alternativeUrl}
                  onChange={(e) => setForm({ ...form, alternativeUrl: e.target.value })}
                  placeholder="https://seusite.com/landing-page"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-[3px] px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#dc2626]/50 transition-colors"
                />
                <p className="text-[11px] text-white/25">Destino quando as regras não forem atendidas</p>
              </div>

              {/* Divider */}
              <div className="border-t border-white/[0.06] pt-4">
                <p className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-4">Regras de Segmentação</p>

                {/* Origem do tráfego */}
                <div className="space-y-2.5 mb-5">
                  <p className="text-xs text-white/50">Origem do tráfego</p>
                  <div className="grid grid-cols-2 gap-2">
                    <SourceCard
                      platform="facebook"
                      active={form.rules.sources.facebook}
                      onClick={() => toggleSource('facebook')}
                    />
                    <SourceCard platform="tiktok" active={false} locked onClick={() => {}} />
                    <SourceCard
                      platform="kwai"
                      active={form.rules.sources.kwai}
                      onClick={() => toggleSource('kwai')}
                    />
                    <SourceCard platform="google" active={false} locked onClick={() => {}} />
                  </div>
                  {form.rules.sources.facebook && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-white/25 flex items-center gap-1">
                        <span className="text-green-400">●</span>
                        Detecta <code className="text-white/40 mx-0.5">?fbclid=</code> na URL automaticamente
                      </p>
                      {/* Parâmetros para o Facebook Ads Manager */}
                      <div className="rounded-[4px] border border-[#1877F2]/20 bg-[#1877F2]/5 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FacebookLogo size={16} />
                            <p className="text-xs font-semibold text-white/70">Parâmetros para o Facebook Ads</p>
                          </div>
                          <button
                            type="button"
                            onClick={copyFbModalParams}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] text-xs font-medium transition-all ${
                              copiedFbModal
                                ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                                : 'bg-[#1877F2]/15 text-[#1877F2] border border-[#1877F2]/20 hover:bg-[#1877F2]/25'
                            }`}
                          >
                            {copiedFbModal ? <><Check className="h-3 w-3" />Copiado!</> : <><Copy className="h-3 w-3" />Copiar</>}
                          </button>
                        </div>
                        <div className="rounded-[3px] bg-black/30 px-3 py-2.5 font-mono text-[11px] text-[#1877F2]/70 break-all leading-relaxed select-all">
                          {FB_UTM_PARAMS}
                        </div>
                        <p className="text-[11px] text-white/20 leading-relaxed">
                          No Facebook Ads Manager, cole no campo <span className="text-white/40">Parâmetros de URL</span> do conjunto de anúncios.
                        </p>
                      </div>
                    </div>
                  )}
                  {form.rules.sources.kwai && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-white/25 flex items-center gap-1">
                        <span className="text-green-400">●</span>
                        Detecta <code className="text-white/40 mx-0.5">?click_id=</code> na URL automaticamente
                      </p>
                      {/* Parâmetros para o Kwai Ads */}
                      <div className="rounded-[4px] border border-[#FF6600]/20 bg-[#FF6600]/5 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <KwaiLogo size={16} />
                            <p className="text-xs font-semibold text-white/70">Parâmetros para o Kwai Ads</p>
                          </div>
                          <button
                            type="button"
                            onClick={copyKwaiModalParams}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] text-xs font-medium transition-all ${
                              copiedKwaiModal
                                ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                                : 'bg-[#FF6600]/15 text-[#FF6600] border border-[#FF6600]/20 hover:bg-[#FF6600]/25'
                            }`}
                          >
                            {copiedKwaiModal ? <><Check className="h-3 w-3" />Copiado!</> : <><Copy className="h-3 w-3" />Copiar</>}
                          </button>
                        </div>
                        <div className="rounded-[3px] bg-black/30 px-3 py-2.5 font-mono text-[11px] text-[#FF6600]/70 break-all leading-relaxed select-all">
                          {KWAI_UTM_PARAMS}
                        </div>
                        <p className="text-[11px] text-white/20 leading-relaxed">
                          No Kwai Ads, cole no campo <span className="text-white/40">Parâmetros de URL</span> do anúncio.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Dispositivo */}
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-white/50">Dispositivo</p>
                  <div className="flex gap-2">
                    <Chip
                      label="Celular"
                      active={form.rules.devices.includes('mobile')}
                      onClick={() => toggleDevice('mobile')}
                    />
                    <Chip
                      label="Desktop"
                      active={form.rules.devices.includes('desktop')}
                      onClick={() => toggleDevice('desktop')}
                    />
                  </div>
                  {form.rules.devices.length === 0 && (
                    <p className="text-[11px] text-white/20">Nenhum selecionado = todos os dispositivos</p>
                  )}
                </div>

                {/* Sistema Operacional */}
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-white/50">Sistema Operacional</p>
                  <div className="flex flex-wrap gap-2">
                    {OS_OPTIONS.map((o) => (
                      <Chip
                        key={o}
                        label={OS_LABELS[o]}
                        active={form.rules.os.includes(o)}
                        onClick={() => toggleOS(o)}
                      />
                    ))}
                  </div>
                  {form.rules.os.length === 0 && (
                    <p className="text-[11px] text-white/20">Nenhum selecionado = todos os sistemas</p>
                  )}
                </div>

                {/* Filtro de dispositivo avançado */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-white/50">Filtro de Dispositivo Avançado</p>
                      <p className="text-[11px] text-white/20 mt-0.5">Detecta celular real vs emulação e DevTools</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          rules: {
                            ...f.rules,
                            deviceFilter: f.rules.deviceFilter === 'mobile_only' ? 'all' : 'mobile_only',
                          },
                        }))
                      }
                      className={`transition-colors ${form.rules.deviceFilter === 'mobile_only' ? 'text-green-400' : 'text-white/25'}`}
                    >
                      {form.rules.deviceFilter === 'mobile_only'
                        ? <ToggleRight className="h-5 w-5" />
                        : <ToggleLeft className="h-5 w-5" />}
                    </button>
                  </div>
                  {form.rules.deviceFilter === 'mobile_only' && (
                    <div className="px-3 py-2.5 rounded-[3px] bg-amber-500/5 border border-amber-500/20 space-y-1">
                      <p className="text-[11px] text-amber-400/90 font-medium">Somente celular real ativado</p>
                      <p className="text-[11px] text-white/30">
                        Bloqueia: desktop, emulação via DevTools, User-Agent falsificado e DevTools aberto.
                        Não mobile → redirecionado para o link alternativo.
                      </p>
                    </div>
                  )}
                </div>

                {/* Horário */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white/50">Horário de Funcionamento</p>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          rules: {
                            ...f.rules,
                            schedule: { ...f.rules.schedule, enabled: !f.rules.schedule.enabled },
                          },
                        }))
                      }
                      className={`transition-colors ${form.rules.schedule.enabled ? 'text-green-400' : 'text-white/25'}`}
                    >
                      {form.rules.schedule.enabled
                        ? <ToggleRight className="h-5 w-5" />
                        : <ToggleLeft className="h-5 w-5" />}
                    </button>
                  </div>
                  {form.rules.schedule.enabled && (
                    <div className="flex items-center gap-3 mt-2">
                      <input
                        type="time"
                        value={form.rules.schedule.start}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            rules: {
                              ...f.rules,
                              schedule: { ...f.rules.schedule, start: e.target.value },
                            },
                          }))
                        }
                        className="bg-white/[0.04] border border-white/[0.08] rounded-[3px] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#dc2626]/50 transition-colors"
                      />
                      <span className="text-white/30 text-sm">às</span>
                      <input
                        type="time"
                        value={form.rules.schedule.end}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            rules: {
                              ...f.rules,
                              schedule: { ...f.rules.schedule, end: e.target.value },
                            },
                          }))
                        }
                        className="bg-white/[0.04] border border-white/[0.08] rounded-[3px] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#dc2626]/50 transition-colors"
                      />
                    </div>
                  )}
                  {form.rules.schedule.enabled && (
                    <p className="text-[11px] text-white/20">
                      Fora do horário configurado, visitantes são enviados ao link alternativo
                    </p>
                  )}
                </div>
              </div>

              {error && (
                <p className="text-[#dc2626] text-xs bg-[#dc2626]/10 border border-[#dc2626]/20 rounded-[3px] px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06]">
              {/* Fluxo da lógica */}
              <div className="flex items-center gap-1.5 text-[11px] text-white/20">
                <span>Regras ok</span>
                <ChevronRight className="h-3 w-3" />
                <Bot className="h-3 w-3" />
                <span>Telegram</span>
                <span className="mx-1 text-white/10">|</span>
                <span>Falha</span>
                <ChevronRight className="h-3 w-3" />
                <ExternalLink className="h-3 w-3" />
                <span>Alternativo</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-white/50 hover:text-white rounded-[3px] hover:bg-white/[0.04] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 bg-[#dc2626] hover:bg-[#b91c1c] disabled:opacity-50 text-white text-sm font-semibold rounded-[3px] transition-colors"
                >
                  {saving ? 'Salvando...' : modal.editing ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Generated link toast (after create) ─────────────────── */}
      {/* Links are visible inline in the table — nothing extra needed */}
    </div>
  )
}
