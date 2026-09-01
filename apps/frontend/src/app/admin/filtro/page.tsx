'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { DateRangePicker, DateRangeValue } from '@/components/dashboard/date-range-picker'
import {
  Loader2, Filter, ChevronLeft, ChevronRight, Search,
  Send, FileQuestion, ExternalLink, Smartphone, Monitor, Tablet, Ban, MessageCircle, Radio,
} from 'lucide-react'

interface ClickItem {
  id: string
  createdAt: string
  destination: string
  source: string | null
  device: string | null
  os: string | null
  language: string | null
  ip: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
  fbclid: string | null
  ttclid: string | null
  kwaiId: string | null
  trafficSource: string | null
  blockedTelegramId: string | null
  redirector: {
    id: string
    name: string
    slug: string
    destinationType: string
    alternativeUrl: string
    externalUrl: string | null
    domain: { domain: string } | null
    workspace: { id: string; name: string } | null
    flow: { bot: { username: string } | null } | null
  } | null
}

const LIMIT = 30

const DESTINATIONS = [
  { value: '',            label: 'Todos' },
  { value: 'telegram',    label: 'Telegram' },
  { value: 'alternative', label: 'Página Branca' },
  { value: 'external',    label: 'Externo' },
  { value: 'blocked',     label: 'Bloqueado' },
]

function DestinationBadge({ d }: { d: string }) {
  const meta: Record<string, { label: string; color: string; icon: any }> = {
    telegram:    { label: 'Telegram',      color: '#0EA5E9', icon: Send },
    alternative: { label: 'Página Branca', color: '#888888', icon: FileQuestion },
    external:    { label: 'Externo',       color: '#A855F7', icon: ExternalLink },
    blocked:     { label: 'Bloqueado',     color: '#EF4444', icon: Ban },
  }
  const m = meta[d] ?? { label: d, color: '#666', icon: FileQuestion }
  const Icon = m.icon
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border"
      style={{ color: m.color, background: `${m.color}18`, borderColor: `${m.color}30` }}
    >
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  )
}

function TrafficSourceBadge({ source }: { source: string | null }) {
  if (!source) return <span className="text-[11px] text-[#444]">—</span>

  const knownColors: Record<string, string> = {
    'WhatsApp':            '#25D366',
    'Facebook':            '#1877F2',
    'Instagram':           '#E1306C',
    'Facebook/Instagram':  '#1877F2',
    'TikTok':              '#69C9D0',
    'Kwai':                '#FF6E28',
    'Google':              '#4285F4',
    'YouTube':              '#FF0000',
    'Twitter/X':           '#888888',
    'Telegram':            '#0EA5E9',
    'Direto':              '#888888',
    'Rede social':         '#A855F7',
  }
  const color = knownColors[source] ?? '#A855F7'
  const Icon = source === 'WhatsApp' ? MessageCircle : source === 'Direto' ? Radio : Send

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap"
      style={{ color, background: `${color}18`, borderColor: `${color}30` }}
    >
      <Icon className="h-3 w-3" /> {source}
    </span>
  )
}

function DeviceIcon({ device }: { device: string | null }) {
  if (device === 'mobile') return <Smartphone className="h-3.5 w-3.5" />
  if (device === 'tablet') return <Tablet className="h-3.5 w-3.5" />
  return <Monitor className="h-3.5 w-3.5" />
}

function destinationTarget(item: ClickItem): string {
  if (item.destination === 'blocked') {
    return item.blockedTelegramId
      ? `IP banido por causa do Telegram ID ${item.blockedTelegramId}`
      : 'IP banido manualmente'
  }
  const r = item.redirector
  if (!r) return '—'
  if (item.destination === 'telegram') return r.flow?.bot?.username ? `@${r.flow.bot.username}` : 'sem bot'
  if (item.destination === 'external') return r.externalUrl || '—'
  return r.alternativeUrl || '—'
}

