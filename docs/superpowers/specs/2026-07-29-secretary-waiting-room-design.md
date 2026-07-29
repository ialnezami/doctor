# Secretary Role + Waiting Room — Design Spec

**Date:** 2026-07-29
**App:** Salamtak (doctor-facing web + shared API)
**Routes:** `/secretary/waiting-room` · `/secretary/today` · `/secretary/invoices` · `/accept-invite`

---

## Goal

Add a `secretary` role that clinic staff can use to manage the waiting room queue and today's appointments without accessing medical data. Patients check in via a QR code unique to their appointment; secretaries see the live queue and call patients in order.

## Architecture

No new MongoDB collections. Two existing models gain new fields. New backend routes handle staff invitation, QR check-in, and waiting room queries. New frontend surfaces give secretaries a scoped dashboard and give doctors a staff management tab in settings.

---

## 1. Data Model Changes

### User model

Two new fields (no new collection):

```js
linkedDoctorId: { type: ObjectId, ref: 'Doctor' }   // secretary only; null for all other roles
isActive:       { type: Boolean, default: true }      // false until invite accepted
inviteToken:    { type: String }                       // bcrypt-hashed invite token; cleared on activation
inviteExpiry:   { type: Date }                         // invite expires 72 h after sending
```

Role enum gains `'secretary'`. Existing roles unchanged.

### Appointment model

Two new fields:

```js
qrToken:     { type: String, unique: true, sparse: true }
checkedInAt: { type: Date }
```

`qrToken` is generated with `crypto.randomBytes(32).toString('hex')` at appointment creation time. Sparse unique index so null rows don't conflict. `checkedInAt` is stamped when the patient scans the QR.

The waiting room queue is derived — no separate collection: today's appointments where `checkedInAt` is set, ordered by `checkedInAt` ASC.

---

## 2. Authentication & Invitation Flow

### Secretary JWT

Same `POST /api/auth/login` endpoint — no separate login URL. JWT payload for secretaries:

```json
{ "userId": "...", "role": "secretary", "linkedDoctorId": "doctor_id_here" }
```

All secretary API calls are automatically scoped to `linkedDoctorId` by backend middleware. The secretary never passes a doctorId explicitly.

### Invitation Flow

```
Doctor → Settings → الموظفون tab
  → enters email → clicks "دعوة"
  → POST /api/staff/invite { email }

Backend:
  1. Validate email not already in use
  2. Create User {
       email, role: 'secretary', linkedDoctorId,
       isActive: false,
       inviteToken: bcrypt(rawToken),
       inviteExpiry: Date.now() + 72h
     }
  3. Send invite email: link → /accept-invite?token=<rawToken>

Secretary opens link → AcceptInvitePage
  → enters password → POST /api/auth/accept-invite { token, password }

Backend:
  1. Find User where inviteToken matches bcrypt(token) AND inviteExpiry > now
  2. Set password (bcrypt), isActive: true, clear inviteToken + inviteExpiry
  3. Return JWT → secretary lands on /secretary/waiting-room
```

### Permission Boundaries

A `requireSecretary` middleware protects the `/secretary/*` API namespace. Secretary JWT must have `role: 'secretary'` and a valid `linkedDoctorId`.

| Secretary can access | Secretary cannot access |
|---------------------|------------------------|
| Waiting room queue | Patient medical notes |
| Today's appointments (view + status change) | Prescriptions |
| Invoices (mark paid) | Reports / analytics |
| Own profile | Any other doctor's data |

---

## 3. Backend API

### Staff Management (`apps/api/src/routes/staff.js`) — doctor-only

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/api/staff/invite` | Invite secretary by email; send invite email |
| `GET` | `/api/staff` | List this doctor's secretaries with status |
| `DELETE` | `/api/staff/:userId` | Revoke: sets `isActive: false` |

### Accept Invite (added to `apps/api/src/routes/auth.js`)

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/api/auth/accept-invite` | Validate token, set password, activate account, return JWT |

