'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/dashboard/page-header'
import {
  Plus, Copy, Check, ExternalLink, Trash2, Pencil, Link2,
  Facebook, Smartphone, Monitor, Clock, ToggleLeft, ToggleRight,
  Bot, GitBranch, MousePointerClick, ChevronRight, X, Globe, FlaskConical,
  Eye, EyeOff,
} from 'lucide-react'

// ─── Facebook UTM template ────────────────────────────────────────────────────

const FB_UTM_PARAMS   = 'utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}'
// O Kwai bloqueia os nomes "pixel_id" e "click_id" como parâmetro próprio na
// criação de campanha ("campo padrão não é permitido"). Por isso, igual à
// UTMify, empacotamos ad_id/click_id/pixel_id dentro do utm_content, separados
// por "::" — o route.ts do redirecionador desempacota isso na leitura.
const KWAI_UTM_PARAMS = 'utm_source=kwai&utm_campaign=__CMPNID__&utm_medium=__ADSETID__&utm_content=__ADID__::__CALLBACK__::__KS_PIXELID__'

// Click id fixo usado no "Link de teste" (fbclid no Facebook, click_id no Kwai)
// — deixa o clique passar pela regra de origem do cloaker sem precisar de um
// anúncio real. Valor fixo (número da marca) pra dar pra filtrar esses cliques
// de teste no tracking depois; o backend também não manda evento pro Kwai com ele.
const TEST_CLICK_ID = '8878'

// Parâmetros do link de teste conforme a plataforma marcada no link. Kwai usa o
// mesmo formato empacotado do anúncio real (ad::click_id::pixel no utm_content),
// então o teste passa pelo mesmo caminho de leitura do route.ts.
const FB_TEST_PARAMS   = `${FB_UTM_PARAMS}&fbclid=${TEST_CLICK_ID}`
const KWAI_TEST_PARAMS = `utm_source=kwai&utm_campaign=teste&utm_medium=teste&utm_content=teste::${TEST_CLICK_ID}::`

