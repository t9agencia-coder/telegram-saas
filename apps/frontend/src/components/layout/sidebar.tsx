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
  X,
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

interface SidebarProps {
  /** Controla o drawer no mobile (< md). Sem efeito em telas >= md. */
  mobileOpen?: boolean
  onClose?:    () => void
}

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Overlay — só no mobile, enquanto o drawer estiver aberto */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          // Mobile: drawer fixo, largura sempre cheia, escondido fora da tela por padrão
          'fixed inset-y-0 left-0 w-[240px] z-50 transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop (md+): comportamento de sempre — sticky, largura conforme collapsed, sempre visível
          'md:sticky md:top-0 md:translate-x-0 md:z-30 md:transition-[width]',
          collapsed ? 'md:w-[60px]' : 'md:w-[240px]',
          'h-screen flex flex-col bg-[#0D0D0D] border-r border-white/[0.06]',
        )}
      >
        <div className="flex items-center justify-between h-14 border-b border-white/[0.06] shrink-0 px-5">
          <div className={cn('flex items-center min-w-0', collapsed && 'md:justify-center md:w-full')}>
            <Image
              src="/logo.png" alt="FireBot" width={150} height={30}
              className={cn('object-contain', collapsed && 'md:hidden')}
              unoptimized
            />
            {collapsed && (
              <span className="hidden md:inline text-[#dc2626] font-black text-lg leading-none">F</span>
            )}
          </div>
          <button onClick={onClose} className="md:hidden text-white/40 hover:text-white transition-colors shrink-0">
            <X className="h-5 w-5" />
          </button>
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
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-[4px] text-sm font-medium transition-all duration-150',
                        active
                          ? 'bg-[#dc2626]/[0.1] text-[#dc2626]'
                          : 'text-white/45 hover:text-white hover:bg-white/[0.04]'
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className={cn('h-3.5 w-3.5 shrink-0 text-current opacity-80', active && 'text-[#dc2626] opacity-100')} />
                      <span className={cn('truncate', collapsed && 'md:hidden')}>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.06] p-2 space-y-0.5">
          {user && (
            <div className={cn('px-3 py-1.5 mb-1', collapsed && 'md:hidden')}>
              <p className="text-sm text-white/80 truncate font-medium">{user.name}</p>
              <p className="text-[11px] text-white/30 truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex items-center gap-2.5 w-full px-3 py-1.5 rounded-[4px] text-sm text-white/45 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5 mx-auto" /> : <><ChevronLeft className="h-3.5 w-3.5" /> Recolher</>}
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-[4px] text-sm text-white/45 hover:text-[#dc2626] hover:bg-[#dc2626]/[0.08] transition-colors"
            title={collapsed ? 'Sair' : undefined}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span className={cn(collapsed && 'md:hidden')}>Sair</span>
          </button>
        </div>
      </aside>
    </>
  )
}
