# WhatsApp AI Booking Agent — Design Spec
**Date:** 2026-08-17  
**Project:** Salamtak Healthcare Platform  
**Status:** Approved for implementation

---

## 1. Overview

A WhatsApp-based AI booking agent that lets patients book, cancel, and check appointments via natural language messages. Built on Twilio WhatsApp API + Claude tool_use, integrated directly into the existing Express/MongoDB API — no extra infrastructure required.

**Scope:**
- Book appointments (find doctor → pick slot → confirm)
- Cancel appointments
- List upcoming appointments
- Silent account creation from WhatsApp phone number
- Optional account claiming with OTP to use the Salamtak app

**Out of scope:** payments, prescriptions, medical records via WhatsApp.

---

## 2. Architecture

```
Patient WhatsApp
      │
      ▼
  Twilio API
      │  POST (From, Body)
      ▼
POST /api/whatsapp/webhook
      │
      ├─ 1. Validate Twilio signature (reject if invalid)
      ├─ 2. Rate limit (20 msg/phone/hour)
      ├─ 3. Find or silently create patient account by phone
      ├─ 4. Load WhatsappSession (conversation history, 24h TTL)
      ├─ 5. Run Claude agent loop (tool_use)
      │       ├─ find_doctors(specialty, name?, city?)
      │       ├─ get_available_slots(doctorId, locationId, daysAhead?)
      │       ├─ book_appointment(doctorId, locationId, date, timeSlot, reason)
      │       ├─ list_my_appointments()
      │       └─ cancel_appointment(appointmentId)
      ├─ 6. Execute tool calls against MongoDB / existing booking logic
      ├─ 7. Save updated conversation history
      └─ 8. Return TwiML reply to Twilio → delivered to patient
```

---

## 3. New Files

| File | Purpose |
|---|---|
| `apps/api/src/routes/whatsapp.js` | Webhook handler, signature validation, rate limiting |
| `apps/api/src/services/whatsappAgent.js` | Claude agent orchestrator (tool_use loop) |
| `apps/api/src/services/bookingTools.js` | Tool implementations (DB queries + booking) |
| `apps/api/src/services/patientProvisioner.js` | Silent account creation from phone number |
| `apps/api/src/models/WhatsappSession.js` | Conversation history per phone, 24h TTL |
| `apps/api/src/models/OtpCode.js` | OTP codes for account claiming |

## 4. Modified Files

| File | Change |
|---|---|
| `apps/api/src/models/User.js` | Add `phone`, `passwordHash: null` default, `whatsappLinked` |
| `apps/api/src/routes/auth.js` | Add `POST /api/auth/claim-account` + `/verify` |
| `apps/api/src/index.js` | Register `/api/whatsapp` route |

---

## 5. Data Models

### 5.1 User model additions
```js
phone:          { type: String, sparse: true, unique: true }
// passwordHash already exists — allow null for WhatsApp-created accounts
whatsappLinked: { type: Boolean, default: false }
```

### 5.2 WhatsappSession
```js
{
  phone:     { type: String, required: true, unique: true },
  patientId: { type: ObjectId, ref: 'User', required: true },
  history:   [{ role: String, content: Mixed }],  // Claude message format
  updatedAt: { type: Date, default: Date.now }     // TTL index: 86400s
}
```
TTL index: `{ updatedAt: 1 }` with `expireAfterSeconds: 86400`.  
`updatedAt` is refreshed on every message — session lives 24h from last activity.

### 5.3 OtpCode
```js
{
  phone:     { type: String, required: true },
  codeHash:  { type: String, required: true },  // SHA-256 of 6-digit OTP
  expiresAt: { type: Date, required: true },     // now + 10 min
  attempts:  { type: Number, default: 0 },       // max 3
  used:      { type: Boolean, default: false }
}
```

---

## 6. Claude Agent — Tool Definitions

