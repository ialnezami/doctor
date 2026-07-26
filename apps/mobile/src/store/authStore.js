import { create } from 'zustand';
const useAuthStore = create((set) => ({
  user: null,
  token: null,
  login: (user, token) => set({ user, token }),
  logout: () => set({ user: null, token: null }),
  updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
}));
export default useAuthStore;
