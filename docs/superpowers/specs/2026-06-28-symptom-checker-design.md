# Phase 4.1 — AI Symptom Checker Design Spec

**Date:** 2026-06-28
**Status:** Approved
**Scope:** Optional pre-appointment symptom input for patients, async Claude-powered triage (urgency + category), and structured display for doctors on appointment detail.

---

## 1. Goals

- Let patients optionally describe their symptoms when booking an appointment.
- Use Claude (Haiku) to extract a minimal triage signal — urgency level and symptom category — asynchronously via BullMQ.
- Surface both the raw patient text and the AI-structured output to the doctor on the appointment detail screen (mobile + web).
- Never block the booking flow or the doctor experience on AI availability.

---

## 2. Data Model

Add two fields to `apps/api/src/models/Appointment.js`:

```js
symptomText: { type: String, default: null },
symptomAnalysis: {
  urgency:     { type: String, enum: ['low', 'medium', 'high'], default: null },
  category:    { type: String, default: null },
  processedAt: { type: Date,   default: null },
},
```

`symptomText` stores the raw patient input. `symptomAnalysis` is populated by the background worker after Claude responds. Both default to null — existing appointments are unaffected.

---

## 3. API

### 3.1 Submit Symptoms

```
PATCH /api/appointments/:id/symptoms
Auth: patient only (auth middleware + ownership check: appt.patientId === req.user.id)
Body: { "symptomText": string }
Response 202: { message: "Symptoms received" }
Errors:
  400 — symptomText missing, empty, or exceeds 1000 characters
  403 — not the patient who owns this appointment
  409 — appointment status is validated or cancelled
```

On success:
1. Saves `symptomText` to the appointment (overwrites if re-submitted).
2. Enqueues a `symptom-analysis` BullMQ job with `{ appointmentId }`.
3. Returns 202 immediately — analysis is async.

Re-submission is allowed while status is `pending` or `confirmed`. Each re-submission overwrites `symptomText` and clears `symptomAnalysis` (sets back to null) and enqueues a fresh job.

### 3.2 Read Symptoms

No new endpoint. `GET /api/appointments/:id` already returns the full appointment document. `symptomText` and `symptomAnalysis` are included for free.

---

## 4. Background Worker

### 4.1 Queue

Queue name: `symptom-analysis`
Connection: same IORedis singleton from `apps/api/src/queues/reminderQueue.js` (`getConnection()`).
New factory function `getSymptomQueue()` added to `reminderQueue.js`.

### 4.2 Worker

New file: `apps/api/src/workers/symptomWorker.js`

Job data: `{ appointmentId: string }`

Processing steps:
1. Load appointment by ID. If not found or `symptomText` is null/empty → skip (no error).
2. Call Claude API using `@anthropic-ai/sdk`:
   - Model: `claude-haiku-4-5-20251001`
   - System prompt:
     ```
     You are a medical triage assistant. Extract two things from the patient's symptom description and return ONLY valid JSON — no other text, no markdown.
     Schema: { "urgency": "low" | "medium" | "high", "category": "<one short phrase>" }
     Rules:
     - urgency=high only for: chest pain, difficulty breathing, severe bleeding, loss of consciousness, or stroke signs.
     - urgency=medium for moderate pain, fever >39°C, persistent vomiting, or worsening chronic symptoms.
     - urgency=low for everything else.
     - category: one short phrase, e.g. "respiratory", "joint pain", "skin rash", "digestive".
     - Never diagnose. Never suggest medications.
     ```
   - User message: the `symptomText` value.
   - `max_tokens: 100`
3. Parse the JSON from the response text. On parse failure → log `[symptom] JSON parse error: <err.message>` and set `urgency: null, category: null` (silent degradation — raw text still visible to doctor).
4. Update appointment: `{ symptomAnalysis: { urgency, category, processedAt: new Date() } }`.

### 4.3 Error Handling

| Scenario | Handling |
|---|---|
| `ANTHROPIC_API_KEY` not set | Worker logs `[symptom] ANTHROPIC_API_KEY not set — skipping` and exits job cleanly |
| Claude API error | BullMQ retries (default 3 attempts with backoff); on final failure, logs `[symptom] Claude API failed after retries` — appointment keeps raw text, analysis stays null |
| JSON parse failure | No retry — logs error, writes `null` analysis, job completes |
| Appointment not found | Job completes silently |

### 4.4 Startup

In `apps/api/src/index.js`, start the symptom worker alongside reminder/digest workers, gated on `REDIS_URL`:

```js
if (process.env.REDIS_URL) {
  startReminderWorker();
  startDigestWorker();
  startSymptomWorker();
  ...
}
```

---

