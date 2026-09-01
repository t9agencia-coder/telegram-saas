import { create } from 'zustand';

const STORAGE_KEY = 'dashboard_privacy_hidden';

interface PrivacyState {
  hidden: boolean;
  toggle: () => void;
}

// Preferência de "ocultar valores" do dashboard (igual apps de banco) — persiste
// no localStorage pra sobreviver a reload, mas é só preferência de exibição no
// navegador: nunca afeta o que é buscado/calculado, só o texto renderizado.
export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  hidden: typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1',
  toggle: () => {
    const next = !get().hidden;
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    set({ hidden: next });
  },
}));
