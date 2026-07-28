'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AuthLayout } from '@/components/auth/auth-layout'
import { PasswordInput } from '@/components/auth/password-input'
import { Recaptcha, type RecaptchaHandle } from '@/components/auth/recaptcha'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ''

type Step = 'credentials' | '2fa' | '2fa-setup'

export default function LoginPage() {
  const router = useRouter()
  const { login, verifyTwoFactor, confirmTwoFactorSetup } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const recaptchaRef = useRef<RecaptchaHandle>(null)
  const handleCaptchaChange = useCallback((token: string | null) => setCaptchaToken(token), [])

  const [step, setStep] = useState<Step>('credentials')
  const [ticket, setTicket] = useState('') // verifyToken ou setupToken
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const finishLogin = () => {
    setSuccess('Login realizado com sucesso!')
    const role = useAuthStore.getState().user?.role
    setTimeout(() => router.push(role === 'ADMIN' ? '/admin' : '/dashboard'), 400)
  }

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (code.length !== 6) {
      setError('Informe os 6 dígitos do código.')
      return
    }
    setLoading(true)
    try {
      if (step === '2fa-setup') {
        await confirmTwoFactorSetup(ticket, code)
      } else {
        await verifyTwoFactor(ticket, code)
      }
      finishLogin()
    } catch (err: any) {
      setError(err.message || 'Código incorreto. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

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

    if (RECAPTCHA_SITE_KEY && !captchaToken) {
      setError('Complete o captcha para continuar.')
      return
    }

    setFieldErrors({})
    setLoading(true)

    try {
      const data = await login(email, password, captchaToken)
      if ('twoFactorRequired' in data) {
        setTicket(data.verifyToken)
        setStep('2fa')
        return
      }
      if ('twoFactorSetupRequired' in data) {
        setTicket(data.setupToken)
        setQrCode(data.qrCode)
        setSecret(data.secret)
        setStep('2fa-setup')
        return
      }
      finishLogin()
    } catch (err: any) {
      const msg = err.message
      if (msg?.includes('EMAIL_NOT_VERIFIED')) {
        router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`)
        return
      } else if (msg?.includes('Unauthorized') || msg?.includes('401')) {
        setError('E-mail ou senha incorretos.')
      } else if (msg?.includes('not found')) {
        setError('Usuário não encontrado.')
      } else {
        setError(msg || 'Erro ao fazer login. Tente novamente.')
      }
      recaptchaRef.current?.reset()
      setCaptchaToken(null)
    } finally {
      setLoading(false)
    }
  }

  if (step === '2fa' || step === '2fa-setup') {
    return (
      <AuthLayout
        title={step === '2fa-setup' ? 'Ative a verificação em duas etapas' : 'Verificação em duas etapas'}
        subtitle={
          step === '2fa-setup'
            ? 'Escaneie o QR code com o Google Authenticator (ou app similar) e digite o código gerado'
            : 'Digite o código do seu app autenticador'
        }
      >
        <form onSubmit={handleTwoFactorSubmit} className="space-y-5">
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

          {step === '2fa-setup' && (
            <div className="flex flex-col items-center gap-3 py-2">
              <img src={qrCode} alt="QR code do 2FA" className="w-40 h-40 rounded-[4px] bg-white p-2" />
              <p className="text-xs text-[#666666] text-center">
                Não consegue escanear? Digite manualmente:
              </p>
              <code className="text-xs text-[#B3B3B3] bg-[#1A1A1A] border border-white/[0.08] rounded-[4px] px-3 py-1.5 tracking-wider">
                {secret}
              </code>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="code" className="text-sm font-medium text-[#B3B3B3]">
              Código de 6 dígitos
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="flex h-11 w-full rounded-[4px] border border-white/[0.08] bg-[#1A1A1A] px-3 py-2 text-center text-lg tracking-[0.5em] text-white placeholder:text-[#666666] focus-visible:outline-none focus-visible:border-[#E50914]/40 focus-visible:shadow-input-focus transition-all duration-200"
              autoComplete="one-time-code"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || code.length !== 6}
            className="          w-full h-11 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#E50914]/10 hover:shadow-[#E50914]/20"
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
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Bem-vindo de volta" subtitle="Entre na sua conta para continuar">
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
              'flex h-11 w-full rounded-[4px] border bg-[#1A1A1A] px-3 py-2 text-sm text-white',
              'placeholder:text-[#666666]',
              'focus-visible:outline-none focus-visible:border-[#E50914]/40 focus-visible:shadow-input-focus',
              'transition-all duration-200',
              fieldErrors.email ? 'border-[#EF4444]/50' : 'border-white/[0.08]'
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
                'w-4 h-4 rounded-[4px] border transition-colors duration-200 flex items-center justify-center',
                remember
                  ? 'bg-[#E50914] border-[#E50914]'
                  : 'border-white/[0.08] bg-[#1A1A1A] group-hover:border-white/[0.15]'
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

        {RECAPTCHA_SITE_KEY && (
          <div className="flex justify-center">
            <Recaptcha ref={recaptchaRef} siteKey={RECAPTCHA_SITE_KEY} onChange={handleCaptchaChange} />
          </div>
        )}

        <Button
          type="submit"
          disabled={loading || (!!RECAPTCHA_SITE_KEY && !captchaToken)}
          className="          w-full h-11 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] active:bg-[#B20710] text-white font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#E50914]/10 hover:shadow-[#E50914]/20"
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
