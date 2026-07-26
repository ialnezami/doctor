# Phone-Linked Patient Accounts + Doctor/Lab Creation

**Date:** 2026-07-11  
**Status:** Approved  
**Scope:** Backend (User model, auth routes) + Web UI (login, doctor/lab dashboard) + Mobile (login screen label)

---

## Problem

Doctors and labs need to create patient records on behalf of patients who may not have an email address. Currently the system requires email for every user. Login also only accepts email, which excludes phone-only patients.

---

## Goals

1. Allow a patient to be identified by phone number instead of (or in addition to) email
2. Let doctors and labs create patient accounts with name + phone + temp password (email optional)
3. Allow login with either email or phone + password

---

## Data Layer

### User model changes

**Email** — change from `required: true` to `required: false` with a sparse unique index. Existing users are unaffected (all have emails). Doctor-created patients may omit email.

**Phone** — new field:
```js
phone: { type: String, sparse: true, unique: true }
```
Normalized to E.164 format (`+966501234567`) in a pre-save hook before storing. Sparse unique index enforces global uniqueness for users who have a phone.

**phoneHash** — new field, same HMAC blind index pattern as `emailHash`:
```js
phoneHash: { type: String, default: null }
```
Maintained by a pre-save hook: whenever `phone` changes, recompute `phoneHash = hmacHash(normalizedPhone)`. Used for login lookup and uniqueness enforcement.
```js
userSchema.index({ phoneHash: 1 }, { unique: true, sparse: true });
```

**Invariant:** every User must have at least one of `email` or `phone`. Enforced at the route level, not the model level.

---

## API Changes

### `POST /api/auth/login` — extended to accept phone

**Before:**
```json
{ "email": "user@example.com", "password": "..." }
```

**After:**
```json
{ "identifier": "user@example.com", "password": "..." }
// or
{ "identifier": "+966501234567", "password": "..." }
```

Server detection logic:
- `identifier` contains `@` → treat as email → lookup by `emailHash`
- otherwise → normalize as E.164 phone → lookup by `phoneHash`

Response is identical to the current login response. Existing clients sending `email` field will break — the field rename is a breaking change, so the login endpoint must accept **both** `email` and `identifier` during a transition period, preferring `identifier` if both are present.

---

### `POST /api/auth/create-patient` — new endpoint

**Auth:** JWT required, role must be `doctor` or `laboratory`.

**Request body:**
```json
{
  "name": "Fatima Al-Zahra",
  "phone": "+966501234567",
  "password": "TempPass123",
  "email": "optional@example.com"
}
```

**Validation:**
- `name` — required, non-empty string, trimmed
- `phone` — required, normalized to E.164, unique check (409 if taken)
- `password` — required, min 8 characters
- `email` — optional; if provided, must be valid email format and unique (409 if taken)

**Success flow (atomic):**
1. Normalize phone to E.164
2. Check `phoneHash` uniqueness (and `emailHash` if email provided) — fail fast with 409 before any writes
3. Create `User` document (role: `patient`)
4. Create `Patient` profile document linked to the new user
5. If Patient creation fails, delete the User (compensating rollback — no transaction available in MongoDB Atlas free tier)
6. Return `201` with `{ id, name, phone, email, createdAt }`

**Error responses:**
- `409` — phone or email already registered
- `422` — validation failure with field-level errors
- `403` — caller is not doctor or laboratory

---

## Web UI

### Login page

Single identifier field replaces the email field:
- Label: `Email or Phone Number`
- Placeholder: `email@example.com or +966...`
- Sends `identifier` in the request body

### Doctor / Lab dashboard — Add Patient modal

A `+ Add Patient` button in the patient list view opens a modal with four fields:

| Field | Required | Notes |
|---|---|---|
| Full Name | Yes | |
| Phone Number | Yes | Hint: international format `+966...` |
| Temporary Password | Yes | Min 8 chars |
| Email | No | Optional |

On success: inline confirmation showing the created patient's name and phone, then modal closes.

On error: inline field-level error messages (duplicate phone, duplicate email, validation).

---

## Mobile

### Login screen

Label change only: `Email` → `Email or Phone Number`. Sends `identifier` field to the existing login endpoint.

No other mobile changes. Patient creation is a web-only (doctor/lab) workflow.

---

## Security Considerations

- Phone stored in normalized E.164 form; `phoneHash` is HMAC-SHA256 (same key as `emailHash`) — consistent with existing blind index pattern
- Temp password is set by the doctor and communicated verbally — no SMS sent, no token stored
- The `create-patient` endpoint is role-gated; a patient cannot call it to create other patients
- Rate limiting already applied to `/api/auth/login` via `loginLimiter` middleware — phone login goes through the same limiter
- The 409 uniqueness check happens before any write to prevent partial state

---

## Out of Scope

- SMS OTP verification
- Patient self-registration with phone
- Password reset via SMS
- Phone number verification (confirming the patient actually owns the number)
