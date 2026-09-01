'use client'

import { useEffect } from 'react'

// Registra o service worker do PWA em toda a aplicação (não só no dashboard) —
// isolado num componente próprio pra não acoplar a lógica de registro a nenhuma
// tela específica. Não faz nada além de registrar; o fluxo de pedir permissão e
// assinar push fica em InstallPushBanner (montado só no dashboard).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Falha de registro (ex: navegador sem suporte, contexto não-seguro em dev
      // via IP) nunca deve quebrar o resto da aplicação — só o PWA fica inativo.
    })
  }, [])

  return null
}
