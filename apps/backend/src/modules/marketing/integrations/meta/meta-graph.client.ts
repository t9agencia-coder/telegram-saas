import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

/**
 * Wrapper único de todas as chamadas ao Graph da Meta (Marketing API).
 * Centraliza versão, timeout, paginação por cursor e classificação de erro
 * (token inválido vs rate limit vs permissão vs genérico) — o resto do módulo
 * nunca fala com o axios direto.
 */

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export class MetaTokenError extends Error {}       // code 190 — token expirado/revogado
export class MetaRateLimitError extends Error {}   // code 4/17/32/613 — throttle
export class MetaPermissionError extends Error {}  // code 10/200/803 — falta permissão
export class MetaApiError extends Error {
  constructor(message: string, readonly code?: number, readonly subcode?: number) {
    super(message);
  }
}

function classify(err: AxiosError): Error {
  const fb: any = (err.response?.data as any)?.error;
  const code = fb?.code;
  const subcode = fb?.error_subcode;
  const msg = fb?.error_user_msg || fb?.message || err.message || 'Erro Meta desconhecido';

  if (code === 190) return new MetaTokenError(msg);
  if ([4, 17, 32, 613].includes(code) || subcode === 2446079) return new MetaRateLimitError(msg);
  if ([10, 200, 272, 294, 803].includes(code)) return new MetaPermissionError(msg);
  return new MetaApiError(msg, code, subcode);
}

@Injectable()
export class MetaGraphClient {
  private readonly logger = new Logger(MetaGraphClient.name);

  get appId(): string  { return process.env.META_APP_ID || ''; }
  get appSecret(): string { return process.env.META_APP_SECRET || ''; }
  get redirectUri(): string {
    return process.env.META_OAUTH_REDIRECT_URI
      || `${(process.env.SERVER_PUBLIC_URL || 'https://api.xbot.solutions')}/api/tracking/meta/oauth/callback`;
  }
  get configured(): boolean { return !!(this.appId && this.appSecret); }

  /** GET simples (sem paginação). */
  async get<T = any>(path: string, params: Record<string, any>): Promise<T> {
    try {
      const res = await axios.get(`${BASE}/${path.replace(/^\//, '')}`, {
        params,
        timeout: 30_000,
      });
      return res.data as T;
    } catch (err: any) {
      throw classify(err);
    }
  }

  /** POST (usado no Fase 3 — gestão). */
  async post<T = any>(path: string, body: Record<string, any>): Promise<T> {
    try {
      const res = await axios.post(`${BASE}/${path.replace(/^\//, '')}`, null, {
        params: body,
        timeout: 30_000,
      });
      return res.data as T;
    } catch (err: any) {
      throw classify(err);
    }
  }

  /**
   * GET com paginação por cursor (`paging.next`). Junta todas as páginas.
   * `hardLimit` protege contra loop/conta gigante.
   */
  async getAll<T = any>(
    path: string,
    params: Record<string, any>,
    hardLimit = 5000,
  ): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = `${BASE}/${path.replace(/^\//, '')}`;
    let query: Record<string, any> | undefined = { limit: 200, ...params };

    while (url && out.length < hardLimit) {
      let data: any;
      try {
        const res = await axios.get(url, { params: query, timeout: 30_000 });
        data = res.data;
      } catch (err: any) {
        throw classify(err);
      }
      if (Array.isArray(data?.data)) out.push(...data.data);
      url = data?.paging?.next || null; // next já vem com todos os params + cursor
      query = undefined;
    }
    return out;
  }
}
