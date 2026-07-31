import { NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

const NAV = [
  { to: '/secretary/waiting-room', label: 'غرفة الانتظار', icon: '🟢' },
  { to: '/secretary/today',        label: 'مواعيد اليوم',  icon: '📅' },
  { to: '/secretary/invoices',     label: 'الفواتير',       icon: '🧾' },
];

function Sidebar() {
  const { logout } = useAuthStore();
  const navigate   = useNavigate();

  return (
    <div style={{
      height: '100vh', background: '#fff', borderInlineStart: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '16px 0',
    }}>
      <div style={{ padding: '4px 16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--primary)', display: 'grid', placeItems: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>سلامتك</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '6px 0 0' }}>لوحة السكرتيرة</p>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, marginBottom: 4,
              fontSize: 13, fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--primary)' : 'var(--text2)',
              background: isActive ? 'var(--primary-dim)' : 'transparent',
              textDecoration: 'none',
            })}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', textAlign: 'right' }}
        >
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}

export default function SecretaryLayout({ children }) {
  return (
    <div dir="rtl" style={{ display: 'grid', gridTemplateColumns: '1fr 220px', height: '100vh', background: 'var(--bg)' }}>
      <main style={{ overflowY: 'auto' }}>{children}</main>
      <Sidebar />
    </div>
  );
}