### QR Check-in — public, no auth (added to `apps/api/src/routes/appointments.js`)

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/api/appointments/checkin` | Body: `{ token }` → stamps `checkedInAt`; returns Arabic confirmation |

Validation: appointment must be today's date, `checkedInAt` must be null, status must not be `cancelled`. Returns `{ message: 'تم تسجيل حضورك بنجاح', patientName, appointmentTime }`.

### Waiting Room (`apps/api/src/routes/waitingRoom.js`) — doctor or secretary

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/waiting-room` | Today's appointments with `checkedInAt` set, ordered ASC, populated with patient name + visit type |
| `PATCH` | `/api/waiting-room/:appointmentId/call` | Sets status → `in_progress`; records `calledAt` timestamp |

### Appointment Creation (existing endpoint, modified)

Add `qrToken: crypto.randomBytes(32).toString('hex')` to every new `Appointment.create()` call.

### Email Transport

`nodemailer` with environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. A single `apps/api/src/utils/mailer.js` utility used only for invite emails in this sub-project.

---

## 4. Frontend

### New Files

| File | Route | Purpose |
|------|-------|---------|
| `apps/web/src/layouts/SecretaryLayout.jsx` | — | Sidebar: غرفة الانتظار · مواعيد اليوم · الفواتير |
| `apps/web/src/pages/secretary/WaitingRoomPage.jsx` | `/secretary/waiting-room` | Live queue ordered by check-in time; "Call" button → `in_progress` |
| `apps/web/src/pages/secretary/TodayPage.jsx` | `/secretary/today` | Today's appointments, read-only medical data, status changes allowed |
| `apps/web/src/pages/secretary/InvoicesPage.jsx` | `/secretary/invoices` | Re-uses existing InvoicesPage component scoped to secretary's linked doctor |
| `apps/web/src/pages/auth/AcceptInvitePage.jsx` | `/accept-invite` | Public; password + confirm → activate account → redirect to waiting room |
| `apps/web/src/pages/CheckinPage.jsx` | `/checkin` | Public; reads `?token` from URL, calls public checkin API, shows Arabic result |
| `apps/web/src/components/doctor/QRModal.jsx` | — | Modal showing QR code + check-in URL for a single appointment |

### Modified Files

**`apps/web/src/pages/doctor/DoctorSettingsPage.jsx`**
- Add "الموظفون" tab
- Email input + "دعوة" button → `POST /api/staff/invite`
- Secretary list: name, email, status badge (نشط / معلق), revoke button

**`apps/web/src/pages/doctor/TodayPage.jsx`**
- Add QR icon button to each appointment card
- Opens `QRModal` with the appointment's `qrToken`

**`apps/web/src/router/index.jsx`**
- Add `/accept-invite` public route
- Add `/checkin` public route
- Add `/secretary/*` routes wrapped in `SecretaryProtected`

**`apps/web/src/store/authStore.js`**
- Post-login redirect: if `role === 'secretary'` → `/secretary/waiting-room`

### Waiting Room Auto-Refresh

`WaitingRoomPage` polls `GET /api/waiting-room` every 30 seconds via `setInterval` in a `useEffect`. No WebSocket needed for this sub-project.

### QR Library

`qrcode` is already installed in `apps/web/package.json`. Use `QRCode.toDataURL(url)` → render as `<img src={dataUrl} />` inside the modal.

---

## Global Constraints

- All secretary routes are RTL (Arabic), consistent with existing DoctorLayout
- Secretary API routes are prefixed `/api/secretary/*` — except `/api/waiting-room` which doctors can also access
- No new MongoDB collections
- `inviteToken` stored as bcrypt hash — raw token only in the email link, never in DB
- Invite link expiry: 72 hours
- QR check-in endpoint is public (no auth) — validated only by token uniqueness + appointment date + status
- `linkedDoctorId` on secretary JWT must always match the target resource's `doctorId` — enforced in every secretary middleware check
- Secretary cannot view or modify: patient notes, prescriptions, reports, or any data belonging to a different doctor
