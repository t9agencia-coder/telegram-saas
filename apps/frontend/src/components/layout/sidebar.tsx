'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import {
  LayoutDashboard,
  BarChart3,
  Receipt,
  Users,
  BookOpen,
  Handshake,
  Bot,
  GitBranch,
  Link as LinkIcon,
  Megaphone,
  Wrench,
  Plug,
  QrCode,
  Activity,
  CreditCard,
  Webhook,
  ChevronLeft,
  ChevronRight,
  LogOut,
  LucideIcon,
} from 'lucide-react'

type MenuItem = {
  icon: LucideIcon
  label: string
  subtitle?: string
  href: string
}

type MenuGroup = {
  label: string
  items: MenuItem[]
}

const menuGroups: MenuGroup[] = [
  {
    label: '',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
      { icon: BarChart3, label: 'Análises', href: '/dashboard/analytics' },
    ],
  },
  {
    label: '',
    items: [
      { icon: Receipt, label: 'Financeiro', subtitle: 'Receitas e transações', href: '/dashboard/financeiro/transacoes' },
      { icon: Users, label: 'Clientes', subtitle: 'Base de leads', href: '/dashboard/clientes/leads' },
      { icon: BookOpen, label: 'Aulas', subtitle: 'Treinamentos e tutoriais', href: '/dashboard/aulas/tutoriais' },
      { icon: Handshake, label: 'Afiliado', subtitle: 'Comissões', href: '/dashboard/afiliado/comissoes' },
    ],
  },
  {
    label: 'Automações',
    items: [
      { icon: Bot, label: 'Meus Robôs', subtitle: 'Gerenciar bots', href: '/dashboard/automacoes/robos' },
      { icon: GitBranch, label: 'Meus Fluxos', subtitle: 'Fluxos de venda', href: '/dashboard/automacoes/fluxos' },
    ],
  },
  {
    label: '',
    items: [
      { icon: LinkIcon, label: 'Redirecionadores', subtitle: 'Links e cloaking', href: '/dashboard/redirecionadores/links' },
      { icon: Megaphone, label: 'Remarketing', subtitle: 'Campanhas', href: '/dashboard/remarketing/campanhas' },
    ],
  },
  {
    label: 'Ferramentas',
    items: [
      { icon: Wrench, label: 'Utilitários', href: '/dashboard/ferramentas/utilitarios' },
      { icon: Plug, label: 'Integrações', subtitle: 'Gateways', href: '/dashboard/ferramentas/integracoes' },
      { icon: QrCode, label: 'Pagamentos Pix', href: '/dashboard/ferramentas/pix' },
      { icon: Activity, label: 'Trackeamento', subtitle: 'Pixels e UTM', href: '/dashboard/ferramentas/tracking' },
      { icon: CreditCard, label: 'Checkout', subtitle: 'Página de pagamento', href: '/dashboard/ferramentas/checkout' },
      { icon: Webhook, label: 'Webhooks', subtitle: 'Notificações externas', href: '/dashboard/ferramentas/webhooks' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        'h-screen sticky top-0 flex flex-col bg-[#0D0D0D] border-r border-[#2A2A2A] transition-all duration-300 z-30',
        collapsed ? 'w-[60px]' : 'w-[240px]'
      )}
    >
      <div className="flex items-center justify-center px-4 h-20 border-b border-[#2A2A2A] shrink-0">
        <Image src="/logo.png" alt="FireBot" width={80} height={80} className="shrink-0" unoptimized />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-4">
        {menuGroups.map((group, gi) => (
          <div key={group.label || `g${gi}`}>
            {group.label && !collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                {group.label}
              </p>
            )}
            {collapsed && group.label && <div className="h-2" />}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group',
                      active
                        ? 'bg-[#E50914]/10 text-[#E50914]'
                        : 'text-[#666666] hover:text-white hover:bg-[#161616]'
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', active && 'text-[#E50914]')} />
                    {!collapsed && (
                      <div className="min-w-0 flex-1">
                        <span className="truncate block">{item.label}</span>
                        {item.subtitle && (
                          <span className="text-[11px] text-[#666666] truncate block leading-tight">
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[#2A2A2A] p-2 space-y-1">
        {!collapsed && user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-sm text-white truncate">{user.name}</p>
            <p className="text-[11px] text-[#666666] truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[#666666] hover:text-white hover:bg-[#161616] transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4 mx-auto" /> : <><ChevronLeft className="h-4 w-4" /> Recolher</>}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[#666666] hover:text-[#EF4444] hover:bg-[#EF4444]/5 transition-colors"
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  )
}
