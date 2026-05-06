# Lab Role & Appointment Booking Workflow — Design Spec
Date: 2026-05-06

## Scope

Two features implemented together because they share auth/role infrastructure:

1. **Laboratory role** — third user type that uploads exam results; accounts need admin approval
2. **Complete appointment booking workflow** — multi-step flow: search → doctor profile + slot picker → booking request → confirmation, with per-doctor auto-accept setting

---

## 1. Data Model Changes

### User model
Add `laboratory` to role enum:
```
role: enum ['doctor', 'patient', 'laboratory']
```
`admin` is **not** added to this enum. Admin routes are protected by checking `process.env.ADMIN_SECRET` in a request header (`x-admin-secret`). Full admin role is Phase 2.

### Lab model (new)
```js
{
  userId:        ObjectId (ref: User, unique, required),
  labName:       String (required),
  licenseNumber: String,
  address:       String,
  isApproved:    Boolean (default: false),
}
```
Lab accounts are fully blocked from uploading results until `isApproved: true`. Approval is granted via admin route only — no self-approval path.

### Doctor model
Add one field:
```js
autoAcceptAppointments: Boolean (default: false)
```
The booking endpoint reads this flag post conflict-check. `true` → appointment status `confirmed`. `false` → status `pending`.

### Patient model
Add home location for search center:
```js
homeLocation: { type: 'Point', coordinates: [lng, lat] }
city: String
```
Used as default `$near` center when searching doctors. Patient sets `city` + coordinates via a new `PATCH /api/patients/me/location` endpoint, exposed as a simple "Set your location" input on the web Find Doctor page and in mobile profile settings. If unset, the doctor search runs without geo-sorting (results ordered by name).

### LabResult model
No schema change. RBAC on the upload endpoint updated to allow `laboratory` role (in addition to `doctor`), with `isApproved` gate enforced in middleware.

---

## 2. API

### Auth — `POST /api/auth/register`
- Accept `laboratory` role
- Create `Lab` document with `isApproved: false`
- Login response carries role — frontend routes lab users to `/lab`

### Doctor search — `GET /api/doctors`
- Add `name` query param → case-insensitive regex on `User.name`
- When `lat`/`lng` absent, fall back to requesting patient's `homeLocation`
- Existing `specialty` filter and `$near` geo query unchanged

### Available slots — `GET /api/doctors/:id/available-slots?date=YYYY-MM-DD`
New endpoint. Logic:
1. Resolve day-of-week from `date`
2. Find matching entry in `doctor.availabilitySlots`
3. Generate 30-min slots across the range
4. Query `Appointment` for `{ doctorId, date, status: { $in: ['pending','confirmed'] } }`
5. Return `[{ time: "09:00", available: true }, ...]`

### Booking — `POST /api/appointments`
After existing conflict check:
```js
const doctor = await Doctor.findOne({ userId: doctorId });
const status = doctor.autoAcceptAppointments ? 'confirmed' : 'pending';
```
No other change to this endpoint.

### Doctor settings — `PATCH /api/doctors/:id/settings`
New endpoint, doctor-only RBAC, ownership check.
Accepts: `{ autoAcceptAppointments: Boolean, availabilitySlots: [...] }`

### Lab results upload — `POST /api/lab-results`
- RBAC: allow `doctor` and `laboratory` roles
- For `laboratory` role: enforce `isApproved: true`, else 403
- `uploadedBy` field stores the caller's userId

### Lab uploads list — `GET /api/lab-results/my-uploads`
New endpoint. Returns results where `uploadedBy === req.user.id`. Lab role only.

### Admin — new thin routes
```
GET  /api/admin/labs          → list labs with isApproved: false
PATCH /api/admin/labs/:id/approve → set isApproved: true
```
Protected by `requireRole('admin')`. Admin JWT seeded manually for Phase 2 admin UI.

---

## 3. Web Frontend

### New routes
```
/doctor/:id        → DoctorProfilePage    (patient)
/book/:doctorId    → BookAppointmentPage  (patient)
/book/confirmed    → BookConfirmedPage    (patient)
/settings          → DoctorSettingsPage   (doctor)
/lab               → LabDashboardPage     (laboratory)
```
Root redirect: `laboratory` role → `/lab`.

### Booking flow

