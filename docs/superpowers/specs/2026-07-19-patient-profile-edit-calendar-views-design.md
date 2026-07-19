# Design: Patient Profile Inline Edit + Calendar Week/Month Views

**Date:** 2026-07-19  
**Scope:** Web only (`apps/web` + `apps/api`)  
**Pages affected:** `PatientDetailPage`, `AppointmentsPage`

---

## 1. Patient Profile Edit Panel

### Goal
Allow doctors to edit patient demographics and medical history directly from the patient profile overview tab — no modal, no separate page.

### Editable Fields

| Field | Input type |
|---|---|
| Date of birth | Date picker (recalculates displayed age) |
| Gender | Select: male / female / other |
| Blood type | Select: A+, A-, B+, B-, AB+, AB-, O+, O- |
| Allergies | Tag input (add/remove chips) |
| Chronic conditions | Tag input (add/remove chips) |
| Emergency contact name | Text input |
| Emergency contact phone | Text input |

### UX Behavior

- "Edit Profile" button appears in the health profile card (overview tab only)
- Clicking it enters edit mode: static display → form inputs, in-place within the same card
- Other tabs and cards remain static during edit mode
- A Save / Cancel bar appears at the bottom of the card
- **Cancel:** restores original values from `draftProfile` snapshot — no refetch required
- **Save:** PATCH request; button shows loading spinner + form disabled during request
- **On success:** exits edit mode, subtle success flash
- **On error:** inline error message below form, stays in edit mode, original data intact

### State (local to `PatientDetailPage`)

```
editMode: boolean
draftProfile: object      // shallow clone of profile on edit start
saving: boolean
saveError: string | null
```

### API Changes

**Frontend** — add to `apps/web/src/api/patients.js`:
```js
export const updatePatientByUserId = (userId, data) =>
  client.patch(`/patients/by-user/${userId}`, data);
```

**Backend** — new route: `PATCH /api/patients/by-user/:userId`
- Auth: `doctor` role only (RBAC middleware)
- Validation: Zod schema — all fields optional, enum checks for blood type / gender, string arrays for allergies / conditions, string for emergency contact fields
- Audit: `auditLog('Patient', 'update', req => req.params.userId)` middleware (reuse existing pattern)
- Returns: updated patient document

### Security
- Doctor can only update PHI fields listed above — not userId, role, or medical record IDs
- Backend whitelist: strip any fields not in the allowed set before update
- Audit log records every update (fire-and-forget, non-blocking)

---

## 2. Appointments Calendar: Week / Month View

### Goal
Add week and month grid views alongside the existing day view in `AppointmentsPage`. Doctors can switch between views to get a broader picture of their schedule.

### View Toggle

Three buttons — **Day / Week / Month** — placed in the header area next to the existing Schedule/Archive tabs. Only visible in Schedule mode (not in Archive).

### Day View
Unchanged. Existing 3-column layout (mini calendar + day schedule + detail panel) is preserved exactly.

### Week View

- 7-column grid: Sunday → Saturday for the week containing `selectedDate`
- Time rows: 08:00–20:00 in 30-minute increments
- Each appointment renders as a colored block in its slot:
  - Shows: patient name + visit type
  - Color: teal for active (`confirmed`/`in_progress`), muted grey for others
- Click a block → opens existing detail panel (col 3)
- Today's column: teal left border highlight
- Mini calendar (col 1) controls which week is shown
- Extracted as `WeekGrid` component in `apps/web/src/components/doctor/WeekGrid.jsx`

### Month View

- Standard grid: 5–6 rows × 7 columns
- Each day cell shows:
  - Appointment count badge
  - Up to 2 patient name chips
  - "+N more" overflow link → clicking switches to day view for that date
- Click any day → sets `selectedDate` and switches to day view
- Reuses existing dot/date logic from `apptDates` Set
- Extracted as `MonthGrid` component in `apps/web/src/components/doctor/MonthGrid.jsx`

### State Change

Add to existing `AppointmentsPage` state:
```js
const [calView, setCalView] = useState('day'); // 'day' | 'week' | 'month'
```

### Data
All three views read from the same `appointments` array already loaded by `getAppointments()`. No new API calls for view switching. Cancelled appointments filtered out in week/month views (same rule as existing dot logic).

### Mobile
Week and month views are hidden on mobile (`isMobile` check). Mobile already has the day navigator — no regression.

### View Persistence
Not persisted. Resets to day view on page reload (YAGNI).

---

## 3. Component Boundaries

```
apps/web/src/
  pages/doctor/
    PatientDetailPage.jsx     — add editMode state + form fields to overview card
    AppointmentsPage.jsx      — add calView state + view toggle buttons
  components/doctor/
    WeekGrid.jsx              — new: pure display, props: appointments, selectedDate, onSelectDate, onSelectAppointment
    MonthGrid.jsx             — new: pure display, props: appointments, selectedDate, onSelectDate
  api/
    patients.js               — add updatePatientByUserId()
apps/api/src/
  routes/patients.js          — add PATCH /by-user/:userId route
```

---

## 4. Out of Scope

- Drag-to-reschedule
- Create appointment from calendar slot
- Mobile week/month views
- View preference persistence
- Patient profile editing on mobile
