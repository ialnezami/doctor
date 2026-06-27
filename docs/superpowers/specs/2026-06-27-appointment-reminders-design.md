# Phase 2.4 — Appointment Reminders Design Spec

**Date:** 2026-06-27  
**Status:** Approved  
**Scope:** Scheduled FCM push reminders (24h + 1h before appointment), doctor daily digest at local 7 AM, patient opt-out per appointment.

---

## 1. Goals

- Send patients a push reminder 24h and 1h before each confirmed appointment.
- Send doctors a morning digest at 7:00 AM their local timezone listing their appointment count for the day.
- Allow patients to disable reminders on a per-appointment basis.
- Survive server restarts without losing scheduled reminders.
- Reuse existing FCM infrastructure (`push.js`, `firebase-admin`).

---

## 2. Architecture

### 2.1 Scheduler: BullMQ + Redis

BullMQ with a Redis backend is used for all scheduling. Three queues run inside the API process:

| Queue | Job types | Trigger |
|---|---|---|
| `appointment-reminders` | `reminder-24h`, `reminder-1h` | Appointment confirmed or cancelled |
| `daily-digest` | `digest-send` | Midnight UTC orchestrator |
| `digest-orchestrator` | `orchestrate-digest` | BullMQ repeatable: `0 0 * * *` UTC |

### 2.2 Per-Appointment Reminder Lifecycle

1. Appointment confirmed → compute delays:
   - `delay24h = appointmentTime - 24h - now`
   - `delay1h  = appointmentTime - 1h  - now`
2. Enqueue two delayed jobs on `appointment-reminders` queue.
3. Store BullMQ job IDs as `reminder24hJobId` and `reminder1hJobId` on the Appointment document.
4. On cancellation → `queue.remove(reminder24hJobId)` + `queue.remove(reminder1hJobId)`.
5. On reschedule (date/time change) → remove old jobs, enqueue new jobs with updated delays, update stored IDs.

Worker guard (checked before every push):
- `appointment.remindersDisabled === true` → skip silently
- `appointment.status === 'cancelled'` → skip silently
- `appointmentTime - now < 30 min` for the 1h job → skip (too late, avoid spam)

### 2.3 Daily Digest Lifecycle

1. Repeatable `orchestrate-digest` job fires at 00:00 UTC every day.
2. Queries all doctors with `fcmToken` set.
3. For each doctor: computes `delay = nextLocalSevenAM(doctor.timezone) - now` using `luxon` or `date-fns-tz`.
4. Enqueues a `digest-send` delayed job per doctor.
5. `digest-send` worker:
   - Counts confirmed appointments for that doctor for today (doctor's local date).
   - If count === 0 → skip (no push, no DB record).
   - If count > 0 → push "You have {n} appointment(s) today" + save `Notification` record.

---

## 3. Data Model Changes

### 3.1 Appointment model (`models/Appointment.js`)

Three new fields added:

```js
remindersDisabled: { type: Boolean, default: false },
reminder24hJobId:  { type: String,  default: null },
reminder1hJobId:   { type: String,  default: null },
```

### 3.2 Doctor model (`models/Doctor.js`)

One new field:

```js
timezone: { type: String, default: 'UTC' },  // IANA tz string, e.g. 'Asia/Riyadh'
```

### 3.3 Notification model (`models/Notification.js`)

Extend `type` enum with:

```
'appointment_reminder'   // 24h and 1h patient reminders
'daily_digest'           // doctor morning digest
```

No new MongoDB collection — records land in the existing `notifications` collection.

---

## 4. New Files

| File | Purpose |
|---|---|
| `src/queues/reminderQueue.js` | BullMQ queue factory + Redis connection |
| `src/workers/reminderWorker.js` | Processes `reminder-24h` and `reminder-1h` jobs |
| `src/workers/digestWorker.js` | Processes `digest-send` and `orchestrate-digest` jobs |

---

## 5. Modified Files

| File | Change |
|---|---|
| `src/models/Appointment.js` | Add 3 reminder fields |
| `src/models/Doctor.js` | Add `timezone` field |
| `src/models/Notification.js` | Extend `type` enum |
| `src/routes/appointments.js` | Enqueue/cancel jobs on confirm/cancel/reschedule; add opt-out endpoint |
| `src/index.js` | Start workers + register digest orchestrator repeatable job on boot |

---

## 6. REST API Changes

### 6.1 Opt-out endpoint (new)

```
PATCH /api/appointments/:id/reminders-opt-out
Auth: patient, must own the appointment
Body: { "disabled": true | false }
Response 200: { remindersDisabled: true }
Errors: 403 if not owner, 404 if not found, 400 if appointment not confirmed/future
```

### 6.2 Doctor profile update (existing, extended)

`PATCH /api/doctors/me` already exists — `timezone` field accepted as part of the existing profile update payload. No new endpoint.

---

## 7. UI Changes

### 7.1 Mobile (React Native)

- **Patient `AppointmentDetailScreen`:** Add a boolean toggle "Disable reminders for this appointment." Visible only when `status === 'confirmed'` and appointment is in the future. Calls the opt-out endpoint on toggle.
- **Doctor profile/settings screen:** Add IANA timezone selector dropdown. Saves via existing `PATCH /api/doctors/me`.

### 7.2 Web (React)

- **Patient `MyAppointmentsPage`:** Same opt-out toggle in the appointment detail/modal view.
- **Doctor settings page:** Timezone selector, same as mobile.

---

## 8. Error Handling & Edge Cases

| Scenario | Handling |
|---|---|
| Redis unavailable at enqueue | try/catch; appointment still created; log `[reminders] enqueue failed: <appointmentId>`; reminders won't fire |
| FCM token missing | `sendPush` silently no-ops; DB `Notification` record still saved |
| FCM send fails | Silent — matches existing Phase 1 pattern |
| Job removal on already-fired job | BullMQ `remove()` returns no-op; no error thrown |
| Appointment created < 24h before start | 24h delay ≤ 0 → BullMQ fires immediately; worker checks: if `appointmentTime - now < 30 min`, skip 1h job to avoid spam |
| Appointment rescheduled | Remove old job IDs, enqueue new jobs, update stored IDs atomically |
| Doctor has 0 appointments today | Digest worker skips push entirely; no Notification record created |
| `remindersDisabled` toggled after job enqueued | Worker reads live appointment at job execution time — no race condition |

---

## 9. Dependencies

New npm package required in `apps/api`:

```
bullmq     — job queue
ioredis    — Redis client (BullMQ peer dependency)
luxon      — IANA timezone math for digest scheduling
```

Redis instance required: Railway Redis addon (production) or `docker run redis` (local dev).

---

## 10. Security Considerations

- Opt-out endpoint validates ownership (`appointment.patientId === req.user.id`) server-side.
- BullMQ job data contains only IDs — no PII in the Redis queue.
- `timezone` field is validated against a known IANA tz list before save to prevent injection.
- Redis connection uses TLS in production (Railway provides `rediss://` URL).
