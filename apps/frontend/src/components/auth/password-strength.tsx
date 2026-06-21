'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Check, X } from 'lucide-react'

interface PasswordStrengthProps {
  password: string
}

const requirements = [
  { label: '8+ caracteres', test: (pw: string) => pw.length >= 8 },
  { label: 'Letra maiúscula', test: (pw: string) => /[A-Z]/.test(pw) },
  { label: 'Letra minúscula', test: (pw: string) => /[a-z]/.test(pw) },
  { label: 'Número', test: (pw: string) => /[0-9]/.test(pw) },
  { label: 'Caractere especial', test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
]

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const checks = useMemo(
    () => requirements.map((r) => ({ ...r, passed: r.test(password) })),
    [password]
  )

  const strength = useMemo(() => {
    const passed = checks.filter((c) => c.passed).length
    if (passed === 0) return { label: '', pct: 0, color: '' }
    if (passed <= 2) return { label: 'Fraca', pct: 25, color: 'bg-[#EF4444]' }
    if (passed <= 3) return { label: 'Média', pct: 50, color: 'bg-[#F59E0B]' }
    if (passed === 4) return { label: 'Boa', pct: 75, color: 'bg-[#22C55E]' }
    return { label: 'Excelente', pct: 100, color: 'bg-[#22C55E]' }
  }, [checks])

  if (!password) return null

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-[#2A2A2A] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-300', strength.color)}
            style={{ width: `${strength.pct}%` }}
          />
        </div>
        {strength.label && (
          <span className="text-xs text-[#B3B3B3] min-w-[56px] text-right">{strength.label}</span>
        )}
      </div>
      <ul className="space-y-1.5">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2 text-xs">
            {check.passed ? (
              <Check className="h-3.5 w-3.5 text-[#22C55E]" />
            ) : (
              <X className="h-3.5 w-3.5 text-[#666666]" />
            )}
            <span className={cn(check.passed ? 'text-[#B3B3B3]' : 'text-[#666666]')}>
              {check.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
