'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Bot,
  ShoppingCart,
  GitBranch,
  BarChart3,
  Plug,
  Settings,
  LogOut,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Bot, label: 'Bots', href: '/bots' },
  { icon: ShoppingCart, label: 'Products', href: '/products' },
  { icon: GitBranch, label: 'Flows', href: '/flows' },
  { icon: BarChart3, label: 'Analytics', href: '/analytics' },
  { icon: Plug, label: 'Integrations', href: '/integrations' },
  { icon: Settings, label: 'Settings', href: '/settings' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { logout } = useAuthStore()

  return (
    <aside className="w-64 border-r bg-card min-h-screen p-4 flex flex-col">
      <div className="mb-8 px-2">
        <h1 className="text-xl font-bold text-primary">Telegram SaaS</h1>
        <p className="text-xs text-muted-foreground mt-1">Bot Platform</p>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t pt-4">
        <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={logout}>
          <LogOut className="h-4 w-4 mr-3" />
          Sign Out
        </Button>
      </div>
    </aside>
  )
}
