'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AuthLayout } from '@/components/auth/auth-layout'
import { PasswordInput } from '@/components/auth/password-input'
import { PasswordStrength } from '@/components/auth/password-strength'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const validateEmail = (value: string) => {
    if (!value) return 'O e-mail é obrigatório'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Insira um e-mail válido'
    return ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = 'O nome é obrigatório'
    const emailErr = validateEmail(email)
    if (emailErr) errors.email = emailErr
    if (!password) errors.password = 'A senha é obrigatória'
    if (password !== confirmPassword) errors.confirmPassword = 'As senhas não conferem'

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setLoading(true)

    try {
      await register(name.trim(), email, password)
      setSuccess('Conta criada com sucesso!')
      setTimeout(() => router.push('/dashboard'), 400)
    } catch (err: any) {
      const msg = err.message
      if (msg?.includes('already exists') || msg?.includes('Unique constraint')) {
        setError('Este e-mail já está cadastrado.')
      } else {
        setError(msg || 'Erro ao criar conta. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  const inputClass = (field: string) =>
    cn(
      'flex h-11 w-full rounded-[4px] border bg-[#1A1A1A] px-3 py-2 text-sm text-white',
      'placeholder:text-[#666666]',
      'focus-visible:outline-none focus-visible:border-[#E50914]/50 focus-visible:ring-1 focus-visible:ring-[#E50914]/20',
      'transition-all duration-200',
      fieldErrors[field] ? 'border-[#EF4444]/50' : 'border-white/[0.06]'
    )

  return (
    <AuthLayout title="Criar conta" subtitle="Preencha os dados para se cadastrar">
      <form onSubmit={handleSubmit} className="space-y-5">
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
          <label htmlFor="name" className="text-sm font-medium text-[#B3B3B3]">
            Nome completo
          </label>
          <input
            ref={nameRef}
            id="name"
            type="text"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass('name')}
            autoComplete="name"
          />
          {fieldErrors.name && (
            <p className="text-xs text-[#EF4444] mt-1 animate-fade-in">{fieldErrors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-[#B3B3B3]">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass('email')}
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
            onChange={(e) => setPassword(e.target.value)}
            className={fieldErrors.password ? 'border-[#EF4444]/50' : ''}
            autoComplete="new-password"
          />
          {fieldErrors.password && (
            <p className="text-xs text-[#EF4444] mt-1 animate-fade-in">{fieldErrors.password}</p>
          )}
          <PasswordStrength password={password} />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-[#B3B3B3]">
            Confirmar senha
          </label>
          <PasswordInput
            id="confirmPassword"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={fieldErrors.confirmPassword ? 'border-[#EF4444]/50' : ''}
            autoComplete="new-password"
          />
          {fieldErrors.confirmPassword && (
            <p className="text-xs text-[#EF4444] mt-1 animate-fade-in">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Criando conta...
            </span>
          ) : (
            'Criar conta'
          )}
        </Button>

        <p className="text-center text-sm text-[#666666]">
          Já possui uma conta?{' '}
          <Link href="/auth/login" className="text-[#E50914] hover:text-[#FF1F2D] transition-colors font-medium">
            Entrar
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
