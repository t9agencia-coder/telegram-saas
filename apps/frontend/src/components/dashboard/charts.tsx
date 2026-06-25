'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart,
} from 'recharts'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { Loader2 } from 'lucide-react'

interface SalesDay { date: string; sales: number; revenue: number }
interface LeadsDay { date: string; count: number }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null
  return (
    <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl px-4 py-3 shadow-2xl animate-fade-in">
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

interface Props {
  startDate: string
  endDate: string
}

export function DashboardCharts({ startDate, endDate }: Props) {
  const { workspaceId } = useAuthStore()
  const [salesData, setSalesData] = useState<SalesDay[]>([])
  const [leadsData, setLeadsData] = useState<LeadsDay[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspaceId) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const [sales, leads] = await Promise.all([
          api.get<SalesDay[]>(`/workspaces/${workspaceId}/analytics/sales?startDate=${startDate}&endDate=${endDate}`),
          api.get<LeadsDay[]>(`/workspaces/${workspaceId}/analytics/leads?startDate=${startDate}&endDate=${endDate}`),
        ])

        setSalesData(sales)
        setLeadsData(leads)
      } catch (err) {
        console.error('Error fetching chart data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [workspaceId, startDate, endDate])

  const revenueChartData = salesData.map((d) => ({
    name: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    receita: d.revenue,
  }))

  const conversionChartData = (() => {
    const map = new Map<string, { leads: number; sales: number }>()
    leadsData.forEach((l) => {
      const day = new Date(l.date).toLocaleDateString('pt-BR', { weekday: 'short' })
      const entry = map.get(day) || { leads: 0, sales: 0 }
      entry.leads += l.count
      map.set(day, entry)
    })
    salesData.forEach((s) => {
      const day = new Date(s.date).toLocaleDateString('pt-BR', { weekday: 'short' })
      const entry = map.get(day) || { leads: 0, sales: 0 }
      entry.sales += s.sales
      map.set(day, entry)
    })
    const dayOrder = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
    return dayOrder.map((d) => {
      const entry = Array.from(map.entries()).find(
        ([k]) => k.toLowerCase().startsWith(d)
      )
      return {
        name: entry ? entry[0] : d,
        leads: entry ? entry[1].leads : 0,
        conversoes: entry ? entry[1].sales : 0,
      }
    })
  })()

  const totalRevenue = revenueChartData.reduce((acc, d) => acc + d.receita, 0)

  if (loading && salesData.length === 0 && leadsData.length === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-5 h-80 flex items-center justify-center card-glow-premium">
            <Loader2 className="h-5 w-5 animate-spin text-[#666666]" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-5 card-glow-premium">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Receita</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">
                R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueChartData}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E50914" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#E50914" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="receita" stroke="#E50914" strokeWidth={2} fill="url(#revenueGrad)" name="Receita" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-5 card-glow-premium">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Conversões</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">
                {conversionChartData.reduce((acc, d) => acc + d.conversoes, 0)}
              </span>
              <span className="text-sm text-[#666666]">conversões</span>
            </div>
          </div>
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={conversionChartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="leads" fill="rgba(255,255,255,0.08)" radius={[4, 4, 0, 0]} name="Leads" />
              <Bar dataKey="conversoes" fill="#E50914" radius={[4, 4, 0, 0]} name="Conversões" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
