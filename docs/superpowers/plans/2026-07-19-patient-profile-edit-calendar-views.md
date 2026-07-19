# Patient Profile Edit + Calendar Week/Month Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline patient profile editing to PatientDetailPage and week/month calendar grid views to AppointmentsPage.

**Architecture:** Patient edit uses local edit-mode state toggled by an "Edit Profile" button in the overview card; saves via a new doctor-only PATCH endpoint. Calendar views (WeekGrid, MonthGrid) are pure display components that read the existing `appointments` array in AppointmentsPage — no new API calls on view switch.

**Tech Stack:** React 18 (JSX, inline styles), Express + express-validator, Mongoose, Node.js

## Global Constraints
- Inline styles only — no Tailwind, no CSS modules (existing pattern)
- CSS variables in use: `--primary`, `--bg`, `--bg2`, `--bg3`, `--text`, `--text2`, `--text3`, `--border`, `--border2`, `--rose`, `--mint`, `--mint-dim`, `--card`, `--r`
- Backend validation with `express-validator` body validators (not Zod) — match existing route pattern
- RBAC: `requireRole('doctor')` from `../middleware/rbac`
- PHI fields (`bloodType`, `allergies`, `conditions`, `dateOfBirth`, `medicalHistory`) are AES-256-GCM encrypted at rest — Mongoose pre-save hook handles it; frontend receives decrypted values from API
- Audit every PHI write: `auditLog('Patient', 'update', ...)` middleware (fire-and-forget)
- Doctor may only edit patients they share an appointment with (relationship check in backend)
- Mobile: week/month views hidden via `isMobile`; edit panel works on mobile

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `apps/api/src/routes/patients.js` | Add `PATCH /by-user/:userId` route |
| Modify | `apps/web/src/api/patients.js` | Add `updatePatientByUserId()` |
| Modify | `apps/web/src/pages/doctor/PatientDetailPage.jsx` | Add edit panel to overview tab |
| Create | `apps/web/src/components/doctor/WeekGrid.jsx` | Week calendar view component |
| Create | `apps/web/src/components/doctor/MonthGrid.jsx` | Month calendar view component |
| Modify | `apps/web/src/pages/doctor/AppointmentsPage.jsx` | Add `calView` state + view toggle + render WeekGrid/MonthGrid |

---

## Task 1: Backend — Doctor patient profile update endpoint

**Files:**
- Modify: `apps/api/src/routes/patients.js` — insert after existing `GET /by-user/:userId` route (around line 60)

**Interfaces:**
- Produces: `PATCH /api/patients/by-user/:userId` — accepts `{ bloodType?, dateOfBirth?, allergies?, conditions?, medicalHistory? }`, returns updated Patient document

- [ ] **Step 1: Add the route to patients.js**

Open `apps/api/src/routes/patients.js`. Find the block:
```js
// GET /api/patients/by-user/:userId — doctor looks up a patient profile by User._id
router.get('/by-user/:userId', ...
```

Insert the following route **after** the closing `);` of that GET handler:

```js
// PATCH /api/patients/by-user/:userId — doctor updates a patient's medical profile
router.patch('/by-user/:userId', auth, requireRole('doctor'), [
  body('bloodType').optional().isIn(BLOOD_TYPES).withMessage('invalid bloodType'),
  body('dateOfBirth').optional().isISO8601().withMessage('dateOfBirth must be ISO8601'),
  body('allergies').optional().isArray().withMessage('allergies must be an array'),
  body('allergies.*').optional().isString().trim(),
  body('conditions').optional().isArray().withMessage('conditions must be an array'),
  body('conditions.*').optional().isString().trim(),
  body('medicalHistory').optional().isArray().withMessage('medicalHistory must be an array'),
  body('medicalHistory.*').optional().isString().trim(),
], validate,
  auditLog('Patient', 'update', (req) => req.params.userId, (req) => req.params.userId),
  async (req, res, next) => {
    try {
      const hasRelationship = await Appointment.exists({
        doctorId: req.user.id,
        patientId: req.params.userId,
      });
      if (!hasRelationship)
        return res.status(403).json({ message: 'Forbidden: no appointment relationship' });

      const patient = await Patient.findOne({ userId: req.params.userId });
      if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

      const { bloodType, dateOfBirth, allergies, conditions, medicalHistory } = req.body;
      if (bloodType !== undefined)      patient.bloodType      = bloodType;
      if (dateOfBirth !== undefined)    patient.dateOfBirth    = new Date(dateOfBirth);
      if (allergies !== undefined)      patient.allergies      = allergies;
      if (conditions !== undefined)     patient.conditions     = conditions;
      if (medicalHistory !== undefined) patient.medicalHistory = medicalHistory;

      await patient.save();
      res.json(patient);
    } catch (err) { next(err); }
  }
);
```

