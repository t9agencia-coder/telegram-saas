'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import {
  Search,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Settings,
  Command,
} from 'lucide-react'

interface DashboardHeaderProps {
  onCommandPalette?: () => void
}

export function DashboardHeader({ onCommandPalette }: DashboardHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [searchFocused, setSearchFocused] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
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

  const notifications = [
    { id: 1, text: 'Novo pagamento recebido - R$ 197,00', time: '2 min atrás', unread: true },
    { id: 2, text: 'Bot "@meubot" está offline', time: '15 min atrás', unread: true },
    { id: 3, text: 'Meta de vendas da semana atingida', time: '1 h atrás', unread: false },
  ]

  return (
    <header className="h-16 border-b border-[#2A2A2A] bg-[#0D0D0D] flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white">{getPageTitle()}</h1>
          <p className="text-xs text-[#666666]">
            {getGreeting()}, {user?.name?.split(' ')[0] || 'usuário'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onCommandPalette}
          className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-lg border border-[#2A2A2A] bg-[#161616] text-sm text-[#666666] hover:text-white hover:border-[#666666] transition-all min-w-[200px]"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Pesquisar...</span>
          <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[#1E1E1E] border border-[#2A2A2A] text-[#666666]">
            <Command className="h-2.5 w-2.5 inline" />K
          </kbd>
        </button>

        <button
          className="sm:hidden h-9 w-9 rounded-lg border border-[#2A2A2A] bg-[#161616] flex items-center justify-center text-[#666666] hover:text-white hover:border-[#666666] transition-all"
          onClick={onCommandPalette}
        >
          <Search className="h-4 w-4" />
        </button>

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="h-9 w-9 rounded-lg border border-[#2A2A2A] bg-[#161616] flex items-center justify-center text-[#666666] hover:text-white hover:border-[#666666] transition-all relative"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#E50914] text-[9px] font-bold text-white flex items-center justify-center">
              2
            </span>
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-[#161616] border border-[#2A2A2A] rounded-xl shadow-2xl animate-scale-in overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2A2A2A]">
                <p className="text-sm font-medium text-white">Notificações</p>
              </div>
              <div className="max-h-72 overflow-y-auto scrollbar-thin">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'px-4 py-3 border-b border-[#2A2A2A]/50 last:border-0 hover:bg-[#1E1E1E] transition-colors cursor-pointer',
                      n.unread && 'bg-[#E50914]/[0.02]'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', n.unread ? 'bg-[#E50914]' : 'bg-[#2A2A2A]')} />
                      <div>
                        <p className="text-sm text-white">{n.text}</p>
                        <p className="text-xs text-[#666666] mt-0.5">{n.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 h-9 px-2 rounded-lg hover:bg-[#161616] transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#E50914] flex items-center justify-center text-xs font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-[#666666]" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-[#161616] border border-[#2A2A2A] rounded-xl shadow-2xl animate-scale-in overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2A2A2A]">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-[#666666] truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <button onClick={() => { setProfileOpen(false); router.push('/settings') }} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-[#B3B3B3] hover:text-white hover:bg-[#1E1E1E] transition-colors">
                  <User className="h-4 w-4" />
                  Meu Perfil
                </button>
                <button onClick={() => { setProfileOpen(false); router.push('/settings') }} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-[#B3B3B3] hover:text-white hover:bg-[#1E1E1E] transition-colors">
                  <Settings className="h-4 w-4" />
                  Configurações
                </button>
              </div>
              <div className="border-t border-[#2A2A2A] py-1">
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
