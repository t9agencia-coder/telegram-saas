'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Search,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Settings,
  Command,
  Menu,
} from 'lucide-react'

type PaymentStatus = 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REFUNDED' | 'CANCELLED' | 'EXPIRED'

interface Payment {
  id:        string
  amount:    string | number
  status:    PaymentStatus
  createdAt: string
}

const LAST_SEEN_KEY = 'pix_notifications_last_seen'

function formatBRL(amount: number): string {
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h atrás`
  return `${Math.floor(h / 24)} d atrás`
}

interface DashboardHeaderProps {
  onCommandPalette?: () => void
  onOpenMobileMenu?: () => void
}

export function DashboardHeader({ onCommandPalette, onOpenMobileMenu }: DashboardHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, workspaceId } = useAuthStore()
  const [searchFocused, setSearchFocused] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [payments, setPayments] = useState<Payment[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const profileRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const loadPayments = useCallback(async () => {
    if (!workspaceId) return
    try {
      const data = await api.get<Payment[]>(`/workspaces/${workspaceId}/payments`)
      // Só PIX gerado (pendente) ou pago (aprovado) — o resto (cancelado, expirado
      // etc.) não faz parte do que foi pedido pra esse mirror.
      const relevant = data.filter(p => p.status === 'PENDING' || p.status === 'APPROVED')
      setPayments(relevant.slice(0, 10))
      const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) || 0)
      setUnreadCount(relevant.filter(p => new Date(p.createdAt).getTime() > lastSeen).length)
    } catch {
      // silencioso — não deve travar o header
    }
  }, [workspaceId])

  useEffect(() => {
    loadPayments()
    const timer = setInterval(loadPayments, 30_000)
    return () => clearInterval(timer)
  }, [loadPayments])

  const openNotifications = () => {
    setNotificationsOpen(v => !v)
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()))
    setUnreadCount(0)
  }

  const getPageTitle = () => {
    if (pathname === '/dashboard') return 'Dashboard'
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length > 1) {
      const page = segments[1]
      return page.charAt(0).toUpperCase() + page.slice(1)
    }
    return 'Dashboard'
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Bom dia'
    if (hour < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  return (
    <header className="relative z-30 h-14 border-b border-white/[0.06] bg-[#0a0a0a]/95 backdrop-blur flex items-center justify-between px-4 sm:px-6 shrink-0">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden h-9 w-9 shrink-0 rounded-[3px] border border-white/[0.08] bg-[#141414] flex items-center justify-center text-white/45 hover:text-white transition-colors"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-medium text-white/95 truncate">{getPageTitle()}</h1>
          <p className="text-xs text-white/40 truncate">
            {getGreeting()}, {user?.name?.split(' ')[0] || 'usuário'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3.5">
        <button
          onClick={onCommandPalette}
          className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-[3px] border border-white/[0.08] bg-[#141414] text-sm text-white/45 hover:text-white hover:bg-[#141414] hover:border-white/[0.14] transition-all min-w-[220px] shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Pesquisar...</span>
          <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-white/35">
            <Command className="h-2.5 w-2.5 inline" />K
          </kbd>
        </button>

        <button
          className="sm:hidden h-9 w-9 rounded-[3px] border border-white/[0.08] bg-[#141414] flex items-center justify-center text-white/45 hover:text-white hover:border-white/[0.14] transition-all"
          onClick={onCommandPalette}
        >
          <Search className="h-4 w-4" />
        </button>

        <div className="relative" ref={notifRef}>
          <button
            onClick={openNotifications}
            className="h-9 w-9 rounded-[3px] border border-white/[0.08] bg-[#141414] flex items-center justify-center text-white/45 hover:text-white hover:bg-[#141414] hover:border-white/[0.14] transition-all relative"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#dc2626] text-[9px] font-bold text-white flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-[#141414] border border-white/[0.08] rounded-[4px] shadow-[0_12px_32px_rgba(0,0,0,0.35)] animate-scale-in overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <p className="text-sm font-medium text-white">Movimentações PIX</p>
              </div>
              <div className="max-h-72 overflow-y-auto scrollbar-thin">
                {payments.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-white/35">Nenhuma movimentação ainda</p>
                ) : (
                  payments.map((p) => {
                    const amount = typeof p.amount === 'string' ? parseFloat(p.amount) : p.amount
                    const isPaid = p.status === 'APPROVED'
                    return (
                      <div
                        key={p.id}
                        className="px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04] transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', isPaid ? 'bg-green-400' : 'bg-[#dc2626]')} />
                          <div>
                            <p className="text-sm text-white/90">
                              {isPaid ? 'PIX pago' : 'PIX gerado'} — {formatBRL(amount)}
                            </p>
                            <p className="text-xs text-white/35 mt-0.5">{relativeTime(p.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 h-9 px-2 rounded-[3px] hover:bg-[#141414] transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#E50914] flex items-center justify-center text-xs font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-[#666666]" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-[#141414] border border-white/[0.06] rounded-[4px] shadow-2xl animate-scale-in overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-[#666666] truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <button onClick={() => { setProfileOpen(false); router.push('/settings') }} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-[#B3B3B3] hover:text-white hover:bg-[#1A1A1A] transition-colors">
                  <User className="h-4 w-4" />
                  Meu Perfil
                </button>
                <button onClick={() => { setProfileOpen(false); router.push('/settings') }} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-[#B3B3B3] hover:text-white hover:bg-[#1A1A1A] transition-colors">
                  <Settings className="h-4 w-4" />
                  Configurações
                </button>
              </div>
              <div className="border-t border-white/[0.06] py-1">
                <button
                  onClick={logout}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-[#EF4444] hover:bg-[#EF4444]/5 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
