'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { Loader2, TrendingUp, DollarSign, Users, ShoppingCart } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'

export default function AnalyticsPage() {
  const { workspaceId } = useAuthStore()
  const [overview, setOverview] = useState<any>(null)
  const [leadsByDay, setLeadsByDay] = useState<any[]>([])
  const [salesByDay, setSalesByDay] = useState<any[]>([])
  const [salesBySource, setSalesBySource] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspaceId) return

    Promise.all([
      api.get(`/workspaces/${workspaceId}/analytics/overview`),
      api.get(`/workspaces/${workspaceId}/analytics/leads`),
      api.get(`/workspaces/${workspaceId}/analytics/sales`),
      api.get(`/workspaces/${workspaceId}/analytics/sources`),
    ]).then(([ov, leads, sales, sources]) => {
      setOverview(ov)
      setLeadsByDay(leads)
      setSalesByDay(sales)
      setSalesBySource(sources)
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [workspaceId])

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

  const summaryCards = [
    { title: 'Total Leads', value: overview?.leads?.totalAll || 0, icon: Users, color: 'text-blue-500' },
    { title: 'Sales', value: overview?.sales?.totalAll || 0, icon: ShoppingCart, color: 'text-green-500' },
    { title: 'Revenue', value: `R$ ${(overview?.revenue?.total || 0).toFixed(2)}`, icon: DollarSign, color: 'text-yellow-500' },
    { title: 'Conversion', value: `${overview?.conversionRate || 0}%`, icon: TrendingUp, color: 'text-purple-500' },
  ]

  return (
    <div>
      <PageHeader title="Análises" description="Métricas e indicadores de performance" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Leads per Day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadsByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sales per Day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sales by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={salesBySource}
                    dataKey="sales"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ source, percent }) => `${source} ${(percent * 100).toFixed(0)}%`}
                  >
                    {salesBySource.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Source Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {salesBySource.map((source: any, index: number) => (
                <div key={source.source} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-sm font-medium capitalize">{source.source}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{source.sales} sales</p>
                    <p className="text-xs text-muted-foreground">R$ {source.revenue.toFixed(2)}</p>
                  </div>
                </div>
              ))}
              {salesBySource.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
