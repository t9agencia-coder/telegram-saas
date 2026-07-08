// Base da API — sempre /api (relativo ao domínio atual)
// - Browser em produção: nginx intercepta /api/* → backend (porta 3001)
// - Browser em dev:      Next.js rewrite /api/* → localhost:3001
// - SSR:                 Next.js rewrite /api/* → http://backend:3001
const API_URL = '/api';

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

async function request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${endpoint}`, config);

  if (!response.ok) {
    if (response.status === 401 && !endpoint.startsWith('/auth/')) {
      localStorage.removeItem('accessToken');
      window.location.href = '/auth/login';
    }
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  get:    <T = any>(endpoint: string)             => request<T>(endpoint),
  post:   <T = any>(endpoint: string, body?: any) => request<T>(endpoint, { method: 'POST',   body }),
  put:    <T = any>(endpoint: string, body?: any) => request<T>(endpoint, { method: 'PUT',    body }),
  patch:  <T = any>(endpoint: string, body?: any) => request<T>(endpoint, { method: 'PATCH',  body }),
  delete: <T = any>(endpoint: string)             => request<T>(endpoint, { method: 'DELETE' }),
};
