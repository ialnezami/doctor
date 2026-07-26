import { useState, useEffect, useRef, useCallback } from 'react';
import * as Network from 'expo-network';
import { flushQueue, getQueue } from '../utils/offlineQueue';
import client from '../api/client';

export default function useNetworkStatus() {
  const [isOnline, setIsOnline]       = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const prevOnline = useRef(true);

  const refreshPendingCount = useCallback(async () => {
    const q = await getQueue();
    setPendingCount(q.length);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const state = await Network.getNetworkStateAsync();
        const online = !!(state.isConnected && state.isInternetReachable !== false);
        if (cancelled) return;

        setIsOnline(online);

        // Offline → online transition: flush pending queue
        if (online && !prevOnline.current) {
          const { synced } = await flushQueue(client);
          if (synced > 0) await refreshPendingCount();
        }

        prevOnline.current = online;
        await refreshPendingCount();
      } catch {}
    }

    check();
    const interval = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refreshPendingCount]);

  return { isOnline, pendingCount, refreshPendingCount };
}
