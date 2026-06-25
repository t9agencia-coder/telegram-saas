'use client'

import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Wrench, FileText, FileSpreadsheet, Image, Download, Shield, Key } from 'lucide-react'

const tools = [
  { name: 'Exportar Dados', description: 'Exporte leads e transações em CSV', icon: FileSpreadsheet, color: 'text-green-500' },
  { name: 'Gerar Relatórios', description: 'Crie relatórios personalizados', icon: FileText, color: 'text-blue-500' },
  { name: 'Compactar Imagens', description: 'Otimize imagens para seus bots', icon: Image, color: 'text-purple-500' },
  { name: 'Backup de Dados', description: 'Baixe backup completo do sistema', icon: Download, color: 'text-yellow-500' },
  { name: 'Gerenciar Chaves de API', description: 'Tokens e chaves de integração', icon: Key, color: 'text-red-500' },
  { name: 'Logs de Segurança', description: 'Histórico de acessos e ações', icon: Shield, color: 'text-cyan-500' },
]

export default function UtilitariosPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Ferramentas" description="Utilitários do sistema" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((t, i) => {
          const Icon = t.icon
          return (
            <Card key={i} className="group cursor-pointer hover:border-[#E50914]/50 transition-colors">
              <CardContent className="p-5">
                <div className={`w-10 h-10 rounded-[3px] bg-[#2A2A2A] flex items-center justify-center mb-3 ${t.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-medium text-white group-hover:text-[#E50914] transition-colors">{t.name}</h3>
                <p className="text-xs text-[#666666] mt-1">{t.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
