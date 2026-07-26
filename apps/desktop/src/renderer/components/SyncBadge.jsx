import { useState, useEffect } from 'react';

const styles = {
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 99,
    fontWeight: 500,
    letterSpacing: 0.2,
    userSelect: 'none',
  },
  dot: { width: 6, height: 6, borderRadius: '50%' },
};

export default function SyncBadge() {
  const [status, setStatus] = useState({ status: 'offline', lastSyncAt: null });

  useEffect(() => {
    // Hydrate initial status
    if (window.api?.sync?.getStatus) {
      setStatus(window.api.sync.getStatus());
    }

    // Subscribe to live updates
    let unsub;
    if (window.api?.sync?.onStatus) {
      unsub = window.api.sync.onStatus((s) => setStatus(s));
    }
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  const syncing  = status.status === 'syncing';
  const synced   = status.status === 'synced';
  const offline  = status.status === 'offline';
  const errored  = status.status === 'error';

  const color = syncing ? '#f59e0b'
              : synced  ? '#0fe3b0'
              : errored ? '#ef4444'
              : '#6b7280'; // offline

  const label = syncing ? '⟳ Syncing…'
              : synced  ? '● Synced'
              : errored ? '✕ Sync error'
              : '○ Offline';

  return (
    <span
      style={{
        ...styles.badge,
        background: `${color}18`,
        color,
        border: `1px solid ${color}40`,
      }}
      title={status.lastSyncAt ? `Last sync: ${new Date(status.lastSyncAt).toLocaleTimeString()}` : label}
    >
      {label}
    </span>
  );
}
