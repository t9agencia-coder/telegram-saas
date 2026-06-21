'use client'

import Image from 'next/image'

interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen auth-gradient flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[420px] animate-slide-up">
        <div className="auth-glow bg-[#161616] rounded-2xl border border-[#2A2A2A] p-8 sm:p-10">
          <div className="flex flex-col items-center text-center mb-8">
            <Image src="/logo.png" alt="FireBot" width={210} height={210} className="mb-6" unoptimized />
            <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
            <p className="text-sm text-[#B3B3B3] mt-1">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
