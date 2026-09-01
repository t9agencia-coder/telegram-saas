'use client'

import { Eye, EyeOff } from 'lucide-react'
import { usePrivacyStore } from '@/store/privacy'

// Botão "olhinho" (igual apps de banco) pra ocultar valores sensíveis do
// dashboard — útil pra quem faz print/compartilha tela sem querer expor
// faturamento. Preferência persiste entre sessões (ver store/privacy.ts).
export function PrivacyToggle() {
  const { hidden, toggle } = usePrivacyStore()

  return (
    <button
      onClick={toggle}
      title={hidden ? 'Mostrar valores' : 'Ocultar valores'}
      className="w-7 h-7 flex items-center justify-center rounded-[3px] border border-white/[0.08] bg-[#1A1A1A] text-[#666666] hover:text-white hover:border-white/[0.15] transition-all duration-200 shrink-0"
    >
      {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </button>
  )
}
