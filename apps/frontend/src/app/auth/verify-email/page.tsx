'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthLayout } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from 'lucide-react'

const RESEND_COOLDOWN_S = 60

function VerifyEmailForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { verifyEmail, resendVerification } = useAuthStore()
  const email = searchParams.get('email') || ''

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    codeRef.current?.focus()
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!email) {
      setError('E-mail não informado. Volte e refaça o cadastro.')
      return
    }
    if (code.length !== 6) {
      setError('Digite o código de 6 dígitos enviado ao seu e-mail.')
      return
    }

    setLoading(true)
    try {
      await verifyEmail(email, code)
      setSuccess('E-mail confirmado!')
      setTimeout(() => router.push('/dashboard'), 400)
    } catch (err: any) {
      const msg = err.message
      if (msg?.includes('expirado')) setError('Código expirado. Peça um novo abaixo.')
      else if (msg?.includes('incorreto')) setError('Código incorreto. Confira e tente de novo.')
      else if (msg?.includes('tentativas')) setError('Muitas tentativas incorretas. Peça um novo código.')
      else setError(msg || 'Não foi possível confirmar o código. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email || cooldown > 0) return
    setError('')
    setSuccess('')
    setResending(true)
    try {
      await resendVerification(email)
      setSuccess('Novo código enviado.')
      setCooldown(RESEND_COOLDOWN_S)
    } catch (err: any) {
      setError(err.message || 'Não foi possível reenviar o código.')
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout
      title="Confirme seu e-mail"
      subtitle={email ? `Enviamos um código para ${email}` : 'Enviamos um código de 6 dígitos para seu e-mail'}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex justify-center text-[#E50914]">
          <MailCheck className="h-10 w-10" />
        </div>

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-[#EF4444] bg-[#EF4444]/10 rounded-[4px] px-4 py-3 animate-fade-in">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2.5 text-sm text-[#22C55E] bg-[#22C55E]/10 rounded-[4px] px-4 py-3 animate-fade-in">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="code" className="text-sm font-medium text-[#B3B3B3]">
            Código de verificação
          </label>
          <input
            ref={codeRef}
            id="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={cn(
              'flex h-14 w-full rounded-[4px] border bg-[#1A1A1A] px-3 py-2 text-center text-2xl tracking-[0.5em] text-white',
              'placeholder:text-[#666666] placeholder:tracking-[0.5em]',
              'focus-visible:outline-none focus-visible:border-[#E50914]/40 focus-visible:shadow-input-focus',
              'transition-all duration-200 border-white/[0.08]',
            )}
            autoComplete="one-time-code"
          />
        </div>

        <Button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full h-11 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Confirmando...
            </span>
          ) : (
            'Confirmar'
          )}
        </Button>

        <p className="text-center text-sm text-[#666666]">
          Não recebeu?{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="text-[#E50914] hover:text-[#FF1F2D] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-[#E50914]"
          >
            {cooldown > 0 ? `Reenviar em ${cooldown}s` : resending ? 'Enviando...' : 'Reenviar código'}
          </button>
        </p>

        <p className="text-center text-sm text-[#666666]">
          <Link href="/auth/login" className="text-[#B3B3B3] hover:text-white transition-colors">
            Voltar para o login
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  )
}
