// Registro central de eventos de webhook de saída.
// Adicionar um evento novo no futuro (pix_expirado, reembolso, lead_criado, etc.)
// é só acrescentar aqui e chamar WebhookDispatchService.dispatch('novo_evento', paymentId)
// de onde faz sentido — nenhuma outra parte da arquitetura muda.
export const WEBHOOK_EVENTS = ['sale_pending', 'sale_approved'] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isValidWebhookEvent(e: string): e is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(e);
}

// Mapa evento → status legível no payload (campo sale.status).
export const EVENT_SALE_STATUS: Record<WebhookEvent, string> = {
  sale_pending:  'pending',
  sale_approved: 'approved',
};
