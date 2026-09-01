import { create } from 'zustand'

const DISMISS_KEY = 'push_banner_dismissed_until'
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

interface PushBannerState {
  dismissedUntil: number
  dismiss: () => void
  isDismissed: () => boolean
}

// Guarda só "até quando não mostrar o banner de novo" — nunca afeta a
// notificação em si (isso é decidido pela permissão real do navegador e pela
// subscription ativa, sempre consultadas ao vivo, nunca por uma flag local).
export const usePushBannerStore = create<PushBannerState>((set, get) => ({
  dismissedUntil: typeof window !== 'undefined'
    ? Number(localStorage.getItem(DISMISS_KEY) || 0)
    : 0,
  dismiss: () => {
    const until = Date.now() + DISMISS_COOLDOWN_MS
    if (typeof window !== 'undefined') localStorage.setItem(DISMISS_KEY, String(until))
    set({ dismissedUntil: until })
  },
  isDismissed: () => Date.now() < get().dismissedUntil,
}))
