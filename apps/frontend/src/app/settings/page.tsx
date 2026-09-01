'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Página movida pra dentro do layout do dashboard (com sidebar/header) em
// /dashboard/configuracoes — mantido aqui só como redirect pra não quebrar
// bookmarks/links antigos que ainda apontem pra /settings.
export default function SettingsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/dashboard/configuracoes') }, [router])
  return null
}
