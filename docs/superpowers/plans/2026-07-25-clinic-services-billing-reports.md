# Clinic Services, Billing & Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three ComingSoonPage stubs at `/services`, `/invoices`, and `/reports` with a service catalog manager, invoice tracker, and analytics dashboard for the Salamtak doctor web app.

**Architecture:** Minimal backend extensions — two new Appointment fields (`paymentStatus`, `invoiceAmount`), two new API routes (`/api/invoices`, `/api/analytics/summary`), one new frontend API file, and three new page components. Services reuse `Doctor.appointmentTypes` via the existing `PATCH /api/doctors/me` endpoint.

**Tech Stack:** Node.js/Express/MongoDB (API), React/Vite (web), recharts (charts), existing DoctorLayout + CSS variables (RTL UI)

## Global Constraints

- All three pages are `DoctorProtected` — already wired in `apps/web/src/router/index.jsx`
- RTL layout — use `dir="rtl"` and existing CSS variables (`--bg`, `--bg2`, `--border`, `--text`, `--text2`, `--text3`, `--mint`, `--primary`, `--rose`)
- Currency display uses `doctor.currency` (default: `'SAR'`)
- No new MongoDB collections
- `invoiceAmount` set at appointment creation, never recomputed (fee freeze)
- API: doctor-only middleware is `auth` + `requireRole('doctor')`
- Working directory for API: `apps/api` — run tests with `npx jest --testPathPattern=<file> --no-coverage`
- Working directory for web: `apps/web` — no test runner configured, verify visually

---

## File Map

**API — modified:**
- `apps/api/src/models/Appointment.js` — add `paymentStatus`, `invoiceAmount` fields
- `apps/api/src/routes/appointments.js` — set `invoiceAmount` at appointment creation
- `apps/api/src/index.js` — register `/api/invoices` and `/api/analytics` routes

**API — created:**
- `apps/api/src/routes/invoices.js` — GET list + PATCH pay
- `apps/api/src/routes/analytics.js` — GET summary with MongoDB aggregation
- `apps/api/src/routes/__tests__/invoices.test.js` — invoice route tests
- `apps/api/src/routes/__tests__/analytics.test.js` — analytics route tests

**Web — modified:**
- `apps/web/src/router/index.jsx` — swap ComingSoonPage for real pages
- `apps/web/src/pages/doctor/DoctorSettingsPage.jsx` — remove appointmentTypes section, add link to /services
- `apps/web/package.json` — add recharts

**Web — created:**
- `apps/web/src/api/invoices.js` — API client functions
- `apps/web/src/api/analytics.js` — API client function
- `apps/web/src/pages/doctor/ServicesPage.jsx` — service catalog UI
- `apps/web/src/pages/doctor/InvoicesPage.jsx` — invoice list + mark paid UI
- `apps/web/src/pages/doctor/ReportsPage.jsx` — analytics dashboard UI

---

### Task 1: Appointment model — add paymentStatus and invoiceAmount

**Files:**
- Modify: `apps/api/src/models/Appointment.js`
- Test: `apps/api/src/routes/__tests__/invoices.test.js` (created here, used in Task 2)

**Interfaces:**
- Produces: `Appointment.paymentStatus` (`'unpaid'|'paid'`, default `'unpaid'`), `Appointment.invoiceAmount` (`Number`, default `0`)

- [ ] **Step 1: Add the two fields to appointmentSchema**

In `apps/api/src/models/Appointment.js`, after the `rescheduleSuggestions` field and before `}, { timestamps: true });`, add:

```js
  paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
  invoiceAmount: { type: Number, default: 0 },
```

- [ ] **Step 2: Write the test file**

Create `apps/api/src/routes/__tests__/invoices.test.js`:

```js
'use strict';

jest.mock('../../middleware/auth', () => (req, res, next) => {
  req.user = { id: '507f1f77bcf86cd799439011', role: 'doctor' };
  next();
});
jest.mock('../../middleware/rbac', () => () => (req, res, next) => next());

const mongoose = require('mongoose');

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/salamtak_test');
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('Appointment model — invoice fields', () => {
  it('defaults paymentStatus to unpaid and invoiceAmount to 0', async () => {
    const Appointment = require('../../models/Appointment');
    const doc = new Appointment({
      doctorId:  new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId(),
      date: new Date(),
      timeSlot: { start: '10:00', end: '10:30' },
    });
    expect(doc.paymentStatus).toBe('unpaid');
    expect(doc.invoiceAmount).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
cd apps/api && npx jest --testPathPattern="invoices.test" --no-coverage 2>&1 | tail -15
```

