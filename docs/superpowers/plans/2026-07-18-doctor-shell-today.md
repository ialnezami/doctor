# Doctor Shell — Navigation + Today Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new RTL doctor shell (DoctorLayout + DoctorSidebar) and TodayPage for web, plus updated DoctorTabs + TodayScreen for mobile, matching the نبض العيادات design from the approved spec.

**Architecture:** A new `DoctorLayout` wraps all doctor web routes exclusively — `AppLayout` stays untouched for patient/lab/pharmacy. The sidebar has 5 grouped nav sections, RTL layout, and teal color tokens. `TodayPage` replaces `/dashboard` as the doctor landing. Mobile gets an updated `DoctorTabs` bottom navigator and a new `TodayScreen`.

**Tech Stack:** React 19, React Router v6, Zustand, react-i18next, lucide-react (new for web), Expo 54, @react-navigation/bottom-tabs v7 (mobile — in package.json, not yet installed)

## Global Constraints

- Web: `dir="rtl"` on `DoctorLayout` wrapper — sidebar appears on the right
- Light theme always active for doctor shell — `DoctorLayout` always sets `data-theme="light"` and `data-doctor-theme`
- Primary teal token: `--primary: #0d9488` — never hardcode this color, always use `var(--primary)`
- All UI labels are Arabic — no English in doctor-facing UI
- No new API endpoints — use `GET /api/appointments` and `GET /api/patients?search=`
- `AppLayout.jsx` and `Sidebar.jsx` must NOT be modified — patient/lab/pharmacy untouched
- Stub pages render only `<div>قريباً</div>` — no placeholder state or logic
- Mobile RTL: `I18nManager.forceRTL(true)` for doctor role only

---

## File Map

**Create (web):**
- `apps/web/src/utils/appointmentGroups.js` — pure helpers: `parseTime`, `isSameDay`, `groupTodayAppointments`
- `apps/web/src/components/layout/DoctorSidebar.jsx` — sidebar with 5 nav groups
- `apps/web/src/components/layout/DoctorLayout.jsx` — RTL shell wrapping all doctor routes
- `apps/web/src/components/doctor/PatientSearchModal.jsx` — Ctrl+K global patient search
- `apps/web/src/pages/doctor/TodayPage.jsx` — today's appointments dashboard
- `apps/web/src/pages/doctor/ComingSoonPage.jsx` — shared stub for unimplemented routes

**Modify (web):**
- `apps/web/src/index.css` — add `[data-doctor-theme]` block
- `apps/web/src/router/index.jsx` — add `DoctorProtected`, new routes, redirect `/dashboard` → `/today`

**Create (mobile):**
- `apps/mobile/src/screens/doctor/TodayScreen.js` — today dashboard screen

**Modify (mobile):**
- `apps/mobile/src/navigation/DoctorTabs.js` — replace with new bottom tabs (اليوم / المواعيد / المرضى / المزيد)

---

### Task 1: Install dependencies + add teal CSS tokens

**Files:**
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Produces: `var(--primary)`, `var(--primary-dim)`, `var(--primary-hover)`, `var(--primary-text)` — used by all subsequent web tasks

- [ ] **Step 1: Install lucide-react in web app**

```bash
cd apps/web && npm install lucide-react
```

Expected: `lucide-react` appears in `apps/web/node_modules/lucide-react`.

- [ ] **Step 2: Install @react-navigation/bottom-tabs in mobile app**

```bash
cd apps/mobile && npx expo install @react-navigation/bottom-tabs
```

Expected: package installs without peer dep errors.

- [ ] **Step 3: Add doctor theme tokens to index.css**

Open `apps/web/src/index.css`. After the `[data-theme="light"]` closing brace, add:

```css
[data-doctor-theme] {
  --primary:       #0d9488;
  --primary-dim:   rgba(13, 148, 136, 0.12);
  --primary-hover: #0f766e;
  --primary-text:  #ffffff;
}
```

- [ ] **Step 4: Verify tokens load**

Start web dev server:
```bash
cd apps/web && npm run dev
```

Open browser DevTools → Elements → select `<html>`. Temporarily add `data-doctor-theme` attribute in DevTools. Confirm `--primary` computes to `rgb(13, 148, 136)` in Computed styles.