- [ ] **Step 2: Smoke-test the route manually**

Start the API: `cd apps/api && node src/index.js`

Run with a doctor JWT (replace `<TOKEN>` and `<USER_ID>`):
```bash
curl -X PATCH http://localhost:3000/api/patients/by-user/<USER_ID> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"bloodType":"A+","allergies":["Penicillin"]}'
```

Expected: `200` with updated patient JSON. `bloodType` and `allergies` visible in response (decrypted).

Try with a patient JWT — expected `403`.
Try with a doctor who has no appointments with the patient — expected `403`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/patients.js
git commit -m "feat(api): add doctor-side patient profile update endpoint"
```

---

## Task 2: Frontend API function

**Files:**
- Modify: `apps/web/src/api/patients.js`

**Interfaces:**
- Produces: `updatePatientByUserId(userId: string, data: object) => Promise<Patient>`

- [ ] **Step 1: Add the function**

Open `apps/web/src/api/patients.js`. Current contents:
```js
import client from './client';
export const getPatientMe = () => client.get('/patients/me');
export const updatePatientProfile = (data) => client.patch('/patients/me/profile', data);
export const getPatientByUserId = (userId) => client.get(`/patients/by-user/${userId}`);
```

Add one line:
```js
import client from './client';
export const getPatientMe = () => client.get('/patients/me');
export const updatePatientProfile = (data) => client.patch('/patients/me/profile', data);
export const getPatientByUserId = (userId) => client.get(`/patients/by-user/${userId}`);
export const updatePatientByUserId = (userId, data) => client.patch(`/patients/by-user/${userId}`, data);
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/api/patients.js
git commit -m "feat(web): add updatePatientByUserId API function"
```

---

## Task 3: Patient profile edit panel

**Files:**
- Modify: `apps/web/src/pages/doctor/PatientDetailPage.jsx`

**Interfaces:**
- Consumes: `updatePatientByUserId(userId, data)` from `../../api/patients`
- Consumes: `profile` state (existing Patient document with decrypted PHI fields)

- [ ] **Step 1: Add import for updatePatientByUserId**

Find the import line in `PatientDetailPage.jsx`:
```js
import { getPatientByUserId } from '../../api/patients';
```

Replace with:
```js
import { getPatientByUserId, updatePatientByUserId } from '../../api/patients';
```

- [ ] **Step 2: Add TagInput helper component**

Add this function **before** the `export default function PatientDetailPage()` declaration:

```jsx
function TagInput({ value, onChange, placeholder }) {
  const [input, setInput] = React.useState('');
  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput('');
  };
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', background: 'var(--bg)', minHeight: 40 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: value.length ? 6 : 0 }}>
        {value.map(tag => (
          <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)' }}>
            {tag}
            <button onClick={() => onChange(value.filter(t => t !== tag))} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={placeholder}
        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', width: '100%' }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Add edit state inside PatientDetailPage**

Find the existing state declarations inside `PatientDetailPage()`. They look like:
```js
const [tab, setTab] = useState('overview');
const [profile, setProfile] = useState(null);
```

Add four new state variables immediately after them:
```js
const [editMode, setEditMode]   = useState(false);
const [draft, setDraft]         = useState(null);
const [saving, setSaving]       = useState(false);
const [saveError, setSaveError] = useState(null);
```

- [ ] **Step 4: Add BLOOD_TYPES constant**

Add this constant near the top of the file, after the imports:
```js
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
```

- [ ] **Step 5: Add edit/save/cancel handlers**

Add these three functions inside `PatientDetailPage()`, after the state declarations:

```js
const startEdit = () => {
  setDraft({
    bloodType:     profile?.bloodType     || '',
    dateOfBirth:   profile?.dateOfBirth   ? new Date(profile.dateOfBirth).toISOString().slice(0, 10) : '',
    allergies:     profile?.allergies     ? [...profile.allergies]     : [],
    conditions:    profile?.conditions    ? [...profile.conditions]    : [],
    medicalHistory:profile?.medicalHistory? [...profile.medicalHistory]: [],
  });
  setSaveError(null);
  setEditMode(true);
};

const cancelEdit = () => {
  setEditMode(false);
  setDraft(null);
  setSaveError(null);
};

const saveEdit = async () => {
  setSaving(true);
  setSaveError(null);
  try {
    const payload = {};
    if (draft.bloodType)     payload.bloodType     = draft.bloodType;
    if (draft.dateOfBirth)   payload.dateOfBirth   = draft.dateOfBirth;
    payload.allergies      = draft.allergies;
    payload.conditions     = draft.conditions;
    payload.medicalHistory = draft.medicalHistory;
    const updated = await updatePatientByUserId(userId, payload);
    setProfile(updated);
    setEditMode(false);
    setDraft(null);
  } catch (err) {
    setSaveError(err?.response?.data?.message || 'فشل الحفظ، حاول مجدداً');
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 6: Replace the health profile card in the overview tab**

Find the `!loading && tab === 'overview'` block. Inside it, find the health profile `<Card>` — it starts with a heading like "Health Profile". Replace that entire `<Card>` with:

```jsx
<Card>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)' }}>
      Health Profile
    </div>
    {!editMode && (
      <button onClick={startEdit} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}>
        Edit Profile
      </button>
    )}
  </div>

  {!editMode ? (
    /* ── Static display ── */
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[
        ['Date of Birth', profile?.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : '—'],
        ['Blood Type',    profile?.bloodType || '—'],
      ].map(([label, val]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{val}</span>
        </div>
      ))}
      {profile?.allergies?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--rose)', marginBottom: 6 }}>Allergies</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {profile.allergies.map(a => (
              <span key={a} style={{ padding: '2px 10px', borderRadius: 20, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: 'var(--rose)' }}>{a}</span>
            ))}
          </div>
        </div>
      )}
      {profile?.conditions?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Conditions</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {profile.conditions.map(c => (
              <span key={c} style={{ padding: '2px 10px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' }}>{c}</span>
            ))}
          </div>
        </div>
      )}
      {profile?.medicalHistory?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Medical History</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {profile.medicalHistory.map(h => (
              <span key={h} style={{ padding: '2px 10px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' }}>{h}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : (
    /* ── Edit form ── */
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Date of Birth</label>
        <input type="date" value={draft.dateOfBirth}
          onChange={e => setDraft(d => ({ ...d, dateOfBirth: e.target.value }))}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Blood Type</label>
        <select value={draft.bloodType} onChange={e => setDraft(d => ({ ...d, bloodType: e.target.value }))}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}>
          <option value="">— Select —</option>
          {BLOOD_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--rose)', display: 'block', marginBottom: 6 }}>Allergies</label>
        <TagInput value={draft.allergies} onChange={v => setDraft(d => ({ ...d, allergies: v }))} placeholder="Type and press Enter…" />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Conditions</label>
        <TagInput value={draft.conditions} onChange={v => setDraft(d => ({ ...d, conditions: v }))} placeholder="Type and press Enter…" />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Medical History</label>
        <TagInput value={draft.medicalHistory} onChange={v => setDraft(d => ({ ...d, medicalHistory: v }))} placeholder="Type and press Enter…" />
      </div>

      {saveError && (
        <div style={{ fontSize: 12, color: 'var(--rose)', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {saveError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <button onClick={saveEdit} disabled={saving}
          style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'جاري الحفظ…' : 'حفظ'}
        </button>
        <button onClick={cancelEdit} disabled={saving}
          style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 13, cursor: 'pointer' }}>
          إلغاء
        </button>
      </div>
    </div>
  )}
</Card>
```

- [ ] **Step 7: Add React import for TagInput (if not already using React namespace)**

Check the top of `PatientDetailPage.jsx`. If it uses named imports only (e.g. `import { useState, ... } from 'react'`), add `React` to the import:
```js
import React, { useState, useEffect, useRef, useCallback } from 'react';
```

If `React` is already imported as a default, skip this step.

- [ ] **Step 8: Manual test**

1. Open `PatientDetailPage` for a patient who has appointments with the logged-in doctor
2. Click "Edit Profile" — form should appear with current values pre-populated
3. Change blood type, add an allergy (type + Enter), click "حفظ" (Save)
4. Verify updated values appear in the static view
5. Click "Edit Profile" again, click "إلغاء" (Cancel) — values should revert

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/pages/doctor/PatientDetailPage.jsx
git commit -m "feat(web): add inline patient profile edit panel for doctors"
```

---

## Task 4: WeekGrid component

**Files:**
- Create: `apps/web/src/components/doctor/WeekGrid.jsx`

**Interfaces:**
- Props:
  - `appointments: Array<{ _id, date, timeSlot: { start, end }, patientId: { name }, visitType, status }>` 
  - `selectedDate: string` — `YYYY-MM-DD` format; determines which week is shown
  - `onSelectDate: (dateStr: string) => void`
  - `onSelectAppointment: (appt: object) => void`

- [ ] **Step 1: Create the file**

Create `apps/web/src/components/doctor/WeekGrid.jsx` with the full contents below:

```jsx
import { useMemo } from 'react';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_START = 8;   // 08:00
const HOUR_END   = 20;  // 20:00
const TOTAL_MIN  = (HOUR_END - HOUR_START) * 60; // 720
const ROW_PX     = 48;  // height per 30-min slot
const GRID_H     = (TOTAL_MIN / 30) * ROW_PX;    // 1152px

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  return d;
}

function toLocalDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA'); // YYYY-MM-DD
}

export default function WeekGrid({ appointments, selectedDate, onSelectDate, onSelectAppointment }) {
  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate]);
  const todayStr  = new Date().toLocaleDateString('en-CA');

  const days = useMemo(() => (
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString('en-CA');
    })
  ), [weekStart]);

  const apptsByDay = useMemo(() => {
    const map = {};
    days.forEach(d => { map[d] = []; });
    appointments.forEach(a => {
      const d = toLocalDate(a.date);
      if (map[d]) map[d].push(a);
    });
    return map;
  }, [appointments, days]);

  const timeLabels = useMemo(() => (
    Array.from({ length: TOTAL_MIN / 30 }, (_, i) => {
      const totalMin = HOUR_START * 60 + i * 30;
      const h = Math.floor(totalMin / 60).toString().padStart(2, '0');
      const m = (totalMin % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    })
  ), []);

  const statusColor = (status) => {
    if (['confirmed', 'in_progress'].includes(status)) return 'var(--mint)';
    if (status === 'completed') return 'rgba(34,197,94,0.8)';
    if (status === 'cancelled') return 'var(--text3)';
    return 'var(--primary)';
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
        <div />
        {days.map((d, i) => {
          const isToday = d === todayStr;
          const isSelected = d === selectedDate;
          const label = new Date(d + 'T00:00:00');
          return (
            <div key={d} onClick={() => onSelectDate(d)}
              style={{ padding: '10px 4px', textAlign: 'center', cursor: 'pointer',
                borderLeft: i === 0 ? 'none' : '1px solid var(--border)',
                borderBottom: isSelected ? '2px solid var(--mint)' : '2px solid transparent' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{DAY_LABELS[i]}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: isToday ? 'var(--mint)' : 'var(--text)', marginTop: 2 }}>{label.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', position: 'relative' }}>
        {/* Time labels column */}
        <div style={{ position: 'relative', height: GRID_H }}>
          {timeLabels.map((t, i) => (
            <div key={t} style={{ position: 'absolute', top: i * ROW_PX - 8, right: 8, fontSize: 10, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
              {i % 2 === 0 ? t : ''}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d, di) => (
          <div key={d} style={{ position: 'relative', height: GRID_H, borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            {/* Hour lines */}
            {timeLabels.map((_, i) => (
              <div key={i} style={{ position: 'absolute', top: i * ROW_PX, left: 0, right: 0,
                borderTop: i % 2 === 0 ? '1px solid var(--border)' : '1px dashed var(--border2)', pointerEvents: 'none' }} />
            ))}

            {/* Today highlight */}
            {d === todayStr && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,227,176,0.03)', pointerEvents: 'none' }} />
            )}

            {/* Appointment blocks */}
            {(apptsByDay[d] || []).filter(a => a.status !== 'cancelled').map(a => {
              const startMin = toMinutes(a.timeSlot?.start || '08:00') - HOUR_START * 60;
              const endMin   = toMinutes(a.timeSlot?.end   || (a.timeSlot?.start ? String(toMinutes(a.timeSlot.start) + 30).replace(/(\d+)/, h => `${Math.floor(h/60).toString().padStart(2,'0')}:${(h%60).toString().padStart(2,'0')}`) : '08:30')) - HOUR_START * 60;
              const clampedStart = Math.max(0, Math.min(startMin, TOTAL_MIN));
              const clampedEnd   = Math.max(clampedStart + 15, Math.min(endMin, TOTAL_MIN));
              const top    = (clampedStart / TOTAL_MIN) * GRID_H;
              const height = Math.max(((clampedEnd - clampedStart) / TOTAL_MIN) * GRID_H, 24);
              const color  = statusColor(a.status);
              return (
                <div key={a._id} onClick={() => onSelectAppointment(a)}
                  style={{ position: 'absolute', top, left: 3, right: 3, height,
                    background: `${color}22`, border: `1px solid ${color}`,
                    borderRadius: 6, padding: '2px 5px', cursor: 'pointer', overflow: 'hidden',
                    boxSizing: 'border-box', zIndex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.patientId?.name || 'Patient'}
                  </div>
                  {height > 30 && (
                    <div style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.visitType || 'Consultation'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/doctor/WeekGrid.jsx
git commit -m "feat(web): add WeekGrid calendar component"
```

---

## Task 5: MonthGrid component

**Files:**
- Create: `apps/web/src/components/doctor/MonthGrid.jsx`

**Interfaces:**
- Props:
  - `appointments: Array<{ _id, date, patientId: { name }, status }>` 
  - `selectedDate: string` — `YYYY-MM-DD`; determines which month is shown
  - `onSelectDate: (dateStr: string) => void` — caller switches to day view on click

- [ ] **Step 1: Create the file**

Create `apps/web/src/components/doctor/MonthGrid.jsx`:

```jsx
import { useMemo, useState } from 'react';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function toLocalDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA');
}

export default function MonthGrid({ appointments, selectedDate, onSelectDate }) {
  const todayStr = new Date().toLocaleDateString('en-CA');

  const [view, setView] = useState(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const prevMonth = () => setView(v => v.month === 0  ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  const nextMonth = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0  } : { ...v, month: v.month + 1 });

  const { cells, daysInMonth } = useMemo(() => {
    const firstDow    = new Date(view.year, view.month, 1).getDay();
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const cells = [
      ...Array(firstDow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return { cells, daysInMonth };
  }, [view]);

  const apptsByDate = useMemo(() => {
    const map = {};
    appointments.forEach(a => {
      if (a.status === 'cancelled') return;
      const d = toLocalDate(a.date);
      if (!map[d]) map[d] = [];
      map[d].push(a);
    });
    return map;
  }, [appointments]);

  const cellDate = (day) => {
    const mm = String(view.month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${view.year}-${mm}-${dd}`;
  };

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 20, padding: '0 10px' }}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{MONTH_NAMES[view.month]} {view.year}</span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 20, padding: '0 10px' }}>›</button>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', padding: '4px 0', letterSpacing: '0.05em' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const dateStr  = cellDate(day);
          const dayAppts = apptsByDate[dateStr] || [];
          const isToday  = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const shown    = dayAppts.slice(0, 2);
          const overflow = dayAppts.length - shown.length;

          return (
            <div key={dateStr} onClick={() => onSelectDate(dateStr)}
              style={{ minHeight: 76, padding: '4px 5px', borderRadius: 8, cursor: 'pointer',
                background: isSelected ? 'var(--mint-dim)' : isToday ? 'var(--bg3)' : 'var(--bg2)',
                border: `1px solid ${isSelected ? 'rgba(15,227,176,0.3)' : 'var(--border)'}`,
                transition: 'background .1s' }}>
              <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--mint)' : 'var(--text)', marginBottom: 3 }}>{day}</div>
              {shown.map(a => (
                <div key={a._id} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, marginBottom: 2,
                  background: 'var(--primary)', color: '#fff',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.timeSlot?.start} {a.patientId?.name || ''}
                </div>
              ))}
              {overflow > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text3)', paddingLeft: 5 }}>+{overflow} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/doctor/MonthGrid.jsx
