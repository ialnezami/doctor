# Design: Chatbot Tool Use — Doctor Search, Availability & Booking

**Date:** 2026-07-22
**Scope:** Backend only (`apps/api/src/`) + minimal frontend SSE event handling
**Pages affected:** Existing chatbot UI (web + mobile) — no layout changes, new event types only

---

## 1. Goal

Allow the AI patient chatbot to actively search for nearby and specific doctors, fetch their availability, and book appointments — all triggered by the patient asking directly in the chat. Uses Anthropic tool use (function calling) so Claude decides when to invoke each tool mid-conversation.

---

## 2. Tools

Three tools exposed to Claude:

| Tool | Inputs | Purpose |
|---|---|---|
| `search_doctors` | `specialty?` (string), `name?` (string), `lat` (float), `lng` (float), `radius?` (meters, default 10000) | Geo-ranked doctor search |
| `get_availability` | `doctorId` (string), `from_date` (YYYY-MM-DD), `to_date` (YYYY-MM-DD) | Available slots for a doctor in a date range |
| `book_appointment` | `doctorId` (string), `locationId` (string), `date` (YYYY-MM-DD), `timeSlot` (HH:MM), `visitType` (string), `reason?` (string) | Create appointment after patient confirms |

---

## 3. Architecture

### 3.1 Tool-Aware Streaming

Current flow: `streamChatResponse` → text-only SSE stream.

New flow:
1. Tool definitions passed to Claude API alongside system prompt
2. Claude's response may include `tool_use` content blocks
3. Server detects tool call → pauses streaming → emits `tool_call` SSE event
4. Server executes tool (DB query or write)
5. Server emits `tool_result` SSE event to frontend
6. Tool result sent back to Claude as `tool_result` message
7. Claude resumes streaming incorporating the result
8. Max **3 tool call rounds per turn** — prevents infinite loops

All tool execution is **server-side only**. Frontend receives structured SSE events; it never calls tools directly.

### 3.2 SSE Event Protocol

**Existing events (unchanged):**
- `{ type: 'delta', text: chunk }` — text chunk
- `{ type: 'error', message: string }` — error
- `{ type: 'done', urgency, specialties, doctors, ... }` — turn complete

**New events:**
| Event | Payload | Frontend behavior |
|---|---|---|
| `{ type: 'tool_call', name, input }` | Tool name + sanitized input | Show spinner: "Searching for doctors…" |
| `{ type: 'tool_result', name, data }` | Tool name + result data | Render inline: doctor cards / slot picker / booking confirmation |

### 3.3 Confirmation Flow (Multi-Turn)

1. Patient: "find me a cardiologist near me"
2. Claude calls `search_doctors` → results shown as doctor cards
3. Patient: "book Dr. Ahmed on Tuesday at 10am"
4. Claude responds: "I'll book Dr. Ahmed — Tuesday 15 July at 10:00am. Shall I confirm?" → `setPendingBooking(userId, { doctorId, locationId, date, timeSlot, visitType })` stored in session
5. Patient: "yes"
6. Claude calls `book_appointment` → server checks `pendingBooking` exists → creates appointment → `clearPendingBooking(userId)`

`pendingBooking` TTL: **10 minutes** — auto-expires if patient doesn't confirm.

---

## 4. File Changes

### New: `apps/api/src/utils/chatbotTools.js`
- Tool JSON schema definitions (what Claude sees)
- `executeTool(name, input, context)` — dispatcher
- `searchDoctors(input, context)` — calls existing `getRankedDoctors` + Doctor model query by name
- `getAvailability(input, context)` — queries Doctor availability slots + checks existing appointments for conflicts
- `bookAppointment(input, context)` — validates `pendingBooking` in session, checks slot conflict, creates Appointment document

### Modified: `apps/api/src/services/chatbotService.js`
- `streamChatResponse` extended to handle `tool_use` content blocks in stream
- Accepts `toolContext: { userId, lat, lng }` parameter
- Emits `tool_call` + `tool_result` SSE events during tool execution
- Tool definitions passed to Claude API (omitted when `isEmergency` is true)

### Modified: `apps/api/src/utils/sessionStore.js`
- Add `setPendingBooking(userId, data)` — stores proposed booking with 10-min TTL
- Add `getPendingBooking(userId)` — retrieves pending booking
- Add `clearPendingBooking(userId)` — removes after confirmed or expired

### Modified: `apps/api/src/routes/chatbot.js`
- Pass `toolContext: { userId, lat, lng }` into `streamChatResponse`
- Emergency short-circuit: tool definitions **not** passed when `isEmergency` is true

---

## 5. Safety & Validation

### Server-side tool input validation (never trust Claude's output)
- `doctorId` / `locationId`: valid MongoDB ObjectId format
- `date`: ISO8601 YYYY-MM-DD
- `timeSlot`: matches `/^\d{2}:\d{2}$/`
- `visitType`: must be one of `['initial','follow-up','check-up','urgent']`
- `radius`: capped at 50,000 metres

### Booking guards
- `book_appointment` requires `pendingBooking` in session — if absent, returns `{ error: "No pending booking to confirm" }` and Claude re-presents details
- Slot conflict check: `Appointment.exists({ doctorId, date, 'timeSlot.start': timeSlot, status: { $nin: ['cancelled','archived'] } })` — returns conflict error if taken
- Created with `initiatedBy: 'patient'` — same as regular booking flow

### Emergency short-circuit
- If triage urgency is `high` / emergency detected: tool definitions omitted from Claude API call — chatbot cannot search or book for emergencies

### Logging (no PHI)
- Every tool call logged: `requestId`, `userId`, `toolName`, `durationMs`, success/failure
- Tool inputs/outputs never logged

### Tool failure handling
- All tool failures return `{ error: string }` to Claude — Claude responds naturally ("I couldn't reach the booking system, please try the booking page")
- Tool failures are non-fatal — conversation continues

---

## 6. Out of Scope

- Frontend UI redesign for doctor cards / slot picker (uses existing ChatBookingFlow component patterns)
- Cancelling appointments via chatbot
- Rescheduling via chatbot
- MCP server / external tool consumers
- Booking for emergency urgency cases