- [ ] **Step 5: Commit**

```bash
cd apps/web && git add src/index.css package.json package-lock.json
git commit -m "feat: add doctor theme teal tokens + install lucide-react"
```

---

### Task 2: Appointment grouping utility (web)

**Files:**
- Create: `apps/web/src/utils/appointmentGroups.js`

**Interfaces:**
- Produces:
  - `parseTime(timeStr: string): Date | null` — parses "HH:MM" into today's Date
  - `isSameDay(a: Date, b: Date): boolean`
  - `groupTodayAppointments(appointments: Appointment[]): { current: Appointment[], upcoming: Appointment[] }`
- Consumed by: Task 7 (TodayPage)

- [ ] **Step 1: Create the utility file**

Create `apps/web/src/utils/appointmentGroups.js`:

```js
export function parseTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function groupTodayAppointments(appointments) {
  const now = new Date();
  const today = appointments.filter(a => {
    if (!a.date) return false;
    return isSameDay(new Date(a.date), now);
  });

  const current = today.filter(a => {
    const start = parseTime(a.timeSlot?.start);
    const end   = parseTime(a.timeSlot?.end);
    if (!start || !end) return false;
    return start <= now && now <= end;
  });

  const upcoming = today.filter(a => {
    const start = parseTime(a.timeSlot?.start);
    if (!start) return false;
    return start > now;
  });

  return { current, upcoming };
}
```

- [ ] **Step 2: Verify logic in browser console**

In the running web dev server, open browser console and paste:

```js
// paste this to test without a test runner
const { parseTime, isSameDay, groupTodayAppointments } = await import('/src/utils/appointmentGroups.js');

const now = new Date();
const past = new Date(now); past.setHours(now.getHours() - 2);
const future = new Date(now); future.setHours(now.getHours() + 2);

const fmt = d => `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;

const appts = [
  { date: now.toISOString(), timeSlot: { start: fmt(past), end: fmt(future) }, patientId: { name: 'Now Patient' } },
  { date: now.toISOString(), timeSlot: { start: fmt(future), end: fmt(new Date(future.getTime() + 30*60000)) }, patientId: { name: 'Upcoming Patient' } },
  { date: new Date(2020,1,1).toISOString(), timeSlot: { start: '09:00', end: '09:30' }, patientId: { name: 'Old Patient' } },
];

const result = groupTodayAppointments(appts);
console.assert(result.current.length === 1, 'Should have 1 current');
console.assert(result.upcoming.length === 1, 'Should have 1 upcoming');
console.assert(result.current[0].patientId.name === 'Now Patient', 'Current patient name');
console.log('✅ appointmentGroups utility works');
```

Expected output: `✅ appointmentGroups utility works` with no assertion errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/utils/appointmentGroups.js
git commit -m "feat: add appointmentGroups utility (parseTime, groupTodayAppointments)"
```

---

### Task 3: DoctorSidebar component

**Files:**
- Create: `apps/web/src/components/layout/DoctorSidebar.jsx`

**Interfaces:**
- Consumes: `useAuthStore` (user, logout), `useNavigate`, `useLocation`, `CreatePatientModal` (existing at `../../components/CreatePatientModal`)
- Produces: `<DoctorSidebar />` — default export, no props required

- [ ] **Step 1: Create DoctorSidebar.jsx**

Create `apps/web/src/components/layout/DoctorSidebar.jsx`:

```jsx
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
      { label: 'الرئيسية', icon: Home,        path: '/today' },
      { label: 'اليوم',    icon: LayoutGrid,  path: '/today' },
    ],
  },
  {
    items: [
      { label: 'لوحة المختبر',   icon: FlaskConical, path: '/lab-board' },
      { label: 'المرضى',         icon: Users,        path: '/patients' },
      { label: 'المواعيد',       icon: Calendar,     path: '/appointments' },
      { label: 'غرفة الانتظار',  icon: ListOrdered,  path: '/waiting-room' },
    ],
  },
  {
    label: 'المالية',
    items: [
      { label: 'خدمات العيادة', icon: Wrench,   path: '/services' },
      { label: 'الفواتير',      icon: FileText, path: '/invoices' },
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
              background: 'var(--primary)', display: 'grid', placeItems: 'center',
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
```

