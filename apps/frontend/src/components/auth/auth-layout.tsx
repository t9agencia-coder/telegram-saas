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
        <div className="bg-[#141414] rounded-[4px] border border-white/[0.06] p-8 sm:p-10 card-glow-premium glow-border">
          <div className="flex flex-col items-center text-center mb-8">
            <Image src="/logo.png" alt="FireBot" width={240} height={48} className="mb-6 object-contain" unoptimized />
            <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
            <p className="text-sm text-[#B3B3B3] mt-1">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
