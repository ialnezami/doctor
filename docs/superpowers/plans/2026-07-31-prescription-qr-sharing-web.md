# Prescription QR Sharing — Backend + Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let patients share prescriptions via QR codes that pharmacies scan to dispense medications and labs scan to accept test orders and publish results back to patients.

**Architecture:** Three new API endpoints extend existing prescription and lab-result routes. The existing `SharedLink` model handles all QR tokens with no schema change. Pharmacies and labs get scan-and-act modals in their existing dashboards using `html5-qrcode` for webcam scanning. Patients get a "Share QR" button in `MedicalRecordsPage` using the already-installed `qrcode` library.

**Tech Stack:** Node.js/Express/Mongoose (API), React (web), `html5-qrcode` ^1.2.1 (new install — webcam QR scanner), `qrcode` ^1.5.4 (already installed — QR image generation)

## Global Constraints

- No new MongoDB collections — extend existing models only
- API tests: Jest + supertest, all `jest.mock()` hoisted before `require()` calls; no real DB
- Auth mock: `jest.mock('../../middleware/auth', () => (req, _res, next) => { req.user = { id: 'uid1', role: 'pharmacy' }; next(); })`
- `requireRole` mock: `jest.mock('../../middleware/requireRole', () => () => (_r, _s, next) => next())`
- `dispensedBy` on Prescription references `Pharmacy._id` (not User._id)
- `doctorId` on LabResult stores the creating lab's User._id (existing pattern)
- Use `qrcode` (already installed): `QRCode.toDataURL(url).then(dataUrl => setDataUrl(dataUrl))`; do NOT install `qrcode.react`
- Install `html5-qrcode` before Tasks 6–7: `cd apps/web && npm install html5-qrcode`
- PHI shown in pharmacy view: patient first name only; no notes, diagnoses, or dosage details
- Atomic stock decrement: `Product.findOneAndUpdate({ _id, stockQty: { $gt: 0 } }, { $inc: { stockQty: -1 } })`
- Notification type `lab_ready` must be added to `apps/api/src/models/Notification.js` type enum (Task 1)
- Lab role string: `'lab'`; pharmacy role string: `'pharmacy'`
- All API error responses: `{ message: string }`
- `apps/web/src/api/client.js` already unwraps `res.data` — do NOT double-unwrap

---

## File Map

**Create:**
- `apps/api/src/routes/__tests__/prescriptions-dispense.test.js`
- `apps/api/src/routes/__tests__/labResults-from-prescription.test.js`
- `apps/api/src/routes/__tests__/labResults-status.test.js`
- `apps/web/src/components/ShareQRModal.jsx`
- `apps/web/src/components/ScanModal.jsx`
- `apps/web/src/components/PrescriptionCheckView.jsx`

**Modify:**
- `apps/api/src/models/LabResult.js` — add `processing` status, optional value, `prescriptionId`
- `apps/api/src/models/Notification.js` — add `lab_ready` to type enum
- `apps/api/src/routes/prescriptions.js` — add `POST /:id/dispense`
- `apps/api/src/routes/labResults.js` — add `POST /from-prescription`, `PATCH /:id/status`
- `apps/web/src/pages/patient/MedicalRecordsPage.jsx` — add "Share QR" button per prescription
- `apps/web/src/pages/pharmacy/PharmacyDashboardPage.jsx` — add "Scan Rx" in POS tab
- `apps/web/src/pages/lab/LabDashboardPage.jsx` — add Orders tab with scan + status management

---

### Task 1: LabResult Model + Notification Enum

**Files:**
- Modify: `apps/api/src/models/LabResult.js`
- Modify: `apps/api/src/models/Notification.js`
- Test: `apps/api/src/routes/__tests__/modelFields-qr.test.js`

**Interfaces:**
- Produces: `LabResult` with `status` enum `['pending', 'processing', 'ready']`, `tests[].value` optional (default `''`), `prescriptionId: ObjectId ref 'Prescription' default null`
- Produces: `Notification.type` enum includes `'lab_ready'`

- [ ] **Step 1: Write failing schema tests**

```js
// apps/api/src/routes/__tests__/modelFields-qr.test.js
const LabResult  = require('../../models/LabResult');
const Notification = require('../../models/Notification');

describe('LabResult schema extensions', () => {
  it('status enum includes processing', () => {
    const path = LabResult.schema.path('status');
    expect(path.enumValues).toContain('processing');
  });

  it('tests value is not required', () => {
    const path = LabResult.schema.path('tests.value');
    expect(path.isRequired).toBeFalsy();
  });

  it('has prescriptionId path', () => {
    expect(LabResult.schema.path('prescriptionId')).toBeDefined();
  });
});

describe('Notification schema', () => {
  it('type enum includes lab_ready', () => {
    const path = Notification.schema.path('type');
    expect(path.enumValues).toContain('lab_ready');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && npx jest apps/api/src/routes/__tests__/modelFields-qr.test.js --no-coverage
```

Expected: 4 failures.

- [ ] **Step 3: Update LabResult model**

In `apps/api/src/models/LabResult.js`:

Find the `status` field and change:
```js
status: { type: String, enum: ['pending', 'ready'], default: 'pending' },
```
to:
```js
status: { type: String, enum: ['pending', 'processing', 'ready'], default: 'pending' },
```

Find the `tests` subdocument `value` field and change:
```js
value: { type: String, required: true },
```
to:
```js
value: { type: String, required: false, default: '' },
```

Add `prescriptionId` after the `appointmentId` field:
```js
prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', default: null },
```

- [ ] **Step 4: Update Notification type enum**

