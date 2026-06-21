'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AuthLayout } from '@/components/auth/auth-layout'
import { PasswordInput } from '@/components/auth/password-input'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const validateEmail = (value: string) => {
    if (!value) return 'O e-mail é obrigatório'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Insira um e-mail válido'
    return ''
  }

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setEmail(value)
    if (fieldErrors.email) {
      const err = validateEmail(value)
      setFieldErrors((prev) => ({ ...prev, email: err }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const emailErr = validateEmail(email)
    const passwordErr = !password ? 'A senha é obrigatória' : ''

    if (emailErr || passwordErr) {
      setFieldErrors({ email: emailErr, password: passwordErr })
      return
    }

    setFieldErrors({})
    setLoading(true)

    try {
      await login(email, password)
      setSuccess('Login realizado com sucesso!')
      setTimeout(() => router.push('/dashboard'), 400)
    } catch (err: any) {
      const msg = err.message
      if (msg?.includes('Unauthorized') || msg?.includes('401')) {
        setError('E-mail ou senha incorretos.')
      } else if (msg?.includes('not found')) {
        setError('Usuário não encontrado.')
      } else {
        setError(msg || 'Erro ao fazer login. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Bem-vindo de volta" subtitle="Entre na sua conta para continuar">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2.5 text-sm text-[#EF4444] bg-[#EF4444]/10 rounded-xl px-4 py-3 animate-fade-in">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2.5 text-sm text-[#22C55E] bg-[#22C55E]/10 rounded-xl px-4 py-3 animate-fade-in">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{success}</span>
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
            onChange={handleEmailChange}
            onBlur={() => {
              if (email) setFieldErrors((prev) => ({ ...prev, email: validateEmail(email) }))
            }}
            className={cn(
              'flex h-11 w-full rounded-xl border bg-[#1E1E1E] px-3 py-2 text-sm text-white',
              'placeholder:text-[#666666]',
              'focus-visible:outline-none focus-visible:border-[#E50914]/50 focus-visible:ring-1 focus-visible:ring-[#E50914]/20',
              'transition-all duration-200',
              fieldErrors.email ? 'border-[#EF4444]/50' : 'border-[#2A2A2A]'
            )}
            autoComplete="email"
          />
          {fieldErrors.email && (
            <p className="text-xs text-[#EF4444] mt-1 animate-fade-in">{fieldErrors.email}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-[#B3B3B3]">
            Senha
          </label>
          <PasswordInput
            id="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (fieldErrors.password && e.target.value) {
                setFieldErrors((prev) => ({ ...prev, password: '' }))
              }
            }}
            className={fieldErrors.password ? 'border-[#EF4444]/50' : ''}
            autoComplete="current-password"
          />
          {fieldErrors.password && (
            <p className="text-xs text-[#EF4444] mt-1 animate-fade-in">{fieldErrors.password}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="sr-only"
            />
            <div
              className={cn(
                'w-4 h-4 rounded border transition-colors duration-200 flex items-center justify-center',
                remember
                  ? 'bg-[#E50914] border-[#E50914]'
                  : 'border-[#2A2A2A] bg-[#1E1E1E] group-hover:border-[#666666]'
              )}
            >
              {remember && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className="text-sm text-[#B3B3B3] group-hover:text-white transition-colors">
              Lembrar de mim
            </span>
          </label>
          <Link
            href="/auth/forgot-password"
            className="text-sm text-[#B3B3B3] hover:text-[#E50914] transition-colors"
          >
            Esqueci minha senha
          </Link>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-xl bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Entrando...
            </span>
          ) : (
            'Entrar'
          )}
        </Button>

        <p className="text-center text-sm text-[#666666]">
          Não possui uma conta?{' '}
          <Link href="/auth/register" className="text-[#E50914] hover:text-[#FF1F2D] transition-colors font-medium">
            Criar conta
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
