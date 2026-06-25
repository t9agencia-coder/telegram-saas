'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { MetricsCard } from '@/components/dashboard/metrics-card'
import { DashboardCharts } from '@/components/dashboard/charts'
import { RecentTransactions } from '@/components/dashboard/recent-transactions'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import type { DateRangeValue } from '@/components/dashboard/date-range-picker'
import { DollarSign, ShoppingCart, TrendingUp, Wallet, Receipt, CheckCircle, Loader2 } from 'lucide-react'

type DateFilter = 'today' | 'yesterday' | '7d' | 'custom'

function toLocalDateStr(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getDateRange(filter: DateFilter, customStart?: string, customEnd?: string) {
  const now = new Date()
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

interface DashboardData {
  revenue: number
  salesCount: number
  conversionRate: number
  averageTicket: number
  pixGenerated: number
  pixPaid: number
}

export default function DashboardPage() {
  const { workspaceId } = useAuthStore()
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [customRange, setCustomRange] = useState<DateRangeValue>({ from: undefined, to: undefined })
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const customS = customRange.from ? toLocalDateStr(customRange.from) : toLocalDateStr(new Date())
      const customE = customRange.to ? toLocalDateStr(customRange.to) : customS
      const { startDate, endDate } = getDateRange(dateFilter, customS, customE)

      const [overview, payments] = await Promise.all([
        api.get<any>(`/workspaces/${workspaceId}/analytics/overview?startDate=${startDate}&endDate=${endDate}`),
        api.get<any[]>(`/workspaces/${workspaceId}/payments`),
      ])

      const allPayments = payments.filter((p: any) => {
        const d = new Date(p.createdAt)
        return d >= new Date(startDate) && d <= new Date(endDate)
      })

      setData({
        revenue: overview.revenue?.total || 0,
        salesCount: overview.sales?.total || 0,
        conversionRate: overview.conversionRate || 0,
        averageTicket: overview.averageTicket || 0,
        pixGenerated: allPayments.length,
        pixPaid: allPayments.filter((p: any) => p.status === 'APPROVED').length,
      })
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, dateFilter, customRange.from, customRange.to])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-[#E50914]" />
      </div>
    )
  }

  const fmt = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const metrics = [
    { title: 'Faturamento', value: fmt(data.revenue), icon: DollarSign },
    { title: 'Pedidos', value: String(data.salesCount), icon: ShoppingCart },
    {
      title: 'Conversão',
      value: `${data.conversionRate.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%`,
      icon: TrendingUp,
    },
    { title: 'Ticket Médio', value: fmt(data.averageTicket), icon: Wallet },
    { title: 'PIX Gerados', value: String(data.pixGenerated), icon: Receipt },
    { title: 'PIX Pagos', value: String(data.pixPaid), icon: CheckCircle },
  ]

  const customS = customRange.from ? toLocalDateStr(customRange.from) : toLocalDateStr(new Date())
  const customE = customRange.to ? toLocalDateStr(customRange.to) : customS
  const { startDate, endDate } = getDateRange(dateFilter, customS, customE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-white">Dashboard</h1>
        <div className="flex items-center gap-1.5 shrink-0">
          {([
            { value: 'today' as const, label: 'Hoje' },
            { value: 'yesterday' as const, label: 'Ontem' },
            { value: '7d' as const, label: '7 dias' },
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {metrics.map((metric) => (
          <MetricsCard key={metric.title} {...metric} />
        ))}
      </div>

      <DashboardCharts startDate={startDate} endDate={endDate} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <RecentTransactions startDate={startDate} endDate={endDate} />
        </div>
        <div>
          <ActivityFeed startDate={startDate} endDate={endDate} />
        </div>
      </div>
    </div>
  )
}
