import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/authStore';
import LanguageSwitcher from '../LanguageSwitcher';

const doctorNavKeys = [
  { key: 'nav.dashboard',      path: '/dashboard' },
  { key: 'nav.appointments',   path: '/appointments', badge: true },
  { key: 'nav.patientRecords', path: '/patients' },
  { key: 'nav.prescriptions',  path: '/prescriptions' },
  { key: 'nav.labResults',     path: '/lab-results' },
  { key: 'nav.settings',       path: '/settings' },
  { key: 'nav.reviews',        path: '/reviews' },
];

const patientNavKeys = [
  { key: 'nav.findADoctor',    path: '/find-doctor' },
  { key: 'nav.myAppointments', path: '/my-appointments', badge: true },
  { key: 'nav.records',        path: '/records' },
  { key: 'nav.settings',       path: '/patient-settings' },
];

const labNavKeys = [
  { key: 'nav.myUploads', path: '/lab' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();

  const navKeys = user?.role === 'doctor' ? doctorNavKeys
    : user?.role === 'laboratory' ? labNavKeys
    : patientNavKeys;

  const roleMenuKey = user?.role === 'doctor' ? 'nav.roleMenu.doctor'
    : user?.role === 'laboratory' ? 'nav.roleMenu.laboratory'
    : 'nav.roleMenu.patient';

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';

  return (
    <aside style={{ width:240, background:'var(--bg2)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', position:'relative', overflow:'hidden' }}>
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
          {t(roleMenuKey)}
        </div>
        {navKeys.map(item => {
          const active = pathname === item.path;
          return (
            <div key={item.path} onClick={() => navigate(item.path)}
              style={{ display:'flex', alignItems:'center', gap:9, padding:'9px 10px', borderRadius:'var(--r-sm)', marginBottom:2, cursor:'pointer', border:'1px solid transparent', transition:'all .13s',
                background: active ? 'var(--mint-dim)' : 'transparent',
                borderColor: active ? 'rgba(15,227,176,0.2)' : 'transparent',
                color: active ? 'var(--mint)' : 'var(--text2)',
                fontWeight: active ? 500 : 400, fontSize:13.5 }}>
              {t(item.key)}
              {item.badge && <span style={{ marginLeft:'auto', background:'var(--rose)', color:'#fff', fontSize:10, fontWeight:700, borderRadius:10, padding:'1px 6px', fontFamily:'var(--font-mono)' }}>!</span>}
            </div>
          );
        })}
      </nav>

      {/* Language */}
      <div style={{ padding:'8px 14px', borderTop:'1px solid var(--border)' }}>
        <LanguageSwitcher />
      </div>

      {/* User */}
      <div style={{ padding:14, borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,var(--mint),#0891b2)', display:'grid', placeItems:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
          {initials}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.name}</div>
          <div style={{ fontSize:11, color:'var(--text2)', textTransform:'capitalize' }}>{user?.role}</div>
        </div>
        <button onClick={logout} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:16, cursor:'pointer' }} title={t('nav.logout')}>⏏</button>
      </div>
    </aside>
  );
}
