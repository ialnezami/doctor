# Pharmacy Role — Design Spec
**Date:** 2026-07-09
**Status:** Approved
**Phase:** 10 (follows AI Chatbot phase 09)

---

## Overview

Introduces a `pharmacy` role to MediConnect. Pharmacies can manage medication inventory, operate a point-of-sale (POS) terminal, fulfill doctor-issued prescriptions (via QR scan or patient lookup), and sell over-the-counter (OTC) medications. Also fixes two known lab role UI gaps bundled in this phase.

---

## 1. Data Models

### 1.1 Pharmacy
Mirrors the existing `Lab` model pattern.

```js
{
  userId:         ObjectId (ref: User, unique, required),
  pharmacyName:   String (required),
  licenseNumber:  String (default: ''),
  address:        String (default: ''),
  isApproved:     Boolean (default: false),
  location: {
    type:        'Point',
    coordinates: [Number]  // [lng, lat]
  }
}
// Indexes: isApproved, location (2dsphere sparse)
```

### 1.2 Product (medication inventory item)
One product per distinct medication per pharmacy.

```js
{
  pharmacyId:        ObjectId (ref: Pharmacy, required),
  name:              String (required),
  barcode:           String (required),           // EAN-13 / QR / custom
  description:       String (default: ''),
  unit:              String enum ['tablet','capsule','ml','mg','box','sachet','other'],
  stockQty:          Number (default: 0, min: 0),
  lowStockThreshold: Number (default: 10),
  price:             Number (required, min: 0),
  currency:          String (default: 'SAR'),
}
// Compound index: { pharmacyId, barcode } unique — barcode unique per pharmacy
```

### 1.3 Sale (POS transaction)
```js
{
  pharmacyId:     ObjectId (ref: Pharmacy, required),
  items: [{
    productId:  ObjectId (ref: Product),
    name:       String,           // snapshot at sale time
    qty:        Number (min: 1),
    unitPrice:  Number,
  }],
  prescriptionId: ObjectId (ref: Prescription, nullable),  // null = OTC sale
  patientId:      ObjectId (ref: User, nullable),
  totalAmount:    Number (required),
  currency:       String (required),
  paymentMethod:  String enum ['cash','card'] (required),
  dispensedBy:    ObjectId (ref: User, required),           // pharmacy user
  receiptNumber:  String (unique, auto-generated),
}
// Indexes: pharmacyId, patientId, prescriptionId, createdAt desc
```

### 1.4 Prescription (extension)
Add two fields to existing `Prescription` model:
```js
dispensedAt: Date (nullable, default: null),
dispensedBy: ObjectId (ref: Pharmacy, nullable, default: null),
```

---

## 2. API Endpoints

### 2.1 Pharmacy Profile
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/pharmacies/me` | pharmacy | Get own profile |
| PATCH | `/api/pharmacies/me` | pharmacy | Update name/address/license |
| PUT | `/api/pharmacies/me/location` | pharmacy | Update geo location |
| GET | `/api/pharmacies` | public | List approved pharmacies (geo search) |
| GET | `/api/pharmacies/:id` | public | Single pharmacy profile |

### 2.2 Inventory
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/pharmacies/me/products` | pharmacy | List all products |
| POST | `/api/pharmacies/me/products` | pharmacy | Create product |
| PATCH | `/api/pharmacies/me/products/:id` | pharmacy | Update product/stock |
| DELETE | `/api/pharmacies/me/products/:id` | pharmacy | Delete product (guard: no active sales) |
| GET | `/api/pharmacies/me/products/barcode/:code` | pharmacy | Lookup by barcode (scanner endpoint) |

Validation on create/update:
- `name`, `barcode`, `unit`, `price` required
- `stockQty` ≥ 0
- `barcode` unique per pharmacy (409 on duplicate)

### 2.3 Prescription Access (pharmacy)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/prescriptions/rx/:token` | pharmacy \| patient | Already exists — pharmacy reads by QR token |
| GET | `/api/prescriptions/patient-active/:patientId` | pharmacy | Active (non-dispensed) prescriptions for patient |
| POST | `/api/prescriptions/:id/dispense` | pharmacy | Mark dispensed, deduct stock atomically |

`dispense` endpoint:
1. Validate prescription exists and `dispensedAt` is null (idempotent guard)
2. For each medication in prescription, find matching product by name in pharmacy inventory
3. Deduct quantities (fail if insufficient stock — return 409 with item names)
4. Set `prescription.dispensedAt = now`, `dispensedBy = pharmacy._id`
5. Create a `Sale` record (type: prescription)
6. All steps in a Mongoose session/transaction

