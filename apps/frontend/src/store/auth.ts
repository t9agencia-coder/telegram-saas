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

interface AuthState {
  user: User | null;
  workspaceId: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setWorkspaceId: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  workspaceId: null,
  isLoading: true,

  setUser: (user) => set({ user }),
  setWorkspaceId: (id) => set({ workspaceId: id }),

  login: async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, workspaceId: data.user.workspaces?.[0]?.id || null });
  },

  register: async (name, email, password) => {
    const data = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, workspaceId: data.user.workspaces?.[0]?.id || null });
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