function ParamChips({ item }: { item: ClickItem }) {
  const chips: string[] = []
  if (item.utmSource)   chips.push(`src: ${item.utmSource}`)
  if (item.utmCampaign) chips.push(`camp: ${item.utmCampaign}`)
  if (item.utmMedium)   chips.push(`med: ${item.utmMedium}`)
  const ids: string[] = []
  if (item.fbclid) ids.push('fbclid')
  if (item.ttclid) ids.push('ttclid')
  if (item.kwaiId) ids.push('kwai')

  if (chips.length === 0 && ids.length === 0) {
    return <span className="text-[11px] text-[#444]">orgânico</span>
  }
  return (
    <div className="flex flex-wrap gap-1 max-w-xs">
      {chips.map((c, i) => (
        <span key={i} title={c} className="text-[10px] font-mono text-[#999] bg-white/[0.04] px-1.5 py-0.5 rounded-[3px] truncate max-w-[140px]">
          {c}
        </span>
      ))}
      {ids.map((id) => (
        <span key={id} className="text-[10px] font-semibold text-[#F59E0B] bg-[#F59E0B]/10 px-1.5 py-0.5 rounded-[3px]">
          {id}
        </span>
      ))}
    </div>
  )
}

export default function AdminFiltroPage() {
  const [items,   setItems]   = useState<ClickItem[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)

  const [destination,  setDestination]  = useState('')
  const [search,       setSearch]       = useState('')
  const [searchInput,  setSearchInput]  = useState('')
  const [dateRange,    setDateRange]    = useState<DateRangeValue>({ from: undefined, to: undefined })

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      if (destination) qs.set('destination', destination)
      if (search.trim()) qs.set('search', search.trim())
      if (dateRange.from) qs.set('startDate', dateRange.from.toISOString())
      if (dateRange.to)   qs.set('endDate', dateRange.to.toISOString())
      const d = await api.get(`/admin/redirector-clicks?${qs.toString()}`)
      setItems(d.items)
      setTotal(d.total)
      setPage(p)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [destination, search, dateRange])

  useEffect(() => { load(1) }, [destination, search, dateRange])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const runSearch = () => setSearch(searchInput)

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <Filter className="h-6 w-6 text-[#E50914]" /> Filtro
        </h1>
        <p className="text-sm text-[#555] mt-1">
          {total} clique{total !== 1 ? 's' : ''} em redirecionadores · destino, origem e parâmetros de cada acesso
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#444]" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder="Buscar por nome/slug do redirecionador..."
            className="w-full h-9 rounded-[4px] border border-white/[0.06] bg-[#141414] pl-9 pr-3 text-xs text-white placeholder:text-[#444] focus:outline-none focus:border-[#E50914]/40 transition-all"
          />
        </div>
        <button
          onClick={runSearch}
          className="h-9 px-3 rounded-[4px] border border-white/[0.06] text-xs text-[#555] hover:text-white transition-colors"
        >
          Buscar
        </button>

        <div className="flex items-center gap-1.5 ml-1">
          {DESTINATIONS.map(d => (
            <button
              key={d.value}
              onClick={() => setDestination(d.value)}
              className={`h-9 px-3 rounded-[4px] text-xs font-semibold border transition-colors ${
                destination === d.value
                  ? 'bg-[#E50914]/12 text-[#E50914] border-[#E50914]/30'
                  : 'text-[#666] border-white/[0.08] hover:text-white'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-[#E50914]" />
        </div>
      ) : (
        <>
          <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Data/Hora', 'Redirecionador', 'Vendedor', 'Destino', 'Origem', 'Parâmetros', 'IP', 'Dispositivo'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-[#444] uppercase tracking-wider px-5 py-3.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141414]">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-[#151515] transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="text-xs text-[#888]">{new Date(item.createdAt).toLocaleString('pt-BR')}</span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-white font-medium">{item.redirector?.name || '—'}</p>
                      <p className="text-[10px] text-[#555] font-mono">
                        {item.redirector?.domain?.domain || 'app.firebot.shop'}/r/{item.redirector?.slug}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-[#888]">{item.redirector?.workspace?.name || '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <DestinationBadge d={item.destination} />
                      <p className="text-[10px] text-[#555] mt-1 truncate max-w-[160px]" title={destinationTarget(item)}>
                        {destinationTarget(item)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <TrafficSourceBadge source={item.trafficSource} />
                    </td>
                    <td className="px-5 py-4">
                      <ParamChips item={item} />
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-mono text-[#666]">{item.ip || '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-[#888]">
                        <DeviceIcon device={item.device} />
                        <span className="text-[10px]">{item.os || '—'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-[#444] text-sm">
                      Nenhum clique encontrado com esses filtros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => load(page - 1)}
                disabled={page <= 1}
                className="w-8 h-8 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#666] hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-[#555]">Página {page} de {totalPages}</span>
              <button
                onClick={() => load(page + 1)}
                disabled={page >= totalPages}
                className="w-8 h-8 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#666] hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
