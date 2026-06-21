'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { AuthLayout } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const validateEmail = (value: string) => {
    if (!value) return 'O e-mail é obrigatório'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Insira um e-mail válido'
    return ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const err = validateEmail(email)
    if (err) {
      setFieldError(err)
      return
    }
    setFieldError('')
    setLoading(true)

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setSent(true)
    } catch {
      setError('Erro ao enviar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout title="E-mail enviado" subtitle="Verifique sua caixa de entrada">
        <div className="text-center space-y-6 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#22C55E]/10">
            <CheckCircle2 className="h-7 w-7 text-[#22C55E]" />
          </div>
          <div className="space-y-2">
            <p className="text-sm text-[#B3B3B3]">
              Enviamos um link de recuperação para <strong className="text-white">{email}</strong>.
            </p>
            <p className="text-sm text-[#666666]">
              Se você não receber o e-mail em alguns minutos, verifique a pasta de spam.
            </p>
          </div>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 text-sm text-[#E50914] hover:text-[#FF1F2D] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para o login
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Recuperar senha" subtitle="Digite seu e-mail para receber o link de recuperação">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2.5 text-sm text-[#EF4444] bg-[#EF4444]/10 rounded-xl px-4 py-3 animate-fade-in">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-[#B3B3B3]">
            E-mail
          </label>
          <input
            ref={emailRef}
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (fieldError) setFieldError(validateEmail(e.target.value))
            }}
            className={cn(
              'flex h-11 w-full rounded-xl border bg-[#1E1E1E] px-3 py-2 text-sm text-white',
              'placeholder:text-[#666666]',
              'focus-visible:outline-none focus-visible:border-[#E50914]/50 focus-visible:ring-1 focus-visible:ring-[#E50914]/20',
              'transition-all duration-200',
              fieldError ? 'border-[#EF4444]/50' : 'border-[#2A2A2A]'
            )}
            autoComplete="email"
          />
          {fieldError && (
            <p className="text-xs text-[#EF4444] mt-1 animate-fade-in">{fieldError}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-xl bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando...
            </span>
          ) : (
            'Enviar link de recuperação'
          )}
        </Button>

        <p className="text-center">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 text-sm text-[#B3B3B3] hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para o login
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
