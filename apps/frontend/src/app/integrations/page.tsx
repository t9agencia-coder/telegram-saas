'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { Facebook, Loader2, Check, X } from 'lucide-react'

export default function IntegrationsPage() {
  const { workspaceId } = useAuthStore()

  return (
    <div>
      <PageHeader title="Integrações" description="Conecte suas ferramentas de marketing e pagamento" />

      <Tabs defaultValue="facebook" className="space-y-6">
        <TabsList>
          <TabsTrigger value="facebook">Facebook Ads</TabsTrigger>
          <TabsTrigger value="kwai">Kwai Ads</TabsTrigger>
          <TabsTrigger value="utmify">UTMify</TabsTrigger>
          <TabsTrigger value="pix">PIX Gateway</TabsTrigger>
        </TabsList>

        <TabsContent value="facebook">
          <FacebookIntegration workspaceId={workspaceId!} />
        </TabsContent>
        <TabsContent value="kwai">
          <KwaiIntegration workspaceId={workspaceId!} />
        </TabsContent>
        <TabsContent value="utmify">
          <UtmifyIntegration workspaceId={workspaceId!} />
        </TabsContent>
        <TabsContent value="pix">
          <PixIntegration workspaceId={workspaceId!} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function FacebookIntegration({ workspaceId }: { workspaceId: string }) {
  const [config, setConfig] = useState<any>(null)
  const [pixelId, setPixelId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get(`/workspaces/${workspaceId}/facebook/config`).then((data) => {
      if (data) {
        setConfig(data)
        setPixelId(data.pixelId || '')
        setIsActive(data.isActive)
      }
    }).finally(() => setLoading(false))
  }, [workspaceId])

  const save = async () => {
    setSaving(true)
    await api.patch(`/workspaces/${workspaceId}/facebook/config`, {
      pixelId,
      accessToken,
      isActive,
    })
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Facebook className="h-5 w-5 text-blue-600" />
          <CardTitle>Facebook Ads Conversion API</CardTitle>
        </div>
        <CardDescription>
          Connect your Facebook Pixel to track conversions and send events
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Pixel ID</Label>
          <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="1234567890" />
        </div>
        <div>
          <Label>Access Token</Label>
          <Input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="EAAB..." />
        </div>
        <div className="flex items-center justify-between">
          <Label>Active</Label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  )
}

function KwaiIntegration({ workspaceId }: { workspaceId: string }) {
  const [advertiserId, setAdvertiserId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get(`/workspaces/${workspaceId}/kwai/config`).then((data) => {
      if (data) {
        setAdvertiserId(data.advertiserId || '')
        setIsActive(data.isActive)
      }
    }).finally(() => setLoading(false))
  }, [workspaceId])

  const save = async () => {
    setSaving(true)
    await api.patch(`/workspaces/${workspaceId}/kwai/config`, { advertiserId, accessToken, isActive })
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kwai Ads Conversion API</CardTitle>
        <CardDescription>Connect your Kwai Ads account to track conversions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Advertiser ID</Label>
          <Input value={advertiserId} onChange={(e) => setAdvertiserId(e.target.value)} />
        </div>
        <div>
          <Label>Access Token</Label>
          <Input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Active</Label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  )
}

function UtmifyIntegration({ workspaceId }: { workspaceId: string }) {
  const [apiKey, setApiKey] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get(`/workspaces/${workspaceId}/utmify/config`).then((data) => {
      if (data) {
        setWebhookUrl(data.webhookUrl || '')
        setIsActive(data.isActive)
      }
    }).finally(() => setLoading(false))
  }, [workspaceId])

  const save = async () => {
    setSaving(true)
    await api.patch(`/workspaces/${workspaceId}/utmify/config`, { apiKey, webhookUrl, isActive })
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>UTMify</CardTitle>
        <CardDescription>Integrate with UTMify for advanced UTM tracking</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>API Key</Label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>
        <div>
          <Label>Webhook URL</Label>
          <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://webhook.utmify.com.br/..." />
        </div>
        <div className="flex items-center justify-between">
          <Label>Active</Label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  )
}

function PixIntegration({ workspaceId }: { workspaceId: string }) {
  const [apiKey, setApiKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get(`/workspaces/${workspaceId}/pix/config`).then((data) => {
      if (data) {
        setIsActive(data.isActive)
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [workspaceId])

  const save = async () => {
    setSaving(true)
    await api.patch(`/workspaces/${workspaceId}/pix/config`, { apiKey, webhookSecret, isActive })
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>PIX Gateway - BlackPay</CardTitle>
        <CardDescription>Configure your PIX payment gateway (BlackPay)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>API Key</Label>
          <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>
        <div>
          <Label>Webhook Secret</Label>
          <Input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Active</Label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Configuration
        </Button>

        <div className="mt-6 p-4 bg-muted rounded-[3px]">
          <p className="text-sm font-medium mb-2">Webhook URL for PIX notifications:</p>
          <code className="text-xs bg-background p-2 rounded block break-all">
            {`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/webhooks/pix/${workspaceId}`}
          </code>
        </div>
      </CardContent>
    </Card>
  )
}
