# Phase 2.5 — Enhanced Notifications Design Spec

**Date:** 2026-06-27
**Status:** Approved
**Scope:** Global notification preferences (push/email toggles), email delivery via Resend, 30-day auto-delete via MongoDB TTL, and 24h read-event cooldown for notes_viewed.

---

## 1. Goals

- Let users control which channels they receive notifications on (push, email) with a single global toggle per channel.
- Send transactional emails via Resend for the four most important notification events.
- Automatically remove notifications older than 30 days from MongoDB without any application-layer code.
- Re-notify patients when the same doctor re-opens their consultation notes after a 24-hour gap.

---

## 2. Notification Preferences

### 2.1 Data Model

Add a `notificationPrefs` sub-document to the `User` model:

```js
notificationPrefs: {
  pushEnabled:  { type: Boolean, default: true },
  emailEnabled: { type: Boolean, default: true },
}
```

Both default to `true` (opt-out model — new users receive all channels by default).

### 2.2 API

```
PATCH /api/users/me/notification-prefs
Auth: any authenticated user
Body: { "pushEnabled": boolean, "emailEnabled": boolean }
Response 200: { notificationPrefs: { pushEnabled, emailEnabled } }
Errors: 400 if either field is not a boolean
```

Partial updates allowed — fields omitted from body are not changed.

### 2.3 Channel Gate

Before sending any push or email, the caller checks `user.notificationPrefs`:
- `pushEnabled: false` → skip `sendPush`
- `emailEnabled: false` → skip `sendEmail`

This check happens in the existing `notifyUser` helper in `apps/api/src/routes/appointments.js` and in the reminder/digest workers.

---

## 3. Email via Resend

### 3.1 Email Utility

New file: `apps/api/src/utils/email.js`

```js
async function sendEmail(to, subject, html) → void
```

- Uses `resend` npm package (`RESEND_API_KEY` env var)
- Sender: `MediConnect <notifications@mediconnect.app>` (configurable via `EMAIL_FROM` env var)
- No-ops silently if `RESEND_API_KEY` is not set (same pattern as `push.js`)
- FCM-style: errors are caught and logged, never thrown to caller

### 3.2 Email Templates

Plain HTML strings (no React Email — keep it simple). Four templates, each a function returning an HTML string:

| Template | Trigger | Recipient |
|---|---|---|
| `appointmentConfirmedEmail(patientName, doctorName, date, timeSlot)` | `appointment_confirmed` | Patient |
| `appointmentReminderEmail(patientName, doctorName, date, timeSlot)` | `appointment_reminder` (24h only) | Patient |
| `consultationValidatedEmail(patientName, doctorName, date)` | `consultation_validated` | Patient |
| `dailyDigestEmail(doctorName, count, date)` | `daily_digest` | Doctor |

Templates live in `apps/api/src/utils/emailTemplates.js`.

### 3.3 Where Emails Are Sent

| Location | Event | Change |
|---|---|---|
| `apps/api/src/routes/appointments.js` → `notifyUser()` | `appointment_confirmed`, `consultation_validated` | Add `sendEmail` call after `sendPush`, gated on `emailEnabled` |
| `apps/api/src/workers/reminderWorker.js` → `processReminderJob()` | `appointment_reminder` (24h only) | Add `sendEmail` call, gated on `emailEnabled` |
| `apps/api/src/workers/digestWorker.js` → `processDigestSendJob()` | `daily_digest` | Add `sendEmail` call, gated on `emailEnabled` |

The `notifyUser` function must be extended to accept an optional `emailData` parameter containing the template data needed to render the email.

### 3.4 Dependencies

```
resend  — Resend Node.js SDK
```

New env vars:
```
RESEND_API_KEY=re_...
EMAIL_FROM=MediConnect <notifications@mediconnect.app>
```

---

## 4. 30-Day Auto-Delete (TTL)

### 4.1 Schema Change

Add to `Notification` model:

```js
expireAt: {
  type: Date,
  default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
}
```

### 4.2 TTL Index

```js
notificationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
```

MongoDB's background TTL thread checks the index and deletes documents once `expireAt` is in the past. No application-layer job needed. MongoDB runs the check approximately every 60 seconds.

