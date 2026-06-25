'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { Bot, Plus, Check, X, Loader2, ExternalLink } from 'lucide-react'

export default function BotsPage() {
  const { workspaceId } = useAuthStore()
  const [bots, setBots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [token, setToken] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const loadBots = async () => {
    if (!workspaceId) return
    try {
      const data = await api.get(`/workspaces/${workspaceId}/bots`)
      setBots(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBots() }, [workspaceId])

  const addBot = async () => {
    if (!workspaceId || !token) return
    setAdding(true)
    setError('')
    try {
      await api.post(`/workspaces/${workspaceId}/bots`, { botToken: token })
      setToken('')
      setShowAddForm(false)
      loadBots()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  const testBot = async (id: string) => {
    if (!workspaceId) return
    try {
      await api.post(`/workspaces/${workspaceId}/bots/${id}/test`)
      loadBots()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const deleteBot = async (id: string) => {
    if (!workspaceId) return
    if (!confirm('Remove this bot?')) return
    await api.delete(`/workspaces/${workspaceId}/bots/${id}`)
    loadBots()
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div>
      <PageHeader title="Bots" description="Gerencie seus bots do Telegram">
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Conectar Bot
        </Button>
      </PageHeader>

      {showAddForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Connect your Telegram Bot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  1. Create a bot on Telegram via <strong>@BotFather</strong>
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  2. Copy the bot token and paste it below
                </p>
              </div>
              {error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>}
              <div className="flex gap-4">
                <Input
                  placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="font-mono"
                />
                <Button onClick={addBot} disabled={!token || adding}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {bots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No bots connected yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bots.map((bot: any) => (
            <Card key={bot.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">@{bot.username}</CardTitle>
                </div>
                {bot.isActive ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Added {new Date(bot.createdAt).toLocaleDateString()}
                </p>
                <p className="text-xs mb-3">
                  Status: <span className={`font-semibold ${bot.status === 'ACTIVE' ? 'text-green-500' : bot.status === 'PENDING_REVIEW' ? 'text-amber-500' : 'text-red-500'}`}>{bot.status}</span>
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={`https://t.me/${bot.username}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open Bot
                    </a>
                  </Button>
                  {bot.status !== 'ACTIVE' && (
                    <Button variant="outline" size="sm" onClick={() => testBot(bot.id)}>
                      Testar
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={() => deleteBot(bot.id)}>
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