In `apps/api/src/models/Notification.js`, find the `type` field enum array and add `'lab_ready'`:
```js
type: {
  type: String,
  enum: [
    'appointment_requested', 'appointment_confirmed', 'consultation_validated',
    'notes_viewed', 'appointment_reminder', 'daily_digest', 'gdpr_export_ready',
    'lab_ready',
  ],
  required: true,
},
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && npx jest apps/api/src/routes/__tests__/modelFields-qr.test.js --no-coverage
```

Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/models/LabResult.js apps/api/src/models/Notification.js apps/api/src/routes/__tests__/modelFields-qr.test.js
git commit -m "feat(api): add processing status, prescriptionId to LabResult; add lab_ready notification type"
```

---

### Task 2: POST /prescriptions/:id/dispense

**Files:**
- Modify: `apps/api/src/routes/prescriptions.js`
- Test: `apps/api/src/routes/__tests__/prescriptions-dispense.test.js`

**Interfaces:**
- Consumes: `Prescription` model (dispensedAt, dispensedBy, medications[]), `Pharmacy` model (findOne by userId), `Product` model (pharmacyId, name, stockQty)
- Produces: `POST /api/prescriptions/:id/dispense` → 201 `{ prescription, dispensedMedications }`

- [ ] **Step 1: Write failing tests**

```js
// apps/api/src/routes/__tests__/prescriptions-dispense.test.js

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'user_pharmacy_1', role: 'pharmacy' };
  next();
});
jest.mock('../../middleware/requireRole', () => () => (_r, _s, next) => next());
jest.mock('../../models/Prescription');
jest.mock('../../models/Pharmacy');
jest.mock('../../models/Product');

const express  = require('express');
const request  = require('supertest');
const Prescription = require('../../models/Prescription');
const Pharmacy     = require('../../models/Pharmacy');
const Product      = require('../../models/Product');
const router       = require('../prescriptions');

const app = express();
app.use(express.json());
app.use('/api/prescriptions', router);

beforeEach(() => jest.clearAllMocks());

describe('POST /api/prescriptions/:id/dispense', () => {
  const fakeRx = {
    _id: 'rx1',
    dispensedAt: null,
    dispensedBy: null,
    medications: [{ name: 'Paracetamol', dosage: '500mg' }],
    patientId: { _id: 'pat1', name: 'أحمد محمد' },
    doctorId:  { _id: 'doc1', name: 'د. سارة' },
    save: jest.fn().mockResolvedValue(true),
  };

  it('returns 201 with dispensedMedications when matched and in stock', async () => {
    Prescription.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({ ...fakeRx }),
      }),
    });
    Pharmacy.findOne.mockResolvedValue({ _id: 'ph1' });
    Product.find.mockResolvedValue([
      { _id: 'p1', name: 'Paracetamol', stockQty: 10 },
    ]);
    Product.findOneAndUpdate.mockResolvedValue({ stockQty: 9 });

    const res = await request(app)
      .post('/api/prescriptions/rx1/dispense')
      .send();

    expect(res.status).toBe(201);
    expect(res.body.dispensedMedications).toHaveLength(1);
    expect(res.body.dispensedMedications[0].matched).toBe(true);
    expect(res.body.dispensedMedications[0].stockBefore).toBe(10);
  });

  it('returns 409 if prescription already dispensed', async () => {
    Prescription.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          ...fakeRx,
          dispensedAt: new Date('2026-07-01'),
        }),
      }),
    });

    const res = await request(app).post('/api/prescriptions/rx1/dispense').send();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already dispensed/i);
  });

  it('returns 404 if prescription not found', async () => {
    Prescription.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      }),
    });

    const res = await request(app).post('/api/prescriptions/bad/dispense').send();
    expect(res.status).toBe(404);
  });

  it('returns 403 if pharmacy profile not found', async () => {
    Prescription.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({ ...fakeRx }),
      }),
    });
    Pharmacy.findOne.mockResolvedValue(null);

    const res = await request(app).post('/api/prescriptions/rx1/dispense').send();
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && npx jest apps/api/src/routes/__tests__/prescriptions-dispense.test.js --no-coverage
```

Expected: failures (route doesn't exist yet).

- [ ] **Step 3: Add route to prescriptions.js**

At the top of `apps/api/src/routes/prescriptions.js`, ensure these are required (add if missing):
```js
const Pharmacy = require('../models/Pharmacy');
const Product  = require('../models/Product');
```

Add this route before `module.exports`:
```js
// POST /api/prescriptions/:id/dispense — pharmacy only
router.post('/:id/dispense', auth, requireRole('pharmacy'), async (req, res, next) => {
  try {
    const prescription = await Prescription.findById(req.params.id)
      .populate('patientId', 'name')
      .populate('doctorId', 'name');

    if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

    if (prescription.dispensedAt) {
      return res.status(409).json({
        message: 'Prescription already dispensed',
        dispensedAt: prescription.dispensedAt,
      });
    }

    const pharmacy = await Pharmacy.findOne({ userId: req.user.id });
    if (!pharmacy) return res.status(403).json({ message: 'Pharmacy profile not found' });

    const products = await Product.find({ pharmacyId: pharmacy._id });

    const dispensedMedications = [];
    for (const med of prescription.medications) {
      const product = products.find(
        p => p.name.toLowerCase() === med.name.toLowerCase()
      );
      if (!product) {
        dispensedMedications.push({ name: med.name, matched: false, stockBefore: 0, stockAfter: 0 });
        continue;
      }
      const stockBefore = product.stockQty;
      if (stockBefore > 0) {
        await Product.findOneAndUpdate(
          { _id: product._id, stockQty: { $gt: 0 } },
          { $inc: { stockQty: -1 } }
        );
        dispensedMedications.push({ name: med.name, matched: true, stockBefore, stockAfter: stockBefore - 1 });
      } else {
        dispensedMedications.push({ name: med.name, matched: true, stockBefore: 0, stockAfter: 0 });
      }
    }

    prescription.dispensedAt = new Date();
    prescription.dispensedBy = pharmacy._id;
    await prescription.save();

    res.status(201).json({ prescription, dispensedMedications });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && npx jest apps/api/src/routes/__tests__/prescriptions-dispense.test.js --no-coverage
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/prescriptions.js apps/api/src/routes/__tests__/prescriptions-dispense.test.js
git commit -m "feat(api): add POST /prescriptions/:id/dispense for pharmacy"
```

---

### Task 3: POST /lab-results/from-prescription

**Files:**
- Modify: `apps/api/src/routes/labResults.js`
- Test: `apps/api/src/routes/__tests__/labResults-from-prescription.test.js`

**Interfaces:**
- Consumes: `SharedLink` model (token, revokedAt, expiresAt, resourceId), `Prescription` (analyses[]), `Lab` model (`findOne({ userId })` → `labName`), `LabResult.create`
- Produces: `POST /api/lab-results/from-prescription` body `{ shareToken }` → 201 LabResult

- [ ] **Step 1: Write failing tests**

```js
// apps/api/src/routes/__tests__/labResults-from-prescription.test.js

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'labuser1', role: 'lab' };
  next();
});
jest.mock('../../middleware/requireRole', () => () => (_r, _s, next) => next());
jest.mock('../../models/SharedLink');
jest.mock('../../models/Prescription');
jest.mock('../../models/LabResult');
jest.mock('../../models/Lab');