/** Plataforma usada no teste: Kwai quando o link é só Kwai; senão Facebook. */
function plataformaDeTeste(rules?: Partial<Rules> | null): 'kwai' | 'facebook' {
  const s = rules?.sources
  return s?.kwai === true && s?.facebook !== true ? 'kwai' : 'facebook'
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Rules = {
  sources: { facebook: boolean; tiktok: boolean; kwai: boolean; google: boolean }
  devices: string[]
  os: string[]
  countries: string[]
  languages: string[]
  schedule: { enabled: boolean; start: string; end: string }
  deviceFilter?: 'all' | 'mobile_only'
  verificationCodeEnabled?: boolean
  /** Exige que o clique tenha sido aberto dentro do app da origem (navegador do Kwai / Facebook). */
  appOrigin?: boolean
  /**
   * Modo revisão. Enquanto ligado, todo o tráfego vai para a página
   * alternativa, ignorando os filtros sem apagá-los.
   *
   * O servidor só honra este campo em link de Kwai sem Facebook marcado
   * (ver `podeRevisar`) — link que recebe tráfego do Facebook segue o caminho
   * de sempre, inalterado.
   */
  reviewMode?: boolean
  /** Desliga a revisão sozinha quando o anúncio entra no ar. */
  reviewAutoOff?: boolean
  /** Quantas pessoas vindas do anúncio disparam o desligamento (padrão 10). */
  reviewAutoOffHits?: number
  /** Quando a revisão foi ligada. Escrito pelo servidor. */
  reviewStartedAt?: string
}

type Redirector = {
  id: string
  name: string
  slug: string
  verificationCode: string
  flowId: string | null
  domainId: string | null
  alternativeUrl: string
  destinationType: 'telegram' | 'external'
  externalUrl: string | null
  rules: Rules
  isActive: boolean
  totalClicks: number
  telegramClicks: number
  alternativeClicks: number
  createdAt: string
  flow?:   { id: string; name: string; bot?: { username: string } | null } | null
  domain?: { id: string; domain: string } | null
}

type ActiveDomain = { id: string; domain: string; isDefault: boolean; isOwn?: boolean }

type Flow = {
  id: string
  name: string
  isActive: boolean
  bot?: { username: string } | null
}

// ─── Default form state ────────────────────────────────────────────────────────

// Países do filtro por IP (sigla ISO, igual à gravada nos acessos).
const PAISES = [
  { code: 'BR', label: 'Brasil' },
  { code: 'PT', label: 'Portugal' },
  { code: 'US', label: 'Estados Unidos' },
  { code: 'AR', label: 'Argentina' },
  { code: 'PY', label: 'Paraguai' },
  { code: 'UY', label: 'Uruguai' },
  { code: 'MX', label: 'México' },
  { code: 'CO', label: 'Colômbia' },
  { code: 'CL', label: 'Chile' },
  { code: 'AO', label: 'Angola' },
  { code: 'MZ', label: 'Moçambique' },
]

const defaultRules = (): Rules => ({
  sources: { facebook: false, tiktok: false, kwai: false, google: false },
  devices: [],
  os: [],
  countries: [],
  languages: [],
  schedule: { enabled: false, start: '08:00', end: '22:00' },
  deviceFilter: 'all',
  verificationCodeEnabled: true,
})

type FormData = {
  name: string
  flowId: string
  domainId: string
  alternativeUrl: string
  destinationType: 'telegram' | 'external'
  externalUrl: string
  rules: Rules
}

const defaultForm = (): FormData => ({
  name: '',
  flowId: '',
  domainId: '',
  alternativeUrl: '',
  destinationType: 'telegram',
  externalUrl: '',
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
          ? 'bg-primary/15 border-primary/60 text-primary'
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

// Os ícones são desenhados aqui, com a marca de cada plataforma na proporção
// certa: cantos arredondados no padrão atual (rx 8 de 32, não 6), o "f" do
// Facebook descendo até a base como no app, e o degradê do Kwai no lugar do
// laranja chapado. Antes eram formas aproximadas que davam ar de software
// velho — e é a primeira coisa que se vê ao escolher a origem do tráfego.
const FacebookLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
    <rect width="32" height="32" rx="8" fill="#0866FF" />
    <path
      d="M21.2 20.6l.68-4.38h-4.2v-2.84c0-1.2.59-2.37 2.47-2.37h1.91V7.28s-1.73-.3-3.39-.3c-3.46 0-5.72 2.1-5.72 5.89v3.35H9.1v4.38h3.85V31.2c.77.12 1.56.18 2.36.18s1.59-.06 2.36-.18V20.6h3.53z"
      fill="white"
    />
  </svg>
)

// A nota do TikTok é uma forma só, deslocada duas vezes: ciano para a
// esquerda, magenta para a direita, branca por cima. É assim que o logo real
// é construído — as três cópias empilhadas com opacidade davam um borrão.
const TikTokLogo = ({ size = 20 }: { size?: number }) => {
  const nota = 'M19.1 6h-3.24v13.1a2.64 2.64 0 1 1-2.16-2.6v-3.29a5.87 5.87 0 1 0 5.4 5.85v-6.72a6.73 6.73 0 0 0 4.06 1.35v-3.2a3.68 3.68 0 0 1-2.9-1.26A3.79 3.79 0 0 1 19.1 6z'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#010101" />
      <g transform="translate(-1.1 0.9)"><path d={nota} fill="#25F4EE" /></g>
      <g transform="translate(1.1 -0.9)"><path d={nota} fill="#FE2C55" /></g>
      <path d={nota} fill="white" />
    </svg>
  )
}

const KwaiLogo = ({ size = 20 }: { size?: number }) => {
  // O id do degradê precisa ser único por instância: o mesmo ícone aparece na
  // tabela e no formulário ao mesmo tempo, e ids repetidos fazem o navegador
  // usar só a primeira definição.
  const id = `kwai-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF9500" />
          <stop offset="1" stopColor="#FF4500" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <path
        d="M11.4 22.6V9.4a1.2 1.2 0 0 1 1.84-1.02l10.4 6.6a1.2 1.2 0 0 1 0 2.04l-10.4 6.6a1.2 1.2 0 0 1-1.84-1.02z"
        fill="white"
      />
    </svg>
  )
}

const GoogleAdsLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
    <rect width="32" height="32" rx="8" fill="#FFFFFF" />
    <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" stroke="#00000014" />
    {/* As duas barras do Google Ads formam um "V": azul à esquerda, amarela à
        direita, com o círculo verde fechando a base. */}
    <path d="M13.1 6.4l7.2 12.5-4.3 2.5L8.8 8.9z" fill="#4285F4" />
    <path d="M18.9 6.4l4.3 2.5-7.2 12.5-4.3-2.5z" fill="#FBBC04" />
    <circle cx="11.2" cy="23.1" r="3.3" fill="#34A853" />
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
          ? 'bg-primary/10 border-primary/50 shadow-[0_0_0_1px_rgba(220,38,38,0.2)]'
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
          <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_rgba(220,38,38,0.8)]" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-white/10" />
        )}
      </div>
    </button>
  )
}

// ─── Últimos acessos ──────────────────────────────────────────────────────────
// Quem clicou nos links do usuário: entrou (Telegram/externo) ou foi barrado
// (página alternativa / IP bloqueado), com o motivo gravado pelo servidor.

type Acesso = {
  id: string
  createdAt: string
  destination: string
  reason: string | null
  device: string | null
  os: string | null
  ip: string | null
  trafficSource: string | null
  utmSource: string | null
  utmCampaign: string | null
  fbclid: string | null
  kwaiId: string | null
  country?: string | null
  region?: string | null
  city?: string | null
  redirector: { id: string; name: string; slug: string } | null
}

// Estado → sigla (a base de IP devolve o nome do estado, com ou sem acento).
const UF: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'federal district': 'DF', 'espirito santo': 'ES', goias: 'GO',
  maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
  para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  sergipe: 'SE', tocantins: 'TO',
}
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

let nomesPaises: Intl.DisplayNames | null = null
function nomePais(sigla: string): string {
  try {
    nomesPaises ||= new Intl.DisplayNames(['pt-BR'], { type: 'region' })
    return nomesPaises.of(sigla) || sigla
  } catch {
    return sigla
  }
}

function Localizacao({ a }: { a: Acesso }) {
  if (!a.country && !a.city && !a.region) {
    return <span className="text-[11px] text-white/20">Sem localização</span>
  }
  const uf = a.country === 'BR' && a.region ? UF[semAcento(a.region)] : null
  const linha1 = [a.city, uf || a.region].filter(Boolean).join(' · ')
  const estrangeiro = !!a.country && a.country !== 'BR'
  return (
    <div className="flex items-center gap-1.5 min-w-0" title={[a.city, a.region, a.country && nomePais(a.country)].filter(Boolean).join(', ')}>
      {a.country && (
        <span className={`shrink-0 text-[9px] font-bold px-1 py-px rounded-[2px] ${estrangeiro ? 'text-red-300 bg-red-500/15' : 'text-white/50 bg-white/[0.07]'}`}>
          {a.country}
        </span>
      )}
      <span className="text-xs text-white/75 truncate">{linha1 || (a.country ? nomePais(a.country) : '—')}</span>
    </div>
  )
}

function tempoRelativo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return `há ${Math.floor(s / 86400)} d`
}

const FILTROS_ACESSO = [
  { value: '',        label: 'Todos' },
  { value: 'entrou',  label: 'Entraram' },
  { value: 'barrado', label: 'Barrados' },
]

function ResultadoAcesso({ a }: { a: Acesso }) {
  const entrou = a.destination === 'telegram' || a.destination === 'external'
  const label = entrou
    ? (a.destination === 'telegram' ? 'Entrou · Telegram' : 'Entrou · Externo')
    : (a.destination === 'blocked' ? 'Bloqueado' : 'Barrado · Página alternativa')
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${
        entrou
          ? 'text-green-400 bg-green-500/10 border-green-500/20'
          : 'text-red-400 bg-red-500/10 border-red-500/20'
      }`}
    >
      {entrou ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {label}
    </span>
  )
}

