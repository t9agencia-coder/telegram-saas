'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { MetricsCard } from '@/components/dashboard/metrics-card'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import type { DateRangeValue } from '@/components/dashboard/date-range-picker'
import {
  DollarSign, ShoppingCart, TrendingUp, Wallet, Receipt,
  Users, Bot, Layers, Building2, Loader2, Search, Clock, Check,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart,
} from 'recharts'

type DateFilter = 'today' | 'yesterday' | '7d' | 'custom'

function toLocalDateStr(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getDateRange(filter: DateFilter, customStart?: string, customEnd?: string) {
  const now   = new Date()
  const endOf = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  let start: Date

  if (filter === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  } else if (filter === 'yesterday') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    start.setHours(0, 0, 0, 0)
    endOf.setDate(endOf.getDate() - 1)
  } else if (filter === '7d') {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else {
    start = customStart ? new Date(customStart + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1)
    const end = customEnd ? new Date(customEnd + 'T23:59:59') : endOf
    return { startDate: start.toISOString(), endDate: end.toISOString() }
  }

  return { startDate: start.toISOString(), endDate: endOf.toISOString() }
}

function formatTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 2 * 60 * 60 * 1000) {
    const mins = Math.floor(diff / 60000)
    if (mins < 1)  return 'agora'
    if (mins < 60) return `${mins} min atrás`
    return `${Math.floor(mins / 60)}h atrás`
  }
  const d = new Date(dateStr)
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null
  return (
    <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-xs text-[#666666] mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-[#B3B3B3]">{p.name}:</span>
          <span className="text-white font-medium">
            {p.name === 'Receita'
              ? `R$ ${Number(p.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Charts ────────────────────────────────────────────────────────────────────

interface SalesDay { date: string; sales: number; revenue: number }
interface LeadsDay { date: string; count: number }

function AdminCharts({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [salesData, setSalesData] = useState<SalesDay[]>([])
  const [leadsData, setLeadsData] = useState<LeadsDay[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<SalesDay[]>(`/admin/dashboard/sales?startDate=${startDate}&endDate=${endDate}`),
      api.get<LeadsDay[]>(`/admin/dashboard/leads?startDate=${startDate}&endDate=${endDate}`),
    ])
      .then(([sales, leads]) => { setSalesData(sales); setLeadsData(leads) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [startDate, endDate])

  const revenueData = salesData.map((d) => ({
    name: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    receita: d.revenue,
  }))

  const convData = (() => {
    const map = new Map<string, { leads: number; sales: number }>()
    leadsData.forEach((l) => {
      const day = new Date(l.date).toLocaleDateString('pt-BR', { weekday: 'short' })
      const e = map.get(day) || { leads: 0, sales: 0 }
      e.leads += l.count
      map.set(day, e)
    })
    salesData.forEach((s) => {
      const day = new Date(s.date).toLocaleDateString('pt-BR', { weekday: 'short' })
      const e = map.get(day) || { leads: 0, sales: 0 }
      e.sales += s.sales
      map.set(day, e)
    })
    const order = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
    return order.map((d) => {
      const entry = Array.from(map.entries()).find(([k]) => k.toLowerCase().startsWith(d))
      return {
        name: entry ? entry[0] : d,
        leads: entry ? entry[1].leads : 0,
        conversoes: entry ? entry[1].sales : 0,
      }
    })
  })()

  const totalRevenue = revenueData.reduce((a, d) => a + d.receita, 0)

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-5 h-80 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#666666]" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-5">
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-white">Receita</h3>
          <span className="text-2xl font-bold text-white">
            R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="adminRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#E50914" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#E50914" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="receita" stroke="#E50914" strokeWidth={2} fill="url(#adminRevGrad)" name="Receita" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-5">
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-white">Conversões</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {convData.reduce((a, d) => a + d.conversoes, 0)}
            </span>
            <span className="text-sm text-[#666666]">conversões</span>
          </div>
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={convData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="leads"      fill="rgba(255,255,255,0.08)" radius={[4, 4, 0, 0]} name="Leads" />
              <Bar dataKey="conversoes" fill="#E50914"                radius={[4, 4, 0, 0]} name="Conversões" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ── Transactions ──────────────────────────────────────────────────────────────

interface TxRow {
  id: string; transactionId: string; amount: number
  status: string; createdAt: string; paidAt?: string
  lead: {
    id: string; name?: string; leadUid: string; telegramId?: string
    workspace?: { name: string; owner?: { name: string } }
  }
  product?: { id: string; name: string } | null
}

const statusCfg: Record<string, { label: string; cls: string; icon: any }> = {
  APPROVED:  { label: 'Aprovado',  cls: 'text-[#22C55E] bg-[#22C55E]/10', icon: Check },
  PENDING:   { label: 'Pendente',  cls: 'text-[#F59E0B] bg-[#F59E0B]/10', icon: Clock },
  EXPIRED:   { label: 'Expirado',  cls: 'text-[#666666] bg-[#1A1A1A]',    icon: Clock },
  CANCELLED: { label: 'Cancelado', cls: 'text-[#666666] bg-[#1A1A1A]',    icon: Clock },
}

function AdminTransactions({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [payments, setPayments] = useState<TxRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')

  useEffect(() => {
    setLoading(true)
    api.get<TxRow[]>(`/admin/dashboard/transactions?startDate=${startDate}&endDate=${endDate}`)
      .then(setPayments)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [startDate, endDate])

  const filtered = payments.filter((t) =>
    (t.lead?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    t.transactionId.toLowerCase().includes(search.toLowerCase()) ||
    (t.lead?.workspace?.name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Transações Recentes</h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#666666]" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-40 rounded-[3px] border border-white/[0.08] bg-[#1A1A1A] pl-7 pr-2.5 text-xs text-white placeholder:text-[#666666] outline-none focus:border-[#E50914]/40 transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[#666666]" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['ID', 'Cliente', 'Conta', 'Produto', 'Valor', 'Status', 'Data'].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-medium text-[#666666] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => {
                const s = statusCfg[tx.status] || statusCfg.PENDING
                const StatusIcon = s.icon
                return (
                  <tr key={tx.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-xs font-medium text-white font-mono">
                      #{tx.transactionId.slice(-6).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#B3B3B3]">
                      {tx.lead?.name || tx.lead?.telegramId || tx.lead?.leadUid || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#666666]">
                      {tx.lead?.workspace?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#B3B3B3]">{tx.product?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-white">
                      R$ {Number(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] text-[11px] font-medium', s.cls)}>
                        <StatusIcon className="h-3 w-3" />
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666666]">{formatTime(tx.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-[#666666]">Nenhuma transação encontrada</div>
      )}
    </div>
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────

interface ActivityEvent {
  id: string; eventName: string; source: string; createdAt: string
  metadata?: { flowId?: string; flowName?: string }
  lead: {
    id: string; name?: string; leadUid: string; telegramId?: string
    workspace?: { name: string }
  }
}

function AdminActivity({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<ActivityEvent[]>(`/admin/dashboard/activity?startDate=${startDate}&endDate=${endDate}`)
      .then(setEvents)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [startDate, endDate])

  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4">
      <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-3">Atividades</h3>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[#666666]" />
        </div>
      ) : (
        <div>
          {events.map((event) => {
            const name     = event.lead?.name || event.lead?.telegramId || event.lead?.leadUid || 'Visitante'
            const flowName = event.metadata?.flowName || 'Fluxo'
            const wsName   = event.lead?.workspace?.name

            return (
              <div
                key={event.id}
                className="flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] -mx-5 px-5 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-[#E50914] mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">Cliente entrou no fluxo</p>
                  <p className="text-xs text-[#666666] mt-0.5 truncate">
                    {name} · {flowName}{wsName ? ` · ${wsName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[#666666] shrink-0 whitespace-nowrap">
                  <Clock className="h-3 w-3" />
                  {formatTime(event.createdAt)}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!loading && events.length === 0 && (
        <div className="py-8 text-center text-sm text-[#666666]">Nenhuma atividade recente</div>
      )}
    </div>
  )
}

// ── Platform totals (sem filtro de data) ─────────────────────────────────────

interface PlatformStats {
  totalUsers: number; totalBots: number; totalFlows: number; totalWorkspaces: number
}

function PlatformRow() {
  const [stats, setStats] = useState<PlatformStats | null>(null)

  useEffect(() => {
    api.get<PlatformStats>('/admin/stats').then(setStats).catch(console.error)
  }, [])

  if (!stats) return null

  const items = [
    { label: 'Usuários',   value: stats.totalUsers,      icon: Users,     color: '#3B82F6' },
    { label: 'Bots',       value: stats.totalBots,       icon: Bot,       color: '#10B981' },
    { label: 'Fluxos',     value: stats.totalFlows,      icon: Layers,    color: '#8B5CF6' },
    { label: 'Workspaces', value: stats.totalWorkspaces, icon: Building2, color: '#F59E0B' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-[#141414] border border-white/[0.06] rounded-[4px] px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-[3px] flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          <div>
            <p className="text-[10px] text-[#555] font-semibold uppercase tracking-wide">{label}</p>
            <p className="text-xl font-black text-white leading-tight">{value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface DashboardData {
  revenue: number; salesCount: number; conversionRate: number
  averageTicket: number; pixGenerated: number; pixPaid: number; newLeads: number
}

export default function AdminDashboard() {
  const [dateFilter,  setDateFilter]  = useState<DateFilter>('today')
  const [customRange, setCustomRange] = useState<DateRangeValue>({ from: undefined, to: undefined })
  const [data,        setData]        = useState<DashboardData | null>(null)
  const [loading,     setLoading]     = useState(true)

  const fetchOverview = useCallback(async () => {
    setLoading(true)
    try {
      const customS = customRange.from ? toLocalDateStr(customRange.from) : toLocalDateStr(new Date())
      const customE = customRange.to   ? toLocalDateStr(customRange.to)   : customS
      const { startDate, endDate } = getDateRange(dateFilter, customS, customE)
      const overview = await api.get<DashboardData>(
        `/admin/dashboard/overview?startDate=${startDate}&endDate=${endDate}`
      )
      setData(overview)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [dateFilter, customRange.from, customRange.to])

  useEffect(() => { fetchOverview() }, [fetchOverview])

  const customS = customRange.from ? toLocalDateStr(customRange.from) : toLocalDateStr(new Date())
  const customE = customRange.to   ? toLocalDateStr(customRange.to)   : customS
  const { startDate, endDate } = getDateRange(dateFilter, customS, customE)

  const fmt = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const metrics = data ? [
    { title: 'Faturamento',  value: fmt(data.revenue),       icon: DollarSign   },
    { title: 'Pedidos',      value: String(data.salesCount),  icon: ShoppingCart  },
    {
      title: 'Conversão',
      value: `${data.conversionRate.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%`,
      icon: TrendingUp,
    },
    { title: 'Ticket Médio', value: fmt(data.averageTicket),  icon: Wallet        },
    { title: 'PIX Gerados',  value: String(data.pixGenerated), icon: Receipt       },
    { title: 'Novos Leads',  value: String(data.newLeads),     icon: Users         },
  ] : []

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header + filtros */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-white">Dashboard Admin</h1>
        <div className="flex items-center gap-1.5 shrink-0">
          {([
            { value: 'today'     as const, label: 'Hoje'   },
            { value: 'yesterday' as const, label: 'Ontem'  },
            { value: '7d'        as const, label: '7 dias' },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setDateFilter(opt.value); setCustomRange({ from: undefined, to: undefined }) }}
              className={cn(
                'px-2.5 py-1 rounded-[3px] text-xs font-medium transition-all duration-200 whitespace-nowrap',
                dateFilter === opt.value && !customRange.from
                  ? 'bg-[#E50914]/10 text-[#E50914] border border-[#E50914]/30'
                  : 'text-[#666666] hover:text-white bg-[#1A1A1A] border border-white/[0.08]'
              )}
            >
              {opt.label}
            </button>
          ))}

          <span className="text-[#2A2A2A] text-xs">|</span>

          <DateRangePicker
            value={customRange}
            onChange={(range) => {
              setCustomRange(range)
              setDateFilter(range.from ? 'custom' : 'today')
            }}
          />
        </div>
      </div>

      {/* Totais fixos da plataforma (sem filtro de data) */}
      <PlatformRow />

      {/* KPIs com filtro de data */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {metrics.map((m) => <MetricsCard key={m.title} {...m} />)}
        </div>
      )}

      {/* Gráficos */}
      <AdminCharts startDate={startDate} endDate={endDate} />

      {/* Transações + Atividades */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <AdminTransactions startDate={startDate} endDate={endDate} />
        </div>
        <div>
          <AdminActivity startDate={startDate} endDate={endDate} />
        </div>
      </div>
    </div>
  )
}
