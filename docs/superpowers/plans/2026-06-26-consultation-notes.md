# Consultation Notes & Patient History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full appointment lifecycle with doctor consultation notes (private/shared), read-receipt tracking, and patient push notifications.

**Architecture:** Separate Mongoose collections for Appointment, ConsultationNote, ReadEvent, and Notification. Express routes enforce role-based ownership server-side. FCM push via `fcmToken` stored on User. Mobile: role-specific screens for doctor (notes editor, appointment detail) and patient (consultation summary, notifications).

**Tech Stack:** Node.js 20, Express 4, Mongoose 8, Firebase Admin SDK (FCM), React Native (Expo), axios

## Global Constraints

- All ownership checks are server-side — never trust IDs from request body for authorization
- Patients must never receive `visibility: private` notes — filter at query level, not presentation
- `ReadEvent` is upserted — one record per doctor per appointment (prevent notification spam)
- `validated` status is terminal — no note edits/deletes after validation
- Push via FCM (`fcmToken` on User model); if FCM fails, notification DB record still saves
- Node.js path: `apps/api/`; mobile path: `apps/mobile/`
- Use `require` (CommonJS) in API; ES module imports in mobile (Expo default)

---

## File Map

### API — new files
```
apps/api/package.json
apps/api/index.js
apps/api/src/models/User.js
apps/api/src/models/Doctor.js
apps/api/src/models/Patient.js
apps/api/src/models/Appointment.js
apps/api/src/models/ConsultationNote.js
apps/api/src/models/ReadEvent.js
apps/api/src/models/Notification.js
apps/api/src/middleware/auth.js
apps/api/src/utils/jwt.js
apps/api/src/utils/push.js
apps/api/src/routes/appointments.js
apps/api/src/routes/notes.js
apps/api/src/routes/notifications.js
```

### API — modify
```
apps/api/src/routes/auth.js     (already exists — no changes needed)
```

### Mobile — new files
```
apps/mobile/src/api/appointments.js
apps/mobile/src/api/notifications.js
apps/mobile/src/constants/colors.js
apps/mobile/src/screens/doctor/AppointmentsScreen.js
apps/mobile/src/screens/doctor/AppointmentDetailScreen.js
apps/mobile/src/screens/doctor/NoteEditorScreen.js
apps/mobile/src/screens/patient/AppointmentsScreen.js
apps/mobile/src/screens/patient/ConsultationSummaryScreen.js
apps/mobile/src/screens/shared/NotificationsScreen.js
```

---

## Task 1: API project bootstrap + base models

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/index.js`
- Create: `apps/api/src/models/User.js`
- Create: `apps/api/src/models/Doctor.js`
- Create: `apps/api/src/models/Patient.js`
- Create: `apps/api/src/middleware/auth.js`
- Create: `apps/api/src/utils/jwt.js`

**Interfaces:**
- Produces: `User` model with fields `name, email, password, role, googleId, fcmToken, location`; `auth` middleware populating `req.user = { id, role }`; `sign(payload)` / `verify(token)` JWT utils

- [ ] **Step 1: Install API dependencies**

```bash
cd apps/api && npm init -y && npm install express mongoose bcryptjs jsonwebtoken express-validator firebase-admin dotenv cors && npm install --save-dev jest supertest
```

Expected: `node_modules/` created, `package.json` updated.

- [ ] **Step 2: Add test script to package.json**

Edit `apps/api/package.json` — add under `"scripts"`:
```json
{
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "test": "jest --runInBand"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/__tests__/**/*.test.js"]
  }
}
```

- [ ] **Step 3: Create JWT util**

Create `apps/api/src/utils/jwt.js`:
```js
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'change_me_in_production';

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

function verify(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { sign, verify };
```

- [ ] **Step 4: Create auth middleware**

Create `apps/api/src/middleware/auth.js`:
```js
const { verify } = require('../utils/jwt');

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing token' });
  }
  try {
    req.user = verify(header.slice(7));
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
```

- [ ] **Step 5: Create User model**

Create `apps/api/src/models/User.js`:
```js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false },
  role:     { type: String, enum: ['doctor', 'patient', 'laboratory'], required: true },
  googleId: { type: String },
  fcmToken: { type: String },
  location: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] },
  },
}, { timestamps: true });

userSchema.index({ location: '2dsphere' });

userSchema.pre('save', async function () {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
```

- [ ] **Step 6: Create Doctor model**

Create `apps/api/src/models/Doctor.js`:
```js
const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialty: { type: String, default: 'General' },
}, { timestamps: true });

