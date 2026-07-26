# Design Spec: Doctor Shell — Navigation + Today Dashboard

**Date:** 2026-07-18  
**Phase:** v2.0 — Clinic Management System  
**Module:** Navigation + Today Dashboard (web + mobile)  
**Approach:** B — New DoctorShell (isolated from patient/lab/pharmacy)

---

## 1. Scope

Build the foundational doctor-facing shell for the "نبض العيادات" (Nabdh Al-Iadaat) clinic management system. This phase delivers:

- `DoctorLayout` + `DoctorSidebar` (web) — replaces `AppLayout` for doctor routes
- `TodayPage` (web) — new doctor landing page showing today's appointments
- Teal color token override for doctor shell
- New routes + stubs for all sidebar nav items
- `DoctorBottomTabs` navigator (mobile)
- `TodayScreen` (mobile)
- RTL enforcement for doctor role (web + mobile)

**Out of scope:** Patient profile, dental chart, appointments calendar, billing, staff management — all future phases.

---

## 2. Layout Architecture (Web)

### 2.1 DoctorLayout

New file: `apps/web/src/components/layout/DoctorLayout.jsx`

- Wraps all doctor routes exclusively. `AppLayout.jsx` stays untouched for patient/lab/pharmacy.
- Root wrapper has `dir="rtl"` and `data-doctor-theme` attribute.
- Desktop grid: `240px sidebar | 1fr main` — sidebar on the right (RTL).
- Mobile: full-width column, sidebar becomes a right-side drawer triggered by hamburger in top-right of header.
- Drawer overlay: semi-transparent backdrop, closes on tap outside.

### 2.2 Router Change

`apps/web/src/router/index.jsx`:
- All `<Protected role="doctor">` wrappers switch from `AppLayout` to `DoctorLayout`.
- Doctor root redirect changes from `/dashboard` → `/today`.
- Existing `/dashboard` route kept as redirect → `/today` for backward compat.

### 2.3 Color Tokens

`apps/web/src/index.css` — add doctor theme block:

```css
[data-doctor-theme] {
  --primary:       #0d9488;   /* teal-600 */
  --primary-dim:   rgba(13, 148, 136, 0.12);
  --primary-text:  #ffffff;
  --primary-hover: #0f766e;   /* teal-700 */
}
```

Applied via `data-doctor-theme` on the `DoctorLayout` wrapper div. Light theme variables (`[data-theme="light"]`) remain active underneath — doctor shell is always light.

---

## 3. DoctorSidebar (Web)

New file: `apps/web/src/components/layout/DoctorSidebar.jsx`

### 3.1 Structure

```
Brand header
  └─ Logo icon + "نبض العيادات"

Primary CTA
  └─ [+ إضافة مريض] — teal filled button, opens CreatePatientModal

Nav group 1 (unlabeled)
  ├─ الرئيسية          → /today
  └─ اليوم             → /today

Nav group 2 (unlabeled)
  ├─ لوحة المختبر      → /lab-board
  ├─ المرضى            → /patients
  ├─ المواعيد          → /appointments
  └─ غرفة الانتظار     → /waiting-room

Nav group 3 — label: "المالية"
  ├─ خدمات العيادة     → /services
  ├─ الفواتير          → /invoices
  └─ التقارير          → /reports

Nav group 4 — label: "إدارة العيادة"
  ├─ الموظفين          → /staff
  ├─ ملف العيادة        → /clinic
  ├─ جدول العمل         → /schedule
  └─ إعدادات النظام    → /settings

Nav group 5 — label: "الدعم"
  ├─ اقتراحاتي         → /feedback
  └─ المساعدة          → /help

User footer
  └─ Avatar (initials) + Name + Email + options menu (⋮)
```

### 3.2 Active State

- Background: `var(--primary-dim)`
- Text color: `var(--primary)`
- Right border: `3px solid var(--primary)` (right = inline-end in RTL)
- Transition: `all 0.13s ease`

