'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { usePushBannerStore } from '@/store/push'
import { isPushSupported, isIOS, isStandalone, getActiveSubscription, subscribeToPush } from '@/lib/push'
import { Download, Bell, X, Share, Loader2, CheckCircle2 } from 'lucide-react'

type Step = 'install' | 'enable-notifications' | 'ios-instructions' | null

// Aparece uma vez (com cooldown de 7 dias se dispensado) pra instalar o PWA e/ou
// ativar notificações push. Nunca chama beforeinstallprompt/PushManager sem antes
// confirmar suporte — evita erro silencioso em navegadores que não têm essas APIs.
export function InstallPushBanner() {
  const { workspaceId } = useAuthStore()
  const { isDismissed, dismiss } = usePushBannerStore()
  const [step, setStep] = useState<Step>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (isDismissed() || !workspaceId) return

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      if (!isStandalone()) setStep('install')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

    // Pequeno atraso antes de decidir o fallback: dá tempo do beforeinstallprompt
    // chegar primeiro (dispara logo após o load em navegadores elegíveis), pra não
    // mostrar "Ativar notificações" e um instante depois trocar pra "Instalar".
    const timer = setTimeout(checkState, 600)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      clearTimeout(timer)
    }
  }, [workspaceId])

  async function checkState() {
    // Checagem de iOS vem ANTES de isPushSupported() de propósito: no iOS,
    // PushManager só existe DEPOIS do site já estar instalado na Tela de Início
    // (independente do navegador — Safari, Chrome, qualquer um no iOS usa o
    // motor da Apple e tem essa mesma limitação). Checar suporte primeiro faria
    // isPushSupported() sempre retornar false aqui e o banner nunca chegaria a
    // mostrar a instrução de instalar — é exatamente essa ordem que causava a
    // mensagem enganosa de "navegador não suporta" no Safari/Chrome do iPhone.
    if (isIOS() && !isStandalone()) {
      setStep('ios-instructions')
      return
    }

    if (!isPushSupported()) return // navegador realmente sem suporte (ex: iOS < 16.4 mesmo instalado)

    const subscription = await getActiveSubscription().catch(() => null)
    if (subscription && Notification.permission === 'granted') return // já tudo certo

    // beforeinstallprompt já tratado pelo próprio listener (que muda o step direto);
    // aqui só cobre quem não recebeu o evento (já instalado, ou navegador sem
    // suporte a ele como Firefox/Safari desktop) — pula direto pra notificações.
    setStep((current) => current ?? 'enable-notifications')
  }

  const handleInstall = async () => {
    if (!deferredPrompt) { setStep('enable-notifications'); return }
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (outcome === 'accepted') {
      setStep('enable-notifications')
    } else {
      dismiss()
      setStep(null)
    }
  }

  const handleEnableNotifications = async () => {
    if (!workspaceId) return
    setBusy(true)
    try {
      await subscribeToPush(workspaceId)
      setDone(true)
      setTimeout(() => setStep(null), 2000)
    } catch {
      // usuário negou a permissão, ou navegador bloqueou — não insiste, só fecha
      dismiss()
      setStep(null)
    } finally {
      setBusy(false)
    }
  }

  const handleDismiss = () => {
    dismiss()
    setStep(null)
  }

  if (!step) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md pointer-events-none">
      <div className="pointer-events-auto rounded-[6px] border border-white/[0.08] bg-[#141414]/97 backdrop-blur shadow-[0_16px_40px_rgba(0,0,0,0.45)] p-4 animate-scale-in">
        {done ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-[#22C55E] shrink-0" />
            <p className="text-sm text-white font-medium">Notificações ativadas!</p>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-[4px] flex items-center justify-center shrink-0"
              style={{ background: 'rgba(229,9,20,0.12)' }}
            >
              {step === 'ios-instructions'
                ? <Share className="h-4.5 w-4.5 text-[#E50914]" />
                : step === 'install'
                  ? <Download className="h-4.5 w-4.5 text-[#E50914]" />
                  : <Bell className="h-4.5 w-4.5 text-[#E50914]" />}
            </div>

            <div className="flex-1 min-w-0">
              {step === 'install' && (
                <>
                  <p className="text-sm font-semibold text-white">Instale nosso aplicativo</p>
                  <p className="text-xs text-white/50 mt-0.5">
                    Receba notificações em tempo real das suas vendas, direto no celular.
                  </p>
                </>
              )}
              {step === 'enable-notifications' && (
                <>
                  <p className="text-sm font-semibold text-white">Ativar notificações</p>
                  <p className="text-xs text-white/50 mt-0.5">
                    Saiba na hora quando um PIX for gerado ou aprovado.
                  </p>
                </>
              )}
              {step === 'ios-instructions' && (
                <>
                  <p className="text-sm font-semibold text-white">Instale nosso aplicativo</p>
                  <p className="text-xs text-white/50 mt-0.5">
                    Toque em <span className="text-white/70 font-medium">Compartilhar</span> e depois em{' '}
                    <span className="text-white/70 font-medium">Adicionar à Tela de Início</span> pra receber notificações.
                  </p>
                </>
              )}

              <div className="flex items-center gap-2 mt-3">
                {step !== 'ios-instructions' && (
                  <button
                    onClick={step === 'install' ? handleInstall : handleEnableNotifications}
                    disabled={busy}
                    className="h-8 px-3 rounded-[4px] text-xs font-semibold text-white disabled:opacity-60 flex items-center gap-1.5"
                    style={{ background: '#E50914' }}
                  >
                    {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                    {step === 'install' ? 'Instalar aplicativo' : 'Ativar notificações'}
                  </button>
                )}
                <button
                  onClick={handleDismiss}
                  className="h-8 px-3 rounded-[4px] text-xs text-white/50 hover:text-white/80 transition-colors"
                >
                  {step === 'ios-instructions' ? 'Entendi' : 'Agora não'}
                </button>
              </div>
            </div>

            <button onClick={handleDismiss} className="text-white/30 hover:text-white/70 transition-colors shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