**`FindDoctorPage`** — replace hardcoded mock array with real `GET /api/doctors` call. Patient's `homeLocation` from their profile passed as `lat`/`lng`. Search input and specialty chips trigger re-fetch with debounce. Clicking a doctor card navigates to `/doctor/:id`.

**`DoctorProfilePage`** — doctor info card (name, specialty, bio, fee, rating). Below: 7-day date strip. Selecting a date calls `GET /api/doctors/:id/available-slots?date=`. Slots render as a grid of pill buttons: mint = available, grey/disabled = taken. Tapping an available slot navigates to `/book/:doctorId?date=&slot=`.

**`BookAppointmentPage`** — reads `date` + `slot` from URL search params. Shows summary card. Form: visit type dropdown + reason textarea. Submit → `POST /api/appointments`. On success redirect to `/book/confirmed?status=confirmed|pending`.

**`BookConfirmedPage`** — reads `status` from URL. If `confirmed`: "Your appointment is confirmed." If `pending`: "Request sent — waiting for doctor approval." Button → `/my-appointments`.

**`DoctorSettingsPage`** — toggle: "Auto-accept appointments". Calls `PATCH /api/doctors/:id/settings`. Availability slot editor: list of rows (day-of-week select + start time + end time + delete). Save button.

**`LabDashboardPage`** — if `!isApproved`: full-width banner "Your account is pending admin approval." If approved: upload form (patient search by name → select, test name, file input) + table of past uploads (test name, patient, date, status).

### Sidebar updates
- Doctor nav: add `Settings` entry → `/settings`
- Lab nav: `My Uploads` only
- Root redirect handles lab role routing

---

## 4. Mobile Frontend

### Navigation changes

`AppNavigator.js` — adds `laboratory` branch → `LabTabs`.

`PatientStack.js` (new) — stack navigator:
```
FindDoctorScreen → DoctorProfileScreen → BookAppointmentScreen → BookConfirmedScreen
```
`PatientTabs.js` — "Find Doctor" tab now uses `PatientStack` instead of direct screen.

`LabTabs.js` (new) — single tab: My Uploads screen.

### Booking flow

**`FindDoctorScreen`** — replaces mock data with `GET /api/doctors`. Passes patient's saved location. Search + specialty chips re-fetch on change. Tapping a card pushes `DoctorProfileScreen`.

**`DoctorProfileScreen`** — doctor card at top. Horizontal scrollable date strip (today + 6 days). Date tap fetches slots. Slot grid: mint pill = available, dark = taken. Tapping available slot pushes `BookAppointmentScreen` with `{ doctorId, doctorName, date, slot }` in route params.

**`BookAppointmentScreen`** — summary card from params. Visit type segmented control (initial / follow-up / check-up / urgent). Reason TextInput. "Request Appointment" button → `POST /api/appointments`. Navigates to `BookConfirmedScreen`.

**`BookConfirmedScreen`** — checkmark. Status: confirmed or pending message. "View My Appointments" button.

**`SettingsScreen`** (doctor, new tab) — toggle row "Auto-accept appointments" + availability slot editor (same logic as web).

**`LabUploadsScreen`** — pending approval state or upload form + flat list of uploads.

**`LoginScreen` / `RegisterScreen`** — add "Laboratory" as third role option.

---

## 5. RBAC Summary

| Action | doctor | patient | laboratory | admin |
|---|---|---|---|---|
| Search doctors | ✓ | ✓ | ✓ | ✓ |
| Book appointment | — | ✓ | — | — |
| Confirm/cancel appointment | ✓ | cancel only | — | — |
| Write prescription | ✓ | — | — | — |
| Write patient notes | ✓ | — | — | — |
| Upload lab result | ✓ | — | ✓ (approved) | — |
| View lab result | ✓ | own only | own uploads | — |
| Approve lab account | — | — | — | ✓ |

---

## 6. Key Constraints

- Lab upload blocked at API level (not just frontend) until `isApproved: true`
- Double-booking prevented atomically in `POST /api/appointments` (existing conflict check kept)
- `autoAcceptAppointments` read server-side — client cannot forge a `confirmed` status
- Patient location stored on Patient model, never sent as raw GPS in booking request
- All new endpoints follow existing auth middleware pattern (`auth` + `requireRole`)
