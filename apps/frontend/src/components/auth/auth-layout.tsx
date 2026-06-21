'use client'

import { cn } from '@/lib/utils'

interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen auth-gradient flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[420px] space-y-8 animate-slide-up">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#E50914] mb-4">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="text-sm text-[#B3B3B3]">{subtitle}</p>
        </div>
        <div className="auth-glow bg-[#161616] rounded-2xl border border-[#2A2A2A] p-6 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
