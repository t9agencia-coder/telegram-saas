'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Activity, Copy, Check } from 'lucide-react'

export default function TrackingPage() {
  const [copied, setCopied] = useState(false)

  const pixelCode = `<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', 'SEU_PIXEL_ID');
  fbq('track', 'PageView');
</script>`

  const copyCode = () => {
    navigator.clipboard.writeText(pixelCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Trackeamento" description="Pixels e UTM" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#E50914]" />
              <CardTitle>Facebook Pixel</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Pixel ID</Label>
              <Input placeholder="1234567890" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Pixel ativo</Label>
              <Switch defaultChecked />
            </div>
            <Button variant="outline" size="sm" onClick={copyCode}>
              {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
              {copied ? 'Copiado' : 'Copiar código do Pixel'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              <CardTitle>Parâmetros UTM</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>UTM Source (origem)</Label>
              <Input placeholder="google, facebook, instagram" />
            </div>
            <div>
              <Label>UTM Medium (meio)</Label>
              <Input placeholder="cpc, social, email" />
            </div>
            <div>
              <Label>UTM Campaign (campanha)</Label>
              <Input placeholder="nome-da-campanha" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Captura automática de UTM</Label>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