### 2.4 POS / Sales
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/pharmacies/me/sales` | pharmacy | Create sale (OTC or prescription-linked) |
| GET | `/api/pharmacies/me/sales` | pharmacy | Sale history (filterable by date, patientId) |
| GET | `/api/pharmacies/me/sales/:id` | pharmacy | Single sale / receipt |

`POST /sales` logic:
1. Validate all `items` exist and belong to this pharmacy
2. Check `stockQty >= qty` for each item (atomic read-check-deduct)
3. If `prescriptionId` provided, validate it's not already dispensed
4. Deduct stock
5. Create `Sale` with auto-generated `receiptNumber` (`RX-{YYYYMMDD}-{seq}`)
6. Return sale with full item details for receipt display

---

## 3. Role & Auth

- Add `'pharmacy'` to `User.role` enum: `['doctor','patient','laboratory','pharmacy']`
- Create `Pharmacy` profile doc on registration (same hook as Lab/Doctor)
- `isApproved: false` by default — admin must approve before pharmacy can use POS or inventory

---

## 4. Admin Dashboard Extension

Add **Pharmacies** tab to existing `AdminPage`:
- List pending pharmacies (`isApproved: false`)
- Approve / reject (same pattern as lab approval)
- View approved pharmacies

New admin endpoint: `GET /api/admin/pharmacies` + `PATCH /api/admin/pharmacies/:id/approve`

---

## 5. Web Dashboard (pharmacy role)

Single-page dashboard with 3 tabs:

### Tab 1 — POS
- Barcode input field at top (auto-focused; USB scanner fires keydown → Enter)
- Product found: adds to cart with qty spinner
- "Link Prescription" button: opens modal → paste/type token OR search patient by name/ID
- Cart: item list, subtotals, total
- Payment method toggle (Cash / Card)
- Checkout → creates sale → shows receipt with receipt number

### Tab 2 — Inventory
- Product table: name, barcode, unit, stock, low-stock badge (red when stock ≤ threshold), price
- Add product form (inline or modal): name, barcode, unit, price, initial stock, threshold
- Edit inline: stock adjustment (+ / −), price, threshold
- Delete with confirmation (blocked if product appears in recent sales)

### Tab 3 — Profile
- Pharmacy name, license number, address
- Map pin (same Leaflet WebView pattern as lab)
- Save button

**Pending approval state**: same as lab — show waiting screen until `isApproved: true`

---

## 6. Mobile App (pharmacy role)

### Screen 1 — POS (camera barcode scan)
- Full-screen `expo-barcode-scanner` viewfinder with overlay
- On scan: product lookup → add to cart
- Cart sheet slides up from bottom
- "Scan Rx QR" mode: switches to read prescription QR token
- Checkout: payment method picker → confirm → receipt screen

### Screen 2 — Inventory
- List with search
- Tap product → edit stock quantity (quick +/− or type value)
- FAB → add new product (form + camera scan to fill barcode field)
- Low-stock items highlighted

### Screen 3 — Profile
- Same fields as web tab

**Navigation**: Tab bar with POS / Inventory / Profile (same pattern as existing doctor/patient tab bars)

---

## 7. Prescription QR Integration

Existing `/rx/:token` public web page already renders the prescription for patients. Extend:

- **Web POS**: "Link Rx" modal has a token input field. On submit, calls `GET /api/prescriptions/rx/:token` and populates cart with prescription medications automatically.
- **Mobile POS**: "Scan Rx QR" mode switches camera to read the QR token embedded in the prescription share URL. On decode, auto-populates cart.
- The QR token is already embedded in prescription share links (`/s/:token`). Reuse that token for dispensing.

---

## 8. Lab Role Gaps (bundled fix)

These are existing defects fixed in the same phase:

### 8.1 Web LabDashboardPage
**Gap**: No result list rendered despite `GET /lab-results/search` being available.
**Fix**: Add a results section below the upload form showing the lab's uploaded results with test name, patient name, date, status badge. Search by patient name or test name.

### 8.2 Mobile LabUploadsScreen
**Gap**: `uploads` state is populated but never rendered as a list.
**Fix**: Add `FlatList` below the form showing upload history with test name, patient, date, status.

---

## 9. Security & Data Integrity

- Pharmacy can only read prescriptions that are active (`dispensedAt: null`). Cannot view patient medical history beyond the Rx.
- Stock deduction on sale is atomic: if any item has insufficient stock, the entire sale is rejected with a 409 listing which items failed.
- `dispensedAt` is set only once (idempotency check: if already set, return 409 "already dispensed").
- All pharmacy endpoints check `isApproved: true` before allowing POS/inventory operations (same guard as lab).
- `receiptNumber` generated server-side; client cannot set it.
- PHI in sale records: patient name stored only via ObjectId reference, never denormalized into Sale document.

---

## 10. Implementation Wave Plan

| Phase | Plans | Content |
|-------|-------|---------|
| 10.1 | Backend foundation | Pharmacy model, routes, Product model, Prescription extension, User enum, admin endpoints |
| 10.2 | Inventory API + web | Product CRUD API, web inventory tab |
| 10.3 | POS API + web | Sales API, web POS tab + receipt |
| 10.4 | Prescription dispensing | Dispense endpoint, QR flow web |
| 10.5 | Mobile pharmacy | POS screen (camera scan), inventory screen, profile |
| 10.6 | Lab fixes + polish | Lab web result list, lab mobile list, admin pharmacy tab |

---

## 11. Out of Scope (this phase)

- Insurance/billing integration
- Medication reorder notifications to suppliers
- Controlled substance tracking / DEA-level audit
- Multi-branch pharmacy (one account = one location)
- Online patient ordering / delivery
