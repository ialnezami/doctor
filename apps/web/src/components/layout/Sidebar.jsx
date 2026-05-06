import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore';

const doctorNav = [
  { label: 'Dashboard',       path: '/dashboard' },
  { label: 'Appointments',    path: '/appointments', badge: true },
  { label: 'Patient Records', path: '/patients' },
  { label: 'Prescriptions',   path: '/prescriptions' },
  { label: 'Lab Results',     path: '/lab-results' },
];

const patientNav = [
  { label: 'Find a Doctor',   path: '/find-doctor' },
  { label: 'My Appointments', path: '/my-appointments', badge: true },
  { label: 'Medical Records', path: '/records' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();
  const nav = user?.role === 'doctor' ? doctorNav : patientNav;
  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';

  return (
    <aside style={{ width:240, background:'var(--bg2)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', position:'relative', overflow:'hidden' }}>
      {/* glow */}
      <div style={{ position:'absolute', top:-80, left:-60, width:200, height:200, background:'radial-gradient(circle, rgba(15,227,176,0.07) 0%, transparent 70%)', pointerEvents:'none' }} />

      {/* Logo */}
      <div style={{ padding:'24px 22px 16px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, background:'var(--mint)', borderRadius:7, display:'grid', placeItems:'center', fontSize:15, fontWeight:800, color:'#000' }}>M</div>
          <span style={{ fontFamily:'var(--font-display)', fontSize:19, fontWeight:600 }}>Medi<span style={{ color:'var(--mint)' }}>Connect</span></span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'8px 10px', overflowY:'auto' }}>
        <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text3)', padding:'0 10px 8px' }}>
          {user?.role === 'doctor' ? 'Doctor' : 'Patient'} Menu
        </div>
        {nav.map(item => {
          const active = pathname === item.path;
          return (
            <div key={item.path} onClick={() => navigate(item.path)}
              style={{ display:'flex', alignItems:'center', gap:9, padding:'9px 10px', borderRadius:'var(--r-sm)', marginBottom:2, cursor:'pointer', border:'1px solid transparent', transition:'all .13s',
                background: active ? 'var(--mint-dim)' : 'transparent',
                borderColor: active ? 'rgba(15,227,176,0.2)' : 'transparent',
                color: active ? 'var(--mint)' : 'var(--text2)',
                fontWeight: active ? 500 : 400, fontSize:13.5 }}>
              {item.label}
              {item.badge && <span style={{ marginLeft:'auto', background:'var(--rose)', color:'#fff', fontSize:10, fontWeight:700, borderRadius:10, padding:'1px 6px', fontFamily:'var(--font-mono)' }}>!</span>}
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div style={{ padding:14, borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,var(--mint),#0891b2)', display:'grid', placeItems:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
          {initials}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.name}</div>
          <div style={{ fontSize:11, color:'var(--text2)', textTransform:'capitalize' }}>{user?.role}</div>
        </div>
        <button onClick={logout} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:16, cursor:'pointer' }} title="Logout">⏏</button>
      </div>
    </aside>
  );
}
