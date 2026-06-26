# Consultation Notes & Patient History Feature

**Date:** 2026-06-26
**Status:** Approved

## Overview

A full appointment lifecycle system with per-consultation doctor notes, read tracking, and patient notifications. Doctors can write private or shared notes per appointment. Validating a consultation compiles shared notes into a summary visible to the patient. When a doctor opens consultation notes, a read event is saved and the patient is notified.

---

## Data Models

### `Appointment`
| Field | Type | Notes |
|---|---|---|
| `patientId` | ref User | |
| `doctorId` | ref User | |
| `scheduledAt` | Date | |
| `status` | enum | `pending \| confirmed \| in_progress \| validated \| cancelled` |
| `initiatedBy` | enum | `patient \| doctor` |
| `createdAt` | Date | |
| `updatedAt` | Date | |

### `ConsultationNote`
| Field | Type | Notes |
|---|---|---|
| `appointmentId` | ref Appointment | |
| `authorId` | ref User | always a doctor |
| `content` | String | |
| `visibility` | enum | `private \| shared` |
| `createdAt` | Date | |
| `updatedAt` | Date | |

### `ReadEvent`
| Field | Type | Notes |
|---|---|---|
| `appointmentId` | ref Appointment | |
| `doctorId` | ref User | |
| `readAt` | Date | upserted — one record per doctor per appointment |

### `Notification`
| Field | Type | Notes |
|---|---|---|
| `recipientId` | ref User | |
| `type` | enum | `appointment_requested \| appointment_confirmed \| consultation_validated \| notes_viewed` |
| `payload` | Object | `{ appointmentId, message, ... }` |
| `read` | Boolean | default false |
| `createdAt` | Date | |

---

## API Endpoints

### Appointments
```
POST   /api/appointments                    Create appointment (patient or doctor)
GET    /api/appointments                    List mine (role-filtered)
GET    /api/appointments/:id                Get single appointment
PATCH  /api/appointments/:id/confirm        Doctor confirms a pending request
PATCH  /api/appointments/:id/validate       Doctor validates → compile summary + notify patient
PATCH  /api/appointments/:id/cancel         Cancel (either party)
```

### Consultation Notes
```
POST   /api/appointments/:id/notes          Doctor adds a note
GET    /api/appointments/:id/notes          Get notes (doctor: all; patient: shared only)
PATCH  /api/appointments/:id/notes/:noteId  Doctor edits a note
DELETE /api/appointments/:id/notes/:noteId  Doctor deletes a note
```
Role-based filtering is enforced server-side. Patients receive only `visibility: shared` notes.

### Read Tracking
```
POST   /api/appointments/:id/read           Doctor marks notes as read
                                            → upserts ReadEvent + sends notification to patient
```

### Notifications
```
GET    /api/notifications                   List my notifications
PATCH  /api/notifications/:id/read          Mark one as read
PATCH  /api/notifications/read-all          Mark all as read
```

---

## Authorization Rules

| Action | Allowed roles | Extra check |
|---|---|---|
| Create appointment | patient, doctor | — |
| Confirm appointment | doctor | must be the assigned doctor |
| Validate appointment | doctor | must be the assigned doctor |
| Cancel appointment | patient, doctor | must be a party to the appointment |
| Add / edit / delete note | doctor | must be the assigned doctor |
| Read notes (all) | doctor | must be the assigned doctor |
| Read notes (shared only) | patient | must be the assigned patient |
| Post read event | doctor | must be the assigned doctor |
| Read notifications | any | own notifications only |

---

## Key Flows

### 1. Book Appointment
1. Either party calls `POST /api/appointments`
2. Other party receives `appointment_requested` push notification

### 2. Doctor Opens Consultation Notes
1. Doctor calls `POST /api/appointments/:id/read`
2. Server upserts `ReadEvent`
3. Server creates `Notification` (type: `notes_viewed`) for patient
4. Patient receives FCM push: "Dr. X reviewed your consultation"

### 3. Doctor Adds Notes
- Doctor calls `POST /api/appointments/:id/notes` with `visibility: private | shared`
- Private notes: stored, never returned to patient
- Shared notes: stored, returned to patient after validation

### 4. Doctor Validates Consultation
1. Doctor calls `PATCH /api/appointments/:id/validate`
2. Server sets appointment `status: validated`
3. Server compiles all `visibility: shared` notes as a summary
4. Server creates `Notification` (type: `consultation_validated`) for patient with summary payload
5. Patient receives FCM push: "Your consultation summary is ready"
6. Patient can open `ConsultationSummaryScreen` to view shared notes

---

## Mobile Screens

### Doctor
- `AppointmentsScreen` — tabs: Upcoming / Past
- `AppointmentDetailScreen` — appointment info + notes list + "Add Note" + "Validate" buttons
- `NoteEditorScreen` — write/edit note, toggle visibility (Private / Shared)

### Patient
- `AppointmentsScreen` — tabs: Upcoming / Past
- `ConsultationSummaryScreen` — shared notes compiled after doctor validates
- `NotificationsScreen` — all notifications with read/unread state

### Shared
- Notification badge on tab bar (unread count)
- FCM push on: appointment requested, appointment confirmed, notes viewed, consultation validated

---

## Security Considerations

- All ownership checks server-side — never trust `doctorId` / `patientId` from request body
- Patients must never receive private notes — filter enforced at query level, not presentation
- `ReadEvent` upserted (not inserted) — prevents notification spam on repeated opens (notify only on first read per session — consider a cooldown, e.g. 1 read event per 24h per appointment)
- Validate action is irreversible — once `status: validated`, notes cannot be deleted

## Failure Scenarios

- FCM push fails → notification still saved in DB, patient sees it on next app open
- Doctor validates with zero shared notes → still allowed, summary will be empty; patient notified
- Concurrent validation requests → use atomic `findOneAndUpdate` with status guard to prevent double-validation

---

## Future Considerations

- Prescription generation from validated consultation
- Doctor can attach lab result requests to a consultation
- Patient can rate/review consultation after validation
