'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { QrCode, Copy, Check, Loader2, ExternalLink } from 'lucide-react'

export default function PixPage() {
  const { workspaceId } = useAuthStore()
  const [config, setConfig] = useState<any>(null)
  const [apiKey, setApiKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    api.get(`/workspaces/${workspaceId}/pix/config`).then((data) => {
      if (data) {
        setConfig(data)
        setApiKey(data.apiKey || '')
        setWebhookSecret(data.webhookSecret || '')
        setIsActive(data.isActive)
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [workspaceId])

  const save = async () => {
    if (!workspaceId) return
    setSaving(true)
    try {
      await api.patch(`/workspaces/${workspaceId}/pix/config`, { apiKey, webhookSecret, isActive })
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const copyWebhook = () => {
    navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/webhooks/pix/${workspaceId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="space-y-6">
      <PageHeader title="Pagamentos PIX" description="Configuração de pagamentos via PIX" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-[#E50914]" />
                <CardTitle>Gateway PIX - BlackPay</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>API Key</Label>
                <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Sua chave de API" />
              </div>
              <div>
                <Label>Webhook Secret</Label>
                <Input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="Segredo do webhook" />
              </div>
              <div className="flex items-center justify-between">
                <Label>Gateway ativo</Label>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar Configuração
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Webhook</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-[#666666]">URL para notificações de pagamento PIX:</p>
              <code className="text-xs bg-[#0D0D0D] px-3 py-2 rounded block break-all border border-white/[0.06] text-[#B3B3B3]">
                {`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/webhooks/pix/${workspaceId}`}
              </code>
              <Button variant="outline" size="sm" className="w-full" onClick={copyWebhook}>
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? 'Copiado' : 'Copiar URL'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${config?.isActive ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-sm text-white">{config?.isActive ? 'Gateway ativo' : 'Gateway inativo'}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