### 4.3 Existing Documents

Existing notifications without `expireAt` will never be auto-deleted (field is undefined — TTL index ignores documents where the indexed field is missing). This is acceptable; only new documents created after the deploy will have a TTL.

---

## 5. Read-Event Cooldown (notes_viewed)

### 5.1 Current Behavior

When a doctor views consultation notes for the first time, the system upserts a `ReadReceipt` `{ appointmentId, doctorId, lastReadAt }` and sends a `notes_viewed` push to the patient. Subsequent reads by the same doctor on the same appointment are silently no-ops (no re-notification).

### 5.2 New Behavior

On each doctor read:
1. Fetch or upsert the `ReadReceipt` for `(appointmentId, doctorId)`.
2. If `lastReadAt` exists AND `Date.now() - lastReadAt < 24 * 60 * 60 * 1000` → skip notification (within cooldown).
3. Otherwise (first read OR re-read after 24h gap) → send `notes_viewed` notification and update `lastReadAt = Date.now()`.

### 5.3 File Changed

`apps/api/src/routes/notes.js` — the handler that upserts the ReadReceipt currently lives here. The cooldown logic is inserted at the read-receipt upsert point.

---

## 6. UI Changes

### 6.1 Mobile (React Native)

Add a "Notifications" section to the doctor and patient settings screens (`SettingsScreen.js` for both roles):
- Push notifications toggle (`Switch`) — calls `PATCH /api/users/me/notification-prefs` with `{ pushEnabled }`
- Email notifications toggle (`Switch`) — calls `PATCH /api/users/me/notification-prefs` with `{ emailEnabled }`

### 6.2 Web (React)

Add the same two toggles to `DoctorSettingsPage.jsx` and a patient settings page (create `PatientSettingsPage.jsx` if it does not exist — add a "Settings" link to the patient sidebar).

---

## 7. New Files

| File | Purpose |
|---|---|
| `apps/api/src/utils/email.js` | Resend wrapper (sendEmail function) |
| `apps/api/src/utils/emailTemplates.js` | Four HTML email template functions |

---

## 8. Modified Files

| File | Change |
|---|---|
| `apps/api/src/models/User.js` | Add `notificationPrefs` sub-document |
| `apps/api/src/models/Notification.js` | Add `expireAt` field + TTL index |
| `apps/api/src/routes/users.js` | Add `PATCH /me/notification-prefs` endpoint |
| `apps/api/src/routes/appointments.js` | Gate push on `pushEnabled`; add email on `emailEnabled` |
| `apps/api/src/routes/notes.js` | 24h cooldown on `notes_viewed` re-notification |
| `apps/api/src/workers/reminderWorker.js` | Add email for 24h reminder, gate push on `pushEnabled` |
| `apps/api/src/workers/digestWorker.js` | Add email for daily digest, gate push on `pushEnabled` |
| `apps/mobile/src/screens/doctor/SettingsScreen.js` | Add push/email preference toggles |
| `apps/mobile/src/screens/patient/SettingsScreen.js` | Add push/email preference toggles |
| `apps/web/src/pages/doctor/DoctorSettingsPage.jsx` | Add push/email preference toggles |
| `apps/web/src/pages/patient/PatientSettingsPage.jsx` | Create with push/email preference toggles |

---

## 9. Error Handling

| Scenario | Handling |
|---|---|
| `RESEND_API_KEY` not set | `sendEmail` no-ops silently — same as `sendPush` with no FCM config |
| Resend API returns error | Caught in `sendEmail`, logged with `[email]` prefix, never thrown |
| `notificationPrefs` missing on old user documents | Default to `{ pushEnabled: true, emailEnabled: true }` at read time |
| TTL index on existing DB | Existing documents without `expireAt` are never deleted — safe |
| ReadReceipt not found | Treated as first read (cooldown not applicable) |

---

## 10. Security

- `PATCH /api/users/me/notification-prefs` updates only `req.user.id` — no other user's prefs can be changed.
- Preference toggles validated server-side: `typeof pushEnabled !== 'boolean'` → 400.
- Email addresses come from the authenticated user record — never from request body.
- `RESEND_API_KEY` is a server-only env var, never exposed to clients.
