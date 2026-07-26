# Video Consultations — Design Spec

**Date:** 2026-06-27
**Phase:** 2.2
**Status:** Approved

---

## Overview

Per-appointment WebRTC video calls between doctor and patient using Daily.co as the managed video infrastructure. Each appointment maps to one Daily.co room. Doctor gets an in-call notes overlay (mobile) / side panel (web). Patient joins the same room and sees a full-screen call UI. Simple waiting state shown when one party joins before the other.

---

## Data Model

### `Appointment` (existing — one field added)

| Field | Type | Notes |
|---|---|---|
| `videoRoomName` | String | Daily.co room name, set on first token request; e.g. `appt-64242e1abc...` |

All other appointment fields unchanged. Room URL is always derived as `https://${DAILY_DOMAIN}/${videoRoomName}` — no need to store the full URL.

---

## API

### Environment Variables (new)

| Variable | Description |
|---|---|
| `DAILY_API_KEY` | Daily.co REST API key (server-side only, never exposed to clients) |
| `DAILY_DOMAIN` | Daily.co subdomain, e.g. `mediconnect` → `mediconnect.daily.co` |

### `POST /api/appointments/:id/video/token`

**Access:** Authenticated doctor or patient of that appointment.

**Status guard:** Returns `403` if `appointment.status` is not `confirmed` or `in_progress`.

**Flow (idempotent):**
1. Validate party membership
2. Check status guard
3. If `appointment.videoRoomName` is not set:
   - `POST https://api.daily.co/v1/rooms` with:
     ```json
     {
       "name": "appt-<appointmentId>",
       "privacy": "private",
       "properties": {
         "exp": <end-of-appointment-day unix timestamp>,
         "enable_recording": false
       }
     }
     ```
   - Save returned `name` to `appointment.videoRoomName`
4. `POST https://api.daily.co/v1/meeting-tokens` with:
   ```json
   {
     "properties": {
       "room_name": "<videoRoomName>",
       "is_owner": <true if doctor, false if patient>,
       "exp": <timeSlot.end unix timestamp + 90 min, capped at 4h from now>
     }
   }
   ```
5. Return `{ roomUrl, token }` where `roomUrl = https://${DAILY_DOMAIN}/${videoRoomName}`

**Error responses:**
- `403` — not a party to the appointment
- `403` — appointment status does not permit video (`pending`, `validated`, `cancelled`)
- `404` — appointment not found
- `500` — Daily.co API failure (logged server-side; client receives generic message)

---

## Architecture

Daily.co is the sole media infrastructure. No media servers, TURN servers, or signalling code to maintain. The API only proxies room/token creation. Video traffic goes directly between clients and Daily.co's edge network.

### Mobile: WebView embed

`@daily-co/react-native-daily-js` requires native module linking incompatible with Expo managed workflow. Instead, the prebuilt Daily.co call UI is loaded via `react-native-webview` using the URL `${roomUrl}?t=${token}`. Daily.co's hosted UI provides camera, mic, grid, participant controls, and connection handling natively.

### Web: `@daily-co/daily-js` iframe

The Daily.co prebuilt iframe (`DailyIframe.createFrame()`) is embedded on web. This gives the same prebuilt call UI while keeping the page structure in our control, allowing a custom notes panel alongside the iframe.

---

## Mobile Screens

### `VideoCallScreen.js` (new — `src/screens/shared/`)

**Route params:** `{ appointmentId, otherPartyName, role }` where `role` is `'doctor'` or `'patient'`.

**On mount:**
1. `POST /api/appointments/:id/video/token` → `{ roomUrl, token }`
2. Render `<WebView source={{ uri: `${roomUrl}?t=${token}` }} style={{ flex: 1 }} />`
3. Pass `onMessage` handler to receive Daily.co postMessage events (participant-joined, participant-left)

**Waiting state:** Before `participant-joined` event received and only one participant in the room, show a translucent banner at the top: `"Waiting for ${otherPartyName}…"`. Banner removed on first `participant-joined` event.

**Notes overlay (doctor only):**
- Floating `📝` button, bottom-right, above WebView
- Tap opens a `Modal` slide-up with:
  - `TextInput` (multiline, max 2000 chars)
  - "Save Note" button → `POST /api/appointments/:id/notes` with `{ content, visibility: 'private' }`
  - "Cancel" button
