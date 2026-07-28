'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    grecaptcha?: {
      render: (container: HTMLElement, params: Record<string, unknown>) => number
      reset: (widgetId?: number) => void
    }
  }
}

export interface RecaptchaHandle {
  reset: () => void
}

interface RecaptchaProps {
  siteKey: string
  onChange: (token: string | null) => void
}

// Widget renderizado imperativamente via grecaptcha.render (em vez de deixar
// o script injetar o iframe direto num JSX declarativo) — evita o React tentar
// reconciliar/remover um nó que o script do Google manipula por fora dele.
export const Recaptcha = forwardRef<RecaptchaHandle, RecaptchaProps>(({ siteKey, onChange }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<number | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (window.grecaptcha && widgetIdRef.current !== null) {
        window.grecaptcha.reset(widgetIdRef.current)
        onChange(null)
      }
    },
  }))

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || widgetIdRef.current !== null) return

    const render = () => {
      if (!window.grecaptcha?.render || !containerRef.current) return
      widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (token: string) => onChange(token),
        'expired-callback': () => onChange(null),
        'error-callback': () => onChange(null),
      })
    }

    if (window.grecaptcha?.render) {
      render()
      return
    }
    // api.js às vezes dispara onLoad antes do runtime interno do grecaptcha existir.
    const interval = setInterval(() => {
      if (window.grecaptcha?.render) {
        clearInterval(interval)
        render()
      }
    }, 100)
    return () => clearInterval(interval)
  }, [scriptLoaded, siteKey, onChange])

  if (!siteKey) return null

  return (
    <>
      <Script
        src="https://www.google.com/recaptcha/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div ref={containerRef} />
    </>
  )
})
Recaptcha.displayName = 'Recaptcha'