function AcessosRecentes({ workspaceId, redirectors }: { workspaceId: string; redirectors: Redirector[] }) {
  const [itens, setItens] = useState<Acesso[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [linkId, setLinkId] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const qs = new URLSearchParams({ limit: '50' })
      if (filtro) qs.set('result', filtro)
      if (linkId) qs.set('redirectorId', linkId)
      const d = await api.get(`/workspaces/${workspaceId}/redirectors/clicks?${qs.toString()}`)
      setItens(Array.isArray(d) ? d : [])
    } catch {
      setItens([])
    } finally {
      setCarregando(false)
    }
  }, [workspaceId, filtro, linkId])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-white/[0.06]">
        <div className="mr-auto">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-primary" /> Últimos acessos
          </h3>
          <p className="text-[11px] text-white/30 mt-0.5">Quem entrou e quem foi barrado nos seus links — e por quê</p>
        </div>
        <select
          value={linkId}
          onChange={(e) => setLinkId(e.target.value)}
          className="h-8 rounded-[3px] border border-white/[0.08] bg-[#0f0f0f] px-2 text-xs text-white/80 focus:outline-none focus:border-primary/40"
        >
          <option value="">Todos os links</option>
          {redirectors.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="flex items-center gap-1">
          {FILTROS_ACESSO.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              className={`h-8 px-3 rounded-[3px] text-xs font-semibold border transition-colors ${
                filtro === f.value
                  ? 'bg-primary/12 text-primary border-primary/30'
                  : 'text-white/40 border-white/[0.08] hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={carregar}
          className="h-8 px-3 rounded-[3px] border border-white/[0.08] text-xs text-white/40 hover:text-white transition-colors"
        >
          Atualizar
        </button>
      </div>

      {carregando ? (
        <div className="py-12 text-center text-white/30 text-sm">Carregando...</div>
      ) : itens.length === 0 ? (
        <div className="py-12 text-center text-white/30 text-sm">Nenhum acesso encontrado</div>
      ) : (
        <>
          {/* Resumo do que está na lista */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.04] border-b border-white/[0.06]">
            {[
              { label: 'Na lista',  valor: itens.length, cor: 'text-white' },
              { label: 'Entraram',  valor: itens.filter((a) => a.destination === 'telegram' || a.destination === 'external').length, cor: 'text-green-400' },
              { label: 'Barrados',  valor: itens.filter((a) => !(a.destination === 'telegram' || a.destination === 'external')).length, cor: 'text-red-400' },
              { label: 'Revisores', valor: itens.filter((a) => a.device === 'revisao').length, cor: 'text-violet-400' },
            ].map((m) => (
              <div key={m.label} className="bg-[#141414] px-5 py-2.5">
                <p className="text-[9px] uppercase tracking-wider text-white/30">{m.label}</p>
                <p className={`text-base font-semibold tabular-nums ${m.cor}`}>{m.valor}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Quando', 'Link', 'Resultado', 'Dispositivo', 'Localização', 'IP'].map((h) => (
                    <th key={h} className="text-left text-[10px] uppercase tracking-wider text-white/30 font-medium px-4 first:pl-5 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itens.map((a) => {
                  const entrou = a.destination === 'telegram' || a.destination === 'external'
                  const teste = a.fbclid === TEST_CLICK_ID || a.kwaiId === TEST_CLICK_ID
                  return (
                    <tr key={a.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors align-top">
                      <td className={`pl-5 pr-4 py-3 whitespace-nowrap border-l-2 ${entrou ? 'border-green-500/50' : 'border-red-500/50'}`}>
                        <p className="text-xs text-white/75">{tempoRelativo(a.createdAt)}</p>
                        <p className="text-[10px] text-white/30 tabular-nums">{new Date(a.createdAt).toLocaleString('pt-BR')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-white/80 truncate max-w-[140px]">{a.redirector?.name || '—'}</span>
                          {teste && (
                            <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-[3px]">TESTE</span>
                          )}
                        </div>
                        <p className="text-[10px] text-white/30">{a.trafficSource || 'Origem desconhecida'}</p>
                      </td>
                      <td className="px-4 py-3 min-w-[220px]">
                        <ResultadoAcesso a={a} />
                        {!entrou && (
                          <p className="text-[11px] text-white/55 mt-1 leading-snug max-w-[320px]">
                            {a.reason || 'Motivo não registrado (acesso antigo)'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {a.device === 'revisao' ? (
                          <div className="flex items-center gap-1.5 text-violet-400" title={`Prévia, robô ou equipe de revisão do Kwai (${a.os || '—'})`}>
                            <Monitor className="h-3.5 w-3.5" />
                            <span className="text-[11px] font-semibold">Revisor do Kwai</span>
                          </div>
                        ) : a.device === 'dev' ? (
                          <div className="flex items-center gap-1.5 text-amber-400" title={`Computador simulando celular (UA dizia ${a.os || '—'})`}>
                            <Monitor className="h-3.5 w-3.5" />
                            <span className="text-[11px] font-semibold">Computador (DevTools)</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-white/55">
                            {a.device === 'mobile' ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
                            <span className="text-[11px]">
                              {a.device === 'mobile' ? 'Celular' : 'Computador'} · {a.os || '—'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[220px]"><Localizacao a={a} /></td>
                      <td className="px-4 py-3 text-[11px] font-mono text-white/35 whitespace-nowrap">
                        <span className="inline-block max-w-[190px] truncate align-bottom" title={a.ip || ''}>{a.ip || '—'}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RedirecionadoresPage() {
  const { workspaceId } = useAuthStore()
  const [redirectors, setRedirectors] = useState<Redirector[]>([])
  const [flows,       setFlows]       = useState<Flow[]>([])
  const [domains,     setDomains]     = useState<ActiveDomain[]>([])
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
  const [copiedTestSlug, setCopiedTestSlug] = useState<string | null>(null)
  const [togglingReview, setTogglingReview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [newLink, setNewLink] = useState<{ slug: string; domain: string; name: string; verificationCode?: string } | null>(null)

  const loadData = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const [rData, fData, dData] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/redirectors`),
        api.get(`/workspaces/${workspaceId}/flows`),
        api.get(`/domains/active?workspaceId=${workspaceId}`).catch(() => []),
      ])
      setRedirectors(rData)
      setFlows((fData as Flow[]).filter((f) => f.isActive && f.bot))
      const activeDomains = dData as ActiveDomain[]
      setDomains(activeDomains)
      // Pré-seleciona o padrão; fallback ao primeiro se não houver padrão definido
      const def = activeDomains.find(d => d.isDefault) ?? activeDomains[0]
      if (def) setForm(f => ({ ...f, domainId: def.id }))
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
    const def = domains.find(d => d.isDefault) ?? domains[0]
    setForm({ ...defaultForm(), domainId: def?.id ?? '' })
    setError('')
    setModal({ open: true, editing: null })
  }

  const openEdit = (r: Redirector) => {
    setForm({
      name:           r.name,
      flowId:         r.flowId  || '',
      domainId:       r.domainId || '',
      alternativeUrl: r.alternativeUrl,
      destinationType: r.destinationType || 'telegram',
      externalUrl:     r.externalUrl || '',
      rules:          r.rules ?? defaultRules(),
    })
    setError('')
    setModal({ open: true, editing: r })
  }

  const closeModal = () => setModal({ open: false, editing: null })

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    if (!form.alternativeUrl.trim()) { setError('Link alternativo é obrigatório'); return }
    if (form.destinationType === 'external' && !form.externalUrl.trim()) {
      setError('URL de destino é obrigatória')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name:           form.name.trim(),
        flowId:         form.flowId   || undefined,
        domainId:       form.domainId || undefined,
        alternativeUrl: form.alternativeUrl.trim(),
        destinationType: form.destinationType,
        externalUrl:     form.destinationType === 'external' ? form.externalUrl.trim() : undefined,
        rules:          form.rules,
      }
      if (modal.editing) {
        const updated = await api.patch(
          `/workspaces/${workspaceId}/redirectors/${modal.editing.id}`,
          payload,
        )
        setRedirectors((prev) =>
          prev.map((r) => (r.id === modal.editing!.id ? { ...r, ...updated } : r)),
        )
      } else {
        const created = await api.post(`/workspaces/${workspaceId}/redirectors`, payload)
        setRedirectors((prev) => [created, ...prev])
        const domainHost = created.domain?.domain ?? (typeof window !== 'undefined' ? window.location.hostname : '')
        setNewLink({
          slug: created.slug,
          name: created.name,
          domain: domainHost,
          verificationCode: created.rules?.verificationCodeEnabled ? created.verificationCode : undefined,
        })
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

  /**
   * Onde o modo revisão é oferecido: só em link de Kwai que não receba também
   * tráfego do Facebook. É a mesma condição que o servidor aplica — se as duas
   * divergirem, a chave aparece e não faz nada.
   */
  const podeRevisar = (r: Redirector) =>
    r.rules?.sources?.kwai === true && r.rules?.sources?.facebook !== true

  const handleToggleReview = async (r: Redirector) => {
    // Manda as regras INTEIRAS: o backend faz `rules: dto.rules`, substituindo
    // o objeto. Enviar só `{ reviewMode }` apagaria todos os filtros do link.
    const rules = { ...r.rules, reviewMode: !r.rules?.reviewMode }
    setTogglingReview(r.id)
    try {
      const updated = await api.patch(
        `/workspaces/${workspaceId}/redirectors/${r.id}`,
        { rules },
      )
      setRedirectors((prev) => prev.map((x) => (x.id === r.id ? { ...x, rules: updated.rules } : x)))
    } catch { /* silent */ } finally {
      setTogglingReview(null)
    }
  }

  const copyFbUrl = (r: Redirector) => {
    navigator.clipboard.writeText(appendCode(FB_UTM_PARAMS, r)).then(() => {
      setCopiedFbSlug(r.slug)
      setTimeout(() => setCopiedFbSlug(null), 1800)
    })
  }

  const copyFbModalParams = () => {
    navigator.clipboard.writeText(appendCode(FB_UTM_PARAMS, modal.editing ?? undefined)).then(() => {
      setCopiedFbModal(true)
      setTimeout(() => setCopiedFbModal(false), 1800)
    })
  }

  const copyKwaiUrl = (r: Redirector) => {
    navigator.clipboard.writeText(appendCode(KWAI_UTM_PARAMS, r)).then(() => {
      setCopiedKwaiSlug(r.slug)
      setTimeout(() => setCopiedKwaiSlug(null), 1800)
    })
  }

  const copyKwaiModalParams = () => {
    navigator.clipboard.writeText(appendCode(KWAI_UTM_PARAMS, modal.editing ?? undefined)).then(() => {
      setCopiedKwaiModal(true)
      setTimeout(() => setCopiedKwaiModal(false), 1800)
    })
  }

  // "Link de teste": link real + parâmetros da plataforma do link (Facebook:
  // fbclid=8878; Kwai: click_id=8878 empacotado no utm_content) + &app=<código>
  // quando o link exige código de verificação. Fica pronto pra o dono do funil
  // clicar e cair no funil de verdade, passando pelo cloaker sem anúncio real.
  const copyTestUrl = (r: Redirector) => {
    const base = plataformaDeTeste(r.rules) === 'kwai' ? KWAI_TEST_PARAMS : FB_TEST_PARAMS
    const params =
      base +
      (r.rules?.verificationCodeEnabled ? `&app=${r.verificationCode}` : '')
    navigator.clipboard.writeText(`${getLink(r)}?${params}`).then(() => {
      setCopiedTestSlug(r.slug)
      setTimeout(() => setCopiedTestSlug(null), 1800)
    })
  }

  const copyLink = (slug: string, fromBanner = false, domain?: string | null) => {
    const host = domain ? `https://${domain}` : window.location.origin
    const link = `${host}/r/${slug}`
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(fromBanner ? `banner_${slug}` : slug)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  const getLink = (r: Redirector) => {
    const host = r.domain?.domain ? `https://${r.domain.domain}` : (typeof window !== 'undefined' ? window.location.origin : '')
    return `${host}/r/${r.slug}`
  }

  // O código de verificação NUNCA vai no link principal — sempre junto dos
  // parâmetros de UTM (Facebook/Kwai Ads), igual ao fbclid/click_id.
  const appendCode = (params: string, r?: Pick<Redirector, 'rules' | 'verificationCode'>) =>
    r?.rules?.verificationCodeEnabled ? `${params}&app=${r.verificationCode}` : params

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
        <Link
          href="/dashboard/redirecionadores/dominios"
          className="flex items-center gap-2 px-4 py-2 border border-white/[0.1] hover:border-white/25 text-white/70 hover:text-white text-sm font-medium rounded-[3px] transition-colors"
        >
          <Globe className="h-4 w-4" />
          Meus Domínios
        </Link>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-[3px] transition-colors"
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
                https://{newLink.domain}/r/{newLink.slug}
              </span>
            </p>
            {newLink.verificationCode && (
              <p className="text-[11px] text-amber-400/80 mt-0.5">
                Código do funil: <span className="font-mono">{newLink.verificationCode}</span> — adicione <code className="text-white/50">&amp;app={newLink.verificationCode}</code> nos Parâmetros de URL do anúncio (não no link acima)
              </p>
            )}
          </div>

          {/* botão copiar */}
          <button
            onClick={() => copyLink(newLink.slug, true, newLink.domain)}
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
              className="mt-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-[3px] transition-colors"
            >
              Criar primeiro redirecionador
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" /> Seus links
                <span className="text-[10px] font-semibold text-white/40 bg-white/[0.06] px-1.5 py-0.5 rounded-[3px]">{redirectors.length}</span>
              </h3>
              <span className="text-[11px] text-white/30 hidden sm:block">
                {redirectors.filter((r) => r.isActive).length} ligado(s) · {redirectors.filter((r) => podeRevisar(r) && r.rules?.reviewMode).length} em revisão
              </span>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {redirectors.map((r) => {
                const fontes = activeSources(r.rules)
                const emRevisao = podeRevisar(r) && !!r.rules?.reviewMode
                return (
                  <div
                    key={r.id}
                    className={`relative px-5 py-4 flex flex-col xl:flex-row xl:items-center gap-4 hover:bg-white/[0.015] transition-colors ${!r.isActive ? 'opacity-55' : ''}`}
                  >
                    {/* faixa lateral: verde ligado, âmbar em revisão, cinza desligado */}
                    <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${!r.isActive ? 'bg-white/10' : emRevisao ? 'bg-amber-400/70' : 'bg-green-500/60'}`} />

                    {/* ── Identidade ── */}
                    <div className="xl:w-[230px] shrink-0 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-white font-semibold truncate">{r.name}</span>
                        {emRevisao && (
                          <span className="shrink-0 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-amber-400 bg-amber-400/10 border border-amber-400/25 px-1.5 py-0.5 rounded-[3px]">
                            <Eye className="h-2.5 w-2.5" /> Em revisão
                          </span>
                        )}
                        {!r.isActive && (
                          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-white/40 bg-white/[0.06] px-1.5 py-0.5 rounded-[3px]">Desligado</span>
                        )}
                      </div>
                      {r.destinationType === 'external' && r.externalUrl ? (
                        <div className="flex items-center gap-1.5 min-w-0" title={r.externalUrl}>
                          <Globe className="h-3 w-3 text-white/30 shrink-0" />
                          <span className="text-white/45 text-xs truncate">{r.externalUrl}</span>
                        </div>
                      ) : r.flow ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <GitBranch className="h-3 w-3 text-white/30 shrink-0" />
                          <span className="text-white/45 text-xs truncate">{r.flow.name}</span>
                          {r.flow.bot && <span className="text-[10px] text-white/25 truncate">@{r.flow.bot.username}</span>}
                        </div>
                      ) : (
                        <span className="text-white/20 text-xs">Sem destino</span>
                      )}
                    </div>

                    {/* ── Link + ferramentas ── */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-stretch rounded-[3px] border border-white/[0.08] overflow-hidden bg-white/[0.03] max-w-[460px]">
                        <div className="flex-1 min-w-0 px-2.5 py-2 flex items-center gap-1.5">
                          {r.domain ? <Globe className="h-3 w-3 text-white/20 shrink-0" /> : <Link2 className="h-3 w-3 text-white/20 shrink-0" />}
                          <span className="text-[11px] font-mono text-white/55 truncate">{getLink(r)}</span>
                        </div>
                        <button
                          onClick={() => copyLink(r.slug, false, r.domain?.domain)}
                          title="Copiar link"
                          className={[
                            'px-3 flex items-center gap-1.5 border-l border-white/[0.07] text-xs font-medium shrink-0 transition-all',
                            copiedId === r.slug
                              ? 'bg-green-500/10 text-green-400'
                              : 'hover:bg-white/[0.06] text-white/40 hover:text-white/80',
                          ].join(' ')}
                        >
                          {copiedId === r.slug
                            ? <><Check className="h-3 w-3" /><span>Copiado</span></>
                            : <><Copy className="h-3 w-3" /><span>Copiar</span></>}
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {fontes.length === 0 && r.rules?.deviceFilter !== 'mobile_only' && (
                          <span className="text-[10px] text-white/30 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]">Qualquer origem</span>
                        )}
                        {fontes.map((src) => (
                          <div key={src} title={PLATFORM_NAMES[src]} className="rounded-md overflow-hidden">
                            {PLATFORM_MINI[src]}
                          </div>
                        ))}
                        {r.rules?.deviceFilter === 'mobile_only' && (
                          <span
                            title="Somente celular real (anti-emulação)"
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-400"
                          >
                            <Smartphone className="h-2.5 w-2.5" /> Mobile
                          </span>
                        )}
                        {(r.rules?.countries?.length ?? 0) > 0 && (
                          <span
                            title="Só entra quem está nesses países (pelo IP)"
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/25 text-[10px] text-sky-400"
                          >
                            <Globe className="h-2.5 w-2.5" /> {r.rules!.countries.join(', ')}
                          </span>
                        )}
                        {r.rules?.verificationCodeEnabled && (
                          <span
                            title="Código de verificação deste link — adicione &app= nos Parâmetros de URL do anúncio"
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] text-[10px] font-mono text-white/50"
                          >
                            app={r.verificationCode}
                          </span>
                        )}
                        <span className="w-px h-3.5 bg-white/[0.08] mx-0.5" />
                        {fontes.includes('facebook') && (
                          <button
                            onClick={() => copyFbUrl(r)}
                            title="Copiar parâmetros UTM para Facebook Ads"
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium transition-all ${
                              copiedFbSlug === r.slug
                                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                                : 'bg-[#1877F2]/8 border-[#1877F2]/20 text-[#1877F2]/70 hover:bg-[#1877F2]/15 hover:text-[#1877F2]'
                            }`}
                          >
                            {copiedFbSlug === r.slug
                              ? <><Check className="h-2.5 w-2.5" />Copiado</>
                              : <><Copy className="h-2.5 w-2.5" />UTM Facebook</>}
                          </button>
                        )}
                        {fontes.includes('kwai') && (
                          <button
                            onClick={() => copyKwaiUrl(r)}
                            title="Copiar parâmetros UTM para Kwai Ads"
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium transition-all ${
                              copiedKwaiSlug === r.slug
                                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                                : 'bg-[#FF6600]/8 border-[#FF6600]/20 text-[#FF6600]/70 hover:bg-[#FF6600]/15 hover:text-[#FF6600]'
                            }`}
                          >
                            {copiedKwaiSlug === r.slug
                              ? <><Check className="h-2.5 w-2.5" />Copiado</>
                              : <><Copy className="h-2.5 w-2.5" />UTM Kwai</>}
                          </button>
                        )}
                        <button
                          onClick={() => copyTestUrl(r)}
                          title={plataformaDeTeste(r.rules) === 'kwai'
                            ? 'Copiar link de teste do Kwai (link + UTM do Kwai + click_id=8878 + código) — passa pelo cloaker sem anúncio real'
                            : 'Copiar link de teste do Facebook (link + UTM + fbclid=8878 + código) — passa pelo cloaker sem anúncio real'}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium transition-all ${
                            copiedTestSlug === r.slug
                              ? 'bg-green-500/10 border-green-500/20 text-green-400'
                              : 'bg-white/[0.03] border-white/[0.08] text-white/40 hover:bg-white/[0.07] hover:text-white/80'
                          }`}
                        >
                          {copiedTestSlug === r.slug
                            ? <><Check className="h-2.5 w-2.5" />Copiado</>
                            : <><FlaskConical className="h-2.5 w-2.5" />Link de teste</>}
                        </button>
                      </div>
                    </div>

                    {/* ── Números ── */}
                    <div className="grid grid-cols-3 gap-2 xl:w-[250px] shrink-0">
                      {[
                        { label: 'Cliques',   valor: r.totalClicks.toLocaleString('pt-BR'),    cor: 'text-white' },
                        { label: 'Telegram',  valor: r.telegramClicks.toLocaleString('pt-BR'), cor: 'text-white/80' },
                        { label: 'Conversão', valor: convRate(r), cor: r.totalClicks > 0 ? 'text-green-400' : 'text-white/25' },
                      ].map((m) => (
                        <div key={m.label} className="rounded-[3px] bg-white/[0.025] border border-white/[0.05] px-2.5 py-1.5">
                          <p className="text-[9px] uppercase tracking-wider text-white/30">{m.label}</p>
                          <p className={`text-sm font-semibold tabular-nums ${m.cor}`}>{m.valor}</p>
                        </div>
                      ))}
                    </div>

                    {/* ── Controles ── */}
                    <div className="flex items-center gap-1 xl:justify-end shrink-0">
                      {/* Revisão: só existe em link de Kwai sem Facebook — não há
                          chave para ligar por engano num link do Facebook. */}
                      {podeRevisar(r) && (
                        <button
                          onClick={() => handleToggleReview(r)}
                          disabled={togglingReview === r.id}
                          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-[3px] border text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                            r.rules?.reviewMode
                              ? 'text-amber-400 border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/15'
                              : 'text-white/40 border-white/[0.08] hover:text-white/70'
                          }`}
                          title={r.rules?.reviewMode
                            ? 'Em revisão: todo o tráfego vai para a página alternativa. Clique para voltar a filtrar.'
                            : 'Ligar o modo revisão (todo o tráfego vai para a alternativa)'}
                        >
                          {r.rules?.reviewMode ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          Revisão
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleActive(r)}
                        className={`flex items-center gap-1.5 h-8 px-2.5 rounded-[3px] border text-[11px] font-semibold transition-colors ${
                          r.isActive
                            ? 'text-green-400 border-green-500/25 bg-green-500/10 hover:bg-green-500/15'
                            : 'text-white/40 border-white/[0.08] hover:text-white/70'
                        }`}
                        title={r.isActive ? 'Desligar o link' : 'Ligar o link'}
                      >
                        {r.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                        {r.isActive ? 'Ligado' : 'Desligado'}
                      </button>
                      <span className="w-px h-5 bg-white/[0.08] mx-1" />
                      <button
                        onClick={() => openEdit(r)}
                        className="p-2 rounded-[3px] hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <a
                        href={getLink(r)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-[3px] hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors"
                        title="Abrir link"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-2 rounded-[3px] hover:bg-primary/10 text-white/40 hover:text-primary transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Últimos acessos ─────────────────────────────────────────────── */}
      {workspaceId && redirectors.length > 0 && (
        <AcessosRecentes workspaceId={workspaceId} redirectors={redirectors} />
      )}

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
                <label className="text-xs text-white/50 font-medium">Nome <span className="text-primary">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Campanha Facebook Produto A"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-[3px] px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              {/* Fluxo vinculado */}
              <div className={`space-y-1.5 transition-opacity ${form.destinationType === 'external' ? 'opacity-40' : ''}`}>
                <label className="text-xs text-white/50 font-medium">Fluxo Vinculado</label>
                {flows.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.02] border border-white/[0.06] rounded-[3px]">
                    <GitBranch className="h-4 w-4 text-white/20" />
                    <span className="text-xs text-white/25">Nenhum fluxo ativo com bot encontrado</span>
                  </div>
                ) : (
                  <select
                    value={form.flowId}
                    disabled={form.destinationType === 'external'}
                    onChange={(e) => setForm({ ...form, flowId: e.target.value })}
                    className="w-full bg-[#141414] border border-white/[0.08] rounded-[3px] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors appearance-none disabled:cursor-not-allowed"
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

              {/* Destino externo */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white/50 font-medium">Direcionar para link externo</p>
                    <p className="text-[11px] text-white/20 mt-0.5">
                      Em vez do fluxo do Telegram, manda quem casar com as regras pra qualquer link — útil quando o destino final não é um bot
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        destinationType: f.destinationType === 'external' ? 'telegram' : 'external',
                      }))
                    }
                    className={`transition-colors ${form.destinationType === 'external' ? 'text-green-400' : 'text-white/25'}`}
                  >
                    {form.destinationType === 'external'
                      ? <ToggleRight className="h-5 w-5" />
                      : <ToggleLeft className="h-5 w-5" />}
                  </button>
                </div>
                {form.destinationType === 'external' && (
                  <input
                    type="url"
                    value={form.externalUrl}
                    onChange={(e) => setForm({ ...form, externalUrl: e.target.value })}
                    placeholder="https://seudominio.com/pagina"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-[3px] px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50 transition-colors"
                  />
                )}
              </div>

              {/* Domínio */}
              {domains.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-white/50 font-medium flex items-center gap-1.5">
                      <Globe className="h-3 w-3" />
                      Domínio do Link
                    </label>
                    <Link href="/dashboard/redirecionadores/dominios" className="text-[11px] text-white/40 hover:text-white transition-colors">
                      Meus Domínios
                    </Link>
                  </div>
                  <select
                    value={form.domainId}
                    onChange={(e) => setForm({ ...form, domainId: e.target.value })}
                    className="w-full bg-[#141414] border border-white/[0.08] rounded-[3px] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors appearance-none"
                  >
                    {domains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.domain}{d.isDefault ? ' (padrão)' : ''}{d.isOwn ? ' (seu domínio)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-white/25">
                    Link gerado: https://{domains.find(d => d.id === form.domainId)?.domain ?? '...'}/r/xxxxxxxx
                  </p>
                </div>
              )}
              {domains.length === 0 && (
                <Link href="/dashboard/redirecionadores/dominios" className="text-[11px] text-white/40 hover:text-white transition-colors inline-flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  Cadastrar um domínio próprio
                </Link>
              )}

              {/* Link alternativo */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50 font-medium">Link Alternativo <span className="text-primary">*</span></label>
                <input
                  type="url"
                  value={form.alternativeUrl}
                  onChange={(e) => setForm({ ...form, alternativeUrl: e.target.value })}
                  placeholder="https://seusite.com/landing-page"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-[3px] px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50 transition-colors"
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
                          {appendCode(FB_UTM_PARAMS, modal.editing ?? undefined)}
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
                        Detecta automaticamente pelo <code className="text-white/40 mx-0.5">utm_content</code> (ou <code className="text-white/40 mx-0.5">?click_id=</code> em links antigos)
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
                          {appendCode(KWAI_UTM_PARAMS, modal.editing ?? undefined)}
                        </div>
                        <p className="text-[11px] text-white/20 leading-relaxed">
                          No Kwai Ads, cole no campo <span className="text-white/40">Parâmetros de URL</span> do anúncio.
                        </p>
                      </div>
                    </div>
                  )}
                  {(form.rules.sources.kwai || form.rules.sources.facebook) && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, rules: { ...f.rules, appOrigin: !f.rules.appOrigin } }))}
                      className={`w-full flex items-start gap-3 rounded-[4px] border p-3 text-left transition-colors ${
                        form.rules.appOrigin
                          ? 'border-green-500/30 bg-green-500/[0.06]'
                          : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className={`mt-0.5 relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${form.rules.appOrigin ? 'bg-green-500' : 'bg-white/15'}`}>
                        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${form.rules.appOrigin ? 'left-3.5' : 'left-0.5'}`} />
                      </span>
                      <span className="space-y-0.5">
                        <span className="block text-xs font-medium text-white/70">Só quem abriu pelo app</span>
                        <span className="block text-[11px] text-white/30 leading-relaxed">
                          Além do click id, exige que o link tenha sido aberto dentro do app
                          {form.rules.sources.kwai && form.rules.sources.facebook ? ' do Kwai ou do Facebook/Instagram' : form.rules.sources.kwai ? ' do Kwai' : ' do Facebook/Instagram'}.
                          Robôs e quem copiou o link pro navegador → link alternativo. O link de teste sempre passa.
                        </span>
                      </span>
                    </button>
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

                {/* País (pelo IP do visitante) */}
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-white/50">País</p>
                  <div className="flex flex-wrap gap-2">
                    {PAISES.map((p) => (
                      <Chip
                        key={p.code}
                        label={p.label}
                        active={(form.rules.countries || []).includes(p.code)}
                        onClick={() =>
                          setForm((f) => {
                            const atual = f.rules.countries || []
                            const countries = atual.includes(p.code)
                              ? atual.filter((c) => c !== p.code)
                              : [...atual, p.code]
                            return { ...f, rules: { ...f.rules, countries } }
                          })
                        }
                      />
                    ))}
                  </div>
                  {(form.rules.countries || []).length === 0 ? (
                    <p className="text-[11px] text-white/20">Nenhum selecionado = qualquer país</p>
                  ) : (
                    <p className="text-[11px] text-amber-400/70">
                      Só entra quem está em {(form.rules.countries || []).map((c) => PAISES.find((p) => p.code === c)?.label || c).join(', ')} (pelo IP).
                      De outro país → link alternativo.
                    </p>
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

                {/* Código de verificação */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-white/50">Código de Verificação</p>
                      <p className="text-[11px] text-white/20 mt-0.5">
                        Exige um código único de 5 dígitos nos parâmetros da URL, além da verificação por plataforma
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          rules: { ...f.rules, verificationCodeEnabled: !f.rules.verificationCodeEnabled },
                        }))
                      }
                      className={`transition-colors ${form.rules.verificationCodeEnabled ? 'text-green-400' : 'text-white/25'}`}
                    >
                      {form.rules.verificationCodeEnabled
                        ? <ToggleRight className="h-5 w-5" />
                        : <ToggleLeft className="h-5 w-5" />}
                    </button>
                  </div>
                  {form.rules.verificationCodeEnabled && (
                    <div className="px-3 py-2.5 rounded-[3px] bg-white/[0.03] border border-white/[0.08] space-y-1.5">
                      {modal.editing ? (
                        <p className="text-[11px] text-white/50">
                          Código deste funil (<span className="text-white/70">{modal.editing.name}</span>):{' '}
                          <span className="font-mono text-sm text-amber-400">{modal.editing.verificationCode}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-white/40">Um código será gerado ao salvar.</p>
                      )}
                      <p className="text-[11px] text-white/25 leading-relaxed">
                        Vai <span className="text-white/45">junto dos Parâmetros de URL</span> do Facebook/Kwai Ads
                        (bloco abaixo, já incluso automaticamente) — <span className="text-white/45">nunca no link principal</span>.
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Modo revisão ──────────────────────────────────────────
                    Só aparece em link de Kwai sem Facebook, a mesma condição
                    que o servidor aplica. Em link do Facebook o bloco não
                    existe — nem a chave, nem o risco de ligar por engano. */}
                {form.rules.sources.kwai && !form.rules.sources.facebook && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/50">Modo revisão</p>
                        <p className="text-[11px] text-white/20 mt-0.5">
                          Enquanto ligado, <span className="text-white/45">todo mundo vai para a página alternativa</span> —
                          inclusive quem passaria nos filtros. Ao desligar, o link volta a filtrar sem perder nenhuma regra.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, rules: { ...f.rules, reviewMode: !f.rules.reviewMode } }))
                        }
                        className={`transition-colors shrink-0 ml-3 ${form.rules.reviewMode ? 'text-amber-400' : 'text-white/25'}`}
                      >
                        {form.rules.reviewMode ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                      </button>
                    </div>

                    {form.rules.reviewMode && (
                      <div className="px-3 py-2.5 rounded-[3px] bg-amber-500/[0.06] border border-amber-500/20 space-y-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] text-white/60">Desligar sozinho quando o anúncio entrar no ar</p>
                            <p className="text-[11px] text-white/25 mt-0.5 leading-relaxed">
                              Enquanto está em análise só o revisor abre o link. Quando o anúncio é aprovado,
                              chega gente de verdade — e aí a revisão se desliga.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                rules: { ...f.rules, reviewAutoOff: !(f.rules.reviewAutoOff ?? true) },
                              }))
                            }
                            className={`transition-colors shrink-0 ${(form.rules.reviewAutoOff ?? true) ? 'text-amber-400' : 'text-white/25'}`}
                          >
                            {(form.rules.reviewAutoOff ?? true)
                              ? <ToggleRight className="h-5 w-5" />
                              : <ToggleLeft className="h-5 w-5" />}
                          </button>
                        </div>

                        {(form.rules.reviewAutoOff ?? true) && (
                          <div className="flex items-center gap-2 text-[11px] text-white/45">
                            Depois de
                            <input
                              type="number" min={2} max={1000}
                              value={form.rules.reviewAutoOffHits ?? 10}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  rules: { ...f.rules, reviewAutoOffHits: Number(e.target.value) || 10 },
                                }))
                              }
                              className="w-16 px-2 py-1 rounded-[3px] bg-white/[0.04] border border-white/10 text-center text-white/80 text-xs"
                            />
                            pessoas diferentes vindas do anúncio
                          </div>
                        )}

                        <p className="text-[11px] text-white/25 leading-relaxed">
                          Deixe as regras prontas enquanto espera: elas passam a valer no instante
                          em que a revisão sair, sem precisar voltar aqui.
                        </p>
                      </div>
                    )}
                  </div>
                )}

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
                        className="bg-white/[0.04] border border-white/[0.08] rounded-[3px] px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
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
                        className="bg-white/[0.04] border border-white/[0.08] rounded-[3px] px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
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
                <p className="text-primary text-xs bg-primary/10 border border-primary/20 rounded-[3px] px-3 py-2">
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
                {form.destinationType === 'external' ? <Globe className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                <span>{form.destinationType === 'external' ? 'Link Externo' : 'Telegram'}</span>
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
                  className="px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-sm font-semibold rounded-[3px] transition-colors"
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
