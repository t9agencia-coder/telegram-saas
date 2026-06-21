'use client'

import { MetricsCard } from '@/components/dashboard/metrics-card'
import { DashboardCharts } from '@/components/dashboard/charts'
import { RecentTransactions } from '@/components/dashboard/recent-transactions'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { PageHeader } from '@/components/dashboard/page-header'
import { DollarSign, ShoppingCart, Users, TrendingUp, Wallet, Activity } from 'lucide-react'

export default function DashboardPage() {
  const metrics = [
    { title: 'Faturamento Hoje', value: 'R$ 3.847', change: 12.5, changeLabel: 'vs. ontem', icon: DollarSign },
    { title: 'Faturamento Mês', value: 'R$ 42.590', change: 8.2, changeLabel: 'vs. mês passado', icon: TrendingUp },
    { title: 'Pedidos', value: '156', change: -3.1, changeLabel: 'vs. mês passado', icon: ShoppingCart },
    { title: 'Conversão', value: '24,8%', change: 2.4, changeLabel: 'vs. mês passado', icon: Activity },
    { title: 'Ticket Médio', value: 'R$ 273', change: 5.7, changeLabel: 'vs. mês passado', icon: Wallet },
    { title: 'Saldo Disponível', value: 'R$ 38.250', change: 15.3, changeLabel: 'vs. mês passado', icon: Users },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Visão geral da sua plataforma" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {metrics.map((metric) => (
          <MetricsCard key={metric.title} {...metric} />
        ))}
      </div>

      <DashboardCharts />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <RecentTransactions />
        </div>
        <div>
          <ActivityFeed />
        </div>
      </div>
    </div>
  )
}
