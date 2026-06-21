'use client'

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Area, AreaChart,
} from 'recharts'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

const revenueData = [
  { name: 'Jan', receita: 4200, custo: 1200 },
  { name: 'Fev', receita: 5800, custo: 1500 },
  { name: 'Mar', receita: 7200, custo: 1800 },
  { name: 'Abr', receita: 6100, custo: 1400 },
  { name: 'Mai', receita: 8900, custo: 2000 },
  { name: 'Jun', receita: 10300, custo: 2200 },
]

const conversionData = [
  { name: 'Seg', leads: 45, conversoes: 12 },
  { name: 'Ter', leads: 52, conversoes: 15 },
  { name: 'Qua', leads: 38, conversoes: 9 },
  { name: 'Qui', leads: 61, conversoes: 18 },
  { name: 'Sex', leads: 55, conversoes: 14 },
  { name: 'Sáb', leads: 42, conversoes: 11 },
  { name: 'Dom', leads: 28, conversoes: 6 },
]

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
            {p.name === 'Receita' || p.name === 'Custo'
              ? `R$ ${p.value.toLocaleString('pt-BR')}`
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const periodOptions = ['7 dias', '30 dias', '90 dias', '12 meses']

export function DashboardCharts() {
  const [revenuePeriod, setRevenuePeriod] = useState('12 meses')
  const [conversionPeriod, setConversionPeriod] = useState('7 dias')

  const totalRevenue = revenueData.reduce((acc, d) => acc + d.receita, 0)
  const prevRevenue = 28900
  const revenueChange = ((totalRevenue - prevRevenue) / prevRevenue * 100).toFixed(1)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Receita</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">R$ {totalRevenue.toLocaleString('pt-BR')}</span>
              <div className="flex items-center gap-0.5 text-xs font-medium text-[#22C55E] bg-[#22C55E]/10 px-1.5 py-0.5 rounded-md">
                <TrendingUp className="h-3 w-3" />
                <span>+{revenueChange}%</span>
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            {periodOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setRevenuePeriod(opt)}
                className={cn(
                  'px-2 py-1 rounded-md text-[10px] font-medium transition-colors',
                  revenuePeriod === opt
                    ? 'bg-[#E50914]/10 text-[#E50914]'
                    : 'text-[#666666] hover:text-white hover:bg-[#1E1E1E]'
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E50914" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#E50914" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" strokeOpacity={0.5} />
              <XAxis dataKey="name" tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="receita" stroke="#E50914" strokeWidth={2} fill="url(#revenueGrad)" name="Receita" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Conversões</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">85</span>
              <span className="text-sm text-[#666666]">conversões</span>
              <div className="flex items-center gap-0.5 text-xs font-medium text-[#22C55E] bg-[#22C55E]/10 px-1.5 py-0.5 rounded-md">
                <TrendingUp className="h-3 w-3" />
                <span>+12.3%</span>
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            {periodOptions.slice(0, 3).map((opt) => (
              <button
                key={opt}
                onClick={() => setConversionPeriod(opt)}
                className={cn(
                  'px-2 py-1 rounded-md text-[10px] font-medium transition-colors',
                  conversionPeriod === opt
                    ? 'bg-[#E50914]/10 text-[#E50914]'
                    : 'text-[#666666] hover:text-white hover:bg-[#1E1E1E]'
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={conversionData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" strokeOpacity={0.5} />
              <XAxis dataKey="name" tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666666', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="leads" fill="#2A2A2A" radius={[4, 4, 0, 0]} name="Leads" />
              <Bar dataKey="conversoes" fill="#E50914" radius={[4, 4, 0, 0]} name="Conversões" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