### System prompt
```
You are Salamtak's WhatsApp booking assistant. You help patients find doctors,
book appointments, view upcoming appointments, and cancel appointments.

Rules:
- Respond in the same language the user writes in (Arabic or English).
- If you do not know the patient's name, ask for it before anything else.
- Never invent doctor names, specialties, or time slots. Only use data returned by tools.
- Always show the user the booking details and ask for explicit confirmation before calling book_appointment.
- Always ask for explicit confirmation before calling cancel_appointment.
- Keep messages short and clear — this is WhatsApp, not a web form.
- If the user asks for something outside your scope (prescriptions, test results, payments), politely decline and explain you only handle appointment booking.
```

### Tools

**find_doctors**
```json
{
  "name": "find_doctors",
  "description": "Search for doctors by medical specialty or name. Call when the user mentions a specialty or doctor name.",
  "input_schema": {
    "type": "object",
    "properties": {
      "specialty": { "type": "string", "description": "Medical specialty in Arabic or English e.g. cardiology, قلبية" },
      "name":      { "type": "string", "description": "Doctor name, optional" },
      "city":      { "type": "string", "description": "City filter, optional" }
    }
  }
}
```

**get_available_slots**
```json
{
  "name": "get_available_slots",
  "description": "Get free appointment slots for a specific doctor and location over the next N days.",
  "input_schema": {
    "type": "object",
    "required": ["doctorId", "locationId"],
    "properties": {
      "doctorId":   { "type": "string" },
      "locationId": { "type": "string" },
      "daysAhead":  { "type": "number", "default": 7 }
    }
  }
}
```

**book_appointment**
```json
{
  "name": "book_appointment",
  "description": "Book an appointment after the user has explicitly confirmed the doctor, date, and time.",
  "input_schema": {
    "type": "object",
    "required": ["doctorId", "locationId", "date", "timeSlot"],
    "properties": {
      "doctorId":   { "type": "string" },
      "locationId": { "type": "string" },
      "date":       { "type": "string", "description": "ISO date e.g. 2026-08-20" },
      "timeSlot":   {
        "type": "object",
        "properties": {
          "start": { "type": "string", "description": "e.g. 10:00" },
          "end":   { "type": "string", "description": "e.g. 10:30" }
        }
      },
      "visitType":  { "type": "string", "default": "initial" },
      "reason":     { "type": "string" }
    }
  }
}
```

**list_my_appointments**
```json
{
  "name": "list_my_appointments",
  "description": "List the patient's upcoming confirmed or pending appointments.",
  "input_schema": { "type": "object", "properties": {} }
}
```

**cancel_appointment**
```json
{
  "name": "cancel_appointment",
  "description": "Cancel a specific appointment. Only call after user confirms cancellation.",
  "input_schema": {
    "type": "object",
    "required": ["appointmentId"],
    "properties": {
      "appointmentId": { "type": "string" }
    }
  }
}
```

**save_patient_name**
```json
{
  "name": "save_patient_name",
  "description": "Persist the patient's name once they provide it. Call immediately after the user tells you their name.",
  "input_schema": {
    "type": "object",
    "required": ["name"],
    "properties": {
      "name": { "type": "string" }
    }
  }
}
```

---

## 7. API Endpoints

### 7.1 Twilio Webhook
```
POST /api/whatsapp/webhook
Content-Type: application/x-www-form-urlencoded  (Twilio format)

Body params: From, Body, MessageSid
Response: TwiML XML with <Message> reply
```

**Validation:** `X-Twilio-Signature` header verified using `twilio.validateRequest()` before any processing.

### 7.2 Account Claim — Send OTP
```
POST /api/auth/claim-account
Body: { phone: "+966501234567" }

- Finds user by phone
- Generates 6-digit OTP
- Stores SHA-256(OTP) in OtpCode collection (10 min TTL)
- Sends OTP via Twilio SMS
- Returns 200 { message: "OTP sent" }
```

### 7.3 Account Claim — Verify OTP + Set Password
```
POST /api/auth/claim-account/verify
Body: { phone: "+966501234567", otp: "482931", password: "newpassword" }

- Finds OtpCode by phone
- Increments attempts; rejects if >= 3
- Compares SHA-256(otp) with stored hash
- If match: sets User.passwordHash, User.whatsappLinked = true, marks OTP used
- Returns JWT token (same as normal login)
```

