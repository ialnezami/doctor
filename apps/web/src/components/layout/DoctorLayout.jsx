import { useState, useEffect } from 'react';
import DoctorSidebar from './DoctorSidebar';
import { useIsMobile } from '../../hooks/useIsMobile';

export default function DoctorLayout({ children }) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-doctor-theme', '');
    return () => {
      document.documentElement.removeAttribute('data-doctor-theme');
    };
  }, []);

  if (isMobile) {
    return (
      <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: '#fff', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--primary)', display: 'grid', placeItems: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>سلامتك</span>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text)', padding: 4 }}
            aria-label="القائمة"
          >
            ☰
          </button>
        </header>

        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 30 }}
          />
        )}

        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 260,
          zIndex: 40, transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .22s ease',
        }}>
          <DoctorSidebar onNavigate={() => setDrawerOpen(false)} />
        </div>

        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      style={{ display: 'grid', gridTemplateColumns: '1fr 240px', height: '100vh', background: 'var(--bg)' }}
    >
      <main style={{ overflowY: 'auto' }}>{children}</main>
      <DoctorSidebar />
    </div>
  );
}
