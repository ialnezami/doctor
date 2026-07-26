import { create } from 'zustand';

export const useSyncStore = create((set) => ({
  status:     'idle',
  lastSyncAt: null,

  init: () => {
    const unsub = window.api.sync.onStatus((data) => {
      set({ status: data.status, lastSyncAt: data.lastSyncAt });
    });
    return unsub;
  },
}));