- Toast on save success; error alert on failure

**Back button:** Header left → `navigation.goBack()`. Call ends when WebView unmounts (Daily.co handles participant departure).

**Navigation entry points:**
- `AppointmentDetailScreen.js` (doctor): "Join Video" button visible when `appt.status === 'confirmed' || appt.status === 'in_progress'`. Navigates to `VideoCall` with `role: 'doctor'` and `otherPartyName: appt.patientId?.name`.
- `MyAppointmentsScreen.js` (patient): "Join Video" button on upcoming cards (status `confirmed`). Navigates to `VideoCall` with `role: 'patient'` and `otherPartyName: a.doctorId?.name`.

**Navigation registration:**
- Add `VideoCallScreen` to `DoctorTabs` stack as `VideoCall`
- Add `VideoCallScreen` to `PatientTabs` stack as `VideoCall`

---

## Web Pages

### `VideoCallPage.jsx` (new — `src/pages/shared/`)

**Routes:**
- `/appointments/:id/video` (doctor)
- `/my-appointments/:id/video` (patient)

**On mount:**
1. `POST /api/appointments/:id/video/token` → `{ roomUrl, token }`
2. `Daily.createCallObject()` bound to a `<div ref>` via `DailyIframe.createFrame()`
3. `.join({ url: roomUrl, token })`
4. Listen to `participant-joined` to clear waiting overlay

**Layout — doctor (role === 'doctor'):**
```
┌─────────────────────────┬───────────────┐
│   Daily.co iframe       │  Notes Panel  │
│   (flex: 1 ~65%)        │  (320px)      │
│                         │  [textarea]   │
│                         │  [Save Note]  │
└─────────────────────────┴───────────────┘
```
Notes panel pre-populates with a blank textarea. "Save Note" → `POST /api/appointments/:id/notes` with `{ content, visibility: 'private' }`. Doctor can collapse the notes panel with a toggle button.

**Layout — patient (role === 'patient'):**
Full-width Daily.co iframe, no notes panel.

**Waiting overlay:** Absolute-positioned semi-transparent banner: `"Waiting for ${otherPartyName}…"` until `participant-joined` fires.

**Leave button:** Back arrow top-left → `navigate(-1)`. `callObject.leave()` called in `useEffect` cleanup.

**Role detection:** Read from `useAuthStore().user.role`.

**Navigation entry points:**
- `AppointmentsPage.jsx` (doctor): "Join Video" button on cards where `status === 'confirmed' || status === 'in_progress'`. Link to `/appointments/${a._id}/video`.
- `MyAppointmentsPage.jsx` (patient): "Join Video" button on upcoming cards (status `confirmed`). Link to `/my-appointments/${a._id}/video`.

---

## Security

| Concern | Mitigation |
|---|---|
| Unauthorized room access | Room `privacy: "private"` — meeting token required to join, room URL alone is insufficient |
| Non-party gets a token | Server validates `doctorId === req.user.id \|\| patientId === req.user.id` before issuing token |
| Token reuse after appointment | Token `exp` = `timeSlot.end + 90 min`, capped at `now + 4h` |
| Stale room | Room `exp` = end of appointment day; Daily.co auto-deletes after expiry |
| Doctor impersonation | `is_owner: true` only issued to the doctor; patient cannot mute/remove others |
| API key exposure | `DAILY_API_KEY` is server-side only; clients receive only the scoped meeting token |
| Cancelled appointment video | Status guard: `403` returned for any status other than `confirmed` or `in_progress` |

---

## Failure Scenarios

| Scenario | Behaviour |
|---|---|
| Daily.co API down on token request | `500` returned; client shows "Could not start video call. Try again." |
| Patient joins before doctor | Daily.co prebuilt UI shows alone-in-call state; app shows "Waiting for doctor…" banner |
| WebView camera/mic permission denied (mobile) | Daily.co's UI shows its own permission error within the WebView |
| Network drops mid-call | Daily.co SDK handles reconnection automatically |
| Appointment not confirmed | `403` returned; "Join Video" button not shown in UI (status check) |
| Daily room already exists (retry) | Server skips room creation if `appointment.videoRoomName` is already set (idempotent) |