- [ ] **Step 2: Verify no import errors**

The dev server should still be running. Check browser console — no red import errors for lucide-react or CreatePatientModal.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/DoctorSidebar.jsx
git commit -m "feat: add DoctorSidebar with 5 nav groups and teal active state"
```

---

### Task 4: DoctorLayout component + router wiring

**Files:**
- Create: `apps/web/src/components/layout/DoctorLayout.jsx`
- Modify: `apps/web/src/router/index.jsx`

**Interfaces:**
- Consumes: `DoctorSidebar` (Task 3), `useIsMobile` (existing hook at `../../hooks/useIsMobile`)
- Produces: `<DoctorLayout>{children}</DoctorLayout>` — default export
- Produces: `DoctorProtected` component in router — wraps children in `DoctorLayout`

- [ ] **Step 1: Create DoctorLayout.jsx**

Create `apps/web/src/components/layout/DoctorLayout.jsx`:

```jsx
import { useState, useEffect } from 'react';
import DoctorSidebar from './DoctorSidebar';
import { useIsMobile } from '../../hooks/useIsMobile';

export default function DoctorLayout({ children }) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Always force light theme + doctor theme for this shell
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
        {/* Mobile header */}
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
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>نبض العيادات</span>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text)', padding: 4 }}
            aria-label="القائمة"
          >
            ☰
          </button>
        </header>

        {/* Drawer overlay */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 30 }}
          />
        )}

        {/* Drawer — slides from right in RTL */}
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
```

- [ ] **Step 2: Update router/index.jsx — add DoctorProtected + new routes**

Open `apps/web/src/router/index.jsx`. Make these changes:

**2a. Add import at top:**
```jsx
import DoctorLayout from '../components/layout/DoctorLayout';
import TodayPage from '../pages/doctor/TodayPage';
import ComingSoonPage from '../pages/doctor/ComingSoonPage';
```

**2b. Add `DoctorProtected` function (below the existing `Protected` function):**
```jsx
function DoctorProtected({ children }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'doctor') return <Navigate to="/" replace />;
  return <DoctorLayout>{children}</DoctorLayout>;
}
```

**2c. Replace all existing `<Protected role="doctor">` doctor routes with `<DoctorProtected>`, and add new routes. Replace the doctor routes block:**

```jsx
{/* Doctor routes */}
<Route path="/today"       element={<DoctorProtected><TodayPage /></DoctorProtected>} />
<Route path="/dashboard"   element={<Navigate to="/today" replace />} />
<Route path="/appointments" element={<DoctorProtected><AppointmentsPage /></DoctorProtected>} />
<Route path="/appointments/:id" element={<DoctorProtected><AppointmentsPage /></DoctorProtected>} />
<Route path="/patients"    element={<DoctorProtected><PatientRecordsPage /></DoctorProtected>} />
<Route path="/patients/:id" element={<DoctorProtected><PatientDetailPage /></DoctorProtected>} />
<Route path="/prescriptions" element={<DoctorProtected><PrescriptionsPage /></DoctorProtected>} />
<Route path="/lab-results" element={<DoctorProtected><LabResultsPage /></DoctorProtected>} />
<Route path="/reviews"     element={<DoctorProtected><ReviewsPage /></DoctorProtected>} />
<Route path="/settings"    element={<DoctorProtected><DoctorSettingsPage /></DoctorProtected>} />
<Route path="/lab-board"   element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
<Route path="/waiting-room" element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
<Route path="/services"    element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
<Route path="/invoices"    element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
<Route path="/reports"     element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
<Route path="/staff"       element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
<Route path="/clinic"      element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
<Route path="/schedule"    element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
<Route path="/feedback"    element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
<Route path="/help"        element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
```

**2d. Update the root redirect for doctor role:**
```jsx
user.role === 'doctor' ? <Navigate to="/today" /> :
```

- [ ] **Step 3: Create ComingSoonPage stub**

Create `apps/web/src/pages/doctor/ComingSoonPage.jsx`:

```jsx
export default function ComingSoonPage() {
  return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)', fontSize: 16 }}>
      قريباً
    </div>
  );
}
```

- [ ] **Step 4: Verify shell renders**

With dev server running, log in as doctor. You should see:
- RTL layout with sidebar on the RIGHT
- "نبض العيادات" branding in sidebar
- Teal "إضافة مريض" button
- All 5 nav groups visible
- Navigating to `/today` shows nothing yet (TodayPage not built — will 404 or render empty, that's fine)
- Patient / lab / pharmacy routes still work normally

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/DoctorLayout.jsx \
        apps/web/src/pages/doctor/ComingSoonPage.jsx \
        apps/web/src/router/index.jsx
git commit -m "feat: add DoctorLayout + DoctorProtected, wire new doctor routes"
```

