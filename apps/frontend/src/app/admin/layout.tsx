'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import {
  LayoutDashboard, Users, Bot, CreditCard,
  Shield, LogOut, ChevronRight, Activity, Megaphone, Globe, ArrowDownToLine, Wallet,
} from 'lucide-react'

const NAV = [
  { href: '/admin',               label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/admin/usuarios',      label: 'Usuários',        icon: Users },
  { href: '/admin/bots',          label: 'Bots',            icon: Bot },
  { href: '/admin/adquirentes',   label: 'Adquirentes',     icon: CreditCard },
  { href: '/admin/dominios',      label: 'Domínios',        icon: Globe },
  { href: '/admin/metricas',      label: 'Métricas',        icon: Activity },
  { href: '/admin/remarketing',   label: 'Remarketing',     icon: Megaphone },
  { href: '/admin/saque',         label: 'Saque',           icon: ArrowDownToLine },
  { href: '/admin/saldo-usuarios', label: 'Saldo Usuários', icon: Wallet },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { user, isLoading, loadUser, logout } = useAuthStore()

  useEffect(() => {
    loadUser().catch(() => router.replace('/auth/login'))
  }, [])

  useEffect(() => {
    if (!isLoading && user && user.role !== 'ADMIN') {
      router.replace('/dashboard')
    }
  }, [user, isLoading])

  if (isLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#080808]">
        <div className="w-8 h-8 border-2 border-[#E50914] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user.role !== 'ADMIN') return null

  return (
    <div className="flex h-screen bg-[#080808] text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col bg-[#141414] border-r border-white/[0.06]">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/[0.06]">
          <div className="w-8 h-8 rounded-[3px] bg-[#E50914] flex items-center justify-center">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Admin Panel</p>
            <p className="text-[10px] text-[#E50914] font-semibold uppercase tracking-wide">Master</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/admin' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-[4px] text-sm font-medium transition-all group ${
                  active
                    ? 'bg-[#E50914]/10 text-[#E50914] border border-[#E50914]/15'
                    : 'text-[#666] hover:text-white hover:bg-[#141414]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
                {active && <ChevronRight className="h-3 w-3 ml-auto opacity-50" />}
              </Link>
            )
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-[4px] bg-[#141414] border border-white/[0.06]">
            <div className="w-8 h-8 rounded-[3px] bg-[#E50914]/15 flex items-center justify-center shrink-0">
              <span className="text-[#E50914] text-xs font-bold">{user.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{user.name}</p>
              <p className="text-[10px] text-[#444] truncate">{user.email}</p>
            </div>
            <button
              onClick={() => { logout(); router.replace('/auth/login') }}
              className="text-[#444] hover:text-white transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
