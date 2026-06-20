'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { Bot, ShoppingCart, Users, DollarSign, TrendingUp, Activity } from 'lucide-react'

export default function DashboardPage() {
  const { workspaceId } = useAuthStore()
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    if (workspaceId) {
      api.get(`/workspaces/${workspaceId}/analytics/overview`).then(setStats).catch(console.error)
    }
  }, [workspaceId])

  const cards = [
    {
      title: 'Total Leads',
      value: stats?.leads?.totalAll || 0,
      icon: Users,
      description: `${stats?.leads?.total || 0} in the last 30 days`,
    },
    {
      title: 'Sales',
      value: stats?.sales?.totalAll || 0,
      icon: ShoppingCart,
      description: `${stats?.sales?.total || 0} in the last 30 days`,
    },
    {
      title: 'Revenue',
      value: `R$ ${(stats?.revenue?.total || 0).toFixed(2)}`,
      icon: DollarSign,
      description: 'Total revenue',
    },
    {
      title: 'Conversion',
      value: `${stats?.conversionRate || 0}%`,
      icon: TrendingUp,
      description: 'Lead to sale conversion',
    },
    {
      title: 'Avg Ticket',
      value: `R$ ${(stats?.averageTicket || 0).toFixed(2)}`,
      icon: Activity,
      description: 'Average order value',
    },
    {
      title: 'Bots',
      value: '--',
      icon: Bot,
      description: 'Active Telegram bots',
    },
  ]

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