---

### Task 5: PatientSearchModal

**Files:**
- Create: `apps/web/src/components/doctor/PatientSearchModal.jsx`

**Interfaces:**
- Consumes: `GET /api/patients?search=<q>` via axios (existing `../../api/` pattern)
- Props: `onClose: () => void`
- Produces: `<PatientSearchModal onClose={fn} />` — default export

- [ ] **Step 1: Create PatientSearchModal.jsx**

Create `apps/web/src/components/doctor/PatientSearchModal.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function PatientSearchModal({ onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Ctrl+K / Escape handlers
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_BASE}/api/patients`, {
          params: { search: query.trim() },
          headers: { Authorization: `Bearer ${token}` },
        });
        setResults(res.data?.patients || res.data || []);
      } catch {
        setError('فشل البحث، حاول مجدداً');
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const goToPatient = (id) => {
    navigate(`/patients/${id}`);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100 }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: '90%', maxWidth: 560, background: '#fff', borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', zIndex: 101, overflow: 'hidden',
      }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)', gap: 10 }}>
          <Search size={18} color="var(--text3)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث عن مريض بالاسم أو الهاتف..."
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 15,
              color: 'var(--text)', background: 'transparent', direction: 'rtl',
            }}
          />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>جاري البحث...</div>
          )}
          {error && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--rose)', fontSize: 13 }}>{error}</div>
          )}
          {!loading && !error && results.length === 0 && query.trim() && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>لا توجد نتائج</div>
          )}
          {!loading && results.map(p => (
            <div
              key={p._id}
              onClick={() => goToPatient(p._id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dim)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--primary-dim)', display: 'grid', placeItems: 'center',
                fontSize: 13, fontWeight: 700, color: 'var(--primary)', flexShrink: 0,
              }}>
                {p.name?.[0] || '؟'}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                {p.phone && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{p.phone}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{ padding: '10px 16px', background: 'var(--bg)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 16 }}>
          <span>↵ للفتح</span>
          <span>Esc للإغلاق</span>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/doctor/PatientSearchModal.jsx
git commit -m "feat: add PatientSearchModal with debounced patient search"
```

---

### Task 6: TodayPage

**Files:**
- Create: `apps/web/src/pages/doctor/TodayPage.jsx`

**Interfaces:**
- Consumes: `groupTodayAppointments` from `../../utils/appointmentGroups`
- Consumes: `getAppointments` from `../../api/appointments`
- Consumes: `PatientSearchModal` from `../../components/doctor/PatientSearchModal`
- Consumes: `PATCH /api/appointments/:id/status` via axios (mark attended / cancel)

- [ ] **Step 1: Create TodayPage.jsx**

Create `apps/web/src/pages/doctor/TodayPage.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, Eye, X, Check, UserPlus, Calendar } from 'lucide-react';
import axios from 'axios';
import { getAppointments } from '../../api/appointments';
import { groupTodayAppointments } from '../../utils/appointmentGroups';
import PatientSearchModal from '../../components/doctor/PatientSearchModal';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const STATUS_BADGE = {
  confirmed:  { label: 'مؤكد',       bg: 'var(--primary)',    color: '#fff'           },
  scheduled:  { label: 'مجدول',      bg: 'transparent',       color: 'var(--text2)',  border: '1px solid var(--border2)' },
  attended:   { label: 'تم الحضور',  bg: '#16a34a',           color: '#fff'           },
  completed:  { label: 'تم الحضور',  bg: '#16a34a',           color: '#fff'           },
  cancelled:  { label: 'ملغى',       bg: 'transparent',       color: 'var(--rose)',   border: '1px solid var(--rose)'   },
  pending:    { label: 'معلق',       bg: 'transparent',       color: 'var(--text3)',  border: '1px solid var(--border)' },
};

const URGENCY_BADGE = {
  high:   { label: 'عالي',   bg: 'var(--amber)', color: '#fff' },
  medium: { label: 'متوسط',  bg: 'var(--blue)',  color: '#fff' },
  low:    { label: 'منخفض',  bg: 'var(--text3)', color: '#fff' },
};

function Badge({ cfg }) {
  if (!cfg) return null;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, border: cfg.border,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

function ActionBtn({ icon: Icon, title, onClick, color }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
        background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer',
        color: color || 'var(--text2)', transition: 'all .13s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-dim)'; e.currentTarget.style.color = 'var(--primary)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = color || 'var(--text2)'; }}
    >
      <Icon size={14} />
    </button>
  );
}

function AppointmentCard({ appt, index, isCurrent, onStatusChange }) {
  const navigate = useNavigate();
  const status = STATUS_BADGE[appt.status] || STATUS_BADGE.scheduled;
  const urgency = URGENCY_BADGE[appt.urgency];

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 16px', background: '#fff',
      borderBottom: '1px solid var(--border)',
      borderInlineEnd: `3px solid ${urgency ? 'var(--amber)' : 'var(--primary)'}`,
    }}>
      {/* Index */}
      <div style={{
        width: 22, height: 22, borderRadius: '50%', background: 'var(--bg)',
        display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--text3)',
        fontWeight: 600, flexShrink: 0, marginTop: 2,
      }}>
        {index}
      </div>

      {/* Time */}
      <div style={{ minWidth: 44, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
          {appt.timeSlot?.start}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>
          {appt.timeSlot?.end}
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {appt.patientId?.name || 'مريض'}
          </span>
          {urgency && <Badge cfg={urgency} />}
          <Badge cfg={status} />
        </div>
        {appt.status === 'pending' && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>معلق ⊘</span>
        )}
        {appt.chiefComplaint && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {appt.chiefComplaint}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
        <ActionBtn icon={Eye} title="عرض" onClick={() => navigate(`/appointments/${appt._id}`)} />
        <ActionBtn icon={X}   title="إلغاء" color="var(--rose)" onClick={() => onStatusChange(appt._id, 'cancelled')} />
        {isCurrent
          ? <ActionBtn icon={Check}    title="تم الحضور" color="var(--primary)" onClick={() => onStatusChange(appt._id, 'attended')} />
          : <ActionBtn icon={UserPlus} title="غرفة الانتظار" onClick={() => {}} />
        }
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 10px' }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 12,
        background: 'var(--primary)', color: '#fff',
      }}>
        {count}
      </span>
    </div>
  );
}

