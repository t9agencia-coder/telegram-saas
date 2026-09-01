import { api } from '@/lib/api'

// Web Push exige a chave VAPID pública nesse formato (Uint8Array), mas o backend
// devolve em base64url — conversão padrão recomendada pela própria MDN.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true
}

export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

// Fluxo completo: pede permissão (se ainda não concedida) → busca a chave VAPID
// pública do backend → cria a subscription no navegador → registra no backend.
// Lança erro se o usuário negar a permissão — quem chama decide como exibir isso.
export async function subscribeToPush(workspaceId: string): Promise<void> {
  // No iOS (Safari, Chrome ou qualquer navegador — todos usam o motor da Apple e
  // têm a mesma limitação), PushManager só existe depois do site instalado na
  // Tela de Início. Detectar isso ANTES do isPushSupported() genérico evita a
  // mensagem enganosa de "navegador não suporta" quando na verdade só falta
  // instalar primeiro.
  if (isIOS() && !isStandalone()) {
    throw new Error('No iPhone, primeiro adicione este site à Tela de Início (toque em Compartilhar → Adicionar à Tela de Início) e abra o app por lá antes de ativar as notificações.')
  }
  if (!isPushSupported()) throw new Error('Este navegador não suporta notificações push')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permissão de notificação negada')

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  if (existing) await existing.unsubscribe() // evita ficar com uma chave antiga presa

  const { publicKey } = await api.get(`/workspaces/${workspaceId}/push/vapid-public-key`)
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  })

  const json = subscription.toJSON()
  await api.post(`/workspaces/${workspaceId}/push/subscribe`, {
    endpoint: json.endpoint,
    keys: json.keys,
    userAgent: navigator.userAgent,
  })
}

export async function unsubscribeFromPush(workspaceId: string): Promise<void> {
  const subscription = await getActiveSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe().catch(() => {})
  await api.post(`/workspaces/${workspaceId}/push/unsubscribe`, { endpoint }).catch(() => {})
}