---

## 8. Silent Account Creation Flow

`patientProvisioner.js` — called on every incoming WhatsApp message:

```
1. Normalize phone: strip spaces, ensure E.164 format (+966...)
2. Find User where phone = normalized
3. If found → return { userId, patientId }
4. If not found:
   a. Create User { phone, name: null, role: 'patient', passwordHash: null }
   b. Create Patient { userId }
   c. Return { userId, patientId }
```

Name is collected by the agent in conversation and updated via `User.findByIdAndUpdate`.

---

## 9. Slot Availability Algorithm

`bookingTools.js → get_available_slots`:

```
1. Load Doctor.locations[locationId].slots (availabilitySlots per day-of-week)
2. For each day in next N days:
   a. Find slots for that dayOfWeek
   b. Generate time slots from startTime → endTime using appointmentType.duration (default 30 min)
   c. Load existing Appointments for that doctor + location + date (status != cancelled)
   d. Remove booked slots
   e. Remove slots in the past
3. Return array of { date, slots: [{ start, end }] }
```

---

## 10. Security

| Risk | Mitigation |
|---|---|
| Fake Twilio requests | `twilio.validateRequest()` with `TWILIO_AUTH_TOKEN` — hard reject if invalid |
| Message flooding | In-memory rate limit: 20 messages per phone per hour; reply with "please wait" |
| PHI in server logs | Never log `Body` content — log only `hash(phone)` + tool name |
| Plain OTP in DB | Store `SHA-256(otp)` only; compare hashes on verify |
| OTP brute force | Max 3 attempts per OTP; invalidate on 4th try; require new OTP |
| Account takeover | OTP delivered to the same phone — attacker needs physical device |
| Slot race condition | Reuse existing `findOne` conflict check before insert in `POST /api/appointments` |
| Unauthorized booking | Agent only books for the phone number's own patientId — never for others |

---

## 11. Environment Variables (new)

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886  # sandbox or production number
```

---

## 12. Conversation Flow Examples

### First-time booking (Arabic)
```
User:  أريد حجز موعد مع طبيب قلب
Agent: أهلاً! ما اسمك الكريم؟
User:  محمد علي
Agent: [calls find_doctors(specialty="cardiology")]
       وجدت هؤلاء الأطباء:
       1. د. أحمد خالد — قلبية — جدة
       2. د. سارة منصور — قلبية — الرياض
       أي طبيب تفضل؟
User:  الأول
Agent: [calls get_available_slots(doctorId, locationId)]
       د. أحمد خالد متاح في:
       - الأحد 20 أغسطس: 10:00، 11:00، 14:00
       - الاثنين 21 أغسطس: 09:00، 15:00
       أي وقت يناسبك؟
User:  الأحد الساعة 10
Agent: ما سبب الزيارة باختصار؟
User:  ألم في الصدر
Agent: تأكيد الحجز:
       الطبيب: د. أحمد خالد
       التاريخ: الأحد 20 أغسطس — 10:00
       السبب: ألم في الصدر
       هل تريد تأكيد الحجز؟ (نعم/لا)
User:  نعم
Agent: [calls book_appointment(...)]
       ✅ تم الحجز بنجاح! رقم الحجز: #AB1234
       لتتبع حجزك في التطبيق، أرسل "تفعيل حساب".
```

### Account claiming
```
User:  تفعيل حساب
Agent: [calls POST /api/auth/claim-account]
       تم إرسال رمز التحقق إلى رقمك.
User:  482931
Agent: [calls POST /api/auth/claim-account/verify]
       ✅ تم تفعيل حسابك. افتح التطبيق وسجل دخولك برقم هاتفك.
```

---

## 13. Claude Model

Use `claude-sonnet-4-6` — good balance of speed and accuracy for conversational tool_use. Max tokens per reply: 1024 (WhatsApp messages must be short). If a tool call fails, the agent retries once then replies with a polite error message.

---

## 14. Dependencies (new)

```json
"twilio": "^5.x"
```

Claude SDK already present. No other new dependencies.
