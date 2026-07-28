import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: 'USER' | 'ADMIN';
  workspaces?: { id: string; name: string }[];
}

// Resposta de POST /auth/login: ou já vem com os tokens (fluxo normal), ou
// pede uma segunda etapa (2FA) — só contas ADMIN passam pelas duas últimas.
type LoginResult =
  | { user: User; accessToken: string; refreshToken: string }
  | { twoFactorRequired: true; verifyToken: string }
  | { twoFactorSetupRequired: true; qrCode: string; secret: string; setupToken: string };

interface AuthState {
  user: User | null;
  workspaceId: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setWorkspaceId: (id: string) => void;
  login: (email: string, password: string, captchaToken: string | null) => Promise<LoginResult>;
  verifyTwoFactor: (verifyToken: string, code: string) => Promise<void>;
  confirmTwoFactorSetup: (setupToken: string, code: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    whatsapp: string,
    captchaToken: string | null,
  ) => Promise<{ email: string; requiresVerification: boolean }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  workspaceId: null,
  isLoading: true,

  setUser: (user) => set({ user }),
  setWorkspaceId: (id) => set({ workspaceId: id }),

  login: async (email, password, captchaToken) => {
    const data = await api.post('/auth/login', { email, password, captchaToken });
    if (data.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      set({ user: data.user, workspaceId: data.user.workspaces?.[0]?.id || null });
    }
    return data;
  },

  verifyTwoFactor: async (verifyToken, code) => {
    const data = await api.post('/auth/2fa/verify', { verifyToken, code });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, workspaceId: data.user.workspaces?.[0]?.id || null });
  },

  confirmTwoFactorSetup: async (setupToken, code) => {
    const data = await api.post('/auth/2fa/setup-confirm', { setupToken, code });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, workspaceId: data.user.workspaces?.[0]?.id || null });
  },

  register: async (name, email, password, whatsapp, captchaToken) => {
    const data = await api.post('/auth/register', { name, email, password, whatsapp, captchaToken });
    // requiresVerification === false: e-mail de verificação está desligado
    // (RESEND_API_KEY ausente) — o backend já retorna os tokens, loga direto.
    if (data.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      set({ user: data.user, workspaceId: data.user.workspaces?.[0]?.id || null });
      return { email: data.user.email, requiresVerification: false };
    }
    return data;
  },

  verifyEmail: async (email, code) => {
    const data = await api.post('/auth/verify-email', { email, code });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, workspaceId: data.user.workspaces?.[0]?.id || null });
  },

  resendVerification: async (email) => {
    await api.post('/auth/resend-verification', { email });
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, workspaceId: null });
    window.location.replace('/auth/login');
  },

  loadUser: async () => {
    try {
      const user = await api.get('/users/me');
      set({ user, workspaceId: user.workspaces?.[0]?.id || null, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },
}));