### 3.3 Group Labels

Font: 11px, uppercase, `var(--text3)`, 0.08em letter-spacing. Padding: 16px top, 8px bottom.

### 3.4 Icons

Lucide React icons (add as dependency). Each nav item gets a single icon at 16px. Group labels have no icon.

---

## 4. New Routes + Stubs (Web)

`apps/web/src/router/index.jsx` additions:

| Route | Component | Status |
|---|---|---|
| `/today` | `TodayPage` | **Implement** |
| `/lab-board` | `LabBoardPage` (stub) | Coming soon |
| `/patients` | existing `PatientRecordsPage` | Reuse |
| `/appointments` | existing `AppointmentsPage` | Reuse |
| `/waiting-room` | `WaitingRoomPage` (stub) | Coming soon |
| `/services` | `ServicesPage` (stub) | Coming soon |
| `/invoices` | `InvoicesPage` (stub) | Coming soon |
| `/reports` | `ReportsPage` (stub) | Coming soon |
| `/staff` | `StaffPage` (stub) | Coming soon |
| `/clinic` | `ClinicProfilePage` (stub) | Coming soon |
| `/schedule` | `SchedulePage` (stub) | Coming soon |
| `/settings` | existing `DoctorSettingsPage` | Reuse |
| `/feedback` | `FeedbackPage` (stub) | Coming soon |
| `/help` | `HelpPage` (stub) | Coming soon |

**Stub pattern:**
```jsx
export default function XxxPage() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
      قريباً
    </div>
  );
}
```

---

## 5. TodayPage (Web)

New file: `apps/web/src/pages/doctor/TodayPage.jsx`

### 5.1 Topbar

Sticky, white background, border-bottom.
- Right: bell icon (🔔) — no action this phase (stub)
- Center: breadcrumb "الرئيسية › اليوم"
- Left: sidebar collapse toggle icon

### 5.2 Patient Search Bar

Full-width card below topbar.

- Right side: label "البحث عن مريض" + subtitle
- Left side: search icon button
- Keyboard shortcut badge: `Ctrl K`
- On click / Ctrl+K: opens `PatientSearchModal` (new component)
- Modal calls `GET /api/patients?search=<query>` (existing endpoint)
- Results show patient name + phone + add-to-clinic CTA

### 5.3 Appointment Sections

**Data fetch:** `GET /api/appointments` filtered to today's date (existing `getAppointments()` API call).

**Grouping logic:**
```js
const now = new Date();
const todayAppts = appointments.filter(a => isSameDay(new Date(a.date), now));
const current = todayAppts.filter(a => {
  const start = parseTime(a.timeSlot?.start);
  const end   = parseTime(a.timeSlot?.end);
  return start <= now && now <= end;
});
const upcoming = todayAppts.filter(a => parseTime(a.timeSlot?.start) > now);
```

**Section header:** Icon + label ("مواعيد اليوم") + teal count badge.

**Group headers:** "🟢 الآن" and "📅 القادم" — rendered only when group is non-empty.

### 5.4 Appointment Card

```
┌──────────────────────────────────────────────────┐
│  [N]  [start]   [PatientName]  [urgency] [status]│
│       [end]     معلق ⊘                            │
│       👁  ✕  ✓/👤                                 │
└──────────────────────────────────────────────────┘
```

- **N:** Sequential number, small gray circle
- **Time:** `timeSlot.start` / `timeSlot.end` stacked, monospace font, teal color
- **Patient name:** `patientId.name`, 14px semibold
- **Urgency badge:** from `a.chiefComplaint` urgency field — "عالي" (amber), "متوسط" (blue), hidden if null
- **Status badge:**
  - `confirmed` → "مؤكد" teal filled
  - `scheduled` → "مجدول" gray outline
  - `attended` → "تم الحضور" green filled
  - `cancelled` → "ملغى" red outline