## 5. Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
```

Server-only. Never exposed to clients.

---

## 6. Mobile UI

### 6.1 Patient — Symptom Input Screen

New screen: `apps/mobile/src/screens/patient/SymptomInputScreen.js`

Inserted into the patient booking stack between slot selection and the booking confirmation screen.

- Title: "Describe your symptoms (optional)"
- Subtitle: "Help your doctor prepare. You can skip this."
- `TextInput` multiline, max 1000 chars, placeholder: "e.g. I've had a sore throat and fever for 3 days…"
- Character count shown below input (e.g. "120 / 1000")
- Two buttons: **Skip** and **Continue**

Flow:
1. Patient taps a slot → navigated to `SymptomInputScreen` with `{ doctorId, date, timeSlot, visitType }` as route params.
2. Patient taps **Skip** or **Continue** (with or without text) → booking `POST /api/appointments` fires.
3. If symptom text is present → immediately calls `PATCH /api/appointments/:id/symptoms` after receiving the appointment ID. Failure is silent (booking already succeeded).
4. Navigates to booking confirmation/success screen.

Navigation registration: `Stack.Screen name="SymptomInput" component={SymptomInputScreen}` in the patient stack.

### 6.2 Doctor — Appointment Detail

In `apps/mobile/src/screens/doctor/AppointmentDetailScreen.js`, add a "Patient Symptoms" card below the appointment info and above the notes section.

Card is rendered only when `appointment.symptomText` is non-null.

Card contents:
- Header: "Patient Symptoms"
- Raw patient text in a scrollable text block
- AI row:
  - If `symptomAnalysis.processedAt` is null → grey pill "Analysis pending…"
  - If processed and `urgency` is null → grey pill "Analysis unavailable"
  - If processed → urgency pill (low=green `#22c55e`, medium=amber `#f59e0b`, high=red `#ef4444`) + category text beside it
- Disclaimer (always shown when card is visible): *"AI-generated — not a substitute for clinical judgment."*

---

## 7. Web UI

### 7.1 Doctor — Appointment Detail Page

In `apps/web/src/pages/doctor/AppointmentDetailPage.jsx` (or equivalent), add the same "Patient Symptoms" card.

Card is rendered only when `appointment.symptomText` is non-null.

Card contents:
- Styled with `var(--card)` background, `var(--border)` border, `var(--r)` border-radius
- Header: "Patient Symptoms" (14px, fontWeight 500)
- Raw patient text block
- AI row:
  - "Analysis pending…" in `var(--text2)` when `processedAt` is null
  - Urgency pill (colored span) + category when processed
  - Pill colors: low=`#22c55e`, medium=`#f59e0b`, high=`#ef4444`
- Disclaimer: *"AI-generated — not a substitute for clinical judgment."* in `var(--text2)`, 12px

---

## 8. New Files

| File | Purpose |
|---|---|
| `apps/api/src/workers/symptomWorker.js` | BullMQ worker — calls Claude, updates appointment |
| `apps/mobile/src/screens/patient/SymptomInputScreen.js` | Optional symptom input step in booking flow |

---

## 9. Modified Files

| File | Change |
|---|---|
| `apps/api/src/models/Appointment.js` | Add `symptomText` + `symptomAnalysis` fields |
| `apps/api/src/routes/appointments.js` | Add `PATCH /:id/symptoms` endpoint |
| `apps/api/src/queues/reminderQueue.js` | Add `getSymptomQueue()` factory |
| `apps/api/src/index.js` | Start `symptomWorker` on boot |
| `apps/mobile/src/screens/patient/BookAppointmentScreen.js` | Navigate to `SymptomInputScreen` after slot selection instead of booking directly |
| `apps/mobile/src/navigation/` (patient nav file — locate at implementation time) | Register `SymptomInputScreen` in patient stack |
| `apps/mobile/src/screens/doctor/AppointmentDetailScreen.js` | Add Patient Symptoms card |
| `apps/web/src/pages/doctor/AppointmentsPage.jsx` | Add Patient Symptoms card to appointment detail view |

---

## 10. Dependencies

```
@anthropic-ai/sdk   — Anthropic Node.js SDK (install in apps/api only)
```

---

## 11. Error Handling & Safety

| Scenario | Handling |
|---|---|
| Patient skips symptom input | No PATCH call — `symptomText` stays null; doctor sees no card |
| Claude timeout / API error | BullMQ retries 3× with exponential backoff; raw text still visible |
| JSON parse failure | Silent — analysis null, raw text visible, doctor informed by "Analysis unavailable" |
| `ANTHROPIC_API_KEY` not set | Worker skips gracefully; raw text still saved and visible |
| Symptom text > 1000 chars | 400 from API; client enforces max length too |
| Re-submission | Overwrites text, clears analysis, re-queues — idempotent |

---

## 12. Security & Disclaimers

- Symptom text is user-controlled input — validated for length server-side; never executed or rendered as HTML.
- `ANTHROPIC_API_KEY` is server-only, never exposed to clients.
- AI output is displayed with a mandatory disclaimer on every surface: *"AI-generated — not a substitute for clinical judgment."*
- Claude is instructed never to diagnose or suggest medications. Output is limited to two structured fields.
- Patient can only submit symptoms for their own appointments (ownership enforced server-side).