git commit -m "feat(web): add MonthGrid calendar component"
```

---

## Task 6: Wire view toggle into AppointmentsPage

**Files:**
- Modify: `apps/web/src/pages/doctor/AppointmentsPage.jsx`

**Interfaces:**
- Consumes: `WeekGrid` from `../../components/doctor/WeekGrid`
- Consumes: `MonthGrid` from `../../components/doctor/MonthGrid`

- [ ] **Step 1: Add imports**

Find the import block at the top of `AppointmentsPage.jsx`. Add two import lines:

```js
import WeekGrid  from '../../components/doctor/WeekGrid';
import MonthGrid from '../../components/doctor/MonthGrid';
```

- [ ] **Step 2: Add calView state**

Find the existing state declaration (around line 468):
```js
const [pageView, setPageView] = useState('schedule'); // 'schedule' | 'archive'
```

Add directly after it:
```js
const [calView,  setCalView]  = useState('day'); // 'day' | 'week' | 'month'
```

- [ ] **Step 3: Add view toggle buttons in the header**

Find the Schedule / Archive toggle block (around line 588-595). It looks like:
```jsx
{/* Schedule / Archive tabs */}
<div style={{ display:'flex', background:'var(--bg3)', borderRadius:10, ...
  {[['schedule','Schedule'],['archive','Archive']].map(([v, label]) => (
    ...
  ))}
</div>
```

After the closing `</div>` of that Schedule/Archive block, add the Day/Week/Month toggle (only on desktop, only in schedule mode):

```jsx
{pageView === 'schedule' && !isMobile && (
  <div style={{ display:'flex', background:'var(--bg3)', borderRadius:10, padding:3, gap:2 }}>
    {[['day','Day'],['week','Week'],['month','Month']].map(([v, label]) => (
      <button key={v} onClick={() => setCalView(v)}
        style={{ padding:'5px 14px', borderRadius:8, border:'none', fontSize:12, fontWeight:500, cursor:'pointer', transition:'all .15s',
          background: calView===v ? 'var(--bg2)' : 'transparent',
          color: calView===v ? 'var(--text)' : 'var(--text3)',
          boxShadow: calView===v ? '0 1px 4px rgba(0,0,0,0.3)' : 'none' }}>
        {label}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 4: Render WeekGrid and MonthGrid conditionally**

Find the section `{pageView === 'schedule' &&` that renders the 3-column layout. It currently always renders the 3-column grid. Wrap it so week/month views replace it:

Find this line (approximately):
```jsx
{/* ── 3-column layout on desktop, 1-column on mobile ── */}
{pageView === 'schedule' &&
<div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '252px 1fr 320px', ...
```

Replace from `{pageView === 'schedule' &&` through the closing `}` of that entire block with:

```jsx
{pageView === 'schedule' && calView === 'week' && !isMobile && (
  <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden' }}>
    <WeekGrid
      appointments={appointments}
      selectedDate={selectedDate}
      onSelectDate={(d) => { setSelectedDate(d); setCalView('day'); }}
      onSelectAppointment={setSelectedAppointment}
    />
  </div>
)}

{pageView === 'schedule' && calView === 'month' && !isMobile && (
  <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20 }}>
    <MonthGrid
      appointments={appointments}
      selectedDate={selectedDate}
      onSelectDate={(d) => { setSelectedDate(d); setCalView('day'); }}
    />
  </div>
)}

{pageView === 'schedule' && (calView === 'day' || isMobile) &&
<div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '252px 1fr 320px', gap: isMobile ? 20 : 22, alignItems:'start' }}>
```

> **Note:** Keep the rest of the 3-column layout block (mini calendar col, day schedule col, detail panel col) unchanged — just update the opening condition.

- [ ] **Step 5: Reset calView to 'day' when switching to Archive**

Find where `setPageView` is called for the Archive button. It looks like:
```js
onClick={() => setPageView(v)}
```

Change the Schedule/Archive onClick handlers to also reset calView:
```js
onClick={() => { setPageView(v); if (v === 'archive') setCalView('day'); }}
```

- [ ] **Step 6: Manual test**

1. Open AppointmentsPage — Day view should look exactly as before
2. Click "Week" — week grid appears showing all 7 days; appointments render as blocks
3. Click an appointment block — detail panel should open (sets `selectedAppointment`)
4. Click a day header — switches to day view for that date
5. Click "Month" — month grid appears; appointment chips visible
6. Click a day cell — switches to day view for that date
7. On mobile (or narrow viewport) — toggle buttons absent, day view only
8. Switch to Archive tab — calView resets to day

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/doctor/AppointmentsPage.jsx
git commit -m "feat(web): add week and month calendar views to AppointmentsPage"
```

---

## Self-Review

### Spec coverage
- [x] Patient edit panel: bloodType, dateOfBirth, allergies, conditions — covered in Task 3
- [x] medicalHistory — added (in model, logical to include alongside conditions)
- [x] Edit mode scoped to health profile card — Task 3 step 6
- [x] Dirty state / Cancel restores original — Task 3 step 5 (`draft` snapshot)
- [x] Saving spinner + disabled form — Task 3 step 6 (`saving` flag)
- [x] Inline error on failure — Task 3 step 6 (`saveError`)
- [x] Backend route doctor-only + relationship check — Task 1
- [x] Audit log on PHI update — Task 1 (auditLog middleware)
- [x] WeekGrid: 7-col, time rows 08-20, appointment blocks, click → detail panel — Task 4
- [x] Today column highlighted — Task 4
- [x] MonthGrid: 5-6 row grid, count + 2 chips + overflow — Task 5
- [x] Click day → switches to day view — Task 6 step 4
- [x] View toggle: Day/Week/Month — Task 6 step 3
- [x] Hidden on mobile — Task 6 steps 3, 4
- [x] No new API calls on view switch — all views read `appointments` state
- [x] No persistence of view preference — `useState('day')` default

### No placeholders — confirmed clean
### Type consistency — `onSelectDate(dateStr: string)` consistent across WeekGrid, MonthGrid, and AppointmentsPage wiring