- **معلق tag:** shown when `a.status === 'pending'`
- **Actions (icon buttons, 28px):**
  - 👁 → navigate to appointment detail
  - ✕ → cancel confirmation dialog → `PATCH /api/appointments/:id/status`
  - ✓ (current group) → mark attended → `PATCH /api/appointments/:id/status`
  - 👤 (upcoming group) → move to waiting room → stub for now

**Left accent bar:** 3px, color matches urgency (teal default, amber if urgent).

---

## 6. Mobile (Expo / React Native)

### 6.1 RTL Enforcement

`apps/mobile/src/App.jsx` (or entry point): call once on startup for doctor role:

```js
import { I18nManager } from 'react-native';
if (user?.role === 'doctor') {
  I18nManager.forceRTL(true);
}
```

Requires app restart on first login if role switches — acceptable for MVP.

### 6.2 DoctorBottomTabs

New file: `apps/mobile/src/navigation/DoctorBottomTabs.jsx`

Uses `@react-navigation/bottom-tabs`:

| Tab | Icon | Route |
|---|---|---|
| اليوم | 🏠 | TodayScreen |
| المواعيد | 📅 | AppointmentsScreen (existing) |
| المرضى | 👥 | PatientsScreen (existing) |
| المزيد | ⋮ | MoreScreen (shows remaining nav as list) |

Active tab color: `#0d9488` (teal). Inactive: `#8aa5b8`.

### 6.3 TodayScreen

New file: `apps/mobile/src/screens/doctor/TodayScreen.jsx`

Mirrors TodayPage logic:
- Sticky header: date + bell icon
- Patient search bar (opens bottom-sheet modal)
- `ScrollView` with "الآن" and "القادم" sections
- Appointment cards match web design, full-width
- Pull-to-refresh calls `getAppointments()`
- Actions via swipe-left (cancel) or tap action row

---

## 7. Data Contracts

No new API endpoints required. All data uses existing:

| Action | Endpoint |
|---|---|
| Fetch appointments | `GET /api/appointments` |
| Search patients | `GET /api/patients?search=` |
| Update status | `PATCH /api/appointments/:id/status` |
| Create patient | `POST /api/patients` (existing modal) |

---

## 8. Component Tree

```
DoctorLayout
├── DoctorSidebar
│   ├── BrandHeader
│   ├── AddPatientButton → CreatePatientModal (existing)
│   ├── NavGroup (×5)
│   │   └── NavItem (×N)
│   └── UserFooter
├── DoctorTopbar
│   ├── BellIcon
│   ├── Breadcrumb
│   └── SidebarToggle
└── <page content>

TodayPage
├── PatientSearchBar → PatientSearchModal
├── AppointmentSection ("الآن")
│   └── AppointmentCard (×N)
└── AppointmentSection ("القادم")
    └── AppointmentCard (×N)
```

---

## 9. Failure Scenarios

- **Appointments fetch fails:** Show empty state with retry button. No crash.
- **Patient search timeout:** Debounce 300ms. Show spinner, then "لا توجد نتائج" on empty.
- **Status update fails:** Optimistic UI rolls back. Toast error: "فشل تحديث الحالة، حاول مجدداً".
- **RTL not applied on mobile (first launch):** App shows LTR until restart. Acceptable — one-time issue on first doctor login.

---

## 10. Security Notes

- No new endpoints → no new attack surface.
- Appointment status update (`PATCH`) already validates doctor ownership server-side.
- Patient search already scoped to doctor's clinic patients server-side.

---

## 11. Dependencies to Add

**Web:**
- `lucide-react` — icon set (tree-shakeable, ~2KB per icon)

**Mobile:**
- `@react-navigation/bottom-tabs` — check if already installed; add if missing

---

## 12. Out of Scope (Future Phases)

- Patient profile redesign
- Dental chart
- Appointments calendar (week/day/list view)
- Waiting room functionality
- Billing, services, reports
- Staff management
- Notifications (bell icon is stub this phase)