export default function TodayPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [showSearch, setShowSearch]     = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getAppointments()
      .then(setAppointments)
      .catch(() => setError('تعذّر تحميل المواعيد'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const updateStatus = async (id, status) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API_BASE}/api/appointments/${id}/status`, { status }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAppointments(prev => prev.map(a => a._id === id ? { ...a, status } : a));
    } catch {
      alert('فشل تحديث الحالة، حاول مجدداً');
    }
  };

  const { current, upcoming } = groupTodayAppointments(appointments);
  const todayCount = current.length + upcoming.length;

  const today = new Date();
  const dateLabel = today.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Topbar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#fff', borderBottom: '1px solid var(--border)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 20, cursor: 'pointer', padding: 4 }}>
          <Bell size={20} />
        </button>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          <span style={{ color: 'var(--text3)' }}>الرئيسية</span>
          <span style={{ margin: '0 6px', color: 'var(--text3)' }}>›</span>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>اليوم</span>
        </div>
        <div style={{ width: 28 }} />
      </div>

      <div style={{ padding: '20px 20px 40px' }}>
        {/* Patient search bar */}
        <div
          onClick={() => setShowSearch(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', background: '#fff', border: '1px solid var(--border)',
            borderRadius: 10, marginBottom: 20, cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>البحث عن مريض</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>ابحث عن مريض في شبكة نبض العيادات أو في...</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 7px', borderRadius: 5,
              background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text3)',
              fontFamily: 'monospace',
            }}>
              Ctrl K
            </span>
            <Search size={18} color="var(--text3)" />
          </div>
        </div>

        {/* Today section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} color="var(--primary)" />
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>مواعيد اليوم</span>
            {todayCount > 0 && (
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '1px 8px', borderRadius: 12,
                background: 'var(--primary)', color: '#fff',
              }}>
                {todayCount}
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{dateLabel}</span>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>جاري التحميل...</div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ color: 'var(--rose)', marginBottom: 12 }}>{error}</div>
            <button
              onClick={load}
              style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {!loading && !error && todayCount === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
            لا توجد مواعيد اليوم
          </div>
        )}

        {/* Now group */}
        {!loading && current.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
            <SectionHeader icon="🟢" title="الآن" count={current.length} />
            {current.map((a, i) => (
              <AppointmentCard
                key={a._id} appt={a} index={i + 1} isCurrent
                onStatusChange={updateStatus}
              />
            ))}
          </div>
        )}

        {/* Upcoming group */}
        {!loading && upcoming.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <SectionHeader icon="📅" title="القادم" count={upcoming.length} />
            {upcoming.map((a, i) => (
              <AppointmentCard
                key={a._id} appt={a} index={i + 1} isCurrent={false}
                onStatusChange={updateStatus}
              />
            ))}
          </div>
        )}
      </div>

      {showSearch && <PatientSearchModal onClose={() => setShowSearch(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify TodayPage renders**

Log in as doctor. You should see:
- Breadcrumb "الرئيسية › اليوم" in topbar
- Patient search bar with Ctrl+K shortcut
- Today's appointments grouped into "الآن" and "القادم"
- Appointment cards with time, patient name, status badge
- Ctrl+K opens search modal
- Cancel / mark-attended buttons work (check network tab for PATCH call)
- Empty state shows when no appointments

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/doctor/TodayPage.jsx
git commit -m "feat: add TodayPage with appointment groups, search bar, and action buttons"
```

---

### Task 7: Mobile — RTL + DoctorTabs + TodayScreen

**Files:**
- Modify: `apps/mobile/src/navigation/DoctorTabs.js`
- Create: `apps/mobile/src/screens/doctor/TodayScreen.js`

**Interfaces:**
- Consumes: `getAppointments` from existing `../../api/appointments` (mobile API client)
- Consumes: `groupTodayAppointments` — inline in TodayScreen (copy the same pure logic)
- Produces: `TodayScreen` default export; updated `DoctorTabs` default export

- [ ] **Step 1: Enforce RTL in mobile app entry point**

Find the mobile app entry point. Check `apps/mobile/App.js` or `apps/mobile/src/navigation/AppNavigator.js`:

```bash
cat apps/mobile/App.js 2>/dev/null || cat apps/mobile/src/App.js 2>/dev/null | head -20
```

In `AppNavigator.js` (or wherever user role is read after login), add RTL enforcement for doctor role. Open `apps/mobile/src/navigation/AppNavigator.js` and add at the top of the file (after imports):

```js
import { I18nManager } from 'react-native';
```

Inside the component, after `user` is read from auth store, add:

```js
// Force RTL for doctor role — requires app restart on first login
if (user?.role === 'doctor' && !I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}
```

- [ ] **Step 2: Create TodayScreen.js**

Create `apps/mobile/src/screens/doctor/TodayScreen.js`:

```js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAppointments } from '../../api/appointments';

const TEAL = '#0d9488';

// Inline grouping (same logic as web utility)
function parseTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function groupTodayAppointments(appointments) {
  const now = new Date();
  const today = appointments.filter(a => a.date && isSameDay(new Date(a.date), now));
  const current = today.filter(a => {
    const s = parseTime(a.timeSlot?.start), e = parseTime(a.timeSlot?.end);
    return s && e && s <= now && now <= e;
  });
  const upcoming = today.filter(a => {
    const s = parseTime(a.timeSlot?.start);
    return s && s > now;
  });
  return { current, upcoming };
}

const STATUS_LABEL = {
  confirmed: 'مؤكد',
  scheduled: 'مجدول',
  attended:  'تم الحضور',
  completed: 'تم الحضور',
  cancelled: 'ملغى',
  pending:   'معلق',
};

const STATUS_COLOR = {
  confirmed: TEAL,
  scheduled: '#8aa5b8',
  attended:  '#16a34a',
  completed: '#16a34a',
  cancelled: '#e11d48',
  pending:   '#8aa5b8',
};

function AppointmentCard({ appt, index }) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardAccent, { backgroundColor: appt.urgency === 'high' ? '#f59e0b' : TEAL }]} />
      <Text style={styles.cardIndex}>{index}</Text>
      <View style={styles.cardTime}>
        <Text style={styles.timeStart}>{appt.timeSlot?.start}</Text>
        <Text style={styles.timeEnd}>{appt.timeSlot?.end}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.patientName}>{appt.patientId?.name || 'مريض'}</Text>
        {appt.chiefComplaint ? (
          <Text style={styles.complaint} numberOfLines={1}>{appt.chiefComplaint}</Text>
        ) : null}
      </View>
      <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[appt.status] || '#8aa5b8' }]}>
        <Text style={styles.statusText}>{STATUS_LABEL[appt.status] || appt.status}</Text>
      </View>
    </View>
  );
}

function SectionHeader({ emoji, title, count }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionEmoji}>{emoji}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBadge}>
        <Text style={styles.sectionBadgeText}>{count}</Text>
      </View>
    </View>
  );
}

export default function TodayScreen() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await getAppointments();
      setAppointments(data || []);
    } catch {
      setError('تعذّر تحميل المواعيد');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { current, upcoming } = groupTodayAppointments(appointments);

  const today = new Date();
  const dateLabel = today.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={TEAL} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerDate}>{dateLabel}</Text>
        <Text style={styles.headerTitle}>اليوم</Text>
      </View>

      <FlatList
        data={[]}
        ListHeaderComponent={
          <>
            {error ? (
              <View style={styles.centered}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => load()} style={styles.retryBtn}>
                  <Text style={styles.retryText}>إعادة المحاولة</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {current.length === 0 && upcoming.length === 0 && !error ? (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>لا توجد مواعيد اليوم</Text>
              </View>
            ) : null}

            {current.length > 0 && (
              <View style={styles.section}>
                <SectionHeader emoji="🟢" title="الآن" count={current.length} />
                {current.map((a, i) => <AppointmentCard key={a._id} appt={a} index={i + 1} />)}
              </View>
            )}

            {upcoming.length > 0 && (
              <View style={styles.section}>
                <SectionHeader emoji="📅" title="القادم" count={upcoming.length} />
                {upcoming.map((a, i) => <AppointmentCard key={a._id} appt={a} index={i + 1} />)}
              </View>
            )}
          </>
        }
        renderItem={null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={TEAL} />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f8fafc' },
  header:          { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#d0dce8', alignItems: 'flex-end' },
  headerDate:      { fontSize: 12, color: '#8aa5b8' },
  headerTitle:     { fontSize: 20, fontWeight: '700', color: '#0f1923', marginTop: 2 },
  section:         { margin: 16, backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#d0dce8' },
  sectionHeader:   { flexDirection: 'row-reverse', alignItems: 'center', padding: 12, gap: 8 },
  sectionEmoji:    { fontSize: 14 },
  sectionTitle:    { fontSize: 14, fontWeight: '600', color: '#0f1923', flex: 1, textAlign: 'right' },
  sectionBadge:    { backgroundColor: TEAL, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  sectionBadgeText:{ color: '#fff', fontSize: 11, fontWeight: '700' },
  card:            { flexDirection: 'row-reverse', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#d0dce8', gap: 10 },
  cardAccent:      { width: 3, height: '100%', position: 'absolute', right: 0, top: 0, bottom: 0 },
  cardIndex:       { width: 22, height: 22, borderRadius: 11, backgroundColor: '#f1f5f9', textAlign: 'center', lineHeight: 22, fontSize: 11, color: '#8aa5b8', fontWeight: '600' },
  cardTime:        { alignItems: 'center', minWidth: 44 },
  timeStart:       { fontSize: 13, fontWeight: '700', color: TEAL, fontVariant: ['tabular-nums'] },
  timeEnd:         { fontSize: 11, color: '#8aa5b8', fontVariant: ['tabular-nums'] },
  cardInfo:        { flex: 1, alignItems: 'flex-end' },
  patientName:     { fontSize: 14, fontWeight: '600', color: '#0f1923' },
  complaint:       { fontSize: 11, color: '#8aa5b8', marginTop: 2 },
  statusBadge:     { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  statusText:      { fontSize: 11, fontWeight: '700', color: '#fff' },
  centered:        { padding: 40, alignItems: 'center' },
  errorText:       { color: '#e11d48', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  retryBtn:        { backgroundColor: TEAL, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText:       { color: '#fff', fontWeight: '600' },
  emptyText:       { color: '#8aa5b8', fontSize: 14 },
});
```

- [ ] **Step 3: Update DoctorTabs.js**

Replace the content of `apps/mobile/src/navigation/DoctorTabs.js` entirely:

```js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import TodayScreen          from '../screens/doctor/TodayScreen';
import AppointmentsScreen   from '../screens/doctor/AppointmentsScreen';
import PatientRecordsScreen from '../screens/doctor/PatientRecordsPage';  // adjust import to match actual filename
import SettingsScreen       from '../screens/doctor/SettingsScreen';

const Tab = createBottomTabNavigator();
const TEAL = '#0d9488';

function TabIcon({ emoji, focused }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

export default function DoctorTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TEAL,
        tabBarInactiveTintColor: '#8aa5b8',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { borderTopColor: '#d0dce8' },
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarLabel: 'اليوم',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Appointments"
        component={AppointmentsScreen}
        options={{
          tabBarLabel: 'المواعيد',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Patients"
        component={PatientRecordsScreen}
        options={{
          tabBarLabel: 'المرضى',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'الإعدادات',
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
```

> **Note:** `PatientRecordsScreen` — check the actual filename in `apps/mobile/src/screens/doctor/`. If it doesn't exist, use `DashboardScreen` temporarily and update when patient screen is built.

- [ ] **Step 4: Verify mobile**

```bash
cd apps/mobile && npx expo start
```

Log in as doctor on the simulator. Verify:
- Bottom tabs show: اليوم / المواعيد / المرضى / الإعدادات
- TodayScreen loads today's appointments
- Pull-to-refresh works
- Appointment cards show time, name, status badge

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/doctor/TodayScreen.js \
        apps/mobile/src/navigation/DoctorTabs.js \
        apps/mobile/src/navigation/AppNavigator.js
git commit -m "feat: add mobile TodayScreen, update DoctorTabs with bottom nav, enforce RTL"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `[data-doctor-theme]` teal tokens | Task 1 |
| `DoctorLayout` with `dir="rtl"` | Task 4 |
| Sidebar on the right (RTL grid) | Task 4 |
| Mobile drawer slides from right | Task 4 |
| DoctorSidebar 5 nav groups | Task 3 |
| "إضافة مريض" CTA button | Task 3 |
| Active state: teal + border-inline-end | Task 3 |
| User footer with initials + name + email | Task 3 |
| `AppLayout` untouched | Tasks 3–4 (DoctorProtected used instead) |
| New routes + stubs (ComingSoonPage) | Task 4 |
| `/dashboard` redirects to `/today` | Task 4 |
| `parseTime` + `groupTodayAppointments` | Task 2 |
| TodayPage topbar breadcrumb + bell | Task 6 |
| Patient search bar (Ctrl+K) | Tasks 5–6 |
| Appointment cards (time, name, badges, actions) | Task 6 |
| "الآن" / "القادم" grouping | Task 6 |
| Status update PATCH on cancel/attend | Task 6 |
| Error state + retry | Task 6 |
| Mobile RTL `I18nManager.forceRTL` | Task 7 |
| DoctorBottomTabs 4 tabs | Task 7 |
| Mobile TodayScreen with pull-to-refresh | Task 7 |
| lucide-react installed | Task 1 |
| @react-navigation/bottom-tabs installed | Task 1 |

**Placeholder scan:** None found.

**Type consistency:**
- `groupTodayAppointments` returns `{ current, upcoming }` — used identically in Task 6 (web) and Task 7 (mobile inline copy)
- `AppointmentCard` receives `appt`, `index`, `isCurrent`, `onStatusChange` — all defined and used in Task 6
- `PatientSearchModal` receives `onClose` — defined in Task 5, consumed in Task 6
