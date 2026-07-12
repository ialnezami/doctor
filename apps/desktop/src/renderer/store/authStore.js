import { create } from 'zustand';

const API_BASE = 'https://web-production-1d93d.up.railway.app';

export const useAuthStore = create((set) => ({
  user:    null,
  token:   null,
  error:   null,
  loading: false,

  hydrate: async () => {
    try {
      const token = await window.api.auth.getToken();
      const user  = await window.api.auth.getUser();
      if (token && user) set({ token, user });
    } catch {}
  },

  login: async (identifier, password) => {
    set({ loading: true, error: null });
    try {
      const body = identifier.includes('@')
        ? { email: identifier, password }
        : { identifier, password };
      const res  = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');
      if (!['pharmacy', 'doctor', 'laboratory'].includes(data.user?.role)) {
        throw new Error('This app is for pharmacy, doctor, and lab roles only');
      }
      await window.api.auth.setToken(data.token);
      await window.api.auth.setUser(data.user);
      set({ user: data.user, token: data.token, loading: false });
      window.api.sync.trigger().catch(() => {});
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  logout: async () => {
    await window.api.auth.clearToken();
    set({ user: null, token: null });
  },
}));
