# Prescription QR Sharing Design

**Date:** 2026-07-11
**Status:** Approved

## Goal

Patients generate a QR code for a prescription. Pharmacies scan it to check inventory and record dispensing. Labs scan it to accept test orders, track processing, and auto-share results back to the patient.

## Architecture

The existing `SharedLink` infrastructure handles QR tokens. The QR code encodes a share URL (`/s/{token}`). Pharmacy and lab scanner UIs live in their respective web dashboards and a shared mobile scan screen. The backend adds three new endpoints; all existing share, notification, and product models are reused without structural changes except for small additions to `LabResult`.

**Tech Stack:** Node.js/Express/Mongoose (API), React (web), React Native/Expo (mobile), `qrcode.react` (web QR render), `react-native-qrcode-svg` (mobile QR render), `html5-qrcode` (web webcam scanner), `expo-barcode-scanner` (mobile camera scanner)

---

## Data Model Changes

### LabResult (`apps/api/src/models/LabResult.js`)

| Change | From | To |
|---|---|---|
| `status` enum | `['pending', 'ready']` | `['pending', 'processing', 'ready']` |
| `tests[].value` | `required: true` | `required: false, default: ''` |
| `prescriptionId` | — | `ObjectId, ref: 'Prescription', default: null` |

### Prescription — no changes
`dispensedAt`, `dispensedBy`, and `analyses[]` already exist.

### SharedLink — no changes
Already supports `resourceType: 'prescription'`.

---

## API Endpoints

### Existing (unchanged)
- `POST /share` — patient creates share token for a prescription
- `GET /share/:token` — public read; returns decrypted prescription (PHI decrypt hooks fire on `findById`)
- `DELETE /share/:token` — patient revokes token

### New

#### `POST /prescriptions/:id/dispense`
- **Auth:** pharmacy role only
- **Guards:** prescription not already dispensed (`dispensedAt` is null), requester's pharmacy account is approved
- **Logic:**
  1. Load prescription; verify not yet dispensed
  2. Load pharmacy's products (`Product.find({ pharmacyId })`)
  3. For each `medication` in prescription: case-insensitive name match against products → if matched and `stockQty > 0`, decrement by 1 (atomic `$inc: { stockQty: -1 }`)
  4. Set `prescription.dispensedAt = new Date()`, `prescription.dispensedBy = pharmacy._id`
  5. Save prescription atomically
- **Returns:** `{ prescription, dispensedMedications: [{ name, matched: bool, stockBefore, stockAfter }] }`
- **Errors:** 409 if already dispensed, 403 if not pharmacy role

#### `POST /lab-results/from-prescription`
- **Auth:** laboratory role only
- **Body:** `{ shareToken: string }`
- **Logic:**
  1. Look up `SharedLink` by token; validate not expired, not revoked
  2. Load prescription from `SharedLink.resourceId`
  3. Reject if prescription has no `analyses[]`
  4. Create `LabResult`:
     - `patientId` = prescription.patientId
     - `doctorId` = prescription.doctorId
     - `labName` = from `Lab.findOne({ userId: req.user.id }).labName`
     - `tests` = prescription.analyses.map(a => `{ name: a.name, value: '', flag: 'normal' }`)
     - `status: 'pending'`
     - `prescriptionId` = prescription._id
- **Returns:** created LabResult
- **Errors:** 404 if token invalid/expired, 422 if prescription has no analyses, 409 if a LabResult already exists for this `prescriptionId` (one lab handles one prescription)

#### `PATCH /lab-results/:id/status`
- **Auth:** laboratory role only; must be the lab that created the result
- **Body:**
  - `{ status: 'processing' }` — marks as started
  - `{ status: 'ready', tests: [{ name, value, unit, referenceRange, flag }] }` — fills results and publishes
- **Logic on `ready`:**
  1. Validate all `tests` have non-empty `value`
  2. Update LabResult with test values and `status: 'ready'`
  3. Create `SharedLink`: `{ resourceType: 'lab_result', resourceId, ownerId: patientId, token: randomBytes(32).hex, expiresAt: null }`
  4. Create `Notification` for patient: `{ type: 'lab_ready', message: 'Your lab results are ready', link: /s/{token} }`
  5. Send FCM push if patient has `fcmToken`
- **Returns:** `{ labResult, sharedLink?: { token, url } }`
- **Errors:** 403 if not owner lab, 422 if marking ready without test values

---

## QR Generation — Patient

### Web
- **File:** `apps/web/src/pages/records/MedicalRecordsPage.jsx`
- Each prescription card gets a "Share QR" button
- On click: `POST /share` `{ resourceType: 'prescription', resourceId, expiry: '24h' }` → renders QR modal
- QR modal shows: `qrcode.react` component encoding `{window.location.origin}/s/{token}`, expiry label, "Revoke" button (`DELETE /share/:token`)
- Patient can regenerate after revoke