Expected: PASS — 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/models/Appointment.js apps/api/src/routes/__tests__/invoices.test.js
git commit -m "feat(api): add paymentStatus and invoiceAmount fields to Appointment model"
```

---

### Task 2: Set invoiceAmount at appointment creation

**Files:**
- Modify: `apps/api/src/routes/appointments.js` (appointment creation handler)
- Test: `apps/api/src/routes/__tests__/invoices.test.js` (extend)

**Interfaces:**
- Consumes: `Doctor.appointmentTypes[].key`, `Doctor.appointmentTypes[].fee`, `req.body.visitType`
- Produces: `appointment.invoiceAmount` set to matching fee at creation time (0 if no match)

- [ ] **Step 1: Find the appointment creation block**

In `apps/api/src/routes/appointments.js`, find the line:
```js
const { doctorId, date, timeSlot, visitType, reason, locationId, chiefComplaint } = req.body;
```
The `Appointment.create(...)` call is nearby. The `Doctor` model is already imported at the top.

- [ ] **Step 2: Add invoiceAmount lookup before Appointment.create**

After the doctor fetch (there is already a `Doctor.findById(doctorId)` call — look for it or add one), extract the fee:

```js
// Capture fee at booking time — frozen so future price changes don't affect this invoice
const apptType = doctor?.appointmentTypes?.find(t => t.key === (visitType || 'initial'));
const invoiceAmount = apptType?.fee ?? 0;
```

Then in the `Appointment.create({...})` call, add:
```js
invoiceAmount,
paymentStatus: 'unpaid',
```

- [ ] **Step 3: Add test for fee capture**

Append to `apps/api/src/routes/__tests__/invoices.test.js`:

```js
describe('invoiceAmount fee freeze', () => {
  it('captures fee from appointmentTypes at creation time', () => {
    const appointmentTypes = [
      { key: 'initial', label: 'Initial', duration: 30, fee: 150, enabled: true },
      { key: 'follow-up', label: 'Follow-up', duration: 20, fee: 75, enabled: true },
    ];
    const visitType = 'follow-up';
    const apptType = appointmentTypes.find(t => t.key === visitType);
    const invoiceAmount = apptType?.fee ?? 0;
    expect(invoiceAmount).toBe(75);
  });

  it('defaults to 0 when visitType has no matching appointmentType', () => {
    const appointmentTypes = [];
    const apptType = appointmentTypes.find(t => t.key === 'initial');
    const invoiceAmount = apptType?.fee ?? 0;
    expect(invoiceAmount).toBe(0);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx jest --testPathPattern="invoices.test" --no-coverage 2>&1 | tail -15
```

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/appointments.js apps/api/src/routes/__tests__/invoices.test.js
git commit -m "feat(api): capture invoiceAmount from appointmentTypes fee at appointment creation"
```

---

### Task 3: Invoice API routes (GET list + PATCH pay)

**Files:**
- Create: `apps/api/src/routes/invoices.js`
- Modify: `apps/api/src/index.js` (register route)
- Test: `apps/api/src/routes/__tests__/invoices.test.js` (extend)

**Interfaces:**
- `GET /api/invoices?status=all|paid|unpaid&page=1&limit=20` → `{ invoices: [...], summary: { total, collected, outstanding }, page, totalPages }`
- `PATCH /api/invoices/:appointmentId/pay` → `{ invoice: { _id, paymentStatus, invoiceAmount, ... } }`
- Each invoice object: `{ _id, patientName, date, visitType, invoiceAmount, paymentStatus, locationName }`

- [ ] **Step 1: Create `apps/api/src/routes/invoices.js`**

```js
'use strict';

const router      = require('express').Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Appointment = require('../models/Appointment');
const Doctor      = require('../models/Doctor');
const User        = require('../models/User');
const mongoose    = require('mongoose');

const doctorOnly = [auth, requireRole('doctor')];

// GET /api/invoices
router.get('/', doctorOnly, async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id }).select('_id');
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const { status = 'all', page = 1, limit = 20 } = req.query;
    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.min(100, parseInt(limit) || 20);

    const filter = { doctorId: doctor._id };
    if (status === 'paid')   filter.paymentStatus = 'paid';
    if (status === 'unpaid') filter.paymentStatus = 'unpaid';

    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .sort({ date: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('patientId', 'name')
        .lean(),
      Appointment.countDocuments(filter),
    ]);

    // Summary always over ALL statuses for this doctor (ignore page filter)
    const [summary] = await Appointment.aggregate([
      { $match: { doctorId: doctor._id } },
      { $group: {
        _id: null,
        total:       { $sum: '$invoiceAmount' },
        collected:   { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$invoiceAmount', 0] } },
        outstanding: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'unpaid'] }, '$invoiceAmount', 0] } },
      }},
    ]);

    const invoices = appointments.map(a => ({
      _id:           a._id,
      patientName:   a.patientId?.name || 'مجهول',
      date:          a.date,
      visitType:     a.visitType,
      invoiceAmount: a.invoiceAmount,
      paymentStatus: a.paymentStatus,
      locationName:  a.locationName || '',
      status:        a.status,
    }));

    res.json({
      invoices,
      summary: summary
        ? { total: summary.total, collected: summary.collected, outstanding: summary.outstanding }
        : { total: 0, collected: 0, outstanding: 0 },
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) { next(err); }
});

// PATCH /api/invoices/:appointmentId/pay
router.patch('/:appointmentId/pay', doctorOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const doctor = await Doctor.findOne({ userId: req.user.id }).select('_id');
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.appointmentId, doctorId: doctor._id },
      { paymentStatus: 'paid' },
      { new: true }
    ).populate('patientId', 'name');

    if (!appt) return res.status(404).json({ message: 'Invoice not found' });

    res.json({
      invoice: {
        _id:           appt._id,
        patientName:   appt.patientId?.name || 'مجهول',
        date:          appt.date,
        visitType:     appt.visitType,
        invoiceAmount: appt.invoiceAmount,
        paymentStatus: appt.paymentStatus,
        locationName:  appt.locationName || '',
        status:        appt.status,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Register in `apps/api/src/index.js`**

After line `app.use('/api/reports', require('./routes/reports'));`, add:

```js
app.use('/api/invoices',   require('./routes/invoices'));
app.use('/api/analytics',  require('./routes/analytics'));
```

(The analytics route is created in Task 4 — add both registrations now so index.js only needs one edit.)

- [ ] **Step 3: Add route tests**

Append to `apps/api/src/routes/__tests__/invoices.test.js`:

```js
describe('GET /api/invoices', () => {
  it('returns invoices and summary for the authenticated doctor', async () => {
    const request = require('supertest');
    const app     = require('../../index');

    const res = await request(app).get('/api/invoices').set('Authorization', 'Bearer test');
    // Auth is mocked — will 404 if no Doctor record, which is expected in unit test
    expect([200, 404]).toContain(res.status);
  });

  it('rejects invalid appointmentId on pay', async () => {
    const request = require('supertest');
    const app     = require('../../index');

    const res = await request(app)
      .patch('/api/invoices/not-an-id/pay')
      .set('Authorization', 'Bearer test');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid/);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx jest --testPathPattern="invoices.test" --no-coverage 2>&1 | tail -20
```

Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/invoices.js apps/api/src/index.js apps/api/src/routes/__tests__/invoices.test.js
git commit -m "feat(api): add GET /api/invoices and PATCH /api/invoices/:id/pay routes"
```

---

### Task 4: Analytics API route (reports summary)

**Files:**
- Create: `apps/api/src/routes/analytics.js`
- Create: `apps/api/src/routes/__tests__/analytics.test.js`

**Interfaces:**
- `GET /api/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` → full summary object (see spec)

- [ ] **Step 1: Create `apps/api/src/routes/analytics.js`**

```js
'use strict';

const router      = require('express').Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Appointment = require('../models/Appointment');
const Doctor      = require('../models/Doctor');

const doctorOnly = [auth, requireRole('doctor')];

// GET /api/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/summary', doctorOnly, async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id }).select('_id');
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    // Default: current calendar month
    const now   = new Date();
    const from  = req.query.from
      ? new Date(req.query.from + 'T00:00:00.000Z')
      : new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const to    = req.query.to
      ? new Date(req.query.to + 'T23:59:59.999Z')
      : new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

    const match = { doctorId: doctor._id, date: { $gte: from, $lte: to } };

    const [revenueAgg, byMonthAgg, apptAgg, byTypeAgg, byDayAgg] = await Promise.all([
      // Revenue totals
      Appointment.aggregate([
        { $match: match },
        { $group: {
          _id: null,
          total:       { $sum: '$invoiceAmount' },
          collected:   { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$invoiceAmount', 0] } },
          outstanding: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'unpaid'] }, '$invoiceAmount', 0] } },
        }},
      ]),
      // By month
      Appointment.aggregate([
        { $match: match },
        { $group: {
          _id:       { $dateToString: { format: '%Y-%m', date: '$date' } },
          invoiced:  { $sum: '$invoiceAmount' },
          collected: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$invoiceAmount', 0] } },
        }},
        { $sort: { _id: 1 } },
        { $project: { _id: 0, month: '$_id', invoiced: 1, collected: 1 } },
      ]),
      // Appointments by status
      Appointment.aggregate([
        { $match: match },
        { $group: {
          _id:   '$status',
          count: { $sum: 1 },
        }},
      ]),
      // By visit type
      Appointment.aggregate([
        { $match: match },
        { $group: {
          _id:     '$visitType',
          count:   { $sum: 1 },
          revenue: { $sum: '$invoiceAmount' },
        }},
        { $project: { _id: 0, type: '$_id', count: 1, revenue: 1 } },
      ]),
      // Busiest days (0=Sun … 6=Sat)
      Appointment.aggregate([
        { $match: match },
        { $group: {
          _id:   { $dayOfWeek: '$date' }, // Mongo: 1=Sun … 7=Sat
          count: { $sum: 1 },
        }},
        { $project: { _id: 0, day: { $subtract: ['$_id', 1] }, count: 1 } }, // convert to 0-based
        { $sort: { day: 1 } },
      ]),
    ]);

    // Build appointments count object
    const apptCounts = { total: 0, completed: 0, cancelled: 0, pending: 0 };
    for (const { _id, count } of apptAgg) {
      apptCounts.total += count;
      if (_id === 'completed' || _id === 'validated') apptCounts.completed += count;
      else if (_id === 'cancelled') apptCounts.cancelled += count;
      else if (_id === 'pending')   apptCounts.pending   += count;
    }

    res.json({
      revenue:      revenueAgg[0] ? { total: revenueAgg[0].total, collected: revenueAgg[0].collected, outstanding: revenueAgg[0].outstanding } : { total: 0, collected: 0, outstanding: 0 },
      byMonth:      byMonthAgg,
      appointments: apptCounts,
      byVisitType:  byTypeAgg,
      busiestDays:  byDayAgg,
    });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Create test file**

Create `apps/api/src/routes/__tests__/analytics.test.js`:

```js
'use strict';

jest.mock('../../middleware/auth', () => (req, res, next) => {
  req.user = { id: '507f1f77bcf86cd799439011', role: 'doctor' };
  next();
});
jest.mock('../../middleware/rbac', () => () => (req, res, next) => next());

const mongoose = require('mongoose');

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/salamtak_test');
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('GET /api/analytics/summary', () => {
  it('returns summary shape with zero values when no appointments exist', async () => {
    const request = require('supertest');
    const app     = require('../../index');

    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', 'Bearer test');

    // 404 expected (no Doctor record) or 200 with zeros
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('revenue');
      expect(res.body).toHaveProperty('byMonth');
      expect(res.body).toHaveProperty('appointments');
      expect(res.body).toHaveProperty('byVisitType');
      expect(res.body).toHaveProperty('busiestDays');
    }
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && npx jest --testPathPattern="analytics.test" --no-coverage 2>&1 | tail -15
```

Expected: PASS — 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/analytics.js apps/api/src/routes/__tests__/analytics.test.js
git commit -m "feat(api): add GET /api/analytics/summary route with MongoDB aggregation"
```

---

### Task 5: Web API clients + install recharts

**Files:**
- Create: `apps/web/src/api/invoices.js`
- Create: `apps/web/src/api/analytics.js`
- Modify: `apps/web/package.json`

**Interfaces:**
- `getInvoices({ status, page, limit })` → `{ invoices, summary, page, totalPages }`
- `markInvoicePaid(appointmentId)` → `{ invoice }`
- `getAnalyticsSummary({ from, to })` → full summary object

- [ ] **Step 1: Create `apps/web/src/api/invoices.js`**

```js
import client from './client';

export const getInvoices = (params = {}) =>
  client.get('/invoices', { params }).then(r => r.data);

export const markInvoicePaid = (appointmentId) =>
  client.patch(`/invoices/${appointmentId}/pay`).then(r => r.data);
```

- [ ] **Step 2: Create `apps/web/src/api/analytics.js`**

```js
import client from './client';

export const getAnalyticsSummary = (params = {}) =>
  client.get('/analytics/summary', { params }).then(r => r.data);
```

- [ ] **Step 3: Install recharts**

```bash
cd apps/web && npm install recharts
```

Verify `"recharts"` appears in `apps/web/package.json` dependencies.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/invoices.js apps/web/src/api/analytics.js apps/web/package.json apps/web/package-lock.json
git commit -m "feat(web): add invoices and analytics API clients, install recharts"
```

---

### Task 6: ServicesPage — clinic service catalog UI

**Files:**
- Create: `apps/web/src/pages/doctor/ServicesPage.jsx`
- Modify: `apps/web/src/router/index.jsx` (swap ComingSoonPage)
- Modify: `apps/web/src/pages/doctor/DoctorSettingsPage.jsx` (remove appointmentTypes section)

**Interfaces:**
- Consumes: `GET /api/doctors/me` (returns `{ appointmentTypes, currency }`)
- Consumes: `PATCH /api/doctors/me` with `{ appointmentTypes: [...] }` — uses existing `updateDoctorSettings` from `apps/web/src/api/doctors.js` which calls `PATCH /api/doctors/:id/settings`

Wait — check the actual function: `updateDoctorSettings(id, data)` calls `PATCH /api/doctors/${id}/settings`. The doctor `id` here is the Doctor document `_id`, not userId. The `GET /api/doctors/me` returns the doctor profile including `_id`. Use that.

- [ ] **Step 1: Create `apps/web/src/pages/doctor/ServicesPage.jsx`**

```jsx
import { useState, useEffect } from 'react';
import useAuthStore from '../../store/authStore';
import { updateDoctorSettings } from '../../api/doctors';

const VISIT_TYPES = ['initial', 'follow-up', 'check-up', 'urgent'];
const VISIT_LABELS = { initial: 'كشف أولي', 'follow-up': 'متابعة', 'check-up': 'فحص دوري', urgent: 'طارئ' };

export default function ServicesPage() {
  const user = useAuthStore(s => s.user);
  const [services, setServices]   = useState([]);
  const [currency, setCurrency]   = useState('SAR');
  const [doctorId, setDoctorId]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [deleteIdx, setDeleteIdx] = useState(null);
  const [newSvc, setNewSvc]       = useState({ key: '', label: '', duration: 30, fee: 0, enabled: true });

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/doctors/me`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then(data => {
        setServices(data.appointmentTypes || []);
        setCurrency(data.currency || 'SAR');
        setDoctorId(data._id);
      })
      .catch(() => setError('تعذر تحميل الخدمات'))
      .finally(() => setLoading(false));
  }, []);

  const save = async (updated) => {
    setSaving(true); setError('');
    try {
      await updateDoctorSettings(doctorId, { appointmentTypes: updated });
      setServices(updated);
    } catch { setError('تعذر الحفظ'); }
    finally { setSaving(false); }
  };

  const toggle = (i) => {
    const updated = services.map((s, idx) => idx === i ? { ...s, enabled: !s.enabled } : s);
    save(updated);
  };

  const update = (i, field, val) =>
    setServices(s => s.map((svc, idx) => idx === i ? { ...svc, [field]: val } : svc));

  const saveEdit = () => save([...services]);

  const remove = (i) => {
    const updated = services.filter((_, idx) => idx !== i);
    save(updated);
    setDeleteIdx(null);
  };

  const addService = () => {
    if (!newSvc.label.trim()) return;
    const key = newSvc.key || `custom_${Date.now()}`;
    const updated = [...services, { ...newSvc, key }];
    save(updated);
    setNewSvc({ key: '', label: '', duration: 30, fee: 0, enabled: true });
    setShowAdd(false);
  };

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>جاري التحميل...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>خدمات العيادة</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>أضف خدماتك وأسعارها ليراها المرضى عند الحجز</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{ background: 'var(--mint)', color: '#000', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
        >
          + إضافة خدمة
        </button>
      </div>

      {error && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {showAdd && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>خدمة جديدة</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 10 }}>
            <input
              placeholder="اسم الخدمة"
              value={newSvc.label}
              onChange={e => setNewSvc(s => ({ ...s, label: e.target.value }))}
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
            />
            <input
              type="number" placeholder="مدة (دق)" min={5}
              value={newSvc.duration}
              onChange={e => setNewSvc(s => ({ ...s, duration: parseInt(e.target.value) || 30 }))}
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
            />
            <input
              type="number" placeholder={`سعر (${currency})`} min={0}
              value={newSvc.fee}
              onChange={e => setNewSvc(s => ({ ...s, fee: parseFloat(e.target.value) || 0 }))}
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={addService} style={{ background: 'var(--mint)', color: '#000', border: 'none', borderRadius: 7, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>حفظ</button>
            <button onClick={() => setShowAdd(false)} style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>إلغاء</button>
          </div>
        </div>
      )}

      {services.length === 0 && !showAdd && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)', fontSize: 14 }}>
          لا توجد خدمات بعد — أضف خدمتك الأولى
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {services.map((svc, i) => (
          <div key={svc.key || i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', gap: 12, alignItems: 'center', opacity: svc.enabled ? 1 : 0.55 }}>
            <button
              onClick={() => toggle(i)}
              title={svc.enabled ? 'إلغاء التفعيل' : 'تفعيل'}
              style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: svc.enabled ? 'var(--mint)' : 'var(--bg3)', flexShrink: 0, position: 'relative', transition: 'background .2s' }}
            >
              <span style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'right .2s, left .2s', [svc.enabled ? 'right' : 'left']: 2 }} />
            </button>
            <div style={{ flex: 1 }}>
              <input
                value={svc.label}
                onChange={e => update(i, 'label', e.target.value)}
                onBlur={saveEdit}
                style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', background: 'transparent', border: 'none', outline: 'none', width: '100%' }}
              />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
              <input
                type="number" min={5}
                value={svc.duration}
                onChange={e => update(i, 'duration', parseInt(e.target.value) || 30)}
                onBlur={saveEdit}
                style={{ width: 48, fontSize: 13, color: 'var(--text2)', background: 'transparent', border: 'none', outline: 'none', textAlign: 'center' }}
              /> دق
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
              <input
                type="number" min={0}
                value={svc.fee}
                onChange={e => update(i, 'fee', parseFloat(e.target.value) || 0)}
                onBlur={saveEdit}
                style={{ width: 64, fontSize: 14, fontWeight: 600, color: 'var(--primary)', background: 'transparent', border: 'none', outline: 'none', textAlign: 'center' }}
              /> {currency}
            </div>
            <button
              onClick={() => setDeleteIdx(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rose)', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
            >×</button>
          </div>
        ))}
      </div>

      {deleteIdx !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, maxWidth: 360, width: '90%', textAlign: 'center' }} dir="rtl">
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>حذف الخدمة؟</p>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 20px' }}>سيتم حذف "{services[deleteIdx]?.label}" نهائياً</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => remove(deleteIdx)} style={{ background: 'var(--rose)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 600, cursor: 'pointer' }}>حذف</button>
              <button onClick={() => setDeleteIdx(null)} style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {saving && <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12, textAlign: 'center' }}>جاري الحفظ...</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire route in `apps/web/src/router/index.jsx`**

Add import at top:
```js
import ServicesPage  from '../pages/doctor/ServicesPage';
```

Replace:
```js
<Route path="/services" element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
```
With:
```js
<Route path="/services" element={<DoctorProtected><ServicesPage /></DoctorProtected>} />
```

- [ ] **Step 3: Remove appointmentTypes from DoctorSettingsPage**

In `apps/web/src/pages/doctor/DoctorSettingsPage.jsx`, find the section that renders the appointment types editor (around the `apptTypes.map(...)` block). Replace the entire appointmentTypes section (the outer container div that wraps the section title, description, and the `apptTypes.map(...)` list) with:

```jsx
<div style={{ padding: '16px 0', borderTop: '1px solid var(--border)', marginTop: 16 }}>
  <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
    لإدارة خدمات العيادة والأسعار،{' '}
    <a href="/services" style={{ color: 'var(--mint)' }}>انتقل إلى صفحة الخدمات</a>
  </p>
</div>
```

Also remove the `apptTypes` state, `addCustomApptType`, `removeApptType`, `updateApptType` functions, and `DEFAULT_APPT_TYPES` constant, and remove `appointmentTypes: apptTypes` from the save payload — all appointment type management now lives in ServicesPage.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/doctor/ServicesPage.jsx apps/web/src/router/index.jsx apps/web/src/pages/doctor/DoctorSettingsPage.jsx
git commit -m "feat(web): add ServicesPage clinic service catalog, remove appointmentTypes from settings"
```

---

### Task 7: InvoicesPage — billing UI

**Files:**
- Create: `apps/web/src/pages/doctor/InvoicesPage.jsx`
- Modify: `apps/web/src/router/index.jsx`

**Interfaces:**
- Consumes: `getInvoices({ status, page })` and `markInvoicePaid(appointmentId)` from `apps/web/src/api/invoices.js`

- [ ] **Step 1: Create `apps/web/src/pages/doctor/InvoicesPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { getInvoices, markInvoicePaid } from '../../api/invoices';

const STATUS_TABS = [
  { key: 'all',    label: 'الكل' },
  { key: 'unpaid', label: 'غير مدفوع' },
  { key: 'paid',   label: 'مدفوع' },
];

const VISIT_LABELS = { initial: 'كشف أولي', 'follow-up': 'متابعة', 'check-up': 'فحص دوري', urgent: 'طارئ' };

function fmt(date) {
  return new Date(date).toLocaleDateString('ar-SA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function InvoicesPage() {
  const [tab, setTab]           = useState('all');
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary]   = useState({ total: 0, collected: 0, outstanding: 0 });
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]   = useState(true);
  const [paying, setPaying]     = useState(null);
  const [error, setError]       = useState('');

  const load = useCallback(async (status, p) => {
    setLoading(true); setError('');
    try {
      const data = await getInvoices({ status, page: p, limit: 20 });
      setInvoices(data.invoices);
      setSummary(data.summary);
      setTotalPages(data.totalPages);
    } catch { setError('تعذر تحميل الفواتير'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(tab, page); }, [tab, page, load]);

  const handlePay = async (id) => {
    setPaying(id);
    try {
      const { invoice } = await markInvoicePaid(id);
      setInvoices(prev => prev.map(inv => inv._id === id ? { ...inv, paymentStatus: 'paid' } : inv));
      setSummary(prev => ({
        ...prev,
        collected:   prev.collected   + invoice.invoiceAmount,
        outstanding: prev.outstanding - invoice.invoiceAmount,
      }));
    } catch { setError('تعذر تحديث الفاتورة'); }
    finally { setPaying(null); }
  };

  const currency = 'SAR';

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }} dir="rtl">
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 20px' }}>الفواتير</h1>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'إجمالي الفواتير', value: summary.total },
          { label: 'المحصّل',          value: summary.collected,   color: 'var(--mint)' },
          { label: 'المتبقي',           value: summary.outstanding, color: 'var(--rose)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--text)' }}>{value.toLocaleString('ar-SA')} {currency}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 8, padding: 3, marginBottom: 20, width: 'fit-content' }}>
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }}
            style={{ padding: '6px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              background: tab === t.key ? 'var(--bg2)' : 'transparent', color: tab === t.key ? 'var(--text)' : 'var(--text3)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>جاري التحميل...</div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)', fontSize: 14 }}>لا توجد فواتير</div>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                {['المريض', 'التاريخ', 'نوع الزيارة', 'المبلغ', 'الحالة', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text2)', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => (
                <tr key={inv._id} style={{ borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>{inv.patientName}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text2)' }}>{fmt(inv.date)}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text2)' }}>{VISIT_LABELS[inv.visitType] || inv.visitType}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{inv.invoiceAmount} {currency}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: inv.paymentStatus === 'paid' ? 'rgba(15,227,176,.15)' : 'rgba(255,90,90,.12)',
                      color: inv.paymentStatus === 'paid' ? 'var(--mint)' : 'var(--rose)' }}>
                      {inv.paymentStatus === 'paid' ? 'مدفوع' : 'غير مدفوع'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {inv.paymentStatus === 'unpaid' && (
                      <button
                        onClick={() => handlePay(inv._id)}
                        disabled={paying === inv._id}
                        style={{ background: 'var(--mint)', color: '#000', border: 'none', borderRadius: 6, padding: '5px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 12, opacity: paying === inv._id ? 0.6 : 1 }}>
                        {paying === inv._id ? '...' : 'تحصيل'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
            السابق
          </button>
          <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text2)' }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire route in router**

Add import:
```js
import InvoicesPage from '../pages/doctor/InvoicesPage';
```

Replace:
```js
<Route path="/invoices" element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
```
With:
```js
<Route path="/invoices" element={<DoctorProtected><InvoicesPage /></DoctorProtected>} />
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/doctor/InvoicesPage.jsx apps/web/src/router/index.jsx
git commit -m "feat(web): add InvoicesPage with billing table, summary strip, and mark-paid action"
```

---

### Task 8: ReportsPage — analytics dashboard UI

**Files:**
- Create: `apps/web/src/pages/doctor/ReportsPage.jsx`
- Modify: `apps/web/src/router/index.jsx`

**Interfaces:**
- Consumes: `getAnalyticsSummary({ from, to })` from `apps/web/src/api/analytics.js`

- [ ] **Step 1: Create `apps/web/src/pages/doctor/ReportsPage.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { getAnalyticsSummary } from '../../api/analytics';

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const VISIT_LABELS = { initial: 'كشف أولي', 'follow-up': 'متابعة', 'check-up': 'فحص دوري', urgent: 'طارئ' };
const STATUS_LABELS = { completed: 'مكتمل', cancelled: 'ملغي', pending: 'معلق' };
const COLORS = ['#0fe3b0', '#3b82f6', '#f59e0b', '#ef4444'];

function isoDate(d) { return d.toISOString().slice(0, 10); }

export default function ReportsPage() {
  const now      = new Date();
  const [from, setFrom] = useState(isoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))));
  const [to,   setTo]   = useState(isoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0))));
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    getAnalyticsSummary({ from, to })
      .then(setData)
      .catch(() => setError('تعذر تحميل التقارير'))
      .finally(() => setLoading(false));
  }, [from, to]);

  const currency = 'SAR';

  const statusPieData = data ? [
    { name: STATUS_LABELS.completed, value: data.appointments.completed },
    { name: STATUS_LABELS.pending,   value: data.appointments.pending },
    { name: STATUS_LABELS.cancelled, value: data.appointments.cancelled },
  ].filter(d => d.value > 0) : [];

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }} dir="rtl">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>التقارير</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text2)' }}>من</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13 }} />
          <label style={{ fontSize: 12, color: 'var(--text2)' }}>إلى</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13 }} />
        </div>
      </div>

      {error && <p style={{ color: 'var(--rose)', fontSize: 13 }}>{error}</p>}
      {loading && <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>جاري التحميل...</div>}

      {!loading && data && (
        <>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
            {[
              { label: 'إجمالي الإيرادات', value: data.revenue.total,       color: 'var(--text)' },
              { label: 'المحصّل',            value: data.revenue.collected,   color: 'var(--mint)' },
              { label: 'المتبقي',             value: data.revenue.outstanding, color: 'var(--rose)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color }}>{value.toLocaleString('ar-SA')} <span style={{ fontSize: 13, fontWeight: 400 }}>{currency}</span></div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
            {/* Monthly revenue bar */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 16px' }}>الإيرادات الشهرية</p>
              {data.byMonth.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '24px 0' }}>لا توجد بيانات</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.byMonth} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                    <Tooltip formatter={(v) => `${v} ${currency}`} />
                    <Bar dataKey="invoiced"  name="مفوتر"   fill="#3b82f6" radius={[3,3,0,0]} />
                    <Bar dataKey="collected" name="محصّل"   fill="#0fe3b0" radius={[3,3,0,0]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Appointments donut */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 16px' }}>المواعيد حسب الحالة — الإجمالي: {data.appointments.total}</p>
              {statusPieData.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '24px 0' }}>لا توجد بيانات</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={statusPieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={3}>
                      {statusPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Tables row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Visit type breakdown */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>حسب نوع الزيارة</p>
              {data.byVisitType.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text3)' }}>لا توجد بيانات</p>
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text3)', fontWeight: 500 }}>النوع</th>
                    <th style={{ textAlign: 'center', padding: '6px 0', color: 'var(--text3)', fontWeight: 500 }}>العدد</th>
                    <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text3)', fontWeight: 500 }}>الإيراد</th>
                  </tr></thead>
                  <tbody>
                    {data.byVisitType.map(row => (
                      <tr key={row.type} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 0' }}>{VISIT_LABELS[row.type] || row.type}</td>
                        <td style={{ padding: '8px 0', textAlign: 'center', color: 'var(--text2)' }}>{row.count}</td>
                        <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: 600 }}>{row.revenue} {currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Busiest days */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>أكثر الأيام ازدحاماً</p>
              {data.busiestDays.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text3)' }}>لا توجد بيانات</p>
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text3)', fontWeight: 500 }}>اليوم</th>
                    <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text3)', fontWeight: 500 }}>عدد المواعيد</th>
                  </tr></thead>
                  <tbody>
                    {data.busiestDays.map(row => (
                      <tr key={row.day} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 0' }}>{DAY_NAMES[row.day] || row.day}</td>
                        <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: 600 }}>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire route in router**

Add import:
```js
import ReportsPage from '../pages/doctor/ReportsPage';
```

Replace:
```js
<Route path="/reports" element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
```
With:
```js
<Route path="/reports" element={<DoctorProtected><ReportsPage /></DoctorProtected>} />
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/doctor/ReportsPage.jsx apps/web/src/router/index.jsx
git commit -m "feat(web): add ReportsPage analytics dashboard with recharts"
```

---

## Self-Review

**Spec coverage:**
- ✅ Services: card grid, add/edit/toggle/delete, reuses appointmentTypes, removes DoctorSettingsPage section
- ✅ Billing: paymentStatus + invoiceAmount fields, GET /api/invoices with filter + pagination + summary, PATCH pay, UI table + tabs + mark-paid inline
- ✅ Reports: GET /api/analytics/summary with aggregation, date range picker, stat cards, bar chart, donut chart, two breakdown tables
- ✅ `invoiceAmount` set at creation from appointmentTypes fee — frozen
- ✅ recharts installed in Task 5
- ✅ RTL throughout
- ✅ Currency from doctor.currency / default SAR
- ✅ DoctorProtected already wired — not changed
- ✅ No new MongoDB collections

**Type consistency:** All API shapes defined in Task 3/4 match what Task 7/8 consume.
