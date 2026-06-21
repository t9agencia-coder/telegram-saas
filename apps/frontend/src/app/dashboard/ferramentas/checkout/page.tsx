'use client'

import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CreditCard, Eye, ExternalLink } from 'lucide-react'

export default function CheckoutPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Checkout" description="Página de pagamento">
        <Button variant="outline" size="sm">
          <Eye className="h-4 w-4 mr-1" />
          Visualizar
        </Button>
        <Button size="sm">
          <ExternalLink className="h-4 w-4 mr-1" />
          Abrir Página
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#E50914]" />
                <CardTitle>Configuração da Página</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nome da Página</Label>
                <Input placeholder="Página de Pagamento" defaultValue="Checkout Oficial" />
              </div>
              <div>
                <Label>Slug (URL)</Label>
                <Input placeholder="checkout" defaultValue="checkoficial" className="font-mono" />
              </div>
              <div>
                <Label>Cor Primária</Label>
                <div className="flex items-center gap-2">
                  <Input placeholder="#E50914" defaultValue="#E50914" className="w-32 font-mono" />
                  <div className="w-8 h-8 rounded-md bg-[#E50914] border border-[#2A2A2A]" />
                </div>
              </div>
              <div>
                <Label>Logo URL</Label>
                <Input placeholder="https://seudominio.com/logo.png" />
              </div>
              <div className="flex items-center justify-between">
                <Label>Página ativa</Label>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Métodos de Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white">PIX</span>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white">Cartão de Crédito</span>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white">Boleto</span>
                <Switch />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm text-white">Online</span>
              </div>
              <p className="text-xs text-[#666666] mt-1">Última atualização: há 2 minutos</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
