# Secretary Role + Waiting Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `secretary` role with email-invite onboarding, per-appointment QR check-in, and a live waiting room queue visible to both doctors and their secretaries.

**Architecture:** Extend existing `User` and `Appointment` models with new fields (no new collections). Add a `requireDoctorOrSecretary` middleware that sets `req.doctorUserId` so all new routes work for both roles. Secretary access to invoices is enabled by updating the existing invoices route to accept `secretary` role.

**Tech Stack:** Node.js + Express + Mongoose (API) · React + Zustand (web) · `resend` for email (already installed) · `qrcode` npm package (already installed in apps/web) · Jest + supertest (API tests)

## Global Constraints

- All secretary-facing UI is RTL (`dir="rtl"`), Arabic copy, consistent with DoctorLayout.
- No new MongoDB collections.
- `inviteToken` stored as SHA-256 hash (not bcrypt) — random tokens don't need slow hashing; deterministic hash enables direct DB lookup.
- `linkedDoctorId` on secretary User stores the **doctor's User `_id`** (not Doctor profile `_id`). Ref: `'User'`.
- Invite link expiry: 72 hours.
- `POST /api/appointments/checkin` is public — no auth middleware.
- Secretary can only access data belonging to their `linkedDoctorId`.
- Email sent via existing `apps/api/src/utils/email.js` `sendEmail(to, subject, html)`.
- `WEB_URL` env var used for invite link base URL (e.g. `https://salamtak.up.railway.app`).
- Test pattern: Jest + supertest, all mocks hoisted before `require`, auto-mock Mongoose models to avoid DB connection hangs.

---

## File Map

**Created (API):**
- `apps/api/src/middleware/secretaryAuth.js` — `requireSecretary`, `requireDoctorOrSecretary`
- `apps/api/src/routes/staff.js` — POST invite, GET list, DELETE revoke, POST accept-invite
- `apps/api/src/routes/waitingRoom.js` — GET queue, PATCH call

**Modified (API):**
- `apps/api/src/models/User.js` — add `secretary` to role enum + 4 new fields
- `apps/api/src/models/Appointment.js` — add `qrToken`, `checkedInAt`
- `apps/api/src/routes/auth.js` — include `linkedDoctorId` in JWT for secretary; add `POST /api/auth/accept-invite`
- `apps/api/src/routes/appointments.js` — add `qrToken` at creation; add `POST /api/appointments/checkin` (public)
- `apps/api/src/routes/invoices.js` — allow `secretary` role on GET + PATCH, scope by `req.doctorUserId`
- `apps/api/src/middleware/auth.js` — check `isActive` for secretary role
- `apps/api/src/index.js` — register `/api/staff`, `/api/waiting-room`

**Created (web):**
- `apps/web/src/layouts/SecretaryLayout.jsx`
- `apps/web/src/pages/auth/AcceptInvitePage.jsx`
- `apps/web/src/pages/CheckinPage.jsx`
- `apps/web/src/components/doctor/QRModal.jsx`
- `apps/web/src/pages/doctor/WaitingRoomPage.jsx` (shared: doctor + secretary)
- `apps/web/src/pages/secretary/SecretaryTodayPage.jsx`
- `apps/web/src/api/staff.js`
- `apps/web/src/api/waitingRoom.js`

**Modified (web):**
- `apps/web/src/router/index.jsx` — `SecretaryProtected`, public routes, secretary routes, `/waiting-room` fix
- `apps/web/src/pages/doctor/TodayPage.jsx` — QR icon on each appointment card
- `apps/web/src/pages/doctor/DoctorSettingsPage.jsx` — Staff section

**Tests (API):**
- `apps/api/src/routes/__tests__/staff.test.js`
- `apps/api/src/routes/__tests__/waitingRoom.test.js`

---

### Task 1: Data Model Extensions

**Files:**
- Modify: `apps/api/src/models/User.js`
- Modify: `apps/api/src/models/Appointment.js`
- Test: `apps/api/src/routes/__tests__/modelFields.test.js`

**Interfaces:**
- Produces: `User` schema with `role: ['doctor','patient','laboratory','pharmacy','secretary']`, `linkedDoctorId: ObjectId ref:'User'`, `isActive: Boolean default:true`, `inviteToken: String`, `inviteExpiry: Date`
- Produces: `Appointment` schema with `qrToken: String unique sparse`, `checkedInAt: Date`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/__tests__/modelFields.test.js`:

```js
'use strict';

const UserSchema    = require('../../models/User').schema;
const ApptSchema    = require('../../models/Appointment').schema;

describe('User schema — secretary fields', () => {
  it('includes secretary in role enum', () => {
    const roleEnum = UserSchema.path('role').enumValues;
    expect(roleEnum).toContain('secretary');
  });

  it('has linkedDoctorId field', () => {
    const path = UserSchema.path('linkedDoctorId');
    expect(path).toBeDefined();
  });

  it('has isActive field defaulting to true', () => {
    const path = UserSchema.path('isActive');
    expect(path).toBeDefined();
    expect(path.defaultValue).toBe(true);
  });

  it('has inviteToken field', () => {
    expect(UserSchema.path('inviteToken')).toBeDefined();
  });

  it('has inviteExpiry field', () => {
    expect(UserSchema.path('inviteExpiry')).toBeDefined();
  });
});

