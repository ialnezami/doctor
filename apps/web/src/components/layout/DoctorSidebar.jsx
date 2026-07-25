import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import CreatePatientModal from '../CreatePatientModal';
import {
  Home, LayoutGrid, FlaskConical, Users, Calendar,
  ListOrdered, Wrench, FileText, BarChart2, UserCog,
  Building2, CalendarCog, Settings, MessageSquare, HelpCircle, Plus,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    items: [
      { label: 'الرئيسية', icon: Home,       path: '/today' },
      { label: 'اليوم',    icon: LayoutGrid, path: '/today' },
    ],
  },
  {
    items: [
      { label: 'لوحة المختبر',  icon: FlaskConical, path: '/lab-board' },
      { label: 'المرضى',        icon: Users,        path: '/patients' },
      { label: 'المواعيد',      icon: Calendar,     path: '/appointments' },
      { label: 'غرفة الانتظار', icon: ListOrdered,  path: '/waiting-room' },
    ],
  },
  {
    label: 'المالية',
    items: [
      { label: 'خدمات العيادة', icon: Wrench,    path: '/services' },
      { label: 'الفواتير',      icon: FileText,  path: '/invoices' },
      { label: 'التقارير',      icon: BarChart2, path: '/reports' },
    ],
  },
  {
    label: 'إدارة العيادة',
    items: [
      { label: 'الموظفين',       icon: UserCog,    path: '/staff' },
      { label: 'ملف العيادة',    icon: Building2,  path: '/clinic' },
      { label: 'جدول العمل',     icon: CalendarCog, path: '/schedule' },
      { label: 'إعدادات النظام', icon: Settings,   path: '/settings' },
    ],
  },
  {
    label: 'الدعم',
    items: [
      { label: 'اقتراحاتي', icon: MessageSquare, path: '/feedback' },
      { label: 'المساعدة',  icon: HelpCircle,    path: '/help' },
    ],
  },
];

export default function DoctorSidebar({ onNavigate }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();
  const [showAddPatient, setShowAddPatient] = useState(false);

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';

  const isActive = (path) =>
    pathname === path || (path !== '/today' && pathname.startsWith(path + '/'));

  const go = (path) => {
    navigate(path);
    onNavigate?.();
  };

  return (
    <>
      <aside style={{
        width: 240, background: '#fff', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto',
      }}>
        {/* Brand */}
        <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--primary)', display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)', lineHeight: 1.2 }}>نبض العيادات</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>إدارة العيادة بالتنظيم</div>
            </div>
          </div>
        </div>

        {/* Add Patient CTA */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowAddPatient(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 7, padding: '9px 14px', borderRadius: 8,
              background: 'var(--primary)', color: 'var(--primary-text)',
              border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              transition: 'background .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
          >
            <Plus size={16} />
            إضافة مريض
          </button>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, padding: '8px 10px' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 4 }}>
              {group.label && (
                <div style={{
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'var(--text3)',
                  padding: '14px 10px 6px',
                }}>
                  {group.label}
                </div>
              )}
              {group.items.map(item => {
                const active = isActive(item.path);
                const Icon = item.icon;
                return (
                  <div
                    key={item.path + item.label}
                    onClick={() => go(item.path)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '8px 10px', borderRadius: 7, marginBottom: 1,
                      cursor: 'pointer', transition: 'all .13s',
                      background: active ? 'var(--primary-dim)' : 'transparent',
                      color: active ? 'var(--primary)' : 'var(--text2)',
                      fontWeight: active ? 600 : 400, fontSize: 13.5,
                      borderInlineEnd: active ? '3px solid var(--primary)' : '3px solid transparent',
                    }}
                  >
                    <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
                    {item.label}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'var(--primary)', display: 'grid', placeItems: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.email}
              </div>
            </div>
            <button
              onClick={logout}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 18, cursor: 'pointer', padding: 4 }}
              title="تسجيل الخروج"
            >
              ⏏
            </button>
          </div>
        </div>
      </aside>

      {showAddPatient && (
        <CreatePatientModal onClose={() => setShowAddPatient(false)} />
      )}
    </>
  );
}