module.exports = mongoose.model('Doctor', doctorSchema);
```

- [ ] **Step 7: Create Patient model**

Create `apps/api/src/models/Patient.js`:
```js
const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  dateOfBirth: { type: Date },
  bloodType:   { type: String },
  allergies:   { type: [String], default: [] },
  conditions:  { type: [String], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Patient', patientSchema);
```

- [ ] **Step 8: Write failing test for auth middleware**

Create `apps/api/src/__tests__/auth.middleware.test.js`:
```js
const auth = require('../middleware/auth');

function mockReqRes(headerValue) {
  const req = { headers: { authorization: headerValue } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

test('rejects request with no token', () => {
  const { req, res, next } = mockReqRes(undefined);
  auth(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('rejects invalid token', () => {
  const { req, res, next } = mockReqRes('Bearer invalidtoken');
  auth(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('passes valid token', () => {
  const { sign } = require('../utils/jwt');
  const token = sign({ id: 'abc123', role: 'doctor' });
  const { req, res, next } = mockReqRes(`Bearer ${token}`);
  auth(req, res, next);
  expect(next).toHaveBeenCalled();
  expect(req.user.id).toBe('abc123');
});
```

- [ ] **Step 9: Run test — expect FAIL**

```bash
cd apps/api && npx jest src/__tests__/auth.middleware.test.js --no-coverage
```

Expected: FAIL (module not found or function missing).

- [ ] **Step 10: Run test — expect PASS after implementation**

After steps 3–4 are done, re-run:
```bash
cd apps/api && npx jest src/__tests__/auth.middleware.test.js --no-coverage
```

Expected: 3 tests PASS.

- [ ] **Step 11: Create app entry point**

Create `apps/api/index.js`:
```js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth',          require('./src/routes/auth'));
app.use('/api/appointments',  require('./src/routes/appointments'));
app.use('/api/notifications', require('./src/routes/notifications'));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal error' });
});

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/doctor')
  .then(() => app.listen(PORT, () => console.log(`API running on :${PORT}`)))
  .catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 12: Commit**

```bash
git add apps/api/package.json apps/api/index.js apps/api/src/models/ apps/api/src/middleware/ apps/api/src/utils/jwt.js apps/api/src/__tests__/auth.middleware.test.js
git commit -m "feat: bootstrap API with base models, auth middleware, JWT utils"
```

---

## Task 2: Feature models (Appointment, ConsultationNote, ReadEvent, Notification)

**Files:**
- Create: `apps/api/src/models/Appointment.js`
- Create: `apps/api/src/models/ConsultationNote.js`
- Create: `apps/api/src/models/ReadEvent.js`
- Create: `apps/api/src/models/Notification.js`

**Interfaces:**
- Produces:
  - `Appointment` — fields `patientId, doctorId, scheduledAt, status, initiatedBy`; status enum `pending|confirmed|in_progress|validated|cancelled`
  - `ConsultationNote` — fields `appointmentId, authorId, content, visibility`; visibility enum `private|shared`
  - `ReadEvent` — fields `appointmentId, doctorId, readAt`; unique index on `(appointmentId, doctorId)`
  - `Notification` — fields `recipientId, type, payload, read`; type enum `appointment_requested|appointment_confirmed|consultation_validated|notes_viewed`

- [ ] **Step 1: Write failing model tests**

Create `apps/api/src/__tests__/models.test.js`:
```js
const mongoose = require('mongoose');

beforeAll(() => mongoose.connect('mongodb://localhost:27017/doctor_test'));
afterAll(() => mongoose.disconnect());
afterEach(() => mongoose.connection.dropDatabase());

test('Appointment rejects invalid status', async () => {
  const Appointment = require('../models/Appointment');
  const appt = new Appointment({
    patientId: new mongoose.Types.ObjectId(),
    doctorId:  new mongoose.Types.ObjectId(),
    scheduledAt: new Date(),
    status: 'invalid_status',
    initiatedBy: 'patient',
  });
  await expect(appt.save()).rejects.toThrow();
});

test('ConsultationNote rejects invalid visibility', async () => {
  const ConsultationNote = require('../models/ConsultationNote');
  const note = new ConsultationNote({
    appointmentId: new mongoose.Types.ObjectId(),
    authorId: new mongoose.Types.ObjectId(),
    content: 'test',
    visibility: 'invisible',
  });
  await expect(note.save()).rejects.toThrow();
});

test('ReadEvent unique index prevents duplicates', async () => {
  const ReadEvent = require('../models/ReadEvent');
  const apptId = new mongoose.Types.ObjectId();
  const docId  = new mongoose.Types.ObjectId();
  await ReadEvent.create({ appointmentId: apptId, doctorId: docId });
  await expect(
    ReadEvent.create({ appointmentId: apptId, doctorId: docId })
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/api && npx jest src/__tests__/models.test.js --no-coverage
```

Expected: FAIL (model files not found).

- [ ] **Step 3: Create Appointment model**

Create `apps/api/src/models/Appointment.js`:
```js
const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scheduledAt: { type: Date, required: true },
  status:      {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'validated', 'cancelled'],
    default: 'pending',
  },
  initiatedBy: { type: String, enum: ['patient', 'doctor'], required: true },
}, { timestamps: true });

appointmentSchema.index({ patientId: 1, scheduledAt: -1 });
appointmentSchema.index({ doctorId: 1, scheduledAt: -1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
```

- [ ] **Step 4: Create ConsultationNote model**

Create `apps/api/src/models/ConsultationNote.js`:
```js
const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  authorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:       { type: String, required: true, maxlength: 5000 },
  visibility:    { type: String, enum: ['private', 'shared'], required: true },
}, { timestamps: true });

noteSchema.index({ appointmentId: 1 });

module.exports = mongoose.model('ConsultationNote', noteSchema);
```

- [ ] **Step 5: Create ReadEvent model**

Create `apps/api/src/models/ReadEvent.js`:
```js
const mongoose = require('mongoose');

const readEventSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  doctorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  readAt:        { type: Date, default: Date.now },
});

readEventSchema.index({ appointmentId: 1, doctorId: 1 }, { unique: true });

module.exports = mongoose.model('ReadEvent', readEventSchema);
```

- [ ] **Step 6: Create Notification model**

Create `apps/api/src/models/Notification.js`:
```js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['appointment_requested', 'appointment_confirmed', 'consultation_validated', 'notes_viewed'],
    required: true,
  },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  read:    { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
```

- [ ] **Step 7: Run tests — expect PASS**

```bash
cd apps/api && npx jest src/__tests__/models.test.js --no-coverage
```

Expected: 3 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/models/Appointment.js apps/api/src/models/ConsultationNote.js apps/api/src/models/ReadEvent.js apps/api/src/models/Notification.js apps/api/src/__tests__/models.test.js
git commit -m "feat: add Appointment, ConsultationNote, ReadEvent, Notification models"
```

---

## Task 3: FCM push utility

**Files:**
- Create: `apps/api/src/utils/push.js`

**Interfaces:**
- Consumes: `FIREBASE_SERVICE_ACCOUNT` env var (JSON string of Firebase service account)
- Produces: `sendPush(fcmToken, title, body, data)` — resolves silently on failure (never throws)

- [ ] **Step 1: Write failing test**

Create `apps/api/src/__tests__/push.test.js`:
```js
test('sendPush resolves without throwing when token is invalid', async () => {
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    type: 'service_account', project_id: 'test',
    private_key_id: 'key', private_key: 'pk',
    client_email: 'test@test.iam.gserviceaccount.com',
    client_id: '1', auth_uri: '', token_uri: '',
  });
  const { sendPush } = require('../utils/push');
  await expect(sendPush('bad_token', 'title', 'body', {})).resolves.not.toThrow();
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/api && npx jest src/__tests__/push.test.js --no-coverage
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create push utility**

Create `apps/api/src/utils/push.js`:
```js
let messaging;

function getMessaging() {
  if (messaging) return messaging;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  messaging = admin.messaging();
  return messaging;
}

async function sendPush(fcmToken, title, body, data = {}) {
  if (!fcmToken || !process.env.FIREBASE_SERVICE_ACCOUNT) return;
  try {
    await getMessaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    });
  } catch (err) {
    console.error('[push] FCM send failed:', err.message);
  }
}

module.exports = { sendPush };
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/api && npx jest src/__tests__/push.test.js --no-coverage
```

Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/utils/push.js apps/api/src/__tests__/push.test.js
git commit -m "feat: add FCM push utility with silent failure handling"
```

---

## Task 4: Appointment routes (CRUD + lifecycle)

**Files:**
- Create: `apps/api/src/routes/appointments.js`

**Interfaces:**
- Consumes: `Appointment` model, `Notification` model, `User` model, `auth` middleware, `sendPush` util
- Produces:
  - `POST /api/appointments` → `{ appointment }`
  - `GET /api/appointments` → `{ appointments: [] }`
  - `GET /api/appointments/:id` → `{ appointment }`
  - `PATCH /api/appointments/:id/confirm` → `{ appointment }`
  - `PATCH /api/appointments/:id/validate` → `{ appointment, summary }`
  - `PATCH /api/appointments/:id/cancel` → `{ appointment }`

- [ ] **Step 1: Write failing route tests**

Create `apps/api/src/__tests__/appointments.routes.test.js`:
```js
const request  = require('supertest');
const mongoose = require('mongoose');
const express  = require('express');
const { sign } = require('../utils/jwt');

let app;
beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/doctor_appt_test');
  app = express();
  app.use(express.json());
  app.use('/api/appointments', require('../routes/appointments'));
});
afterAll(() => mongoose.disconnect());
afterEach(() => mongoose.connection.dropDatabase());

async function createUsers() {
  const User = require('../models/User');
  const doctor  = await User.create({ name: 'Dr Smith', email: 'dr@test.com', role: 'doctor', password: 'pass12345' });
  const patient = await User.create({ name: 'Jane',     email: 'jane@test.com', role: 'patient', password: 'pass12345' });
  return { doctor, patient };
}

test('patient can create appointment', async () => {
  const { doctor, patient } = await createUsers();
  const token = sign({ id: patient._id, role: 'patient' });
  const res = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({ doctorId: doctor._id, scheduledAt: new Date(Date.now() + 86400000) });
  expect(res.status).toBe(201);
  expect(res.body.appointment.status).toBe('pending');
  expect(res.body.appointment.initiatedBy).toBe('patient');
});

test('doctor can confirm pending appointment', async () => {
  const { doctor, patient } = await createUsers();
  const Appointment = require('../models/Appointment');
  const appt = await Appointment.create({
    patientId: patient._id, doctorId: doctor._id,
    scheduledAt: new Date(), initiatedBy: 'patient',
  });
  const token = sign({ id: doctor._id, role: 'doctor' });
  const res = await request(app)
    .patch(`/api/appointments/${appt._id}/confirm`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.appointment.status).toBe('confirmed');
});

test('non-doctor cannot confirm appointment', async () => {
  const { doctor, patient } = await createUsers();
  const Appointment = require('../models/Appointment');
  const appt = await Appointment.create({
    patientId: patient._id, doctorId: doctor._id,
    scheduledAt: new Date(), initiatedBy: 'patient',
  });
  const token = sign({ id: patient._id, role: 'patient' });
  const res = await request(app)
    .patch(`/api/appointments/${appt._id}/confirm`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/api && npx jest src/__tests__/appointments.routes.test.js --no-coverage
```

Expected: FAIL (route module not found).

- [ ] **Step 3: Create appointment routes**

Create `apps/api/src/routes/appointments.js`:
```js
const router       = require('express').Router();
const { body, validationResult } = require('express-validator');
const mongoose     = require('mongoose');
const auth         = require('../middleware/auth');
const Appointment  = require('../models/Appointment');
const Notification = require('../models/Notification');
const User         = require('../models/User');
const { sendPush } = require('../utils/push');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

async function notifyUser(recipientId, type, payload) {
  const notif = await Notification.create({ recipientId, type, payload });
  const user  = await User.findById(recipientId).select('fcmToken');
  if (user?.fcmToken) {
    const titles = {
      appointment_requested:   'New appointment request',
      appointment_confirmed:   'Appointment confirmed',
      consultation_validated:  'Consultation summary ready',
      notes_viewed:            'Doctor reviewed your consultation',
    };
    await sendPush(user.fcmToken, titles[type], payload.message || '', { appointmentId: String(payload.appointmentId) });
  }
  return notif;
}

// POST /api/appointments
router.post('/', auth, [
  body('doctorId').notEmpty().withMessage('doctorId required'),
  body('scheduledAt').isISO8601().withMessage('scheduledAt must be ISO date'),
], validate, async (req, res, next) => {
  try {
    const { doctorId, scheduledAt, patientId: bodyPatientId } = req.body;
    const { id: callerId, role } = req.user;

    let resolvedPatientId, resolvedDoctorId, initiatedBy;

    if (role === 'patient') {
      resolvedPatientId = callerId;
      resolvedDoctorId  = doctorId;
      initiatedBy       = 'patient';
    } else if (role === 'doctor') {
      if (!bodyPatientId) return res.status(422).json({ message: 'patientId required for doctor-initiated appointment' });
      resolvedPatientId = bodyPatientId;
      resolvedDoctorId  = callerId;
      initiatedBy       = 'doctor';
    } else {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const appointment = await Appointment.create({
      patientId: resolvedPatientId,
      doctorId:  resolvedDoctorId,
      scheduledAt,
      initiatedBy,
    });

    const otherPartyId = role === 'patient' ? resolvedDoctorId : resolvedPatientId;
    await notifyUser(otherPartyId, 'appointment_requested', {
      appointmentId: appointment._id,
      message: `New appointment scheduled for ${new Date(scheduledAt).toLocaleDateString()}`,
    });

    res.status(201).json({ appointment });
  } catch (err) { next(err); }
});

// GET /api/appointments
router.get('/', auth, async (req, res, next) => {
  try {
    const { id, role } = req.user;
    const filter = role === 'doctor' ? { doctorId: id } : { patientId: id };
    const appointments = await Appointment.find(filter).sort({ scheduledAt: -1 }).limit(100);
    res.json({ appointments });
  } catch (err) { next(err); }
});

// GET /api/appointments/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Not found' });
    const { id } = req.user;
    if (appt.patientId.toString() !== id && appt.doctorId.toString() !== id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.json({ appointment: appt });
  } catch (err) { next(err); }
});

// PATCH /api/appointments/:id/confirm
router.patch('/:id/confirm', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctors only' });
    const appt = await Appointment.findOne({ _id: req.params.id, doctorId: req.user.id });
    if (!appt) return res.status(404).json({ message: 'Not found' });
    if (appt.status !== 'pending') return res.status(409).json({ message: 'Can only confirm pending appointments' });

    appt.status = 'confirmed';
    await appt.save();

    await notifyUser(appt.patientId, 'appointment_confirmed', {
      appointmentId: appt._id,
      message: 'Your appointment has been confirmed',
    });

    res.json({ appointment: appt });
  } catch (err) { next(err); }
});

// PATCH /api/appointments/:id/validate
router.patch('/:id/validate', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctors only' });

    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, doctorId: req.user.id, status: { $ne: 'validated' } },
      { status: 'validated' },
      { new: true }
    );
    if (!appt) return res.status(404).json({ message: 'Not found or already validated' });

    const ConsultationNote = require('../models/ConsultationNote');
    const sharedNotes = await ConsultationNote.find({ appointmentId: appt._id, visibility: 'shared' }).sort({ createdAt: 1 });
    const summary = sharedNotes.map(n => n.content);

    await notifyUser(appt.patientId, 'consultation_validated', {
      appointmentId: appt._id,
      message: 'Your consultation summary is ready',
      summary,
    });

    res.json({ appointment: appt, summary });
  } catch (err) { next(err); }
});

// PATCH /api/appointments/:id/cancel
router.patch('/:id/cancel', auth, async (req, res, next) => {
  try {
    const { id } = req.user;
    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Not found' });
    if (appt.patientId.toString() !== id && appt.doctorId.toString() !== id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (appt.status === 'validated') return res.status(409).json({ message: 'Cannot cancel a validated appointment' });

    appt.status = 'cancelled';
    await appt.save();
    res.json({ appointment: appt });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/api && npx jest src/__tests__/appointments.routes.test.js --no-coverage
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/appointments.js apps/api/src/__tests__/appointments.routes.test.js
git commit -m "feat: add appointment routes with lifecycle (create/confirm/validate/cancel)"
```

---

## Task 5: Consultation notes routes + read tracking

**Files:**
- Create: `apps/api/src/routes/notes.js`

**Note:** Mount this in `index.js` as `/api/appointments/:apptId/notes` — but Express nested param routing requires a small adjustment (see step 3).

**Interfaces:**
- Consumes: `ConsultationNote`, `ReadEvent`, `Notification`, `Appointment`, `User` models; `auth` middleware; `sendPush`
- Produces:
  - `POST   /api/appointments/:apptId/notes` → `{ note }`
  - `GET    /api/appointments/:apptId/notes` → `{ notes: [] }`
  - `PATCH  /api/appointments/:apptId/notes/:noteId` → `{ note }`
  - `DELETE /api/appointments/:apptId/notes/:noteId` → `204`
  - `POST   /api/appointments/:apptId/read` → `{ readEvent }`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/__tests__/notes.routes.test.js`:
```js
const request  = require('supertest');
const mongoose = require('mongoose');
const express  = require('express');
const { sign } = require('../utils/jwt');

let app;
beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/doctor_notes_test');
  app = express();
  app.use(express.json());
  app.use('/api/appointments', require('../routes/notes'));
});
afterAll(() => mongoose.disconnect());
afterEach(() => mongoose.connection.dropDatabase());

async function seed() {
  const User = require('../models/User');
  const Appointment = require('../models/Appointment');
  const doctor  = await User.create({ name: 'Dr A', email: 'dra@x.com', role: 'doctor', password: 'pass12345' });
  const patient = await User.create({ name: 'Pat B', email: 'pat@x.com', role: 'patient', password: 'pass12345' });
  const appt = await Appointment.create({
    patientId: patient._id, doctorId: doctor._id,
    scheduledAt: new Date(), initiatedBy: 'doctor',
  });
  return { doctor, patient, appt };
}

test('doctor can add a private note', async () => {
  const { doctor, appt } = await seed();
  const token = sign({ id: doctor._id, role: 'doctor' });
  const res = await request(app)
    .post(`/api/appointments/${appt._id}/notes`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content: 'Private observation', visibility: 'private' });
  expect(res.status).toBe(201);
  expect(res.body.note.visibility).toBe('private');
});

test('patient cannot see private notes', async () => {
  const { doctor, patient, appt } = await seed();
  const ConsultationNote = require('../models/ConsultationNote');
  await ConsultationNote.create({ appointmentId: appt._id, authorId: doctor._id, content: 'secret', visibility: 'private' });
  await ConsultationNote.create({ appointmentId: appt._id, authorId: doctor._id, content: 'shared info', visibility: 'shared' });

  const token = sign({ id: patient._id, role: 'patient' });
  const res = await request(app)
    .get(`/api/appointments/${appt._id}/notes`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.notes).toHaveLength(1);
  expect(res.body.notes[0].content).toBe('shared info');
});

test('doctor read triggers ReadEvent', async () => {
  const { doctor, appt } = await seed();
  const token = sign({ id: doctor._id, role: 'doctor' });
  const res = await request(app)
    .post(`/api/appointments/${appt._id}/read`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  const ReadEvent = require('../models/ReadEvent');
  const event = await ReadEvent.findOne({ appointmentId: appt._id, doctorId: doctor._id });
  expect(event).not.toBeNull();
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/api && npx jest src/__tests__/notes.routes.test.js --no-coverage
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create notes routes**

Create `apps/api/src/routes/notes.js`:
```js
const router           = require('express').Router({ mergeParams: true });
const { body, validationResult } = require('express-validator');
const mongoose         = require('mongoose');
const auth             = require('../middleware/auth');
const Appointment      = require('../models/Appointment');
const ConsultationNote = require('../models/ConsultationNote');
const ReadEvent        = require('../models/ReadEvent');
const Notification     = require('../models/Notification');
const User             = require('../models/User');
const { sendPush }     = require('../utils/push');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

async function getAppointmentForDoctor(apptId, doctorId) {
  if (!mongoose.isValidObjectId(apptId)) return null;
  return Appointment.findOne({ _id: apptId, doctorId });
}

async function getAppointmentForParty(apptId, userId) {
  if (!mongoose.isValidObjectId(apptId)) return null;
  return Appointment.findOne({ _id: apptId, $or: [{ doctorId: userId }, { patientId: userId }] });
}

// POST /api/appointments/:apptId/notes
router.post('/:apptId/notes', auth, [
  body('content').notEmpty().isLength({ max: 5000 }),
  body('visibility').isIn(['private', 'shared']),
], validate, async (req, res, next) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctors only' });
    const appt = await getAppointmentForDoctor(req.params.apptId, req.user.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (appt.status === 'validated') return res.status(409).json({ message: 'Cannot add notes to a validated appointment' });

    const note = await ConsultationNote.create({
      appointmentId: appt._id,
      authorId: req.user.id,
      content: req.body.content,
      visibility: req.body.visibility,
    });
    res.status(201).json({ note });
  } catch (err) { next(err); }
});

// GET /api/appointments/:apptId/notes
router.get('/:apptId/notes', auth, async (req, res, next) => {
  try {
    const appt = await getAppointmentForParty(req.params.apptId, req.user.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });

    const filter = { appointmentId: appt._id };
    if (req.user.role === 'patient') filter.visibility = 'shared';

    const notes = await ConsultationNote.find(filter).sort({ createdAt: 1 });
    res.json({ notes });
  } catch (err) { next(err); }
});

// PATCH /api/appointments/:apptId/notes/:noteId
router.patch('/:apptId/notes/:noteId', auth, [
  body('content').optional().notEmpty().isLength({ max: 5000 }),
  body('visibility').optional().isIn(['private', 'shared']),
], validate, async (req, res, next) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctors only' });
    const appt = await getAppointmentForDoctor(req.params.apptId, req.user.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (appt.status === 'validated') return res.status(409).json({ message: 'Cannot edit notes on a validated appointment' });

    const note = await ConsultationNote.findOneAndUpdate(
      { _id: req.params.noteId, appointmentId: appt._id },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!note) return res.status(404).json({ message: 'Note not found' });
    res.json({ note });
  } catch (err) { next(err); }
});

// DELETE /api/appointments/:apptId/notes/:noteId
router.delete('/:apptId/notes/:noteId', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctors only' });
    const appt = await getAppointmentForDoctor(req.params.apptId, req.user.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (appt.status === 'validated') return res.status(409).json({ message: 'Cannot delete notes on a validated appointment' });

    const note = await ConsultationNote.findOneAndDelete({ _id: req.params.noteId, appointmentId: appt._id });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/appointments/:apptId/read
router.post('/:apptId/read', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctors only' });
    const appt = await getAppointmentForDoctor(req.params.apptId, req.user.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });

    const readEvent = await ReadEvent.findOneAndUpdate(
      { appointmentId: appt._id, doctorId: req.user.id },
      { readAt: new Date() },
      { upsert: true, new: true }
    );

    // Notify patient only on first read (upserted)
    if (readEvent.__v === undefined) {
      const doctorUser = await User.findById(req.user.id).select('name');
      const patient    = await User.findById(appt.patientId).select('fcmToken');
      const notif = await Notification.create({
        recipientId: appt.patientId,
        type: 'notes_viewed',
        payload: { appointmentId: appt._id, message: `Dr. ${doctorUser?.name || ''} reviewed your consultation` },
      });
      if (patient?.fcmToken) {
        await sendPush(
          patient.fcmToken,
          'Consultation reviewed',
          `Dr. ${doctorUser?.name || ''} reviewed your consultation`,
          { appointmentId: String(appt._id) }
        );
      }
    }

    res.json({ readEvent });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Mount notes router in index.js**

Edit `apps/api/index.js` — add this line after the appointments route line:
```js
app.use('/api/appointments', require('./src/routes/notes'));
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/api && npx jest src/__tests__/notes.routes.test.js --no-coverage
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/notes.js apps/api/src/__tests__/notes.routes.test.js apps/api/index.js
git commit -m "feat: add consultation notes routes with visibility enforcement and read tracking"
```

---

## Task 6: Notifications routes

**Files:**
- Create: `apps/api/src/routes/notifications.js`

**Interfaces:**
- Produces:
  - `GET /api/notifications` → `{ notifications: [], unreadCount: number }`
  - `PATCH /api/notifications/:id/read` → `{ notification }`
  - `PATCH /api/notifications/read-all` → `{ modifiedCount }`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/__tests__/notifications.routes.test.js`:
```js
const request  = require('supertest');
const mongoose = require('mongoose');
const express  = require('express');
const { sign } = require('../utils/jwt');

let app;
beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/doctor_notif_test');
  app = express();
  app.use(express.json());
  app.use('/api/notifications', require('../routes/notifications'));
});
afterAll(() => mongoose.disconnect());
afterEach(() => mongoose.connection.dropDatabase());

test('returns only own notifications', async () => {
  const Notification = require('../models/Notification');
  const User = require('../models/User');
  const userA = await User.create({ name: 'A', email: 'a@x.com', role: 'patient', password: 'pass12345' });
  const userB = await User.create({ name: 'B', email: 'b@x.com', role: 'patient', password: 'pass12345' });
  await Notification.create({ recipientId: userA._id, type: 'appointment_confirmed', payload: {} });
  await Notification.create({ recipientId: userB._id, type: 'appointment_confirmed', payload: {} });

  const token = sign({ id: userA._id, role: 'patient' });
  const res = await request(app)
    .get('/api/notifications')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.notifications).toHaveLength(1);
});

test('mark all read updates unreadCount to 0', async () => {
  const Notification = require('../models/Notification');
  const User = require('../models/User');
  const user = await User.create({ name: 'C', email: 'c@x.com', role: 'patient', password: 'pass12345' });
  await Notification.insertMany([
    { recipientId: user._id, type: 'appointment_confirmed', payload: {} },
    { recipientId: user._id, type: 'notes_viewed', payload: {} },
  ]);
  const token = sign({ id: user._id, role: 'patient' });
  await request(app).patch('/api/notifications/read-all').set('Authorization', `Bearer ${token}`);
  const res = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
  expect(res.body.unreadCount).toBe(0);
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/api && npx jest src/__tests__/notifications.routes.test.js --no-coverage
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create notifications routes**

Create `apps/api/src/routes/notifications.js`:
```js
const router       = require('express').Router();
const mongoose     = require('mongoose');
const auth         = require('../middleware/auth');
const Notification = require('../models/Notification');

// GET /api/notifications
router.get('/', auth, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ recipientId: req.user.id })
      .sort({ createdAt: -1 }).limit(50);
    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ notifications, unreadCount });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/read-all  — must be before /:id route
router.patch('/read-all', auth, async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { recipientId: req.user.id, read: false },
      { read: true }
    );
    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', auth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Not found' });
    res.json({ notification });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/api && npx jest src/__tests__/notifications.routes.test.js --no-coverage
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/notifications.js apps/api/src/__tests__/notifications.routes.test.js
git commit -m "feat: add notifications routes (list, mark-read, mark-all-read)"
```

---

## Task 7: Mobile API modules + constants

**Files:**
- Create: `apps/mobile/src/constants/colors.js`
- Create: `apps/mobile/src/api/client.js`
- Create: `apps/mobile/src/api/appointments.js`
- Create: `apps/mobile/src/api/notifications.js`

**Interfaces:**
- Consumes: `AsyncStorage` for token, `API_BASE_URL` env var
- Produces:
  - `appointments.js` — `createAppointment(data)`, `listAppointments()`, `getAppointment(id)`, `confirmAppointment(id)`, `validateAppointment(id)`, `cancelAppointment(id)`, `addNote(apptId, data)`, `getNotes(apptId)`, `updateNote(apptId, noteId, data)`, `deleteNote(apptId, noteId)`, `markRead(apptId)`
  - `notifications.js` — `listNotifications()`, `markNotificationRead(id)`, `markAllRead()`

- [ ] **Step 1: Install mobile dependencies**

```bash
cd apps/mobile && npm install axios @react-native-async-storage/async-storage
```

- [ ] **Step 2: Create colors constants**

Create `apps/mobile/src/constants/colors.js`:
```js
const C = {
  bg:       '#0D1117',
  card:     '#161B22',
  border:   '#30363D',
  mint:     '#3FB950',
  blue:     '#58A6FF',
  red:      '#F85149',
  yellow:   '#D29922',
  textPrimary:   '#E6EDF3',
  textSecondary: '#8B949E',
  white:    '#FFFFFF',
};

export default C;
```

- [ ] **Step 3: Create API client**

Create `apps/mobile/src/api/client.js`:
```js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const client = axios.create({ baseURL: BASE });

client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;
```

- [ ] **Step 4: Create appointments API module**

Create `apps/mobile/src/api/appointments.js`:
```js
import client from './client';

export const createAppointment  = (data)                   => client.post('/api/appointments', data).then(r => r.data);
export const listAppointments   = ()                        => client.get('/api/appointments').then(r => r.data);
export const getAppointment     = (id)                      => client.get(`/api/appointments/${id}`).then(r => r.data);
export const confirmAppointment = (id)                      => client.patch(`/api/appointments/${id}/confirm`).then(r => r.data);
export const validateAppointment= (id)                      => client.patch(`/api/appointments/${id}/validate`).then(r => r.data);
export const cancelAppointment  = (id)                      => client.patch(`/api/appointments/${id}/cancel`).then(r => r.data);
export const addNote            = (apptId, data)            => client.post(`/api/appointments/${apptId}/notes`, data).then(r => r.data);
export const getNotes           = (apptId)                  => client.get(`/api/appointments/${apptId}/notes`).then(r => r.data);
export const updateNote         = (apptId, noteId, data)    => client.patch(`/api/appointments/${apptId}/notes/${noteId}`, data).then(r => r.data);
export const deleteNote         = (apptId, noteId)          => client.delete(`/api/appointments/${apptId}/notes/${noteId}`).then(r => r.data);
export const markRead           = (apptId)                  => client.post(`/api/appointments/${apptId}/read`).then(r => r.data);
```

- [ ] **Step 5: Create notifications API module**

Create `apps/mobile/src/api/notifications.js`:
```js
import client from './client';

export const listNotifications      = ()    => client.get('/api/notifications').then(r => r.data);
export const markNotificationRead   = (id)  => client.patch(`/api/notifications/${id}/read`).then(r => r.data);
export const markAllRead            = ()    => client.patch('/api/notifications/read-all').then(r => r.data);
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/constants/colors.js apps/mobile/src/api/
git commit -m "feat: add mobile API client modules for appointments and notifications"
```

---

## Task 8: Doctor mobile screens

**Files:**
- Create: `apps/mobile/src/screens/doctor/AppointmentsScreen.js`
- Create: `apps/mobile/src/screens/doctor/AppointmentDetailScreen.js`
- Create: `apps/mobile/src/screens/doctor/NoteEditorScreen.js`

**Interfaces:**
- Consumes: `listAppointments`, `getAppointment`, `confirmAppointment`, `validateAppointment`, `getNotes`, `deleteNote`, `markRead` from `../../api/appointments`
- Navigation params: `AppointmentDetailScreen` receives `{ appointmentId: string }`; `NoteEditorScreen` receives `{ appointmentId: string, note?: NoteObject }`

- [ ] **Step 1: Create doctor AppointmentsScreen**

Create `apps/mobile/src/screens/doctor/AppointmentsScreen.js`:
```js
import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { listAppointments } from '../../api/appointments';
import C from '../../constants/colors';

const STATUS_COLOR = {
  pending:    C.yellow,
  confirmed:  C.blue,
  in_progress:C.mint,
  validated:  C.textSecondary,
  cancelled:  C.red,
};

export default function DoctorAppointmentsScreen({ navigation }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    listAppointments()
      .then(d => setAppointments(d.appointments))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []));

  if (loading) return (
    <SafeAreaView style={s.center}>
      <ActivityIndicator color={C.mint} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.title}>My Appointments</Text>
      <FlatList
        data={appointments}
        keyExtractor={item => item._id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            onPress={() => navigation.navigate('AppointmentDetail', { appointmentId: item._id })}
          >
            <View style={s.cardRow}>
              <Text style={s.dateText}>{new Date(item.scheduledAt).toLocaleDateString()}</Text>
              <Text style={[s.status, { color: STATUS_COLOR[item.status] }]}>{item.status}</Text>
            </View>
            <Text style={s.sub}>{new Date(item.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Text style={s.empty}>No appointments</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  title:     { fontSize: 22, fontWeight: '700', color: C.textPrimary, padding: 16 },
  card:      { backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  cardRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText:  { fontSize: 16, fontWeight: '600', color: C.textPrimary },
  status:    { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  sub:       { color: C.textSecondary, fontSize: 13, marginTop: 4 },
  empty:     { color: C.textSecondary, textAlign: 'center', marginTop: 40 },
});
```

- [ ] **Step 2: Create AppointmentDetailScreen**

Create `apps/mobile/src/screens/doctor/AppointmentDetailScreen.js`:
```js
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getAppointment, confirmAppointment, validateAppointment, getNotes, deleteNote, markRead } from '../../api/appointments';
import C from '../../constants/colors';

export default function AppointmentDetailScreen({ route, navigation }) {
  const { appointmentId } = route.params;
  const [appt, setAppt]   = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getAppointment(appointmentId), getNotes(appointmentId)])
      .then(([a, n]) => { setAppt(a.appointment); setNotes(n.notes); })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        markRead(appointmentId).catch(() => {}); // fire-and-forget
      });
  }, [appointmentId]);

  useFocusEffect(load);

  const handleConfirm = () => {
    Alert.alert('Confirm', 'Confirm this appointment?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => confirmAppointment(appointmentId).then(d => setAppt(d.appointment)).catch(() => {}) },
    ]);
  };

  const handleValidate = () => {
    Alert.alert('Validate', 'Finalize consultation? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Validate', style: 'destructive', onPress: () => validateAppointment(appointmentId).then(d => setAppt(d.appointment)).catch(() => {}) },
    ]);
  };

  const handleDeleteNote = (noteId) => {
    Alert.alert('Delete', 'Delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () =>
        deleteNote(appointmentId, noteId)
          .then(() => setNotes(ns => ns.filter(n => n._id !== noteId)))
          .catch(() => {})
      },
    ]);
  };

  if (loading) return (
    <SafeAreaView style={s.center}><ActivityIndicator color={C.mint} /></SafeAreaView>
  );

  const validated = appt?.status === 'validated';

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.title}>Consultation</Text>
        <View style={s.card}>
          <Text style={s.label}>Date</Text>
          <Text style={s.value}>{appt ? new Date(appt.scheduledAt).toLocaleString() : '—'}</Text>
          <Text style={s.label}>Status</Text>
          <Text style={[s.value, { color: validated ? C.textSecondary : C.mint }]}>{appt?.status}</Text>
        </View>

        <Text style={s.sectionTitle}>Notes</Text>
        {notes.map(note => (
          <View key={note._id} style={[s.noteCard, { borderColor: note.visibility === 'private' ? C.yellow : C.mint }]}>
            <Text style={s.noteContent}>{note.content}</Text>
            <View style={s.noteFooter}>
              <Text style={[s.badge, { color: note.visibility === 'private' ? C.yellow : C.mint }]}>{note.visibility}</Text>
              {!validated && (
                <View style={s.noteActions}>
                  <TouchableOpacity onPress={() => navigation.navigate('NoteEditor', { appointmentId, note })}>
                    <Text style={s.editBtn}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteNote(note._id)}>
                    <Text style={s.deleteBtn}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ))}

        {!validated && (
          <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('NoteEditor', { appointmentId })}>
            <Text style={s.addBtnText}>+ Add Note</Text>
          </TouchableOpacity>
        )}

        {appt?.status === 'pending' && (
          <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm}>
            <Text style={s.btnText}>Confirm Appointment</Text>
          </TouchableOpacity>
        )}
        {(appt?.status === 'confirmed' || appt?.status === 'in_progress') && (
          <TouchableOpacity style={s.validateBtn} onPress={handleValidate}>
            <Text style={s.btnText}>Validate Consultation</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  title:        { fontSize: 22, fontWeight: '700', color: C.textPrimary, marginBottom: 16 },
  card:         { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  label:        { fontSize: 12, color: C.textSecondary, marginTop: 8 },
  value:        { fontSize: 16, color: C.textPrimary, fontWeight: '500' },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: C.textPrimary, marginBottom: 10 },
  noteCard:     { backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1 },
  noteContent:  { color: C.textPrimary, fontSize: 15, lineHeight: 22 },
  noteFooter:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  badge:        { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  noteActions:  { flexDirection: 'row', gap: 12 },
  editBtn:      { color: C.blue, fontSize: 13 },
  deleteBtn:    { color: C.red, fontSize: 13 },
  addBtn:       { borderWidth: 1, borderColor: C.mint, borderRadius: 10, padding: 14, alignItems: 'center', marginVertical: 8 },
  addBtnText:   { color: C.mint, fontWeight: '600' },
  confirmBtn:   { backgroundColor: C.blue, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  validateBtn:  { backgroundColor: C.mint, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  btnText:      { color: C.white, fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 3: Create NoteEditorScreen**

Create `apps/mobile/src/screens/doctor/NoteEditorScreen.js`:
```js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addNote, updateNote } from '../../api/appointments';
import C from '../../constants/colors';

export default function NoteEditorScreen({ route, navigation }) {
  const { appointmentId, note } = route.params;
  const [content, setContent]       = useState(note?.content || '');
  const [isShared, setIsShared]     = useState(note?.visibility === 'shared');
  const [saving, setSaving]         = useState(false);

  const handleSave = async () => {
    if (!content.trim()) return Alert.alert('Error', 'Note content is required');
    setSaving(true);
    try {
      const visibility = isShared ? 'shared' : 'private';
      if (note?._id) {
        await updateNote(appointmentId, note._id, { content: content.trim(), visibility });
      } else {
        await addNote(appointmentId, { content: content.trim(), visibility });
      }
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.title}>{note ? 'Edit Note' : 'New Note'}</Text>

      <TextInput
        style={s.input}
        multiline
        numberOfLines={8}
        placeholder="Write your clinical notes here..."
        placeholderTextColor={C.textSecondary}
        value={content}
        onChangeText={setContent}
        maxLength={5000}
      />
      <Text style={s.charCount}>{content.length}/5000</Text>

      <View style={s.visibilityRow}>
        <View>
          <Text style={s.visibilityLabel}>Share with patient</Text>
          <Text style={s.visibilitySub}>{isShared ? 'Patient will see this after validation' : 'Private — only you can see this'}</Text>
        </View>
        <Switch
          value={isShared}
          onValueChange={setIsShared}
          trackColor={{ true: C.mint, false: C.border }}
          thumbColor={C.white}
        />
      </View>

      <TouchableOpacity style={[s.saveBtn, saving && s.disabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveText}>Save Note</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.bg, padding: 16 },
  title:           { fontSize: 22, fontWeight: '700', color: C.textPrimary, marginBottom: 16 },
  input:           { backgroundColor: C.card, borderRadius: 12, padding: 14, color: C.textPrimary, fontSize: 15, minHeight: 160, textAlignVertical: 'top', borderWidth: 1, borderColor: C.border },
  charCount:       { color: C.textSecondary, fontSize: 12, textAlign: 'right', marginTop: 4 },
  visibilityRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 20, backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  visibilityLabel: { color: C.textPrimary, fontWeight: '600', fontSize: 16 },
  visibilitySub:   { color: C.textSecondary, fontSize: 13, marginTop: 2 },
  saveBtn:         { backgroundColor: C.mint, borderRadius: 12, padding: 16, alignItems: 'center' },
  disabled:        { opacity: 0.5 },
  saveText:        { color: C.white, fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/doctor/
git commit -m "feat: add doctor appointment and note editor screens"
```

---

## Task 9: Patient screens + notifications screen

**Files:**
- Create: `apps/mobile/src/screens/patient/AppointmentsScreen.js`
- Create: `apps/mobile/src/screens/patient/ConsultationSummaryScreen.js`
- Create: `apps/mobile/src/screens/shared/NotificationsScreen.js`

**Interfaces:**
- Consumes: `listAppointments`, `getAppointment`, `getNotes` from `../../api/appointments`; `listNotifications`, `markNotificationRead`, `markAllRead` from `../../api/notifications`
- Navigation params: `ConsultationSummaryScreen` receives `{ appointmentId: string }`

- [ ] **Step 1: Create patient AppointmentsScreen**

Create `apps/mobile/src/screens/patient/AppointmentsScreen.js`:
```js
import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { listAppointments } from '../../api/appointments';
import C from '../../constants/colors';

const STATUS_COLOR = {
  pending:    C.yellow,
  confirmed:  C.blue,
  in_progress:C.mint,
  validated:  C.textSecondary,
  cancelled:  C.red,
};

export default function PatientAppointmentsScreen({ navigation }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    listAppointments()
      .then(d => setAppointments(d.appointments))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []));

  if (loading) return (
    <SafeAreaView style={s.center}><ActivityIndicator color={C.mint} /></SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.title}>My Appointments</Text>
      <FlatList
        data={appointments}
        keyExtractor={item => item._id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            onPress={() => item.status === 'validated'
              ? navigation.navigate('ConsultationSummary', { appointmentId: item._id })
              : null
            }
          >
            <View style={s.cardRow}>
              <Text style={s.dateText}>{new Date(item.scheduledAt).toLocaleDateString()}</Text>
              <Text style={[s.status, { color: STATUS_COLOR[item.status] }]}>{item.status}</Text>
            </View>
            <Text style={s.sub}>{new Date(item.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            {item.status === 'validated' && <Text style={s.tapHint}>Tap to view summary →</Text>}
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Text style={s.empty}>No appointments</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  title:     { fontSize: 22, fontWeight: '700', color: C.textPrimary, padding: 16 },
  card:      { backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  cardRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText:  { fontSize: 16, fontWeight: '600', color: C.textPrimary },
  status:    { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  sub:       { color: C.textSecondary, fontSize: 13, marginTop: 4 },
  tapHint:   { color: C.blue, fontSize: 12, marginTop: 6 },
  empty:     { color: C.textSecondary, textAlign: 'center', marginTop: 40 },
});
```

- [ ] **Step 2: Create ConsultationSummaryScreen**

Create `apps/mobile/src/screens/patient/ConsultationSummaryScreen.js`:
```js
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAppointment, getNotes } from '../../api/appointments';
import C from '../../constants/colors';

export default function ConsultationSummaryScreen({ route }) {
  const { appointmentId } = route.params;
  const [appt, setAppt]   = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAppointment(appointmentId), getNotes(appointmentId)])
      .then(([a, n]) => { setAppt(a.appointment); setNotes(n.notes); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [appointmentId]);

  if (loading) return (
    <SafeAreaView style={s.center}><ActivityIndicator color={C.mint} /></SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.title}>Consultation Summary</Text>
        <View style={s.card}>
          <Text style={s.label}>Date</Text>
          <Text style={s.value}>{appt ? new Date(appt.scheduledAt).toLocaleString() : '—'}</Text>
        </View>

        <Text style={s.sectionTitle}>Doctor's Notes</Text>
        {notes.length === 0 ? (
          <Text style={s.empty}>No shared notes for this consultation.</Text>
        ) : (
          notes.map((note, idx) => (
            <View key={note._id} style={s.noteCard}>
              <Text style={s.noteIndex}>Note {idx + 1}</Text>
              <Text style={s.noteContent}>{note.content}</Text>
              <Text style={s.noteDate}>{new Date(note.updatedAt).toLocaleDateString()}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  title:        { fontSize: 22, fontWeight: '700', color: C.textPrimary, marginBottom: 16 },
  card:         { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  label:        { fontSize: 12, color: C.textSecondary, marginTop: 8 },
  value:        { fontSize: 16, color: C.textPrimary, fontWeight: '500' },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: C.textPrimary, marginBottom: 10 },
  noteCard:     { backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  noteIndex:    { fontSize: 12, color: C.textSecondary, marginBottom: 4 },
  noteContent:  { color: C.textPrimary, fontSize: 15, lineHeight: 22 },
  noteDate:     { color: C.textSecondary, fontSize: 12, marginTop: 8, textAlign: 'right' },
  empty:        { color: C.textSecondary, textAlign: 'center', marginTop: 20 },
});
```

- [ ] **Step 3: Create shared NotificationsScreen**

Create `apps/mobile/src/screens/shared/NotificationsScreen.js`:
```js
import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { listNotifications, markNotificationRead, markAllRead } from '../../api/notifications';
import C from '../../constants/colors';

const TYPE_ICON = {
  appointment_requested:  '📅',
  appointment_confirmed:  '✅',
  consultation_validated: '📋',
  notes_viewed:           '👁',
};

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    listNotifications()
      .then(d => { setNotifications(d.notifications); setUnreadCount(d.unreadCount); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  const handleMarkRead = async (id) => {
    await markNotificationRead(id).catch(() => {});
    setNotifications(ns => ns.map(n => n._id === id ? { ...n, read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const handleMarkAll = async () => {
    await markAllRead().catch(() => {});
    setNotifications(ns => ns.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  if (loading) return (
    <SafeAreaView style={s.center}><ActivityIndicator color={C.mint} /></SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Notifications {unreadCount > 0 && <Text style={s.badge}>({unreadCount})</Text>}</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAll}>
            <Text style={s.markAll}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={notifications}
        keyExtractor={item => item._id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.card, !item.read && s.unread]}
            onPress={() => !item.read && handleMarkRead(item._id)}
          >
            <Text style={s.icon}>{TYPE_ICON[item.type] || '🔔'}</Text>
            <View style={s.cardBody}>
              <Text style={s.message}>{item.payload?.message || item.type}</Text>
              <Text style={s.time}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
            {!item.read && <View style={s.dot} />}
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        ListEmptyComponent={<Text style={s.empty}>No notifications</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title:     { fontSize: 22, fontWeight: '700', color: C.textPrimary },
  badge:     { color: C.mint },
  markAll:   { color: C.blue, fontSize: 14 },
  card:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  unread:    { borderColor: C.mint },
  icon:      { fontSize: 22, marginRight: 12 },
  cardBody:  { flex: 1 },
  message:   { color: C.textPrimary, fontSize: 15 },
  time:      { color: C.textSecondary, fontSize: 12, marginTop: 3 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: C.mint },
  empty:     { color: C.textSecondary, textAlign: 'center', marginTop: 40 },
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/patient/ apps/mobile/src/screens/shared/
git commit -m "feat: add patient consultation summary and shared notifications screen"
```

---

## Task 10: Run full test suite + push to GitHub

- [ ] **Step 1: Run all tests**

```bash
cd apps/api && npx jest --no-coverage --runInBand
```

Expected: All test suites PASS.

- [ ] **Step 2: Verify SSH is configured and push**

```bash
ssh -T git@github.com
git push -u origin master
```

If SSH not configured yet, see the SSH setup instructions provided in the conversation.

- [ ] **Step 3: Verify on GitHub**

Visit `https://github.com/ialnezami/doctor` and confirm all files are present.
