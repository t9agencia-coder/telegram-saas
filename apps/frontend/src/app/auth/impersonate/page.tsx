'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react'

function ImpersonateContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setError('Token ausente na URL.')
      return
    }

    api.post('/auth/impersonate', { token })
      .then((data: any) => {
        localStorage.setItem('accessToken',  data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)
        router.replace('/dashboard')
      })
      .catch((e: any) => {
        setError(e?.message || 'Token inválido ou expirado.')
      })
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center p-4">
        <div className="bg-[#141414] border border-[#E50914]/20 rounded-[4px] p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-[4px] bg-[#E50914]/10 flex items-center justify-center mx-auto">
            <AlertCircle className="h-6 w-6 text-[#E50914]" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg">Link inválido</h2>
            <p className="text-[#555] text-sm mt-1">{error}</p>
          </div>
          <button
            onClick={() => router.replace('/auth/login')}
            className="w-full px-4 py-2 text-sm text-white bg-[#E50914] hover:bg-[#c8010f] rounded-[3px] transition-colors font-semibold"
          >
            Ir para o login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center p-4">
      <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] p-8 max-w-sm w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-[4px] bg-[#3B82F6]/10 flex items-center justify-center mx-auto">
          <ShieldCheck className="h-6 w-6 text-[#3B82F6]" />
        </div>
        <div>
          <h2 className="text-white font-bold text-lg">Entrando na conta...</h2>
          <p className="text-[#555] text-sm mt-1">Validando token de acesso</p>
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-[#3B82F6] mx-auto" />
      </div>
    </div>
  )
}

export default function ImpersonatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#3B82F6]" />
      </div>
    }>
      <ImpersonateContent />
    </Suspense>
  )
}
