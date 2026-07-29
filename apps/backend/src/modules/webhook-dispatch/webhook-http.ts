import axios from 'axios';

export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_USER_AGENT = 'Telegram-SaaS-Webhook';

export interface WebhookSendResult {
  success: boolean;         // true só em HTTP 200/201
  responseStatus: number | null;
  responseBody: string | null;   // truncado
  executionMs: number;
  errorMessage: string | null;
}

// Bloqueia hosts internos óbvios (loopback, link-local, redes privadas) pra o servidor
// não ser usado como proxy contra a rede interna (SSRF). Não resolve DNS — cobre os
// casos diretos (IPs literais e localhost); domínios públicos legítimos passam normal.
export function validateWebhookUrl(raw: string): { ok: true } | { ok: false; reason: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'URL inválida' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: 'A URL deve começar com http:// ou https://' };
  }
  const host = u.hostname.toLowerCase();
  const blockedExact = ['localhost', '0.0.0.0', '::1', '[::1]'];
  if (blockedExact.includes(host)) {
    return { ok: false, reason: 'Endereço interno não permitido' };
  }
  // IPv4 privado / loopback / link-local
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    const isPrivate =
      a === 127 ||                                   // loopback
      a === 10 ||                                    // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) ||           // 172.16.0.0/12
      (a === 192 && b === 168) ||                    // 192.168.0.0/16
      (a === 169 && b === 254);                       // link-local
    if (isPrivate) return { ok: false, reason: 'Endereço interno não permitido' };
  }
  return { ok: true };
}

// Envia o POST e classifica o resultado. Nunca lança — sempre devolve o WebhookSendResult.
export async function sendWebhookHttp(params: {
  url: string;
  secret?: string | null;
  event: string;
  eventId: string;
  payload: unknown;
}): Promise<WebhookSendResult> {
  const { url, secret, event, eventId, payload } = params;
  const startedAt = Date.now();
  const headers: Record<string, string> = {
    'Content-Type':    'application/json',
    'User-Agent':      WEBHOOK_USER_AGENT,
    'X-Webhook-Event': event,
    'X-Webhook-ID':    eventId,
  };
  if (secret) headers['X-Webhook-Secret'] = secret;

  try {
    const res = await axios.post(url, payload, {
      headers,
      timeout: WEBHOOK_TIMEOUT_MS,
      // Não deixa o axios lançar por status — a gente classifica 200/201 vs resto.
      validateStatus: () => true,
      maxRedirects: 0,
    });
    const executionMs = Date.now() - startedAt;
    const bodyStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
    const success = res.status === 200 || res.status === 201;
    return {
      success,
      responseStatus: res.status,
      responseBody: (bodyStr || '').slice(0, 2048),
      executionMs,
      errorMessage: success ? null : `HTTP ${res.status}`,
    };
  } catch (err: any) {
    const executionMs = Date.now() - startedAt;
    const reason =
      err?.code === 'ECONNABORTED'
        ? `Timeout após ${WEBHOOK_TIMEOUT_MS / 1000}s`
        : (err?.code || err?.message || 'Erro de conexão');
    return { success: false, responseStatus: null, responseBody: null, executionMs, errorMessage: String(reason) };
  }
}