### Mobile
- **File:** `apps/mobile/src/screens/records/PrescriptionDetailScreen.js`
- "Show QR" button → full-screen modal with `react-native-qrcode-svg`
- Same API call and revoke flow

---

## Pharmacy Flow

### Web
- **File:** `apps/web/src/pages/pharmacy/PharmacyDashboardPage.jsx`
- "Scan Rx" button in POS tab header
- Opens `ScanModal`: webcam feed via `html5-qrcode`, scanning until QR decoded
- On decode: extract token from URL → `GET /api/share/{token}` → prescription data
- `PrescriptionCheckView` component shows:
  - Doctor name, patient first name only
  - Medications list with inventory status (computed client-side against `products` state):
    - ✓ **In Stock** — case-insensitive name match, `stockQty > 0` — shows qty
    - ✗ **Out of Stock** — matched, `stockQty = 0`
    - — **Not Carried** — no name match
- "Confirm Dispense" → `POST /prescriptions/:id/dispense` → shows per-medication deduction summary
- Prescription already dispensed: shows read-only "Filled on {date}" banner

### Mobile
- **File:** `apps/mobile/src/screens/pharmacy/ScanRxScreen.js`
- Uses `expo-barcode-scanner`; same decode → check → dispense flow presented in a bottom-sheet modal

---

## Lab Flow

### Web
- **File:** `apps/web/src/pages/lab/LabDashboardPage.jsx`
- New **"Orders"** tab alongside existing upload tab
- "Scan Rx" button in header → same `html5-qrcode` webcam modal
- On decode: shows `analyses[]` from prescription
- "Accept Order" → `POST /lab-results/from-prescription` `{ shareToken }` → LabResult created as `pending`
- Orders tab lists all LabResults with `prescriptionId != null`, grouped by status:
  - **Pending:** "Start" → `PATCH status: processing`
  - **Processing:** "Enter Results" → inline form per test (name pre-filled, value + flag input) → "Publish" → `PATCH status: ready, tests: [...]`
  - **Ready:** shows "Shared ✓" badge; no further action needed

### Mobile
- **File:** `apps/mobile/src/screens/lab/ScanRxScreen.js`
- Scan → shows analyses → "Accept Order" → navigates to lab orders list

---

## Patient Auto-Notification (Lab Results)

When `PATCH /lab-results/:id/status` sets `ready`:
1. SharedLink created (no password, no expiry) — permanent link owned by patient
2. `Notification` document created in DB
3. FCM push sent to patient's `fcmToken` if set

Patient sees: push notification → taps → deep-links to SharedLink viewer showing LabResult.

---

## New Files

| File | Purpose |
|---|---|
| `apps/web/src/components/QRModal.jsx` | Reusable: renders QR code + expiry + revoke button |
| `apps/web/src/components/ScanModal.jsx` | Reusable: webcam scanner using `html5-qrcode` |
| `apps/web/src/components/PrescriptionCheckView.jsx` | Prescription + inventory status display (pharmacy) |
| `apps/mobile/src/screens/pharmacy/ScanRxScreen.js` | Mobile pharmacy scan + dispense |
| `apps/mobile/src/screens/lab/ScanRxScreen.js` | Mobile lab scan + accept order |

---

## Modified Files

| File | Change |
|---|---|
| `apps/api/src/models/LabResult.js` | Add `processing` status, optional `value`, `prescriptionId` |
| `apps/api/src/routes/prescriptions.js` | Add `POST /:id/dispense` |
| `apps/api/src/routes/labResults.js` | Add `POST /from-prescription` and `PATCH /:id/status` |
| `apps/web/src/pages/records/MedicalRecordsPage.jsx` | Add "Share QR" button per prescription |
| `apps/web/src/pages/pharmacy/PharmacyDashboardPage.jsx` | Add "Scan Rx" button + scan + dispense flow |
| `apps/web/src/pages/lab/LabDashboardPage.jsx` | Add "Scan Rx" button + Orders tab |
| `apps/mobile/src/screens/records/PrescriptionDetailScreen.js` | Add "Show QR" button |

---

## Security Notes

- QR tokens expire in 24h by default; patient can revoke at any time
- `POST /prescriptions/:id/dispense` is pharmacy-role-gated; double-dispense prevented by 409 guard
- `POST /lab-results/from-prescription` is lab-role-gated; duplicate order prevented by 409 guard
- PHI decryption happens server-side in existing post-init hooks; share endpoint already returns decrypted data
- Patient first name only shown in pharmacy view to limit unnecessary PHI exposure
