# Real-Time Chat — Design Spec

**Date:** 2026-06-27
**Phase:** 2.1
**Status:** Approved

---

## Overview

Per-appointment in-app messaging between doctor and patient. Each appointment has its own chat thread. Messages support text and file attachments (images, PDFs). Real-time delivery via Socket.io. Read receipts show the sender when the other party has opened the chat.

---

## Data Models

### `Message` (new collection)

| Field | Type | Notes |
|---|---|---|
| `appointmentId` | ref Appointment | indexed |
| `senderId` | ref User | always from `socket.user.id` |
| `type` | String | `'text' \| 'image' \| 'file'` |
| `text` | String | optional, max 2000 chars, escaped |
| `fileUrl` | String | Cloudinary URL, optional |
| `fileName` | String | display name for file/image |
| `createdAt` | Date | |

Index: `{ appointmentId: 1, createdAt: -1 }`

### `ChatReadMarker` (new collection)

| Field | Type | Notes |
|---|---|---|
| `appointmentId` | ref Appointment | |
| `userId` | ref User | |
| `lastReadAt` | Date | upserted each time the user opens chat |

Unique index: `{ appointmentId: 1, userId: 1 }`

"Seen" logic: a message is seen by the other party when their `lastReadAt > message.createdAt`. One upsert per chat session open — no per-message updates.

---

## Architecture

### Socket.io

Socket.io attaches to the existing Express HTTP server on the same port. No separate process or port.

**Connection auth:** JWT verified on the `connection` event using the existing `verify()` util from `src/utils/jwt.js`. Unauthenticated sockets are immediately disconnected.

**Rooms:** `chat:${appointmentId}` — one room per appointment. Only the doctor and patient of that appointment may join.

### Socket Events

| Event | Direction | Payload |
|---|---|---|
| `join_chat` | client → server | `{ appointmentId }` |
| `send_message` | client → server | `{ appointmentId, type, text?, fileUrl?, fileName? }` |
| `new_message` | server → room | full Message document |
| `mark_read` | client → server | `{ appointmentId }` |
| `read_receipt` | server → room | `{ appointmentId, userId, lastReadAt }` |

**`send_message` flow:**
1. Validate sender is party to appointment
2. Block if appointment status is `cancelled`
3. Escape `text` field
4. Persist `Message` to DB
5. Broadcast `new_message` to `chat:${appointmentId}`

**`mark_read` flow:**
1. Upsert `ChatReadMarker` for `(appointmentId, socket.user.id)` with `lastReadAt: now`
2. Broadcast `read_receipt` to room so sender can update "Seen" display

---

## REST Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/appointments/:id/messages` | Party | Paginated history — `?before=<msgId>&limit=20` (cursor-based, newest first) |
| `POST` | `/api/appointments/:id/messages/upload` | Party | Upload attachment → Cloudinary → returns `{ fileUrl, fileName, type }` |

History endpoint loads past messages on chat open before the socket takes over. The `before` cursor is the `_id` of the oldest loaded message (for infinite scroll upward).

---

## Mobile Screens

### `ChatScreen` (new — shared by both roles)

- Accessed from `AppointmentDetailScreen` (doctor) and `MyAppointmentsScreen` (patient) via "Chat" button
- Route params: `{ appointmentId, otherPartyName }`
- On mount: load REST history, connect socket, `join_chat`, `mark_read`
- On unmount: leave room, disconnect socket
- On re-focus: emit `mark_read` again

**Message list:**
- `FlatList` inverted (newest at bottom)
- Own messages: right-aligned, mint bubble
- Other party: left-aligned, dark bubble
- Images render inline as thumbnails (tap to view full-size)
- Files render as a tappable pill showing `fileName`
- "Seen" shown under last sent message if `otherParty.lastReadAt > message.createdAt`

**Bottom input bar:**
- Text input (multiline, max 2000 chars)
- 📎 attach button → ActionSheet → "Image" (ImagePicker) or "File" (DocumentPicker)
- Attachment → `POST /upload` → emit `send_message` with `type: 'image'|'file'`
- Send button disabled when input empty and no pending attachment

**Navigation:**
- `DoctorTabs` Stack: add `ChatScreen`
- `PatientTabs` Stack: add `ChatScreen`

---

## Web Pages

### `ChatPage` (new)

**Routes:**
- `/doctor/appointments/:id/chat`
- `/patient/appointments/:id/chat`

**Layout:**
- Sticky topbar: appointment info + other party name
- Scrollable message area (auto-scroll to bottom on new message)
- Bottom bar: textarea + file input button + send button
- File input: accepts `image/*,application/pdf`, max 10 MB

Accessed via "Chat" link from Appointments list. No new sidebar link needed.

Behaviour mirrors mobile: same socket events, same REST load-on-open, same "Seen" indicator.

---

## Security

- **Socket auth:** JWT verified on `connection` — unauthenticated connections disconnected immediately
- **Room access:** `join_chat` checks `appointment.doctorId === socket.user.id || appointment.patientId === socket.user.id`
- **Message ownership:** `send_message` re-validates party membership before DB write; `senderId` always from `socket.user.id`, never from payload
- **Read-only on cancelled:** `send_message` blocked server-side if `appointment.status === 'cancelled'`; history still readable
- **File upload:** multer + Cloudinary (existing middleware); authenticated parties only; max 10 MB; allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- **Text sanitization:** `text` escaped via express-validator before DB write

---

## Failure Scenarios

| Scenario | Behaviour |
|---|---|
| Socket disconnects mid-session | Client reconnects automatically (Socket.io built-in retry) |
| Upload fails | Error shown inline; message not sent |
| Appointment cancelled | `send_message` returns `chat_error: 'Appointment is cancelled'`; UI shows read-only banner |
| Non-party tries to join | `join_chat` emits `chat_error: 'Forbidden'`; socket not added to room |
| DB write fails on `send_message` | Server emits `chat_error` to sender only; message not broadcast |
