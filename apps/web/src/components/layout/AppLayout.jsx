import { useState } from 'react';
import Sidebar from './Sidebar';
import { useIsMobile } from '../../hooks/useIsMobile';
import useAuthStore from '../../store/authStore';
import PatientLayout from '../../pages/patient/PatientLayout';

export default function AppLayout({ children }) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const isPatient = user?.role === 'patient';

  // Wrap page content in PatientLayout for patient users so the AI chat bubble
  // is available on every patient page without restructuring the route tree.
  const pageContent = isPatient ? <PatientLayout>{children}</PatientLayout> : children;

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Mobile top bar */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0, zIndex: 20 }}>
          <button
            onClick={() => setDrawerOpen(true)}
            style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 22, lineHeight: 1, padding: 4 }}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, background: 'var(--mint)', borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, color: '#000' }}>M</div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>Medi<span style={{ color: 'var(--mint)' }}>Connect</span></span>
          </div>
        </header>

        {/* Drawer overlay */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30, backdropFilter: 'blur(2px)' }}
          />
        )}

        {/* Drawer sidebar */}
        <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 260, background: 'var(--bg2)', zIndex: 40, transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .22s ease', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 14px 0' }}>
            <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, lineHeight: 1, padding: 4 }} aria-label="Close menu">✕</button>
          </div>
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </div>

        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>{pageContent}</main>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '100vh' }}>
      <Sidebar />
      <main style={{ overflowY: 'auto', background: 'var(--bg)' }}>{pageContent}</main>
    </div>
  );
}
