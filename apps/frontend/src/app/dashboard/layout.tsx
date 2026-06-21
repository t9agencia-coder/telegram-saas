'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import { CommandPalette } from '@/components/dashboard/command-palette'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, isLoading, loadUser } = useAuthStore()
  const [commandOpen, setCommandOpen] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token) {
      router.push('/auth/login')
      return
    }
    loadUser()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0D0D0D]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E50914] flex items-center justify-center">
            <svg className="w-5 h-5 text-white animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-[#E50914]" />
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex min-h-screen bg-[#0D0D0D]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader onCommandPalette={() => setCommandOpen(true)} />
        <main className="flex-1 overflow-auto">
          <div className="p-6 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
      {commandOpen && <CommandPalette />}
    </div>
  )
}