describe('Appointment schema — QR fields', () => {
  it('has qrToken field', () => {
    expect(ApptSchema.path('qrToken')).toBeDefined();
  });

  it('has checkedInAt field', () => {
    expect(ApptSchema.path('checkedInAt')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest --testPathPattern="modelFields" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `secretary` not in enum, fields not found.

- [ ] **Step 3: Update User model**

In `apps/api/src/models/User.js` — replace the `role` line and add 4 new fields after `isSuspended`:

```js
// Replace:
role: { type: String, enum: ['doctor', 'patient', 'laboratory', 'pharmacy'], required: true },

// With:
role: { type: String, enum: ['doctor', 'patient', 'laboratory', 'pharmacy', 'secretary'], required: true },
```

Add after `isSuspended: { type: Boolean, default: false },`:

```js
  // Secretary-only fields
  linkedDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isActive:       { type: Boolean, default: true },
  inviteToken:    { type: String, default: null },
  inviteExpiry:   { type: Date,   default: null },
```

- [ ] **Step 4: Update Appointment model**

In `apps/api/src/models/Appointment.js` — add after `invoiceAmount` line, before `}, { timestamps: true }`:

```js
  qrToken:     { type: String, unique: true, sparse: true, default: null },
  checkedInAt: { type: Date, default: null },
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/api && npx jest --testPathPattern="modelFields" --no-coverage 2>&1 | tail -10
```

Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/models/User.js apps/api/src/models/Appointment.js apps/api/src/routes/__tests__/modelFields.test.js
git commit -m "feat(api): extend User and Appointment models for secretary and QR check-in"
```

---

### Task 2: Secretary Auth Middleware + Login JWT

**Files:**
- Create: `apps/api/src/middleware/secretaryAuth.js`
- Modify: `apps/api/src/routes/auth.js` (login + register JWT shape)
- Modify: `apps/api/src/middleware/auth.js` (isActive check for secretary)

**Interfaces:**
- Produces: `requireSecretary(req,res,next)` — sets `req.doctorUserId = req.user.linkedDoctorId`, 403 if not secretary or missing `linkedDoctorId`
- Produces: `requireDoctorOrSecretary(req,res,next)` — sets `req.doctorUserId`: `req.user.id` for doctor, `req.user.linkedDoctorId` for secretary; 403 otherwise
- Produces: login JWT includes `linkedDoctorId` for secretary role
- Produces: auth middleware blocks revoked secretary (`isActive: false`)

- [ ] **Step 1: Write the failing test for secretaryAuth middleware**

Create `apps/api/src/middleware/__tests__/secretaryAuth.test.js`:

```js
'use strict';

// Mock User model (used by auth middleware)
jest.mock('../../models/User');

const { requireSecretary, requireDoctorOrSecretary } = require('../secretaryAuth');

function makeReq(role, id = 'uid1', linkedDoctorId = null) {
  return { user: { id, role, linkedDoctorId } };
}
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireSecretary', () => {
  it('passes for secretary with linkedDoctorId, sets req.doctorUserId', () => {
    const req  = makeReq('secretary', 'uid1', 'doc1');
    const res  = makeRes();
    const next = jest.fn();
    requireSecretary(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.doctorUserId).toBe('doc1');
  });

  it('returns 403 for doctor', () => {
    const req = makeReq('doctor', 'uid1', null);
    const res = makeRes();
    requireSecretary(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 for secretary missing linkedDoctorId', () => {
    const req = makeReq('secretary', 'uid1', null);
    const res = makeRes();
    requireSecretary(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('requireDoctorOrSecretary', () => {
  it('passes for doctor, sets req.doctorUserId = req.user.id', () => {
    const req  = makeReq('doctor', 'doc_user_id', null);
    const res  = makeRes();
    const next = jest.fn();
    requireDoctorOrSecretary(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.doctorUserId).toBe('doc_user_id');
  });

  it('passes for secretary, sets req.doctorUserId = linkedDoctorId', () => {
    const req  = makeReq('secretary', 'sec_id', 'linked_doc_id');
    const res  = makeRes();
    const next = jest.fn();
    requireDoctorOrSecretary(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.doctorUserId).toBe('linked_doc_id');
  });

  it('returns 403 for patient', () => {
    const req = makeReq('patient');
    const res = makeRes();
    requireDoctorOrSecretary(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest --testPathPattern="secretaryAuth" --no-coverage 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the middleware**

Create `apps/api/src/middleware/secretaryAuth.js`:

```js
'use strict';

const requireSecretary = (req, res, next) => {
  if (req.user?.role !== 'secretary') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (!req.user.linkedDoctorId) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  req.doctorUserId = req.user.linkedDoctorId;
  next();
};

const requireDoctorOrSecretary = (req, res, next) => {
  const { role, id, linkedDoctorId } = req.user || {};
  if (role === 'doctor') {
    req.doctorUserId = id;
    return next();
  }
  if (role === 'secretary' && linkedDoctorId) {
    req.doctorUserId = linkedDoctorId;
    return next();
  }
  return res.status(403).json({ message: 'Forbidden' });
};

module.exports = { requireSecretary, requireDoctorOrSecretary };
```

- [ ] **Step 4: Run test to verify middleware passes**

```bash
cd apps/api && npx jest --testPathPattern="secretaryAuth" --no-coverage 2>&1 | tail -10
```

Expected: PASS (5 tests).

- [ ] **Step 5: Update auth.js login to include linkedDoctorId in JWT**

In `apps/api/src/routes/auth.js`, the login endpoint currently does (line ~137):
```js
const token = sign({ id: user._id, role: user.role });
res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
```

Replace those two lines with:
```js
const payload = { id: user._id, role: user.role };
if (user.role === 'secretary' && user.linkedDoctorId) {
  payload.linkedDoctorId = user.linkedDoctorId;
}
const token = sign(payload);
res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, linkedDoctorId: user.linkedDoctorId || null } });
```

Also update the register endpoint (line ~82) similarly:
```js
const payload = { id: user._id, role: user.role };
const token = sign(payload);
res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, linkedDoctorId: null } });
```

- [ ] **Step 6: Update auth middleware to block revoked secretaries**

In `apps/api/src/middleware/auth.js`, update the DB check block:

```js
// Replace:
const user = await User.findById(decoded.id).select('erasedAt isSuspended').lean();
if (!user) return res.status(401).json({ message: 'User not found' });
if (user.erasedAt) return res.status(401).json({ message: 'Account has been erased' });
if (user.isSuspended) return res.status(403).json({ message: 'Account suspended. Contact support.' });

// With:
const user = await User.findById(decoded.id).select('erasedAt isSuspended isActive').lean();
if (!user) return res.status(401).json({ message: 'User not found' });
if (user.erasedAt) return res.status(401).json({ message: 'Account has been erased' });
if (user.isSuspended) return res.status(403).json({ message: 'Account suspended. Contact support.' });
if (decoded.role === 'secretary' && !user.isActive) {
  return res.status(403).json({ message: 'Secretary access has been revoked' });
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/middleware/secretaryAuth.js \
        apps/api/src/middleware/__tests__/secretaryAuth.test.js \
        apps/api/src/routes/auth.js \
        apps/api/src/middleware/auth.js
git commit -m "feat(api): add secretary auth middleware and include linkedDoctorId in JWT"
```

---

### Task 3: Staff Management + Accept Invite API

**Files:**
- Create: `apps/api/src/routes/staff.js`
- Modify: `apps/api/src/routes/auth.js` (add `POST /api/auth/accept-invite`)
- Modify: `apps/api/src/index.js` (register `/api/staff`)
- Test: `apps/api/src/routes/__tests__/staff.test.js`

**Interfaces:**
- Consumes: `requireSecretary`, `requireDoctorOrSecretary` from `../middleware/secretaryAuth`
- Consumes: `sendEmail(to, subject, html)` from `../utils/email`
- Consumes: `sign` from `../utils/jwt`
- Consumes: `hmacHash` from `../utils/blindIndex`
- Produces: `POST /api/staff/invite` → 201 `{ message, secretaryId }`
- Produces: `GET /api/staff` → 200 `{ secretaries: [{_id, name, email, isActive, createdAt}] }`
- Produces: `DELETE /api/staff/:userId` → 200 `{ message }`
- Produces: `POST /api/auth/accept-invite` → 200 `{ token, user }`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/__tests__/staff.test.js`:

```js
'use strict';

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: '507f1f77bcf86cd799439011', role: 'doctor' };
  next();
});
jest.mock('../../middleware/rbac', () => () => (_req, _res, next) => next());
jest.mock('../../middleware/secretaryAuth', () => ({
  requireSecretary: (_req, _res, next) => next(),
  requireDoctorOrSecretary: (req, _res, next) => {
    req.doctorUserId = req.user.id;
    next();
  },
}));
jest.mock('../../models/User');
jest.mock('../../utils/email', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../utils/blindIndex', () => ({ hmacHash: jest.fn().mockReturnValue('hash123') }));
jest.mock('../../utils/jwt', () => ({ sign: jest.fn().mockReturnValue('fake.jwt.token') }));

const express  = require('express');
const request  = require('supertest');
const User     = require('../../models/User');
const router   = require('../staff');

const app = express();
app.use(express.json());
app.use('/api/staff', router);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/staff', () => {
  it('returns 200 with secretary list', async () => {
    User.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'sec1', name: 'Sara', email: 'sara@test.com', isActive: true },
        ]),
      }),
    });
    const res = await request(app).get('/api/staff');
    expect(res.status).toBe(200);
    expect(res.body.secretaries).toHaveLength(1);
    expect(res.body.secretaries[0].email).toBe('sara@test.com');
  });
});

describe('POST /api/staff/invite', () => {
  it('returns 201 when email not taken', async () => {
    User.findOne = jest.fn().mockResolvedValue(null);
    User.create  = jest.fn().mockResolvedValue({ _id: 'newsec' });
    const res = await request(app)
      .post('/api/staff/invite')
      .send({ email: 'new@clinic.com' });
    expect(res.status).toBe(201);
    expect(res.body.secretaryId).toBe('newsec');
  });

  it('returns 409 when email already registered', async () => {
    User.findOne = jest.fn().mockResolvedValue({ _id: 'existing' });
    const res = await request(app)
      .post('/api/staff/invite')
      .send({ email: 'taken@clinic.com' });
    expect(res.status).toBe(409);
  });

  it('returns 422 for invalid email', async () => {
    const res = await request(app)
      .post('/api/staff/invite')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/staff/:userId', () => {
  it('returns 200 when secretary found', async () => {
    User.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: 'sec1' });
    const res = await request(app).delete('/api/staff/sec1');
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found or wrong doctor', async () => {
    User.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    const res = await request(app).delete('/api/staff/sec999');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest --testPathPattern="staff.test" --no-coverage 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create staff route**

Create `apps/api/src/routes/staff.js`:

```js
'use strict';

const crypto     = require('crypto');
const router     = require('express').Router();
const { body, validationResult } = require('express-validator');
const auth       = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const User       = require('../models/User');
const { sendEmail } = require('../utils/email');
const { hmacHash }  = require('../utils/blindIndex');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// GET /api/staff — list secretaries linked to this doctor
router.get('/', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const secretaries = await User.find({
      role: 'secretary',
      linkedDoctorId: req.user.id,
    }).select('name email isActive createdAt').lean();
    res.json({ secretaries });
  } catch (err) { next(err); }
});

// POST /api/staff/invite — doctor invites a secretary by email
router.post('/invite', auth, requireRole('doctor'), [
  body('email').isEmail().normalizeEmail(),
], validate, async (req, res, next) => {
  try {
    const { email } = req.body;

    const existing = await User.findOne({ emailHash: hmacHash(email) });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const secretary = await User.create({
      name:          email.split('@')[0],
      email,
      role:          'secretary',
      linkedDoctorId: req.user.id,
      isActive:      false,
      inviteToken:   tokenHash,
      inviteExpiry:  new Date(Date.now() + 72 * 60 * 60 * 1000),
      // GDPR defaults — secretary consents on accept-invite
      consentVersion:       null,
      dataProcessingAllowed: false,
    });

    const inviteUrl = `${process.env.WEB_URL || 'http://localhost:5173'}/accept-invite?token=${rawToken}`;
    await sendEmail(
      email,
      'دعوة للانضمام إلى سلامتك',
      `<div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0d9488">مرحباً بك في سلامتك</h2>
        <p>تمت دعوتك للعمل كسكرتيرة في عيادة على منصة سلامتك.</p>
        <p><a href="${inviteUrl}" style="background:#0d9488;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">تفعيل الحساب</a></p>
        <p style="color:#64748b;font-size:12px">الرابط صالح لمدة 72 ساعة.</p>
      </div>`
    );

    res.status(201).json({ message: 'تم إرسال الدعوة', secretaryId: secretary._id });
  } catch (err) { next(err); }
});

// DELETE /api/staff/:userId — doctor revokes secretary access
router.delete('/:userId', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const secretary = await User.findOneAndUpdate(
      { _id: req.params.userId, role: 'secretary', linkedDoctorId: req.user.id },
      { isActive: false },
      { new: true }
    );
    if (!secretary) return res.status(404).json({ message: 'لم يتم العثور على السكرتيرة' });
    res.json({ message: 'تم إلغاء الوصول' });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Add POST /api/auth/accept-invite to auth.js**

At the end of `apps/api/src/routes/auth.js`, before `module.exports = router`, add:

```js
// POST /api/auth/accept-invite — secretary sets password and activates account
router.post('/accept-invite', [
  body('token').notEmpty().withMessage('token is required'),
  body('password').isLength({ min: 8 }).withMessage('password must be at least 8 characters'),
], validate, async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      inviteToken:  tokenHash,
      inviteExpiry: { $gt: new Date() },
      role:         'secretary',
      isActive:     false,
    });

    if (!user) {
      return res.status(400).json({ message: 'رابط الدعوة غير صالح أو منتهي الصلاحية' });
    }

    user.password    = password; // pre-save hook hashes it
    user.isActive    = true;
    user.inviteToken  = null;
    user.inviteExpiry = null;
    // Record consent at activation
    user.consentVersion       = process.env.TERMS_VERSION || '1.0';
    user.consentTimestamp     = new Date();
    user.consentIp            = req.ip;
    user.dataProcessingAllowed = true;
    await user.save();

    const payload = { id: user._id, role: user.role, linkedDoctorId: user.linkedDoctorId };
    const jwtToken = sign(payload);

    res.json({
      token: jwtToken,
      user: {
        id:              user._id,
        name:            user.name,
        email:           user.email,
        role:            user.role,
        linkedDoctorId:  user.linkedDoctorId,
      },
    });
  } catch (err) { next(err); }
});
```

- [ ] **Step 5: Register /api/staff in index.js**

In `apps/api/src/index.js`, after the `/api/analytics` line (line 73), add:

```js
app.use('/api/staff',        require('./routes/staff'));
```

- [ ] **Step 6: Run tests**

```bash
cd apps/api && npx jest --testPathPattern="staff.test" --no-coverage 2>&1 | tail -15
```

Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/staff.js \
        apps/api/src/routes/__tests__/staff.test.js \
        apps/api/src/routes/auth.js \
        apps/api/src/index.js
git commit -m "feat(api): add staff management API and accept-invite endpoint"
```

---

### Task 4: QR Check-in API + qrToken at Appointment Creation

**Files:**
- Modify: `apps/api/src/routes/appointments.js`
- Test: `apps/api/src/routes/__tests__/checkin.test.js`

**Interfaces:**
- Produces: `POST /api/appointments/checkin` (public) → 200 `{ message, patientName, appointmentTime }` or 400
- Produces: all new appointments have `qrToken` set (64-char hex)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/__tests__/checkin.test.js`:

```js
'use strict';

// Public route — no auth mock needed
jest.mock('../../models/Appointment');

const express     = require('express');
const request     = require('supertest');
const Appointment = require('../../models/Appointment');

// Mount only the appointments router; the checkin endpoint is public
const router = require('../appointments');
const app = express();
app.use(express.json());
app.use('/api/appointments', router);

beforeEach(() => jest.clearAllMocks());

describe('POST /api/appointments/checkin', () => {
  it('returns 200 and confirmation when token valid', async () => {
    Appointment.findOneAndUpdate = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        patientId: { name: 'Ahmed' },
        timeSlot:  { start: '10:30' },
      }),
    });

    const res = await request(app)
      .post('/api/appointments/checkin')
      .send({ token: 'a'.repeat(64) });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('تم تسجيل حضورك بنجاح');
    expect(res.body.patientName).toBe('Ahmed');
    expect(res.body.appointmentTime).toBe('10:30');
  });

  it('returns 400 when token not found or already checked in', async () => {
    Appointment.findOneAndUpdate = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app)
      .post('/api/appointments/checkin')
      .send({ token: 'b'.repeat(64) });

    expect(res.status).toBe(400);
  });

  it('returns 422 when token missing', async () => {
    const res = await request(app)
      .post('/api/appointments/checkin')
      .send({});
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest --testPathPattern="checkin.test" --no-coverage 2>&1 | tail -10
```

Expected: FAIL (route not found / 404).

- [ ] **Step 3: Add qrToken to appointment creation**

In `apps/api/src/routes/appointments.js`, add at the very top (after existing requires):

```js
const crypto = require('crypto');
```

In the `new Appointment({...})` block (around line 112), add `qrToken` field after `paymentStatus`:

```js
      paymentStatus:   'unpaid',
      qrToken:         crypto.randomBytes(32).toString('hex'),
```

- [ ] **Step 4: Add public checkin endpoint to appointments.js**

In `apps/api/src/routes/appointments.js`, add this block **before** the `POST /` (patient books) route. It must be declared before routes with `auth` middleware so it remains public:

```js
// POST /api/appointments/checkin — public, no auth — patient scans QR
router.post('/checkin', [
  body('token').notEmpty().isLength({ min: 64, max: 64 }).withMessage('Invalid token'),
], validate, async (req, res, next) => {
  try {
    const { token } = req.body;

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const appt = await Appointment.findOneAndUpdate(
      {
        qrToken:      token,
        date:         { $gte: todayStart, $lte: todayEnd },
        checkedInAt:  null,
        status:       { $nin: ['cancelled', 'completed', 'archived'] },
      },
      { checkedInAt: new Date() },
      { new: true }
    ).populate('patientId', 'name');

    if (!appt) {
      return res.status(400).json({ message: 'رابط الحجز غير صالح أو تم تسجيل الحضور مسبقاً' });
    }

    res.json({
      message:         'تم تسجيل حضورك بنجاح',
      patientName:     appt.patientId?.name || 'المريض',
      appointmentTime: appt.timeSlot?.start,
    });
  } catch (err) { next(err); }
});
```

Note: `body` and `validate` are already defined earlier in `appointments.js`. If they're not, add:

```js
const { body, validationResult } = require('express-validator');
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && npx jest --testPathPattern="checkin.test" --no-coverage 2>&1 | tail -10
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/appointments.js \
        apps/api/src/routes/__tests__/checkin.test.js
git commit -m "feat(api): add QR check-in endpoint and qrToken generation at appointment creation"
```

---

### Task 5: Waiting Room API + Secretary Invoice Access

**Files:**
- Create: `apps/api/src/routes/waitingRoom.js`
- Modify: `apps/api/src/routes/invoices.js` (allow secretary)
- Modify: `apps/api/src/index.js` (register `/api/waiting-room`)
- Test: `apps/api/src/routes/__tests__/waitingRoom.test.js`

**Interfaces:**
- Consumes: `requireDoctorOrSecretary` from `../middleware/secretaryAuth` — sets `req.doctorUserId`
- Produces: `GET /api/waiting-room` → `{ queue: [{_id, patientName, appointmentTime, visitType, checkedInAt, status}] }`
- Produces: `PATCH /api/waiting-room/:id/call` → `{ appointment: {...} }`
- Produces: `GET /api/invoices` also accepts `secretary` role

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/__tests__/waitingRoom.test.js`:

```js
'use strict';

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: '507f1f77bcf86cd799439011', role: 'doctor' };
  next();
});
jest.mock('../../middleware/secretaryAuth', () => ({
  requireDoctorOrSecretary: (req, _res, next) => {
    req.doctorUserId = req.user.id;
    next();
  },
}));
jest.mock('../../models/Appointment');

const express     = require('express');
const request     = require('supertest');
const Appointment = require('../../models/Appointment');
const router      = require('../waitingRoom');

const app = express();
app.use(express.json());
app.use('/api/waiting-room', router);

beforeEach(() => jest.clearAllMocks());

describe('GET /api/waiting-room', () => {
  it('returns 200 with queue', async () => {
    Appointment.find = jest.fn().mockReturnValue({
      sort:     jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean:     jest.fn().mockResolvedValue([
        { _id: 'a1', patientId: { name: 'Ali' }, timeSlot: { start: '09:00' }, visitType: 'initial', checkedInAt: new Date(), status: 'confirmed' },
      ]),
    });

    const res = await request(app).get('/api/waiting-room');
    expect(res.status).toBe(200);
    expect(res.body.queue).toHaveLength(1);
    expect(res.body.queue[0].patientName).toBe('Ali');
  });
});

describe('PATCH /api/waiting-room/:id/call', () => {
  it('returns 200 and updated appointment', async () => {
    Appointment.findOneAndUpdate = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id: 'a1', status: 'in_progress', patientId: { name: 'Ali' }, timeSlot: { start: '09:00' },
      }),
    });
    const res = await request(app).patch('/api/waiting-room/a1/call');
    expect(res.status).toBe(200);
    expect(res.body.appointment.status).toBe('in_progress');
  });

  it('returns 404 when appointment not found', async () => {
    Appointment.findOneAndUpdate = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });
    const res = await request(app).patch('/api/waiting-room/bad/call');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest --testPathPattern="waitingRoom.test" --no-coverage 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create waitingRoom route**

Create `apps/api/src/routes/waitingRoom.js`:

```js
'use strict';

const router     = require('express').Router();
const auth       = require('../middleware/auth');
const { requireDoctorOrSecretary } = require('../middleware/secretaryAuth');
const Appointment = require('../models/Appointment');
const mongoose   = require('mongoose');

const guard = [auth, requireDoctorOrSecretary];

// GET /api/waiting-room — today's checked-in patients, ordered by check-in time
router.get('/', guard, async (req, res, next) => {
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const appointments = await Appointment.find({
      doctorId:    req.doctorUserId,
      date:        { $gte: todayStart, $lte: todayEnd },
      checkedInAt: { $ne: null },
    })
      .sort({ checkedInAt: 1 })
      .populate('patientId', 'name')
      .lean();

    const queue = appointments.map(a => ({
      _id:             a._id,
      patientName:     a.patientId?.name || 'مجهول',
      appointmentTime: a.timeSlot?.start,
      visitType:       a.visitType,
      checkedInAt:     a.checkedInAt,
      status:          a.status,
    }));

    res.json({ queue });
  } catch (err) { next(err); }
});

// PATCH /api/waiting-room/:id/call — mark patient as called (in_progress)
router.patch('/:id/call', guard, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, doctorId: req.doctorUserId },
      { status: 'in_progress' },
      { new: true }
    ).populate('patientId', 'name');

    if (!appt) return res.status(404).json({ message: 'لم يتم العثور على الموعد' });

    res.json({
      appointment: {
        _id:         appt._id,
        status:      appt.status,
        patientName: appt.patientId?.name,
        timeSlot:    appt.timeSlot,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Update invoices.js to accept secretary role**

In `apps/api/src/routes/invoices.js`, replace the two route guard lines and add secretary scoping:

```js
// Replace at top:
const doctorOnly = [auth, requireRole('doctor')];

// With:
const { requireDoctorOrSecretary } = require('../middleware/secretaryAuth');
const doctorOrSecretary = [auth, requireDoctorOrSecretary];
```

In the `GET /api/invoices` route, replace `doctorOnly` with `doctorOrSecretary` and change the doctor lookup:
```js
// Replace:
router.get('/', doctorOnly, async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id }).select('_id');

// With:
router.get('/', doctorOrSecretary, async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.doctorUserId }).select('_id');
```

In the `PATCH /:appointmentId/pay` route, replace `doctorOnly` with `doctorOrSecretary` and change the lookup:
```js
// Replace:
router.patch('/:appointmentId/pay', doctorOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const doctor = await Doctor.findOne({ userId: req.user.id }).select('_id');

// With:
router.patch('/:appointmentId/pay', doctorOrSecretary, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const doctor = await Doctor.findOne({ userId: req.doctorUserId }).select('_id');
```

- [ ] **Step 5: Register waiting room route in index.js**

In `apps/api/src/index.js`, after the `/api/staff` line, add:

```js
app.use('/api/waiting-room', require('./routes/waitingRoom'));
```

- [ ] **Step 6: Run tests**

```bash
cd apps/api && npx jest --testPathPattern="waitingRoom.test" --no-coverage 2>&1 | tail -10
```

Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/waitingRoom.js \
        apps/api/src/routes/__tests__/waitingRoom.test.js \
        apps/api/src/routes/invoices.js \
        apps/api/src/index.js
git commit -m "feat(api): add waiting room API and allow secretary access to invoices"
```

---

### Task 6: SecretaryLayout, Route Guards, Accept Invite + Checkin Pages

**Files:**
- Create: `apps/web/src/layouts/SecretaryLayout.jsx`
- Create: `apps/web/src/pages/auth/AcceptInvitePage.jsx`
- Create: `apps/web/src/pages/CheckinPage.jsx`
- Modify: `apps/web/src/router/index.jsx`

**Interfaces:**
- Produces: `SecretaryLayout` — RTL sidebar with 3 nav items (waiting room, today, invoices)
- Produces: `SecretaryProtected` guard — checks `user.role === 'secretary'`, renders in `SecretaryLayout`
- Produces: `/accept-invite` public route → `AcceptInvitePage`
- Produces: `/checkin` public route → `CheckinPage`
- Produces: `/waiting-room` route uses `WaitingRoomPage` (not ComingSoonPage) for doctors
- Produces: root `/` redirect sends secretary to `/secretary/waiting-room`

- [ ] **Step 1: Create SecretaryLayout**

Create `apps/web/src/layouts/SecretaryLayout.jsx`:

```jsx
import { NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

const NAV = [
  { to: '/secretary/waiting-room', label: 'غرفة الانتظار', icon: '🟢' },
  { to: '/secretary/today',        label: 'مواعيد اليوم',  icon: '📅' },
  { to: '/secretary/invoices',     label: 'الفواتير',       icon: '🧾' },
];

function Sidebar() {
  const { logout } = useAuthStore();
  const navigate   = useNavigate();

  return (
    <div style={{
      height: '100vh', background: '#fff', borderInlineStart: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '16px 0',
    }}>
      <div style={{ padding: '4px 16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--primary)', display: 'grid', placeItems: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>سلامتك</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '6px 0 0' }}>لوحة السكرتيرة</p>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, marginBottom: 4,
              fontSize: 13, fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--primary)' : 'var(--text2)',
              background: isActive ? 'var(--primary-dim)' : 'transparent',
              textDecoration: 'none',
            })}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', textAlign: 'right' }}
        >
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}

export default function SecretaryLayout({ children }) {
  return (
    <div dir="rtl" style={{ display: 'grid', gridTemplateColumns: '1fr 220px', height: '100vh', background: 'var(--bg)' }}>
      <main style={{ overflowY: 'auto' }}>{children}</main>
      <Sidebar />
    </div>
  );
}
```

- [ ] **Step 2: Create AcceptInvitePage**

Create `apps/web/src/pages/auth/AcceptInvitePage.jsx`:

```jsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import client from '../../api/client';

export default function AcceptInvitePage() {
  const [params]         = useSearchParams();
  const navigate         = useNavigate();
  const { login }        = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const token = params.get('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('كلمتا المرور غير متطابقتين'); return; }
    if (password.length < 8)  { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return; }
    if (!token)               { setError('رابط الدعوة غير صالح'); return; }

    setLoading(true); setError('');
    try {
      const data = await client.post('/auth/accept-invite', { token, password }).then(r => r.data);
      login(data.user, data.token);
      navigate('/secretary/waiting-room', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'حدث خطأ، حاول مجدداً');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', color: 'var(--primary)' }}>تفعيل الحساب</h1>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 24px' }}>أدخل كلمة مرور لتفعيل حسابك</p>

        {error && <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 16 }}>{error}</p>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="password" placeholder="كلمة المرور (8 أحرف على الأقل)"
            value={password} onChange={e => setPassword(e.target.value)} required
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }}
          />
          <input
            type="password" placeholder="تأكيد كلمة المرور"
            value={confirm} onChange={e => setConfirm(e.target.value)} required
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }}
          />
          <button
            type="submit" disabled={loading}
            style={{ padding: '11px', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'جاري التفعيل...' : 'تفعيل الحساب'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CheckinPage**

Create `apps/web/src/pages/CheckinPage.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';

export default function CheckinPage() {
  const [params]  = useSearchParams();
  const [state,   setState]  = useState('loading'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [name,    setName]    = useState('');
  const [time,    setTime]    = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState('error'); setMessage('رابط غير صالح'); return; }

    client.post('/appointments/checkin', { token })
      .then(r => {
        setName(r.data.patientName);
        setTime(r.data.appointmentTime);
        setState('success');
      })
      .catch(err => {
        setMessage(err.response?.data?.message || 'حدث خطأ، حاول مجدداً');
        setState('error');
      });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,.1)' }}>
        {state === 'loading' && (
          <p style={{ color: 'var(--text2)', fontSize: 15 }}>جاري التحقق...</p>
        )}
        {state === 'success' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#16a34a', margin: '0 0 8px' }}>تم تسجيل حضورك بنجاح</h2>
            <p style={{ fontSize: 15, color: 'var(--text2)', margin: 0 }}>مرحباً {name}، موعدك الساعة {time}</p>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 16 }}>توجه إلى غرفة الانتظار</p>
          </>
        )}
        {state === 'error' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>❌</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--rose)', margin: '0 0 8px' }}>تعذر التسجيل</h2>
            <p style={{ fontSize: 14, color: 'var(--text2)', margin: 0 }}>{message}</p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update router**

Replace the content of `apps/web/src/router/index.jsx` with:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import AppLayout from '../components/layout/AppLayout';
import DoctorLayout from '../components/layout/DoctorLayout';
import SecretaryLayout from '../layouts/SecretaryLayout';

import LoginPage          from '../pages/auth/LoginPage';
import RegisterPage       from '../pages/auth/RegisterPage';
import AcceptInvitePage   from '../pages/auth/AcceptInvitePage';
import CheckinPage        from '../pages/CheckinPage';
import TodayPage          from '../pages/doctor/TodayPage';
import DashboardPage      from '../pages/doctor/DashboardPage';
import AppointmentsPage   from '../pages/doctor/AppointmentsPage';
import PatientRecordsPage  from '../pages/doctor/PatientRecordsPage';
import PatientDetailPage   from '../pages/doctor/PatientDetailPage';
import PrescriptionsPage  from '../pages/doctor/PrescriptionsPage';
import LabResultsPage     from '../pages/doctor/LabResultsPage';
import DoctorSettingsPage from '../pages/doctor/DoctorSettingsPage';
import ComingSoonPage     from '../pages/doctor/ComingSoonPage';
import InvoicesPage       from '../pages/doctor/InvoicesPage';
import ServicesPage      from '../pages/doctor/ServicesPage';
import WaitingRoomPage   from '../pages/doctor/WaitingRoomPage';
import FindDoctorPage     from '../pages/patient/FindDoctorPage';
import DoctorProfilePage  from '../pages/patient/DoctorProfilePage';
import BookAppointmentPage from '../pages/patient/BookAppointmentPage';
import BookConfirmedPage  from '../pages/patient/BookConfirmedPage';
import MyAppointmentsPage from '../pages/patient/MyAppointmentsPage';
import MedicalRecordsPage from '../pages/patient/MedicalRecordsPage';
import PatientSettingsPage from '../pages/patient/PatientSettingsPage';
import ReviewsPage        from '../pages/doctor/ReviewsPage';
import ReportsPage        from '../pages/doctor/ReportsPage';
import LabDashboardPage      from '../pages/lab/LabDashboardPage';
import PharmacyDashboardPage from '../pages/pharmacy/PharmacyDashboardPage';
import ShareViewerPage         from '../pages/public/ShareViewerPage';
import RxVerifyPage            from '../pages/public/RxVerifyPage';
import DoctorPublicProfilePage from '../pages/public/DoctorPublicProfilePage';
import DownloadPage            from '../pages/public/DownloadPage';
import ChatPage           from '../pages/shared/ChatPage';
import VideoCallPage      from '../pages/shared/VideoCallPage';
import AdminLoginPage from '../pages/admin/AdminLoginPage';
import AdminPage      from '../pages/admin/AdminPage';
import SecretaryTodayPage   from '../pages/secretary/SecretaryTodayPage';

function Protected({ children, role }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function DoctorProtected({ children }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'doctor') return <Navigate to="/" replace />;
  return <DoctorLayout>{children}</DoctorLayout>;
}

function SecretaryProtected({ children }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'secretary') return <Navigate to="/" replace />;
  return <SecretaryLayout>{children}</SecretaryLayout>;
}

export default function AppRouter() {
  const { user } = useAuthStore();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"          element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/register"       element={user ? <Navigate to="/" /> : <RegisterPage />} />
        <Route path="/accept-invite"  element={<AcceptInvitePage />} />
        <Route path="/checkin"        element={<CheckinPage />} />

        {/* Doctor routes */}
        <Route path="/today"         element={<DoctorProtected><TodayPage /></DoctorProtected>} />
        <Route path="/dashboard"     element={<Navigate to="/today" replace />} />
        <Route path="/appointments"  element={<DoctorProtected><AppointmentsPage /></DoctorProtected>} />
        <Route path="/appointments/:id" element={<DoctorProtected><AppointmentsPage /></DoctorProtected>} />
        <Route path="/appointments/:id/video" element={<DoctorProtected><VideoCallPage /></DoctorProtected>} />
        <Route path="/appointments/:id/chat"  element={<DoctorProtected><ChatPage /></DoctorProtected>} />
        <Route path="/patients"         element={<DoctorProtected><PatientRecordsPage /></DoctorProtected>} />
        <Route path="/patients/:userId" element={<DoctorProtected><PatientDetailPage /></DoctorProtected>} />
        <Route path="/prescriptions"    element={<DoctorProtected><PrescriptionsPage /></DoctorProtected>} />
        <Route path="/lab-results"      element={<DoctorProtected><LabResultsPage /></DoctorProtected>} />
        <Route path="/settings"         element={<DoctorProtected><DoctorSettingsPage /></DoctorProtected>} />
        <Route path="/reviews"          element={<DoctorProtected><ReviewsPage /></DoctorProtected>} />
        <Route path="/lab-board"        element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
        <Route path="/waiting-room"     element={<DoctorProtected><WaitingRoomPage /></DoctorProtected>} />
        <Route path="/services"         element={<DoctorProtected><ServicesPage /></DoctorProtected>} />
        <Route path="/invoices"         element={<DoctorProtected><InvoicesPage /></DoctorProtected>} />
        <Route path="/reports"          element={<DoctorProtected><ReportsPage /></DoctorProtected>} />
        <Route path="/staff"            element={<DoctorProtected><DoctorSettingsPage initialTab="staff" /></DoctorProtected>} />
        <Route path="/clinic"           element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
        <Route path="/schedule"         element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
        <Route path="/feedback"         element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
        <Route path="/help"             element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />

        {/* Secretary routes */}
        <Route path="/secretary/waiting-room" element={<SecretaryProtected><WaitingRoomPage /></SecretaryProtected>} />
        <Route path="/secretary/today"        element={<SecretaryProtected><SecretaryTodayPage /></SecretaryProtected>} />
        <Route path="/secretary/invoices"     element={<SecretaryProtected><InvoicesPage /></SecretaryProtected>} />

        {/* Patient routes */}
        <Route path="/find-doctor"     element={<Protected role="patient"><FindDoctorPage /></Protected>} />
        <Route path="/doctor/:id"      element={<Protected role="patient"><DoctorProfilePage /></Protected>} />
        <Route path="/book/:doctorId"  element={<Protected role="patient"><BookAppointmentPage /></Protected>} />
        <Route path="/book/confirmed"  element={<Protected role="patient"><BookConfirmedPage /></Protected>} />
        <Route path="/my-appointments" element={<Protected role="patient"><MyAppointmentsPage /></Protected>} />
        <Route path="/records"         element={<Protected role="patient"><MedicalRecordsPage /></Protected>} />
        <Route path="/my-appointments/:id/video" element={<Protected role="patient"><VideoCallPage /></Protected>} />
        <Route path="/my-appointments/:id/chat" element={<Protected role="patient"><ChatPage /></Protected>} />
        <Route path="/patient-settings" element={<Protected role="patient"><PatientSettingsPage /></Protected>} />

        {/* Lab routes */}
        <Route path="/lab" element={<Protected role="laboratory"><LabDashboardPage /></Protected>} />

        {/* Pharmacy routes */}
        <Route path="/pharmacy" element={<Protected role="pharmacy"><PharmacyDashboardPage /></Protected>} />

        {/* Public */}
        <Route path="/dr/:id"    element={<DoctorPublicProfilePage />} />
        <Route path="/s/:token"  element={<ShareViewerPage />} />
        <Route path="/rx/:token" element={<RxVerifyPage />} />
        <Route path="/download"  element={<DownloadPage />} />

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminPage />} />

        {/* Root redirect */}
        <Route path="/" element={
          !user ? <Navigate to="/login" /> :
          user.role === 'doctor'     ? <Navigate to="/today" /> :
          user.role === 'secretary'  ? <Navigate to="/secretary/waiting-room" /> :
          user.role === 'laboratory' ? <Navigate to="/lab" /> :
          user.role === 'pharmacy'   ? <Navigate to="/pharmacy" /> :
          <Navigate to="/find-doctor" />
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/layouts/SecretaryLayout.jsx \
        apps/web/src/pages/auth/AcceptInvitePage.jsx \
        apps/web/src/pages/CheckinPage.jsx \
        apps/web/src/router/index.jsx
git commit -m "feat(web): add SecretaryLayout, route guards, accept-invite and checkin pages"
```

---

### Task 7: QR Modal + Doctor Waiting Room Page

**Files:**
- Create: `apps/web/src/components/doctor/QRModal.jsx`
- Create: `apps/web/src/pages/doctor/WaitingRoomPage.jsx`
- Create: `apps/web/src/api/waitingRoom.js`
- Modify: `apps/web/src/pages/doctor/TodayPage.jsx`

**Interfaces:**
- Produces: `QRModal({ appt, onClose })` — renders QR code for `appt.qrToken`, uses `qrcode` library
- Produces: `WaitingRoomPage` — shared page used by both `/waiting-room` (doctor) and `/secretary/waiting-room`
- Produces: `getWaitingRoom()` → `{ queue: [...] }`, `callPatient(id)` → `{ appointment }`

- [ ] **Step 1: Create waitingRoom API client**

Create `apps/web/src/api/waitingRoom.js`:

```js
import client from './client';

export const getWaitingRoom  = ()   => client.get('/waiting-room').then(r => r.data);
export const callPatient     = (id) => client.patch(`/waiting-room/${id}/call`).then(r => r.data);
```

- [ ] **Step 2: Create QRModal component**

Create `apps/web/src/components/doctor/QRModal.jsx`:

```jsx
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QRModal({ appt, onClose }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    const url = `${window.location.origin}/checkin?token=${appt.qrToken}`;
    QRCode.toDataURL(url, { width: 220, margin: 2 })
      .then(setDataUrl)
      .catch(console.error);
  }, [appt.qrToken]);

  const url = `${window.location.origin}/checkin?token=${appt.qrToken}`;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 1000 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 320, width: '90%', textAlign: 'center' }}
        dir="rtl"
      >
        <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>رمز الحضور</p>
        <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>
          {appt.patientId?.name || 'المريض'} — {appt.timeSlot?.start}
        </p>
        {dataUrl && <img src={dataUrl} alt="QR check-in" style={{ width: 220, height: 220, display: 'block', margin: '0 auto 16px' }} />}
        <p style={{ fontSize: 11, color: 'var(--text3)', wordBreak: 'break-all', margin: '0 0 16px', direction: 'ltr' }}>{url}</p>
        <button
          onClick={onClose}
          style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13 }}
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create WaitingRoomPage**

Create `apps/web/src/pages/doctor/WaitingRoomPage.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { getWaitingRoom, callPatient } from '../../api/waitingRoom';

const VISIT_LABELS = {
  initial:     'كشف أولي',
  'follow-up': 'متابعة',
  'check-up':  'فحص دوري',
  urgent:      'طارئ',
};

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

export default function WaitingRoomPage() {
  const [queue,   setQueue]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [calling, setCalling] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getWaitingRoom()
      .then(d => setQueue(d.queue || []))
      .catch(() => setError('تعذر تحميل القائمة'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleCall = async (id) => {
    if (calling) return;
    setCalling(id);
    try {
      const { appointment } = await callPatient(id);
      setQueue(prev => prev.map(a => a._id === id ? { ...a, status: appointment.status } : a));
    } catch {
      setError('تعذر تحديث الحالة');
    } finally {
      setCalling(null);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>غرفة الانتظار</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>المرضى الذين سجلوا حضورهم</p>
        </div>
        <button onClick={load} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text2)' }}>
          تحديث
        </button>
      </div>

      {error && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>جاري التحميل...</p>}

      {!loading && queue.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)', fontSize: 14 }}>
          لا يوجد مرضى في قائمة الانتظار حالياً
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {queue.map((item, i) => (
          <div key={item._id} style={{
            background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
            opacity: item.status === 'in_progress' ? 0.6 : 1,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{item.patientName}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                {item.appointmentTime} · {VISIT_LABELS[item.visitType] || item.visitType} · وصل {fmtTime(item.checkedInAt)}
              </div>
            </div>
            {item.status !== 'in_progress' && (
              <button
                onClick={() => handleCall(item._id)}
                disabled={!!calling}
                style={{
                  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: calling ? 'not-allowed' : 'pointer',
                  opacity: calling === item._id ? 0.7 : 1,
                }}
              >
                {calling === item._id ? '...' : 'استدعاء'}
              </button>
            )}
            {item.status === 'in_progress' && (
              <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>جارٍ الكشف</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add QR button to TodayPage appointment cards**

In `apps/web/src/pages/doctor/TodayPage.jsx`:

At the top, add imports:
```jsx
import { useState } from 'react'; // already imported — add QrCode to lucide imports
import { QrCode } from 'lucide-react'; // add to existing lucide import line
import QRModal from '../../components/doctor/QRModal';
```

The existing lucide import line is:
```jsx
import { Bell, Search, Eye, X, Check, UserPlus, Calendar } from 'lucide-react';
```
Replace with:
```jsx
import { Bell, Search, Eye, X, Check, UserPlus, Calendar, QrCode } from 'lucide-react';
```

In `TodayPage` function, add state:
```jsx
const [qrAppt, setQrAppt] = useState(null);
```

In `AppointmentCard` component, add a `onShowQR` prop and a QR action button. Replace the component signature:
```jsx
function AppointmentCard({ appt, index, isCurrent, onStatusChange, onShowQR }) {
```

In the `ActionBtn` group (the `<div style={{ display: 'flex', gap: 5 ... }}>` block), add the QR button before the close button:
```jsx
{appt.qrToken && <ActionBtn icon={QrCode} title="رمز الحضور" onClick={() => onShowQR(appt)} />}
```

In `TodayPage` return, pass `onShowQR` to each `AppointmentCard`:
```jsx
// In the current.map():
<AppointmentCard key={a._id} appt={a} index={i + 1} isCurrent onStatusChange={updateStatus} onShowQR={setQrAppt} />

// In the upcoming.map():
<AppointmentCard key={a._id} appt={a} index={i + 1} isCurrent={false} onStatusChange={updateStatus} onShowQR={setQrAppt} />
```

At the bottom of the return, before the closing `</div>`, add:
```jsx
{qrAppt && <QRModal appt={qrAppt} onClose={() => setQrAppt(null)} />}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/waitingRoom.js \
        apps/web/src/components/doctor/QRModal.jsx \
        apps/web/src/pages/doctor/WaitingRoomPage.jsx \
        apps/web/src/pages/doctor/TodayPage.jsx
git commit -m "feat(web): add QR modal to today page and doctor waiting room view"
```

---

### Task 8: Secretary Dashboard Pages

**Files:**
- Create: `apps/web/src/pages/secretary/SecretaryTodayPage.jsx`

**Interfaces:**
- Consumes: `getAppointments()` from `../../api/appointments` (already exists)
- Produces: `SecretaryTodayPage` — today's appointment list, read-only medical data, status changes via existing API

- [ ] **Step 1: Create SecretaryTodayPage**

Create `apps/web/src/pages/secretary/SecretaryTodayPage.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { getAppointments } from '../../api/appointments';
import { groupTodayAppointments } from '../../utils/appointmentGroups';
import client from '../../api/client';

const STATUS_BADGE = {
  confirmed:  { label: 'مؤكد',      bg: 'var(--primary)', color: '#fff' },
  scheduled:  { label: 'مجدول',     bg: 'transparent',    color: 'var(--text2)', border: '1px solid var(--border2)' },
  attended:   { label: 'تم الحضور', bg: '#16a34a',        color: '#fff' },
  completed:  { label: 'تم الحضور', bg: '#16a34a',        color: '#fff' },
  in_progress:{ label: 'جارٍ الكشف', bg: 'var(--primary)', color: '#fff' },
  cancelled:  { label: 'ملغى',      bg: 'transparent',    color: 'var(--rose)', border: '1px solid var(--rose)' },
  pending:    { label: 'معلق',      bg: 'transparent',    color: 'var(--text3)', border: '1px solid var(--border)' },
};

const VISIT_LABELS = {
  initial:     'كشف أولي',
  'follow-up': 'متابعة',
  'check-up':  'فحص دوري',
  urgent:      'طارئ',
};

function Badge({ cfg }) {
  if (!cfg) return null;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: cfg.bg, color: cfg.color, border: cfg.border, display: 'inline-block', whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

export default function SecretaryTodayPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error,   setError]             = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAppointments()
      .then(setAppointments)
      .catch(() => setError('تعذّر تحميل المواعيد'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, status) => {
    try {
      await client.patch(`/appointments/${id}/status`, { status });
      setAppointments(prev => prev.map(a => a._id === id ? { ...a, status } : a));
    } catch {
      alert('فشل تحديث الحالة');
    }
  };

  const { current, upcoming } = groupTodayAppointments(appointments);
  const todayCount = current.length + upcoming.length;
  const dateLabel = new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const renderList = (list) => list.map((appt, i) => {
    const badge = STATUS_BADGE[appt.status] || STATUS_BADGE.pending;
    return (
      <div key={appt._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fff', borderBottom: '1px solid var(--border)', borderInlineEnd: '3px solid var(--primary)' }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--bg)', display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--text3)', fontWeight: 600, flexShrink: 0 }}>
          {i + 1}
        </div>
        <div style={{ minWidth: 44, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>{appt.timeSlot?.start}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{appt.timeSlot?.end}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{appt.patientId?.name || 'مريض'}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{VISIT_LABELS[appt.visitType] || appt.visitType}</div>
        </div>
        <Badge cfg={badge} />
        <div style={{ display: 'flex', gap: 6 }}>
          {appt.status === 'pending' && (
            <button onClick={() => updateStatus(appt._id, 'confirmed')} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'var(--mint)', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              تأكيد
            </button>
          )}
          {!['cancelled', 'completed', 'archived'].includes(appt.status) && (
            <button onClick={() => updateStatus(appt._id, 'cancelled')} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'none', color: 'var(--rose)', border: '1px solid var(--rose)', cursor: 'pointer' }}>
              إلغاء
            </button>
          )}
        </div>
      </div>
    );
  });

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>مواعيد اليوم</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 0' }}>{dateLabel}</p>
        </div>
        {todayCount > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 12, background: 'var(--primary)', color: '#fff' }}>{todayCount}</span>
        )}
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>جاري التحميل...</p>}
      {error && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {!loading && todayCount === 0 && <p style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>لا توجد مواعيد اليوم</p>}

      {current.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px 8px', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>🟢 الآن ({current.length})</div>
          {renderList(current)}
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px 8px', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>📅 القادم ({upcoming.length})</div>
          {renderList(upcoming)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/secretary/SecretaryTodayPage.jsx
git commit -m "feat(web): add secretary today page with appointment list and status actions"
```

---

### Task 9: Doctor Settings Staff Tab + API Clients

**Files:**
- Create: `apps/web/src/api/staff.js`
- Modify: `apps/web/src/pages/doctor/DoctorSettingsPage.jsx`

**Interfaces:**
- Consumes: `GET /api/staff`, `POST /api/staff/invite`, `DELETE /api/staff/:userId`
- Produces: `inviteSecretary(email)`, `getStaff()`, `revokeSecretary(userId)`
- Produces: "الموظفون" section in DoctorSettingsPage, accessible via `/staff` route (`initialTab="staff"` prop)

- [ ] **Step 1: Create staff API client**

Create `apps/web/src/api/staff.js`:

```js
import client from './client';

export const getStaff         = ()       => client.get('/staff').then(r => r.data);
export const inviteSecretary  = (email)  => client.post('/staff/invite', { email }).then(r => r.data);
export const revokeSecretary  = (userId) => client.delete(`/staff/${userId}`).then(r => r.data);
```

- [ ] **Step 2: Add Staff section to DoctorSettingsPage**

In `apps/web/src/pages/doctor/DoctorSettingsPage.jsx`:

Add imports at the top:
```jsx
import { getStaff, inviteSecretary, revokeSecretary } from '../../api/staff';
```

Add to the component's props and state. The component signature is currently:
```jsx
export default function DoctorSettingsPage() {
```

Replace with:
```jsx
export default function DoctorSettingsPage({ initialTab }) {
```

Add state for staff section inside the component (before the return):
```jsx
const [staffList,    setStaffList]    = useState([]);
const [staffLoading, setStaffLoading] = useState(false);
const [inviteEmail,  setInviteEmail]  = useState('');
const [inviting,     setInviting]     = useState(false);
const [staffError,   setStaffError]   = useState('');
const [staffSuccess, setStaffSuccess] = useState('');
```

Add a `loadStaff` function and effect:
```jsx
const loadStaff = useCallback(() => {
  setStaffLoading(true);
  getStaff()
    .then(d => setStaffList(d.secretaries || []))
    .catch(() => setStaffError('تعذر تحميل قائمة الموظفين'))
    .finally(() => setStaffLoading(false));
}, []);

useEffect(() => { loadStaff(); }, [loadStaff]);
```

Add `handleInvite` and `handleRevoke`:
```jsx
const handleInvite = async () => {
  if (!inviteEmail.trim()) return;
  setInviting(true); setStaffError(''); setStaffSuccess('');
  try {
    await inviteSecretary(inviteEmail.trim());
    setStaffSuccess('تم إرسال الدعوة');
    setInviteEmail('');
    loadStaff();
  } catch (err) {
    setStaffError(err.response?.data?.message || 'تعذر إرسال الدعوة');
  } finally {
    setInviting(false);
  }
};

const handleRevoke = async (userId) => {
  try {
    await revokeSecretary(userId);
    setStaffList(prev => prev.map(s => s._id === userId ? { ...s, isActive: false } : s));
  } catch {
    setStaffError('تعذر إلغاء الوصول');
  }
};
```

At the **end** of the settings page return (before the final `</div>`), add the staff section. Find the last `</div>` of the page and add before it:

```jsx
{/* Staff / Secretaries section */}
<div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginTop: 24 }}>
  <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>الموظفون</h2>
  <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 16px' }}>أضف سكرتيرة للوصول إلى غرفة الانتظار والمواعيد</p>

  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
    <input
      type="email" placeholder="البريد الإلكتروني"
      value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && handleInvite()}
      style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
    />
    <button
      onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}
      style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: inviting ? 'not-allowed' : 'pointer', opacity: inviting ? 0.7 : 1, whiteSpace: 'nowrap' }}
    >
      {inviting ? '...' : 'دعوة'}
    </button>
  </div>

  {staffError   && <p style={{ fontSize: 13, color: 'var(--rose)',  marginBottom: 8 }}>{staffError}</p>}
  {staffSuccess && <p style={{ fontSize: 13, color: '#16a34a',      marginBottom: 8 }}>{staffSuccess}</p>}

  {staffLoading && <p style={{ fontSize: 13, color: 'var(--text3)' }}>جاري التحميل...</p>}

  {staffList.length === 0 && !staffLoading && (
    <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '16px 0' }}>لا يوجد موظفون — أرسل دعوة أعلاه</p>
  )}

  <div style={{ display: 'grid', gap: 8 }}>
    {staffList.map(s => (
      <div key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.name || s.email}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{s.email}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: s.isActive ? '#dcfce7' : 'var(--bg3)', color: s.isActive ? '#16a34a' : 'var(--text3)' }}>
          {s.isActive ? 'نشط' : 'معلق'}
        </span>
        {s.isActive && (
          <button
            onClick={() => handleRevoke(s._id)}
            style={{ fontSize: 12, color: 'var(--rose)', background: 'none', border: '1px solid var(--rose)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
          >
            إلغاء
          </button>
        )}
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Verify DoctorSettingsPage imports use useCallback if not already**

Check the top of `DoctorSettingsPage.jsx`. If `useCallback` and `useEffect` are not already imported from `'react'`, add them:
```jsx
import { useState, useEffect, useCallback } from 'react';
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/staff.js \
        apps/web/src/pages/doctor/DoctorSettingsPage.jsx
git commit -m "feat(web): add staff management tab to doctor settings and staff API client"
```

---

## Self-Review

**Spec Coverage Check:**

| Spec Requirement | Task |
|-----------------|------|
| `secretary` role + `linkedDoctorId` on User | Task 1 |
| `qrToken` + `checkedInAt` on Appointment | Task 1 |
| Secretary JWT includes `linkedDoctorId` | Task 2 |
| `requireDoctorOrSecretary` middleware | Task 2 |
| Revoked secretary blocked on every request | Task 2 |
| POST /api/staff/invite + email | Task 3 |
| GET /api/staff, DELETE /api/staff/:userId | Task 3 |
| POST /api/auth/accept-invite | Task 3 |
| POST /api/appointments/checkin (public) | Task 4 |
| qrToken at appointment creation | Task 4 |
| GET /api/waiting-room | Task 5 |
| PATCH /api/waiting-room/:id/call | Task 5 |
| Secretary invoice access | Task 5 |
| SecretaryLayout + SecretaryProtected | Task 6 |
| AcceptInvitePage | Task 6 |
| CheckinPage | Task 6 |
| Root redirect for secretary | Task 6 |
| /waiting-room not ComingSoonPage | Task 6+7 |
| WaitingRoomPage (shared) | Task 7 |
| QRModal in TodayPage | Task 7 |
| SecretaryTodayPage | Task 8 |
| Doctor Settings staff tab | Task 9 |
| staff API client | Task 9 |

All spec requirements covered. No TBDs. Type/method signatures consistent across tasks.
