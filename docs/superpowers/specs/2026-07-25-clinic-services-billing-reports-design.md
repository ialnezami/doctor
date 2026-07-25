# Clinic Services, Billing & Reports — Design Spec

**Date:** 2026-07-25
**App:** Salamtak (doctor-facing web)
**Routes:** `/services` · `/invoices` · `/reports`

---

## Goal

Replace the three `ComingSoonPage` stubs with functional pages that let doctors manage their service catalog, track invoice payments from appointments, and view revenue and appointment analytics.

## Architecture

Minimal backend extensions on top of existing models. No new MongoDB collections. The three features share a single dependency chain: **Services** defines fees → **Appointments** capture those fees as `invoiceAmount` at booking → **Reports** aggregate over that data.

---

## 1. خدمات العيادة — Clinic Services (`/services`)

### Data

Reuses `Doctor.appointmentTypes` (already in the Doctor model):

```js
{ key: String, label: String, duration: Number, fee: Number, enabled: Boolean }
```

No new model. Saved via existing `PATCH /api/doctors/me`.

### API

No new endpoints. Uses:
- `GET /api/doctors/me` — load current service list
- `PATCH /api/doctors/me` — save updated `appointmentTypes` array

### UI

Card grid. Each card shows:
- Service name (`label`) — inline editable
- Duration in minutes
- Fee in SAR (doctor's `currency` field)
- Enabled/disabled toggle
- Edit and delete actions

Actions:
- **Add service** — opens inline form (name, duration, fee)
- **Edit** — inline, saves on blur/enter
- **Toggle** — switches `enabled`, saves immediately
- **Delete** — confirmation before removal

**Note:** DoctorSettingsPage currently has a basic appointment-types editor. That section will be removed and replaced with a "Manage in Services page" link to `/services`.

---

## 2. الفواتير — Billing / Invoices (`/invoices`)

### Data Model Changes

Two new fields on the `Appointment` model:

```js
paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' }
invoiceAmount: { type: Number, default: 0 }
```

`invoiceAmount` is set at appointment creation time from `appointmentTypes.find(t => t.key === visitType).fee`. Frozen at creation — fee changes don't affect past invoices. If no match or fee is 0, amount is 0 (still tracked).

### API

**`GET /api/invoices`** — doctor-only
- Query: `?status=paid|unpaid|all` (default: all), `?page`, `?limit`
- Returns appointments as invoice records, populated with patient name
- Response: `{ invoices: [...], summary: { total, collected, outstanding } }`

**`PATCH /api/invoices/:appointmentId/pay`** — doctor-only
- Sets `paymentStatus: 'paid'` on the appointment
- Returns updated invoice record

### UI

Filter tabs: **الكل · غير مدفوع · مدفوع**

Summary strip (always visible):
- Total invoiced · Total collected · Total outstanding

Table columns:
| Patient | Date | Visit Type | Amount | Status | Action |
|---------|------|------------|--------|--------|--------|
| Name | DD/MM/YYYY | initial/follow-up/… | 150 SAR | badge | "تحصيل" button |

"تحصيل" (Collect) button marks the invoice as paid inline — no page reload.

---

## 3. التقارير — Reports (`/reports`)

### API

**`GET /api/reports/summary`** — doctor-only
- Query: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (default: current calendar month)
- MongoDB aggregation over `Appointment` collection filtered by `doctorId` and date range

Response:
```json
{
  "revenue": { "total": 0, "collected": 0, "outstanding": 0 },
  "byMonth": [{ "month": "2026-07", "invoiced": 0, "collected": 0 }],
  "appointments": { "total": 0, "completed": 0, "cancelled": 0, "pending": 0 },
  "byVisitType": [{ "type": "initial", "count": 0, "revenue": 0 }],
  "busiestDays": [{ "day": 0, "count": 0 }]
}
```

`busiestDays.day` is 0–6 (Sunday–Saturday), rendered as Arabic day names in the UI.

### UI

**Date range picker** at top (from/to). Default: first → last day of current month. Fetches on change.

**Stat cards row:** Total Revenue · Collected · Outstanding

**Charts (recharts):**
- Monthly revenue bar chart (invoiced vs collected, grouped by month)
- Appointments by status donut chart

**Tables:**
- Visit type breakdown: type name · count · revenue
- Busiest days: day name · appointment count

### Dependency

`recharts` added to `apps/web/package.json` if not already installed.

---

## Global Constraints

- All three pages are doctor-only (`DoctorProtected` wrapper already in router)
- RTL layout — consistent with existing DoctorLayout (Arabic, right-to-left)
- Currency display uses `doctor.currency` (default: SAR)
- No new MongoDB collections
- `invoiceAmount` must be set at appointment creation, not derivable at query time (fee can change)
- API responses never include PHI beyond what's already in existing appointment endpoints
- Pagination on `/api/invoices` — default 20 per page
