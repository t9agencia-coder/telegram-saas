'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Webhook, Plus, Copy, Check, Trash2, Activity } from 'lucide-react'

const initialWebhooks = [
  { name: 'Notificar Vendas', url: 'https://hooks.slack.com/services/xxx', events: ['payment.approved'], active: true },
  { name: 'Novo Lead', url: 'https://webhook.example.com/lead', events: ['lead.created'], active: true },
  { name: 'Webhook UTMify', url: 'https://webhook.utmify.com.br/callback', events: ['lead.created', 'payment.approved'], active: false },
]

export default function WebhooksPage() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const copyUrl = (url: string, index: number) => {
    navigator.clipboard.writeText(url)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Webhooks" description="Notificações externas">
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Webhook
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4">
        {initialWebhooks.map((w, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-[3px] bg-[#E50914]/10 flex items-center justify-center">
                    <Webhook className="h-5 w-5 text-[#E50914]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white">{w.name}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        w.active ? 'bg-green-500/10 text-green-500' : 'bg-[#2A2A2A] text-[#666666]'
                      }`}>
                        {w.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <code className="text-xs text-[#666666] font-mono mt-1 block">{w.url}</code>
                    <div className="flex items-center gap-2 mt-2">
                      {w.events.map((e) => (
                        <span key={e} className="text-[10px] bg-[#2A2A2A] text-[#B3B3B3] px-2 py-0.5 rounded-full">{e}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => copyUrl(w.url, i)}>
                    {copiedIndex === i ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm"><Activity className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
