'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Download,
  FileText,
  Users,
  UserCheck,
  Settings,
  Plug,
  Webhook,
  User,
  ScrollText,
  Code,
  Shield,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bot,
  ShoppingCart,
  GitBranch,
  BarChart3,
  LucideIcon,
} from 'lucide-react'

type MenuItem = {
  icon: LucideIcon
  label: string
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
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { icon: TrendingUp, label: 'Transações', href: '/dashboard/transactions' },
      { icon: Wallet, label: 'Pagamentos', href: '/dashboard/payments' },
      { icon: Download, label: 'Saques', href: '/dashboard/withdrawals' },
      { icon: FileText, label: 'Extrato', href: '/dashboard/statements' },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { icon: Users, label: 'Usuários', href: '/dashboard/users' },
      { icon: UserCheck, label: 'Afiliados', href: '/dashboard/affiliates' },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { icon: Plug, label: 'Integrações', href: '/integrations' },
      { icon: Webhook, label: 'Webhooks', href: '/dashboard/webhooks' },
      { icon: User, label: 'Conta', href: '/settings' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { icon: Bot, label: 'Bots', href: '/bots' },
      { icon: ShoppingCart, label: 'Produtos', href: '/products' },
      { icon: GitBranch, label: 'Fluxos', href: '/flows' },
      { icon: BarChart3, label: 'Analytics', href: '/analytics' },
      { icon: ScrollText, label: 'Logs', href: '/dashboard/logs' },
      { icon: Shield, label: 'Segurança', href: '/dashboard/security' },
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
      <div className="flex items-center gap-3 px-4 h-16 border-b border-[#2A2A2A] shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#E50914] flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">Telegram SaaS</p>
            <p className="text-[10px] text-[#666666] truncate">Bot Platform</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-5">
        {menuGroups.map((group) => (
          <div key={group.label || 'main'}>
            {group.label && !collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                {group.label}
              </p>
            )}
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
                    {!collapsed && <span className="truncate">{item.label}</span>}
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
