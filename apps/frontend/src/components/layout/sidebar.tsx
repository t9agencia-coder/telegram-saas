'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import {
  LayoutDashboard,
  Users,
  Bot,
  GitBranch,
  Link as LinkIcon,
  Megaphone,
  Receipt,
  Plug,
  Webhook,
  ChevronLeft,
  ChevronRight,
  LogOut,
  LucideIcon,
} from 'lucide-react'

type MenuItem = {
  icon: LucideIcon
  label: string
  href: string
}

type MenuGroup = {
  items: MenuItem[]
}

const menuGroups: MenuGroup[] = [
  {
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
      { icon: Users, label: 'Vendas', href: '/dashboard/vendas' },
      { icon: Bot, label: 'Bots', href: '/dashboard/automacoes/robos' },
      { icon: GitBranch, label: 'Fluxos', href: '/dashboard/automacoes/fluxos' },
    ],
  },
  {
    items: [
      { icon: LinkIcon, label: 'Cloak', href: '/dashboard/redirecionadores/links' },
      { icon: Megaphone, label: 'Remarketing', href: '/dashboard/remarketing/campanhas' },
    ],
  },
  {
    items: [
      { icon: Receipt, label: 'Financeiro', href: '/dashboard/financeiro/transacoes' },
      { icon: Plug, label: 'Tracking', href: '/dashboard/ferramentas/integracoes' },
      { icon: Webhook, label: 'Webhooks', href: '/dashboard/ferramentas/webhooks' },
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
        'h-screen sticky top-0 flex flex-col bg-[#0D0D0D] border-r border-white/[0.06] transition-all duration-300 z-30',
        collapsed ? 'w-[60px]' : 'w-[240px]'
      )}
    >
      <div className="flex items-center justify-center h-14 border-b border-white/[0.06] shrink-0 px-5">
        {collapsed ? (
          <span className="text-[#dc2626] font-black text-lg leading-none">F</span>
        ) : (
          <Image src="/logo.png" alt="FireBot" width={150} height={30} className="object-contain" unoptimized />
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-3">
        {menuGroups.map((group, gi) => (
          <div key={`g${gi}`} className={cn(gi > 0 && 'pt-2 border-t border-white/[0.05]')}>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-[4px] text-sm font-medium transition-all duration-150',
                      active
                        ? 'bg-[#dc2626]/[0.1] text-[#dc2626]'
                        : 'text-white/45 hover:text-white hover:bg-white/[0.04]'
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className={cn('h-3.5 w-3.5 shrink-0 text-current opacity-80', active && 'text-[#dc2626] opacity-100')} />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.06] p-2 space-y-0.5">
        {!collapsed && user && (
          <div className="px-3 py-1.5 mb-1">
            <p className="text-sm text-white/80 truncate font-medium">{user.name}</p>
            <p className="text-[11px] text-white/30 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-[4px] text-sm text-white/45 hover:text-white hover:bg-white/[0.04] transition-colors"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5 mx-auto" /> : <><ChevronLeft className="h-3.5 w-3.5" /> Recolher</>}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-[4px] text-sm text-white/45 hover:text-[#dc2626] hover:bg-[#dc2626]/[0.08] transition-colors"
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  )
}