const express    = require('express');
const request    = require('supertest');
const SharedLink = require('../../models/SharedLink');
const Prescription = require('../../models/Prescription');
const LabResult  = require('../../models/LabResult');
const Lab        = require('../../models/Lab');
const router     = require('../labResults');

const app = express();
app.use(express.json());
app.use('/api/lab-results', router);

beforeEach(() => jest.clearAllMocks());

const validLink = {
  token: 'abc'.repeat(21) + 'a',
  revokedAt: null,
  expiresAt: null,
  resourceId: 'rx1',
};

const validRx = {
  _id: 'rx1',
  patientId: 'pat1',
  doctorId: 'doc1',
  analyses: [{ name: 'Complete Blood Count', instructions: '' }],
};

describe('POST /api/lab-results/from-prescription', () => {
  it('returns 201 with created LabResult for valid token with analyses', async () => {
    SharedLink.findOne.mockResolvedValue(validLink);
    Prescription.findById.mockResolvedValue(validRx);
    LabResult.findOne.mockResolvedValue(null);
    Lab.findOne.mockResolvedValue({ labName: 'مختبر الأمل' });
    LabResult.create.mockResolvedValue({ _id: 'lr1', status: 'pending' });

    const res = await request(app)
      .post('/api/lab-results/from-prescription')
      .send({ shareToken: 'abc'.repeat(21) + 'a' });

    expect(res.status).toBe(201);
    expect(LabResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'pat1',
        status: 'pending',
        prescriptionId: 'rx1',
        labName: 'مختبر الأمل',
      })
    );
  });

  it('returns 422 if shareToken missing', async () => {
    const res = await request(app).post('/api/lab-results/from-prescription').send({});
    expect(res.status).toBe(422);
  });

  it('returns 404 if token not found', async () => {
    SharedLink.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/lab-results/from-prescription')
      .send({ shareToken: 'x'.repeat(64) });
    expect(res.status).toBe(404);
  });

  it('returns 422 if prescription has no analyses', async () => {
    SharedLink.findOne.mockResolvedValue(validLink);
    Prescription.findById.mockResolvedValue({ ...validRx, analyses: [] });
    const res = await request(app)
      .post('/api/lab-results/from-prescription')
      .send({ shareToken: 'abc'.repeat(21) + 'a' });
    expect(res.status).toBe(422);
  });

  it('returns 409 if LabResult already exists for this prescription', async () => {
    SharedLink.findOne.mockResolvedValue(validLink);
    Prescription.findById.mockResolvedValue(validRx);
    LabResult.findOne.mockResolvedValue({ _id: 'existing' });
    const res = await request(app)
      .post('/api/lab-results/from-prescription')
      .send({ shareToken: 'abc'.repeat(21) + 'a' });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && npx jest apps/api/src/routes/__tests__/labResults-from-prescription.test.js --no-coverage
```

Expected: failures.

- [ ] **Step 3: Add route to labResults.js**

At the top of `apps/api/src/routes/labResults.js`, ensure these are required (add if missing):
```js
const SharedLink   = require('../models/SharedLink');
const Prescription = require('../models/Prescription');
const Lab          = require('../models/Lab');
```

Add this route **before** `router.post('/', ...)` (the existing create route) to avoid `:id` capturing `/from-prescription`:
```js
// POST /api/lab-results/from-prescription — lab role only
router.post('/from-prescription', auth, requireRole('lab'), async (req, res, next) => {
  try {
    const { shareToken } = req.body;
    if (!shareToken) return res.status(422).json({ message: 'shareToken is required' });

    const link = await SharedLink.findOne({ token: shareToken });
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
      return res.status(404).json({ message: 'Invalid or expired share token' });
    }

    const prescription = await Prescription.findById(link.resourceId);
    if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

    if (!prescription.analyses || prescription.analyses.length === 0) {
      return res.status(422).json({ message: 'Prescription has no lab tests ordered' });
    }

    const existing = await LabResult.findOne({ prescriptionId: prescription._id });
    if (existing) {
      return res.status(409).json({ message: 'A lab result already exists for this prescription' });
    }

    const lab = await Lab.findOne({ userId: req.user.id });

    const labResult = await LabResult.create({
      patientId: prescription.patientId,
      doctorId: req.user.id,
      labName: lab?.labName || 'Unknown Lab',
      tests: prescription.analyses.map(a => ({ name: a.name, value: '', flag: 'normal' })),
      status: 'pending',
      prescriptionId: prescription._id,
    });

    res.status(201).json(labResult);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && npx jest apps/api/src/routes/__tests__/labResults-from-prescription.test.js --no-coverage
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/labResults.js apps/api/src/routes/__tests__/labResults-from-prescription.test.js
git commit -m "feat(api): add POST /lab-results/from-prescription"
```

---

### Task 4: PATCH /lab-results/:id/status

**Files:**
- Modify: `apps/api/src/routes/labResults.js`
- Test: `apps/api/src/routes/__tests__/labResults-status.test.js`

**Interfaces:**
- Consumes: `LabResult` (doctorId for ownership, patientId, labName), `SharedLink.create`, `Notification.create`, `User.findById` (fcmToken), `sendPush` from `../utils/fcm`
- Produces: `PATCH /api/lab-results/:id/status` body `{ status, tests? }` → 200 `{ labResult, sharedLink? }`

- [ ] **Step 1: Write failing tests**

```js
// apps/api/src/routes/__tests__/labResults-status.test.js

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'labuser1', role: 'lab' };
  next();
});
jest.mock('../../middleware/requireRole', () => () => (_r, _s, next) => next());
jest.mock('../../models/LabResult');
jest.mock('../../models/SharedLink');
jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../utils/fcm', () => ({ sendPush: jest.fn().mockResolvedValue(null) }));

const express      = require('express');
const request      = require('supertest');
const LabResult    = require('../../models/LabResult');
const SharedLink   = require('../../models/SharedLink');
const Notification = require('../../models/Notification');
const User         = require('../../models/User');
const { sendPush } = require('../../utils/fcm');
const router       = require('../labResults');

const app = express();
app.use(express.json());
app.use('/api/lab-results', router);

beforeEach(() => jest.clearAllMocks());

const fakeLR = {
  _id: 'lr1',
  doctorId: { toString: () => 'labuser1' },
  patientId: 'pat1',
  labName: 'مختبر الأمل',
  status: 'pending',
  tests: [],
  save: jest.fn().mockResolvedValue(true),
};

describe('PATCH /api/lab-results/:id/status', () => {
  it('returns 200 and sets status to processing', async () => {
    LabResult.findById.mockResolvedValue({ ...fakeLR });

    const res = await request(app)
      .patch('/api/lab-results/lr1/status')
      .send({ status: 'processing' });

    expect(res.status).toBe(200);
    expect(res.body.labResult).toBeDefined();
  });

  it('returns 200, creates SharedLink and Notification when marking ready', async () => {
    const lr = { ...fakeLR, save: jest.fn().mockResolvedValue(true) };
    LabResult.findById.mockResolvedValue(lr);
    SharedLink.create.mockResolvedValue({ token: 'tok123' });
    Notification.create.mockResolvedValue({});
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ fcmToken: null }) });

    const res = await request(app)
      .patch('/api/lab-results/lr1/status')
      .send({
        status: 'ready',
        tests: [{ name: 'CBC', value: '14.2', unit: 'g/dL', referenceRange: '12-16', flag: 'normal' }],
      });

    expect(res.status).toBe(200);
    expect(SharedLink.create).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'lab_result', ownerId: 'pat1' })
    );
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'pat1', type: 'lab_ready' })
    );
  });

  it('returns 422 if marking ready with empty test value', async () => {
    LabResult.findById.mockResolvedValue({ ...fakeLR });

    const res = await request(app)
      .patch('/api/lab-results/lr1/status')
      .send({ status: 'ready', tests: [{ name: 'CBC', value: '', flag: 'normal' }] });

    expect(res.status).toBe(422);
  });

  it('returns 403 if lab does not own the result', async () => {
    LabResult.findById.mockResolvedValue({
      ...fakeLR,
      doctorId: { toString: () => 'other_lab_user' },
    });

    const res = await request(app)
      .patch('/api/lab-results/lr1/status')
      .send({ status: 'processing' });

    expect(res.status).toBe(403);
  });

  it('returns 422 for unknown status value', async () => {
    LabResult.findById.mockResolvedValue({ ...fakeLR });

    const res = await request(app)
      .patch('/api/lab-results/lr1/status')
      .send({ status: 'cancelled' });

    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && npx jest apps/api/src/routes/__tests__/labResults-status.test.js --no-coverage
```

Expected: failures.

- [ ] **Step 3: Add route to labResults.js**

At the top, add if missing:
```js
const crypto       = require('crypto');
const SharedLink   = require('../models/SharedLink');
const Notification = require('../models/Notification');
const User         = require('../models/User');
const { sendPush } = require('../utils/fcm');
```

Add this route before `module.exports`:
```js
// PATCH /api/lab-results/:id/status — lab role, owner only
router.patch('/:id/status', auth, requireRole('lab'), async (req, res, next) => {
  try {
    const { status, tests } = req.body;

    if (!['processing', 'ready'].includes(status)) {
      return res.status(422).json({ message: 'status must be processing or ready' });
    }

    const result = await LabResult.findById(req.params.id);
    if (!result) return res.status(404).json({ message: 'Lab result not found' });

    if (result.doctorId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (status === 'processing') {
      result.status = 'processing';
      await result.save();
      return res.json({ labResult: result });
    }

    // status === 'ready'
    if (!tests || !Array.isArray(tests) || tests.length === 0 || tests.some(t => !t.value)) {
      return res.status(422).json({ message: 'All test results must have a value' });
    }

    result.tests  = tests;
    result.status = 'ready';
    await result.save();

    const token = crypto.randomBytes(32).toString('hex');
    const sharedLink = await SharedLink.create({
      resourceType: 'lab_result',
      resourceId:   result._id,
      ownerId:      result.patientId,
      token,
      expiresAt:    null,
    });

    await Notification.create({
      recipientId: result.patientId,
      type:        'lab_ready',
      payload:     { labResultId: result._id, token },
      read:        false,
    });

    const patient = await User.findById(result.patientId).select('fcmToken');
    if (patient?.fcmToken) {
      await sendPush(
        patient.fcmToken,
        'نتائج التحليل جاهزة',
        `نتائج تحاليلك من ${result.labName} جاهزة للاطلاع`,
        { type: 'lab_ready', token }
      );
    }

    res.json({ labResult: result, sharedLink: { token, url: `/s/${token}` } });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && npx jest apps/api/src/routes/__tests__/labResults-status.test.js --no-coverage
```

Expected: 5 passing.

- [ ] **Step 5: Run all API tests to verify no regressions**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && npx jest apps/api/src/routes/__tests__/ --no-coverage 2>&1 | tail -10
```

Expected: all suites pass except pre-existing `chatbot.test.js` hoisting issue.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/labResults.js apps/api/src/routes/__tests__/labResults-status.test.js
git commit -m "feat(api): add PATCH /lab-results/:id/status with SharedLink + notification on ready"
```

---

### Task 5: Patient QR Sharing in MedicalRecordsPage

**Files:**
- Create: `apps/web/src/components/ShareQRModal.jsx`
- Modify: `apps/web/src/pages/patient/MedicalRecordsPage.jsx`

**Interfaces:**
- Consumes: `POST /api/share { resourceType, resourceId, expiry }` → `{ token, url, expiresAt }`; `DELETE /api/share/:token`; `QRCode.toDataURL(url)` from `qrcode`
- Produces: `<ShareQRModal prescription={rx} onClose={fn} />` component

- [ ] **Step 1: Create ShareQRModal component**

```jsx
// apps/web/src/components/ShareQRModal.jsx
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import client from '../api/client';

export default function ShareQRModal({ prescription, onClose }) {
  const [dataUrl, setDataUrl]   = useState('');
  const [token, setToken]       = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [revoked, setRevoked]   = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client.post('/share', {
      resourceType: 'prescription',
      resourceId:   prescription._id,
      expiry:       '24h',
    })
      .then(data => {
        if (cancelled) return;
        const url = `${window.location.origin}/s/${data.token}`;
        setToken(data.token);
        setExpiresAt(data.expiresAt);
        return QRCode.toDataURL(url, { width: 280 });
      })
      .then(du => { if (!cancelled) setDataUrl(du); })
      .catch(() => { if (!cancelled) setError('تعذر إنشاء رمز المشاركة'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [prescription._id]);

  const handleRevoke = async () => {
    if (!token) return;
    setRevoking(true);
    try {
      await client.delete(`/share/${token}`);
      setRevoked(true);
    } catch {
      setError('تعذر إلغاء رمز المشاركة');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
        display: 'grid', placeItems: 'center', zIndex: 1100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        dir="rtl"
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 28, maxWidth: 360, width: '90%', textAlign: 'center',
        }}
      >
        <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>مشاركة الوصفة الطبية</p>
        <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 20px' }}>
          أرِ هذا الرمز للصيدلاني أو المختبر
        </p>

        {loading && <p style={{ color: 'var(--text2)', fontSize: 13 }}>جاري الإنشاء...</p>}
        {error   && <p style={{ color: 'var(--rose)', fontSize: 13 }}>{error}</p>}
        {revoked && <p style={{ color: 'var(--mint)', fontSize: 13 }}>تم إلغاء رمز المشاركة</p>}

        {!loading && !error && !revoked && dataUrl && (
          <>
            <img src={dataUrl} alt="QR" style={{ width: 200, height: 200, margin: '0 auto 12px' }} />
            {expiresAt && (
              <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 16px' }}>
                صالح حتى: {new Date(expiresAt).toLocaleString('ar-SA')}
              </p>
            )}
            <button
              onClick={handleRevoke}
              disabled={revoking}
              style={{
                background: 'none', border: '1px solid var(--rose)',
                color: 'var(--rose)', borderRadius: 8, padding: '6px 18px',
                cursor: 'pointer', fontSize: 13, marginBottom: 12,
              }}
            >
              {revoking ? 'جاري الإلغاء...' : 'إلغاء الرمز'}
            </button>
          </>
        )}

        <button
          onClick={onClose}
          style={{
            display: 'block', width: '100%', background: 'var(--bg3)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px 0', cursor: 'pointer', fontSize: 13,
          }}
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add "Share QR" button in MedicalRecordsPage**

Open `apps/web/src/pages/patient/MedicalRecordsPage.jsx`.

Add the import at the top with the other imports:
```js
import ShareQRModal from '../../components/ShareQRModal';
```

Add state near the other state declarations:
```js
const [shareRx, setShareRx] = useState(null);
```

In the prescriptions tab, find where each prescription card is rendered (inside `.map()` over `rxList`). After the existing PDF button (or at the bottom of the card actions), add:
```jsx
<button
  onClick={() => setShareRx(rx)}
  style={{
    background: 'none', border: '1px solid var(--primary)',
    color: 'var(--primary)', borderRadius: 7, padding: '5px 12px',
    cursor: 'pointer', fontSize: 12,
  }}
>
  مشاركة QR
</button>
```

At the bottom of the JSX return, before the closing tag, add:
```jsx
{shareRx && <ShareQRModal prescription={shareRx} onClose={() => setShareRx(null)} />}
```

- [ ] **Step 3: Verify by reading the modified file**

Read `apps/web/src/pages/patient/MedicalRecordsPage.jsx` and confirm:
- `ShareQRModal` is imported
- `shareRx` state exists
- "مشاركة QR" button is inside the prescriptions list map
- `{shareRx && <ShareQRModal ... />}` is at the bottom of the return

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ShareQRModal.jsx apps/web/src/pages/patient/MedicalRecordsPage.jsx
git commit -m "feat(web): add prescription QR share modal for patients"
```

---

### Task 6: Pharmacy Scan + Dispense Flow

**Files:**
- Create: `apps/web/src/components/ScanModal.jsx`
- Create: `apps/web/src/components/PrescriptionCheckView.jsx`
- Modify: `apps/web/src/pages/pharmacy/PharmacyDashboardPage.jsx`

**Interfaces:**
- Consumes: `GET /api/share/:token` → `{ resourceType, resource: prescription }`; `POST /api/prescriptions/:id/dispense` → `{ dispensedMedications }`; `html5-qrcode` for webcam scan; `products` array already in `PharmacyDashboardPage` state
- Produces: `<ScanModal onScan={fn} onClose={fn} />`, `<PrescriptionCheckView prescription={rx} products={[]} onDispense={fn} dispensed={bool} dispensedMedications={[]} />`

- [ ] **Step 1: Install html5-qrcode**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/web && npm install html5-qrcode
```

Expected output: `added 1 package` (or similar).

- [ ] **Step 2: Create ScanModal component**

```jsx
// apps/web/src/components/ScanModal.jsx
import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function ScanModal({ onScan, onClose }) {
  const scannerRef = useRef(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );
    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        scanner.clear().catch(() => {});
        onScan(decodedText);
      },
      () => {} // ignore scan errors (camera noise)
    );

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [onScan]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
        display: 'grid', placeItems: 'center', zIndex: 1200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        dir="rtl"
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 24, maxWidth: 400, width: '90%',
        }}
      >
        <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 16px', textAlign: 'center' }}>
          امسح رمز QR للوصفة
        </p>
        <div id="qr-reader" />
        <button
          onClick={onClose}
          style={{
            marginTop: 16, width: '100%', background: 'var(--bg3)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px 0', cursor: 'pointer', fontSize: 13,
          }}
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create PrescriptionCheckView component**

```jsx
// apps/web/src/components/PrescriptionCheckView.jsx
import { useState } from 'react';
import client from '../api/client';

export default function PrescriptionCheckView({ prescription, products, onDispense }) {
  const [dispensing, setDispensing]         = useState(false);
  const [dispensed, setDispensed]           = useState(!!prescription.dispensedAt);
  const [dispensedMeds, setDispensedMeds]   = useState([]);
  const [error, setError]                   = useState('');

  const patientFirstName = prescription.patientId?.name?.split(' ')[0] || 'المريض';

  const getMedStatus = (medName) => {
    const p = products.find(pr => pr.name.toLowerCase() === medName.toLowerCase());
    if (!p)          return { label: 'غير متوفر',  color: 'var(--text3)' };
    if (p.stockQty > 0) return { label: `متوفر (${p.stockQty})`, color: 'var(--mint)' };
    return               { label: 'نفذ من المخزن', color: 'var(--rose)' };
  };

  const handleDispense = async () => {
    setDispensing(true); setError('');
    try {
      const data = await client.post(`/prescriptions/${prescription._id}/dispense`);
      setDispensedMeds(data.dispensedMedications);
      setDispensed(true);
      if (onDispense) onDispense(data);
    } catch (err) {
      setError(err?.message || 'تعذر صرف الوصفة');
    } finally {
      setDispensing(false);
    }
  };

  return (
    <div dir="rtl">
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 12px' }}>
        المريض: <strong>{patientFirstName}</strong>
        {prescription.doctorId?.name && ` — الطبيب: ${prescription.doctorId.name}`}
      </p>

      {dispensed && !dispensedMeds.length && (
        <div style={{
          background: 'rgba(22,163,74,.12)', borderRadius: 8,
          padding: '10px 14px', fontSize: 13, color: 'var(--mint)', marginBottom: 12,
        }}>
          تم صرف هذه الوصفة بتاريخ {new Date(prescription.dispensedAt).toLocaleDateString('ar-SA')}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {prescription.medications?.map((med, i) => {
          const status = getMedStatus(med.name);
          return (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{med.name}</span>
              <span style={{ fontSize: 12, color: status.color }}>{status.label}</span>
            </div>
          );
        })}
      </div>

      {dispensedMeds.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--mint)', margin: '0 0 6px' }}>
            تم الصرف
          </p>
          {dispensedMeds.map((m, i) => (
            <p key={i} style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0' }}>
              {m.name}: {m.matched ? `${m.stockBefore} → ${m.stockAfter}` : 'غير متطابق'}
            </p>
          ))}
        </div>
      )}

      {error && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 8 }}>{error}</p>}

      {!dispensed && (
        <button
          onClick={handleDispense}
          disabled={dispensing}
          style={{
            width: '100%', background: 'var(--mint)', color: '#000',
            border: 'none', borderRadius: 8, padding: '9px 0',
            fontWeight: 700, cursor: 'pointer', fontSize: 14,
          }}
        >
          {dispensing ? 'جاري الصرف...' : 'تأكيد الصرف'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add "Scan Rx" flow to PharmacyDashboardPage**

Open `apps/web/src/pages/pharmacy/PharmacyDashboardPage.jsx`.

Add imports at the top:
```js
import ScanModal            from '../../components/ScanModal';
import PrescriptionCheckView from '../../components/PrescriptionCheckView';
import client               from '../../api/client';
```

Add state near other state declarations:
```js
const [scanning, setScanning]       = useState(false);
const [scanResult, setScanResult]   = useState(null); // { prescription }
const [scanError, setScanError]     = useState('');
```

Add the handler:
```js
const handleScan = async (decodedText) => {
  setScanning(false);
  setScanError('');
  try {
    // Extract token from URL: /s/<token>
    const url = new URL(decodedText);
    const token = url.pathname.split('/s/')[1];
    if (!token) throw new Error('invalid');
    const data = await client.get(`/share/${token}`);
    if (data.resourceType !== 'prescription') throw new Error('not a prescription');
    setScanResult({ prescription: data.resource });
  } catch {
    setScanError('رمز QR غير صالح أو لا يشير إلى وصفة طبية');
  }
};
```

In the POS tab JSX, find the header area (where the "بيع جديد" or similar button is) and add immediately after it:
```jsx
<button
  onClick={() => { setScanResult(null); setScanError(''); setScanning(true); }}
  style={{
    background: 'var(--primary)', color: '#fff', border: 'none',
    borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  }}
>
  مسح وصفة طبية
</button>
{scanError && <p style={{ color: 'var(--rose)', fontSize: 12, margin: '4px 0 0' }}>{scanError}</p>}
```

At the bottom of the JSX return, before the closing tag, add:
```jsx
{scanning && (
  <ScanModal onScan={handleScan} onClose={() => setScanning(false)} />
)}

{scanResult && (
  <div
    onClick={() => setScanResult(null)}
    style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'grid', placeItems: 'center', zIndex: 1100,
    }}
  >
    <div
      onClick={e => e.stopPropagation()}
      dir="rtl"
      style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24, maxWidth: 420, width: '90%',
      }}
    >
      <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 16px' }}>الوصفة الطبية</p>
      <PrescriptionCheckView
        prescription={scanResult.prescription}
        products={products}
        onDispense={() => setScanResult(null)}
      />
      <button
        onClick={() => setScanResult(null)}
        style={{
          marginTop: 12, width: '100%', background: 'var(--bg3)',
          border: '1px solid var(--border)', borderRadius: 8,
          padding: '7px 0', cursor: 'pointer', fontSize: 13,
        }}
      >
        إغلاق
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify by reading PharmacyDashboardPage**

Confirm:
- `ScanModal` and `PrescriptionCheckView` imported
- `scanning`, `scanResult`, `scanError` state declared
- `handleScan` function defined
- "مسح وصفة طبية" button in POS tab
- Scan modal + prescription check modal at bottom of return

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ScanModal.jsx apps/web/src/components/PrescriptionCheckView.jsx apps/web/src/pages/pharmacy/PharmacyDashboardPage.jsx apps/web/package.json apps/web/package-lock.json
git commit -m "feat(web): add prescription QR scan and dispense flow to pharmacy dashboard"
```

---

### Task 7: Lab Orders Tab

**Files:**
- Modify: `apps/web/src/pages/lab/LabDashboardPage.jsx`

**Interfaces:**
- Consumes: `ScanModal` component (already created in Task 6), `GET /api/share/:token`, `POST /api/lab-results/from-prescription { shareToken }`, `GET /api/lab-results?prescriptionBased=true` (or `GET /api/lab-results/my-uploads`), `PATCH /api/lab-results/:id/status { status, tests? }`
- Produces: Lab dashboard with "Orders" tab

**Note on fetching orders:** The existing `GET /api/lab-results/my-uploads` returns the lab's own uploads. Filter client-side: `uploads.filter(r => r.prescriptionId)`. No new endpoint needed.

- [ ] **Step 1: Add Orders tab to LabDashboardPage**

Open `apps/web/src/pages/lab/LabDashboardPage.jsx`.

Add imports at top:
```js
import ScanModal from '../../components/ScanModal';
import client    from '../../api/client';
```

Add state:
```js
const [scanning, setScanning]     = useState(false);
const [scanError, setScanError]   = useState('');
const [orders, setOrders]         = useState([]);
const [ordersLoading, setOrdersLoading] = useState(false);
const [activeResultId, setActiveResultId] = useState(null); // for "Enter Results" form
const [draftTests, setDraftTests] = useState([]); // tests for the active result
const [publishing, setPublishing] = useState(false);
```

Add a helper to load orders (call this when switching to Orders tab or after accepting):
```js
const loadOrders = () => {
  setOrdersLoading(true);
  client.get('/lab-results/my-uploads')
    .then(data => setOrders((data.uploads || data).filter(r => r.prescriptionId)))
    .catch(() => {})
    .finally(() => setOrdersLoading(false));
};
```

Add the scan handler:
```js
const handleOrderScan = async (decodedText) => {
  setScanning(false); setScanError('');
  try {
    const url       = new URL(decodedText);
    const shareToken = url.pathname.split('/s/')[1];
    if (!shareToken) throw new Error('invalid');
    await client.post('/lab-results/from-prescription', { shareToken });
    loadOrders();
  } catch (err) {
    setScanError(err?.message || 'تعذر قبول الطلب — تحقق من رمز QR');
  }
};
```

Add status action handlers:
```js
const handleStart = async (id) => {
  await client.patch(`/lab-results/${id}/status`, { status: 'processing' });
  loadOrders();
};

const handlePublish = async (id) => {
  if (draftTests.some(t => !t.value.trim())) return;
  setPublishing(true);
  try {
    await client.patch(`/lab-results/${id}/status`, { status: 'ready', tests: draftTests });
    setActiveResultId(null);
    setDraftTests([]);
    loadOrders();
  } catch (err) {
    setScanError(err?.message || 'تعذر نشر النتائج');
  } finally {
    setPublishing(false);
  }
};
```

Add the "Orders" tab to the tab list. Find the existing tabs (the file has a form section and "my uploads" section). Add a tab button for "الطلبات" alongside the existing structure. Add a `useEffect` that calls `loadOrders()` once on mount:
```js
useEffect(() => { loadOrders(); }, []);
```

Add the Orders tab panel content. This should be shown when the active tab is `'orders'` (add `'orders'` as a tab option):

```jsx
{/* Orders tab panel — rendered when tab === 'orders' */}
<div dir="rtl">
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
    <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>طلبات التحليل</h2>
    <button
      onClick={() => { setScanError(''); setScanning(true); }}
      style={{
        background: 'var(--primary)', color: '#fff', border: 'none',
        borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
      }}
    >
      مسح وصفة طبية
    </button>
  </div>

  {scanError && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 8 }}>{scanError}</p>}
  {ordersLoading && <p style={{ color: 'var(--text2)', fontSize: 13 }}>جاري التحميل...</p>}

  {orders.length === 0 && !ordersLoading && (
    <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', marginTop: 32 }}>
      لا توجد طلبات بعد — امسح وصفة طبية لبدء التحليل
    </p>
  )}

  <div style={{ display: 'grid', gap: 12 }}>
    {orders.map(order => (
      <div key={order._id} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{order.labName}</span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 12,
            background: order.status === 'ready' ? 'rgba(22,163,74,.15)' : order.status === 'processing' ? 'rgba(245,158,11,.15)' : 'rgba(99,102,241,.15)',
            color: order.status === 'ready' ? 'var(--mint)' : order.status === 'processing' ? '#f59e0b' : 'var(--primary)',
          }}>
            {order.status === 'ready' ? 'تم النشر ✓' : order.status === 'processing' ? 'قيد التحليل' : 'معلق'}
          </span>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
          {order.tests?.map((t, i) => (
            <span key={i} style={{ marginLeft: 8 }}>{t.name}{t.value ? `: ${t.value}` : ''}</span>
          ))}
        </div>

        {order.status === 'pending' && (
          <button
            onClick={() => handleStart(order._id)}
            style={{
              background: 'var(--primary)', color: '#fff', border: 'none',
              borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
            }}
          >
            بدء التحليل
          </button>
        )}

        {order.status === 'processing' && activeResultId !== order._id && (
          <button
            onClick={() => {
              setActiveResultId(order._id);
              setDraftTests(order.tests.map(t => ({ ...t, value: t.value || '', flag: t.flag || 'normal' })));
            }}
            style={{
              background: 'var(--mint)', color: '#000', border: 'none',
              borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            إدخال النتائج
          </button>
        )}

        {order.status === 'processing' && activeResultId === order._id && (
          <div style={{ marginTop: 10 }}>
            {draftTests.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, flex: 1 }}>{t.name}</span>
                <input
                  value={t.value}
                  onChange={e => setDraftTests(d => d.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                  placeholder="النتيجة"
                  style={{
                    flex: 1, padding: '5px 8px', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
                  }}
                />
                <select
                  value={t.flag}
                  onChange={e => setDraftTests(d => d.map((x, j) => j === i ? { ...x, flag: e.target.value } : x))}
                  style={{ padding: '5px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                >
                  <option value="normal">طبيعي</option>
                  <option value="high">مرتفع</option>
                  <option value="low">منخفض</option>
                  <option value="critical">حرج</option>
                </select>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => handlePublish(order._id)}
                disabled={publishing || draftTests.some(t => !t.value.trim())}
                style={{
                  background: 'var(--mint)', color: '#000', border: 'none',
                  borderRadius: 7, padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                {publishing ? 'جاري النشر...' : 'نشر النتائج'}
              </button>
              <button
                onClick={() => { setActiveResultId(null); setDraftTests([]); }}
                style={{
                  background: 'none', border: '1px solid var(--border)',
                  borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
                }}
              >
                إلغاء
              </button>
            </div>
          </div>
        )}
      </div>
    ))}
  </div>
</div>
```

At the bottom of the return, add:
```jsx
{scanning && <ScanModal onScan={handleOrderScan} onClose={() => setScanning(false)} />}
```

- [ ] **Step 2: Verify by reading LabDashboardPage**

Confirm:
- `ScanModal` imported
- `orders`, `scanning`, `activeResultId`, `draftTests` state declared
- `loadOrders`, `handleOrderScan`, `handleStart`, `handlePublish` functions defined
- Orders tab renders order cards with status-conditional actions
- ScanModal mounted at bottom when `scanning` is true

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/lab/LabDashboardPage.jsx
git commit -m "feat(web): add lab Orders tab with QR scan, status progression, and result publishing"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ LabResult model: `processing` status, optional `value`, `prescriptionId`
- ✅ `POST /prescriptions/:id/dispense`: pharmacy role, 409 on duplicate, atomic stock decrement
- ✅ `POST /lab-results/from-prescription`: lab role, token validate, analyses check, 409 on duplicate
- ✅ `PATCH /lab-results/:id/status`: owner check, ready → SharedLink + Notification + FCM
- ✅ Patient: "Share QR" in MedicalRecordsPage, 24h expiry, revoke button
- ✅ Pharmacy: webcam scan → prescription check (inventory status) → confirm dispense → deduction summary
- ✅ Lab: scan → accept order → start → enter results → publish → patient notified
- ✅ PHI: patient first name only in pharmacy view
- ✅ Notification type `lab_ready` added

**Not in this plan (mobile — separate plan):**
- `apps/mobile/src/screens/pharmacy/ScanRxScreen.js`
- `apps/mobile/src/screens/lab/ScanRxScreen.js`
- `apps/mobile/src/screens/records/PrescriptionDetailScreen.js` QR button
