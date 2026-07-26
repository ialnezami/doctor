# Phase 2.5 Enhanced Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global push/email notification preferences per user, transactional email via Resend for 4 event types, 30-day auto-delete of old notifications via MongoDB TTL, and 24-hour re-notification cooldown for the notes_viewed event.

**Architecture:** New `notificationPrefs` sub-doc on User controls push/email channels globally. A new `email.js` utility wraps the Resend SDK (mirrors `push.js`). The existing `notifyUser()` helper in appointments.js is extended to check prefs and fire email. Reminder/digest workers get the same channel gate. Notes read handler checks `ReadEvent.readAt` against a 24h window instead of the `!existing` boolean. MongoDB TTL index on `Notification.expireAt` handles cleanup with zero application code.

**Tech Stack:** Node.js/Express, Mongoose, Resend SDK (`resend`), React Native (Expo), React.js

## Global Constraints

- `resend` package installed in `apps/api` only — no mobile/web package changes for email
- Always use `apps/api/src/utils/push.js` `sendPush` for FCM — never import firebase-admin directly
- New `sendEmail` mirrors `push.js`: silent no-op when `RESEND_API_KEY` unset, errors caught and logged, never thrown
- All new API routes use existing `auth` middleware from `../middleware/auth`
- No new MongoDB collections — notifications stay in existing `notifications` collection
- CommonJS only in `apps/api` (require/module.exports)
- `notifyUser()` backward-compatible — existing call sites require no changes
- `RESEND_API_KEY` and `EMAIL_FROM` are server-only env vars

---

### Task 1: Install resend + User model notificationPrefs

**Files:**
- Modify: `apps/api/package.json` (via npm install)
- Modify: `apps/api/src/models/User.js`
- Test: `apps/api/src/models/__tests__/models.test.js` (extend existing file)

**Interfaces:**
- Produces: `User` schema has `notificationPrefs: { pushEnabled: Boolean (default true), emailEnabled: Boolean (default true) }`
- Produces: `resend` importable in `apps/api/src/`

- [ ] **Step 1: Install resend**

```bash
cd apps/api && npm install resend
```

Expected: `added N packages` with no peer-dep errors.

- [ ] **Step 2: Verify installed**

```bash
cd apps/api && node -e "require('resend'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Write failing model test**

In `apps/api/src/models/__tests__/models.test.js`, add:

```js
describe('User model notificationPrefs', () => {
  it('has pushEnabled default true', () => {
    const User = require('../User');
    const prefs = User.schema.paths['notificationPrefs.pushEnabled'];
    expect(prefs.defaultValue).toBe(true);
  });
  it('has emailEnabled default true', () => {
    const User = require('../User');
    const prefs = User.schema.paths['notificationPrefs.emailEnabled'];
    expect(prefs.defaultValue).toBe(true);
  });
});
```

- [ ] **Step 4: Run to confirm failure**

```bash
cd apps/api && npx jest src/models/__tests__/models.test.js --no-coverage
```

Expected: FAIL — `paths['notificationPrefs.pushEnabled']` is undefined.

- [ ] **Step 5: Add notificationPrefs to User model**

In `apps/api/src/models/User.js`, add after `photoUrl`:

```js
  notificationPrefs: {
    pushEnabled:  { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: true },
  },
```

- [ ] **Step 6: Run tests — confirm pass**

```bash
cd apps/api && npx jest src/models/__tests__/models.test.js --no-coverage
```

Expected: PASS (all existing tests + 2 new).

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/models/User.js apps/api/src/models/__tests__/models.test.js
git commit -m "feat(api): add notificationPrefs to User model and install resend"
```

---

### Task 2: Notification TTL (30-day auto-delete)

**Files:**
- Modify: `apps/api/src/models/Notification.js`
- Test: `apps/api/src/models/__tests__/models.test.js` (extend existing file)

**Interfaces:**
- Produces: `Notification` schema has `expireAt: Date` (default 30 days from now)
- Produces: TTL index on `expireAt` with `expireAfterSeconds: 0`

- [ ] **Step 1: Write failing test**

In `apps/api/src/models/__tests__/models.test.js`, add:

```js
describe('Notification model expireAt TTL', () => {
  it('has expireAt field defaulting to ~30 days from now', () => {
    const Notification = require('../Notification');
    const path = Notification.schema.paths.expireAt;
    expect(path).toBeDefined();
    const defaultVal = path.defaultValue();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(defaultVal.getTime()).toBeGreaterThan(Date.now() + thirtyDaysMs - 5000);
    expect(defaultVal.getTime()).toBeLessThan(Date.now() + thirtyDaysMs + 5000);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest src/models/__tests__/models.test.js --no-coverage
```

Expected: FAIL — `path` is undefined.

- [ ] **Step 3: Add expireAt field and TTL index**

In `apps/api/src/models/Notification.js`, add `expireAt` to the schema and a TTL index:

```js
// In the schema definition, add after the `read` field:
  expireAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
```

After the existing `notificationSchema.index(...)` line, add:

```js
notificationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd apps/api && npx jest src/models/__tests__/models.test.js --no-coverage
```

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/models/Notification.js apps/api/src/models/__tests__/models.test.js
git commit -m "feat(api): add 30-day TTL expireAt field to Notification model"
```

---

### Task 3: Email utility + HTML templates

**Files:**
- Create: `apps/api/src/utils/email.js`
- Create: `apps/api/src/utils/emailTemplates.js`
- Test: `apps/api/src/utils/__tests__/emailTemplates.test.js`

**Interfaces:**
- Produces: `sendEmail(to: string, subject: string, html: string) → Promise<void>` — from `email.js`
- Produces: `appointmentConfirmedEmail(patientName, doctorName, date, timeSlot) → string` (HTML)
- Produces: `appointmentReminderEmail(patientName, doctorName, date, timeSlot) → string` (HTML)
- Produces: `consultationValidatedEmail(patientName, doctorName, date) → string` (HTML)
- Produces: `dailyDigestEmail(doctorName, count, date) → string` (HTML)
- All template functions return non-empty HTML strings containing the passed-in values

- [ ] **Step 1: Write failing template tests**

Create `apps/api/src/utils/__tests__/emailTemplates.test.js`:

```js
const {
  appointmentConfirmedEmail,
  appointmentReminderEmail,
  consultationValidatedEmail,
  dailyDigestEmail,
} = require('../emailTemplates');

describe('appointmentConfirmedEmail', () => {
  it('includes patient name, doctor name, date, and time slot', () => {
    const html = appointmentConfirmedEmail('Alice', 'Dr. Smith', '2026-07-01', '10:00');
    expect(html).toContain('Alice');
    expect(html).toContain('Dr. Smith');
    expect(html).toContain('2026-07-01');
    expect(html).toContain('10:00');
  });
});

describe('appointmentReminderEmail', () => {
  it('includes patient name, doctor name, date, and time slot', () => {
    const html = appointmentReminderEmail('Bob', 'Dr. Jones', '2026-07-02', '14:30');
    expect(html).toContain('Bob');
    expect(html).toContain('Dr. Jones');
    expect(html).toContain('2026-07-02');
    expect(html).toContain('14:30');
  });
});

describe('consultationValidatedEmail', () => {
  it('includes patient name, doctor name, and date', () => {
    const html = consultationValidatedEmail('Carol', 'Dr. Lee', '2026-06-30');
    expect(html).toContain('Carol');
    expect(html).toContain('Dr. Lee');
    expect(html).toContain('2026-06-30');
  });
});

describe('dailyDigestEmail', () => {
  it('includes doctor name and appointment count', () => {
    const html = dailyDigestEmail('Dr. Khan', 5, '2026-07-01');
    expect(html).toContain('Dr. Khan');
    expect(html).toContain('5');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest src/utils/__tests__/emailTemplates.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../emailTemplates'`.

- [ ] **Step 3: Create emailTemplates.js**

Create `apps/api/src/utils/emailTemplates.js`:

```js
'use strict';

function base(title, body) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">
<h2 style="color:#0ea5e9">${title}</h2>
${body}
<hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"/>
<p style="font-size:12px;color:#94a3b8">MediConnect &mdash; Your health, connected.</p>
</body></html>`;
}

function appointmentConfirmedEmail(patientName, doctorName, date, timeSlot) {
  return base('Appointment Confirmed', `
    <p>Hi ${patientName},</p>
    <p>Your appointment with <strong>${doctorName}</strong> has been confirmed.</p>
    <p><strong>Date:</strong> ${date}<br/><strong>Time:</strong> ${timeSlot}</p>
    <p>Please arrive a few minutes early. You can view or manage your appointment in the MediConnect app.</p>
  `);
}

function appointmentReminderEmail(patientName, doctorName, date, timeSlot) {
  return base('Appointment Reminder', `
    <p>Hi ${patientName},</p>
    <p>This is a reminder that you have an appointment with <strong>${doctorName}</strong> tomorrow.</p>
    <p><strong>Date:</strong> ${date}<br/><strong>Time:</strong> ${timeSlot}</p>
    <p>Open the MediConnect app to view details or join via video call.</p>
  `);
}

function consultationValidatedEmail(patientName, doctorName, date) {
  return base('Consultation Summary Ready', `
    <p>Hi ${patientName},</p>
    <p>Your consultation with <strong>${doctorName}</strong> on <strong>${date}</strong> has been completed.</p>
    <p>Your consultation summary, including any shared notes and prescriptions, is now available in the MediConnect app.</p>
  `);
}

function dailyDigestEmail(doctorName, count, date) {
  return base('Your Daily Schedule', `
    <p>Good morning, ${doctorName},</p>
    <p>You have <strong>${count} appointment(s)</strong> scheduled for today, <strong>${date}</strong>.</p>
    <p>Open the MediConnect app to review your schedule and patient details.</p>
  `);
}

module.exports = {
  appointmentConfirmedEmail,
  appointmentReminderEmail,
  consultationValidatedEmail,
  dailyDigestEmail,
};
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd apps/api && npx jest src/utils/__tests__/emailTemplates.test.js --no-coverage
```

Expected: PASS (4 tests).

- [ ] **Step 5: Create email.js**

Create `apps/api/src/utils/email.js`:

```js
'use strict';

let _resend;

function getResend() {
  if (!_resend) {
    const { Resend } = require('resend');
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await getResend().emails.send({
      from: process.env.EMAIL_FROM || 'MediConnect <notifications@mediconnect.app>',
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[email] send failed to', to, ':', err.message);
  }
}

module.exports = { sendEmail };
```

- [ ] **Step 6: Verify module loads**

```bash
cd apps/api && node -e "require('./src/utils/email'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/utils/email.js apps/api/src/utils/emailTemplates.js apps/api/src/utils/__tests__/emailTemplates.test.js
git commit -m "feat(api): add Resend email utility and HTML email templates"
```

---

### Task 4: Notification preferences API endpoint

**Files:**
- Create: `apps/api/src/routes/users.js`
- Modify: `apps/api/src/index.js`
- Test: `apps/api/src/routes/__tests__/users-notification-prefs.test.js`

**Interfaces:**
- Produces: `PATCH /api/users/me/notification-prefs` with body `{ pushEnabled?: boolean, emailEnabled?: boolean }` → `{ notificationPrefs: { pushEnabled, emailEnabled } }`
- Partial updates: fields not present in body are unchanged
- Errors: 400 if `pushEnabled` or `emailEnabled` is provided but not a boolean; 401 if not authenticated

- [ ] **Step 1: Write failing route tests**

Create `apps/api/src/routes/__tests__/users-notification-prefs.test.js`:

```js
jest.mock('../../models/User');
const User = require('../../models/User');

const express  = require('express');
const request  = require('supertest');
const router   = require('../users');
const auth     = require('../../middleware/auth');

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'user1' };
  next();
});

const app = express();
app.use(express.json());
app.use('/api/users', router);

beforeEach(() => jest.clearAllMocks());

test('PATCH /me/notification-prefs returns updated prefs', async () => {
  User.findByIdAndUpdate = jest.fn().mockResolvedValue({
    notificationPrefs: { pushEnabled: false, emailEnabled: true },
  });
  const res = await request(app)
    .patch('/api/users/me/notification-prefs')
    .send({ pushEnabled: false });
  expect(res.status).toBe(200);
  expect(res.body.notificationPrefs.pushEnabled).toBe(false);
});

test('returns 400 if pushEnabled is not a boolean', async () => {
  const res = await request(app)
    .patch('/api/users/me/notification-prefs')
    .send({ pushEnabled: 'yes' });
  expect(res.status).toBe(400);
});

test('returns 400 if emailEnabled is not a boolean', async () => {
  const res = await request(app)
    .patch('/api/users/me/notification-prefs')
    .send({ emailEnabled: 1 });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest src/routes/__tests__/users-notification-prefs.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../users'`.

- [ ] **Step 3: Create users.js route**

Create `apps/api/src/routes/users.js`:

```js
'use strict';

const router = require('express').Router();
const auth   = require('../middleware/auth');
const User   = require('../models/User');

// PATCH /api/users/me/notification-prefs
router.patch('/me/notification-prefs', auth, async (req, res, next) => {
  try {
    const { pushEnabled, emailEnabled } = req.body;

    if (pushEnabled !== undefined && typeof pushEnabled !== 'boolean') {
      return res.status(400).json({ message: 'pushEnabled must be a boolean' });
    }
    if (emailEnabled !== undefined && typeof emailEnabled !== 'boolean') {
      return res.status(400).json({ message: 'emailEnabled must be a boolean' });
    }

    const update = {};
    if (pushEnabled  !== undefined) update['notificationPrefs.pushEnabled']  = pushEnabled;
    if (emailEnabled !== undefined) update['notificationPrefs.emailEnabled'] = emailEnabled;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, select: 'notificationPrefs' }
    );

    res.json({ notificationPrefs: user.notificationPrefs });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Register route in index.js**

In `apps/api/src/index.js`, add after the existing route registrations (before the error handler):

```js
app.use('/api/users',          require('./routes/users'));
```

- [ ] **Step 5: Run tests — confirm pass**

```bash
cd apps/api && npx jest src/routes/__tests__/users-notification-prefs.test.js --no-coverage
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/users.js apps/api/src/routes/__tests__/users-notification-prefs.test.js apps/api/src/index.js
git commit -m "feat(api): add notification preferences endpoint PATCH /api/users/me/notification-prefs"
```

---

### Task 5: Wire email + push gating into notifyUser and appointment events

**Files:**
- Modify: `apps/api/src/routes/appointments.js`
- Test: `apps/api/src/routes/__tests__/appointments-notify.test.js`

**Interfaces:**
- Consumes: `sendEmail(to, subject, html)` from `../utils/email`
- Consumes: `appointmentConfirmedEmail(patientName, doctorName, date, timeSlot)` from `../utils/emailTemplates`
- Consumes: `consultationValidatedEmail(patientName, doctorName, date)` from `../utils/emailTemplates`
- Consumes: `User.findById(id).select('fcmToken email name notificationPrefs')` — extended select
- Produces: `notifyUser(recipientId, type, payload, emailData?)` — `emailData` optional: `{ to, subject, html }`. When provided and user `emailEnabled`, calls `sendEmail`. Push only fires when user `pushEnabled`. Notification DB record always created.
- `emailData` shape: `{ to: string, subject: string, html: string }`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/__tests__/appointments-notify.test.js`:

```js
jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../utils/push');
jest.mock('../../utils/email');
jest.mock('../../queues/reminderQueue', () => ({ getReminderQueue: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../utils/reminderDelays', () => ({ computeReminderDelays: jest.fn().mockReturnValue({ delay24h: 0, delay1h: 0 }) }));
jest.mock('../../models/Appointment');
jest.mock('../../models/Doctor');

const Notification = require('../../models/Notification');
const User         = require('../../models/User');
const { sendPush } = require('../../utils/push');
const { sendEmail } = require('../../utils/email');

const router = require('../appointments');
const { notifyUser } = router;

beforeEach(() => jest.clearAllMocks());

function mockUser(overrides = {}) {
  User.findById = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: 'u1', fcmToken: 'tok1', email: 'patient@test.com', name: 'Alice',
      notificationPrefs: { pushEnabled: true, emailEnabled: true },
      ...overrides,
    }),
  });
}

test('always creates Notification record', async () => {
  mockUser();
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1', message: 'Confirmed' });
  expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'u1', type: 'appointment_confirmed' }));
});

test('skips push when pushEnabled is false', async () => {
  mockUser({ notificationPrefs: { pushEnabled: false, emailEnabled: true } });
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1', message: 'Confirmed' });
  expect(sendPush).not.toHaveBeenCalled();
});

test('sends email when emailEnabled and emailData provided', async () => {
  mockUser();
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1' }, {
    to: 'patient@test.com', subject: 'Confirmed', html: '<p>Hi</p>',
  });
  expect(sendEmail).toHaveBeenCalledWith('patient@test.com', 'Confirmed', '<p>Hi</p>');
});

test('skips email when emailEnabled is false', async () => {
  mockUser({ notificationPrefs: { pushEnabled: true, emailEnabled: false } });
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1' }, {
    to: 'patient@test.com', subject: 'Confirmed', html: '<p>Hi</p>',
  });
  expect(sendEmail).not.toHaveBeenCalled();
});

test('skips email when no emailData provided', async () => {
  mockUser();
  Notification.create = jest.fn().mockResolvedValue({});
  await notifyUser('u1', 'appointment_confirmed', { appointmentId: 'a1' });
  expect(sendEmail).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest src/routes/__tests__/appointments-notify.test.js --no-coverage
```

Expected: FAIL — `notifyUser` not exported on router.

- [ ] **Step 3: Update imports at the top of appointments.js**

In `apps/api/src/routes/appointments.js`, add after the existing requires:

```js
const { sendEmail }                  = require('../utils/email');
const { appointmentConfirmedEmail, consultationValidatedEmail } = require('../utils/emailTemplates');
```

- [ ] **Step 4: Replace the notifyUser function**

Find the existing `notifyUser` function (lines ~12-26) and replace it with:

```js
async function notifyUser(recipientId, type, payload, emailData) {
  const notif = await Notification.create({ recipientId, type, payload });
  const user  = await User.findById(recipientId).select('fcmToken email name notificationPrefs');
  if (!user) return notif;

  const prefs = user.notificationPrefs || {};
  const pushEnabled  = prefs.pushEnabled  !== false;
  const emailEnabled = prefs.emailEnabled !== false;

  if (pushEnabled && user.fcmToken) {
    const titles = {
      appointment_requested:  'New appointment request',
      appointment_confirmed:  'Appointment confirmed',
      consultation_validated: 'Consultation summary ready',
      notes_viewed:           'Doctor reviewed your consultation',
    };
    await sendPush(user.fcmToken, titles[type], payload.message || '', {
      appointmentId: String(payload.appointmentId),
    });
  }

  if (emailEnabled && emailData) {
    await sendEmail(emailData.to, emailData.subject, emailData.html);
  }

  return notif;
}
```

- [ ] **Step 5: Add emailData to appointment_confirmed call**

Find the `PATCH /:id/confirm` handler's `notifyUser` call (currently ~line 192):

```js
await notifyUser(appt.patientId, 'appointment_confirmed', {
```

Replace with:

```js
const patientForEmail = await User.findById(appt.patientId).select('email name');
const doctor          = await User.findById(req.user.id).select('name');
const apptDate        = new Date(appt.date).toISOString().split('T')[0];
await notifyUser(appt.patientId, 'appointment_confirmed', {
  appointmentId: appt._id,
  message: 'Your appointment has been confirmed.',
}, patientForEmail?.email ? {
  to:      patientForEmail.email,
  subject: 'Appointment Confirmed — MediConnect',
  html:    appointmentConfirmedEmail(
    patientForEmail.name || 'Patient',
    `Dr. ${doctor?.name || 'Your doctor'}`,
    apptDate,
    appt.timeSlot?.start || '',
  ),
} : undefined);
```

- [ ] **Step 6: Add emailData to consultation_validated call**

Find the `PATCH /:id/validate` (or confirm-validated) handler's `notifyUser` call (~line 215):

```js
await notifyUser(appt.patientId, 'consultation_validated', {
```

Replace with:

```js
const patientForEmail2 = await User.findById(appt.patientId).select('email name');
const doctor2          = await User.findById(req.user.id).select('name');
const apptDate2        = new Date(appt.date).toISOString().split('T')[0];
await notifyUser(appt.patientId, 'consultation_validated', {
  appointmentId: appt._id,
  message: 'Your consultation summary is ready.',
}, patientForEmail2?.email ? {
  to:      patientForEmail2.email,
  subject: 'Consultation Summary Ready — MediConnect',
  html:    consultationValidatedEmail(
    patientForEmail2.name || 'Patient',
    `Dr. ${doctor2?.name || 'Your doctor'}`,
    apptDate2,
  ),
} : undefined);
```

- [ ] **Step 7: Export notifyUser for testing**

At the bottom of `apps/api/src/routes/appointments.js`, after `module.exports = router;`, add:

```js
router.notifyUser = notifyUser;
```

- [ ] **Step 8: Run tests — confirm pass**

```bash
cd apps/api && npx jest src/routes/__tests__/appointments-notify.test.js --no-coverage
```

Expected: PASS (5 tests).

- [ ] **Step 9: Run existing appointment tests to check for regressions**

```bash
cd apps/api && npx jest src/routes/__tests__/appointments-reminders.test.js --no-coverage
```

Expected: PASS (4 tests).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/routes/appointments.js apps/api/src/routes/__tests__/appointments-notify.test.js
git commit -m "feat(api): gate push on pushEnabled, send email for appointment_confirmed and consultation_validated"
```

---

### Task 6: Wire email into reminder + digest workers

**Files:**
- Modify: `apps/api/src/workers/reminderWorker.js`
- Modify: `apps/api/src/workers/digestWorker.js`
- Test: `apps/api/src/workers/__tests__/reminderWorker.test.js` (extend)
- Test: `apps/api/src/workers/__tests__/digestWorker.test.js` (extend)

**Interfaces:**
- Consumes: `sendEmail(to, subject, html)` from `../../utils/email`
- Consumes: `appointmentReminderEmail(patientName, doctorName, date, timeSlot)` from `../../utils/emailTemplates`
- Consumes: `dailyDigestEmail(doctorName, count, date)` from `../../utils/emailTemplates`
- Consumes: `User.notificationPrefs.pushEnabled` and `.emailEnabled`
- Produces: `processReminderJob` — for `reminderType === '24h'` only: sends email when `emailEnabled`; gates push on `pushEnabled`
- Produces: `processDigestSendJob` — sends email when `emailEnabled`; gates push on `pushEnabled`

- [ ] **Step 1: Add mocks and tests to reminderWorker.test.js**

In `apps/api/src/workers/__tests__/reminderWorker.test.js`, add these mocks at the top of the existing mock block:

```js
jest.mock('../../utils/email');
jest.mock('../../utils/emailTemplates', () => ({
  appointmentReminderEmail: jest.fn().mockReturnValue('<p>reminder</p>'),
}));
```

Add these imports after the existing ones:

```js
const { sendEmail } = require('../../utils/email');
```

Add these two new tests after the existing tests:

```js
test('sends email for 24h reminder when emailEnabled', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'a1', status: 'confirmed', remindersDisabled: false, patientId: 'p1',
    date: new Date(Date.now() + 2 * 3600 * 1000), timeSlot: { start: '10:00' },
    doctorId: 'd1',
  });
  User.findById = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue({
      fcmToken: 'tok1', email: 'p@test.com', name: 'Alice',
      notificationPrefs: { pushEnabled: true, emailEnabled: true },
    }),
  });
  Notification.create = jest.fn().mockResolvedValue({});
  sendPush.mockResolvedValue();
  sendEmail.mockResolvedValue();

  await processReminderJob({ data: { appointmentId: 'a1', reminderType: '24h' } });

  expect(sendEmail).toHaveBeenCalledWith('p@test.com', expect.stringContaining('Reminder'), '<p>reminder</p>');
});

test('skips email for 1h reminder even when emailEnabled', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'a1', status: 'confirmed', remindersDisabled: false, patientId: 'p1',
    date: new Date(Date.now() + 2 * 3600 * 1000), timeSlot: { start: '10:00' },
    doctorId: 'd1',
  });
  User.findById = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue({
      fcmToken: 'tok1', email: 'p@test.com', name: 'Alice',
      notificationPrefs: { pushEnabled: true, emailEnabled: true },
    }),
  });
  Notification.create = jest.fn().mockResolvedValue({});
  sendPush.mockResolvedValue();
  sendEmail.mockResolvedValue();

  await processReminderJob({ data: { appointmentId: 'a1', reminderType: '1h' } });

  expect(sendEmail).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
cd apps/api && npx jest src/workers/__tests__/reminderWorker.test.js --no-coverage
```

Expected: 5 pass, 2 fail (new tests).

- [ ] **Step 3: Update reminderWorker.js**

In `apps/api/src/workers/reminderWorker.js`, add at the top after existing requires:

```js
const { sendEmail }              = require('../utils/email');
const { appointmentReminderEmail } = require('../utils/emailTemplates');
```

Replace the `processReminderJob` function's push + notification block:

```js
  const user = await User.findById(appt.patientId).select('fcmToken email name notificationPrefs');
  const prefs = user?.notificationPrefs || {};
  const pushEnabled  = prefs.pushEnabled  !== false;
  const emailEnabled = prefs.emailEnabled !== false;

  await Notification.create({
    recipientId: appt.patientId,
    type: 'appointment_reminder',
    payload: { appointmentId: appt._id, reminderType, message: bodies[reminderType] },
  });

  if (pushEnabled && user?.fcmToken) {
    try {
      await sendPush(user.fcmToken, titles[reminderType], bodies[reminderType], {
        appointmentId: String(appt._id), reminderType,
      });
    } catch (fcmErr) {
      console.error('[reminders] FCM push failed (notification already saved):', fcmErr.message);
    }
  }

  if (emailEnabled && reminderType === '24h' && user?.email) {
    const apptDate = new Date(appt.date).toISOString().split('T')[0];
    const doctorUser = await User.findById(appt.doctorId).select('name');
    await sendEmail(
      user.email,
      'Appointment Reminder — MediConnect',
      appointmentReminderEmail(
        user.name || 'Patient',
        `Dr. ${doctorUser?.name || 'Your doctor'}`,
        apptDate,
        appt.timeSlot?.start || '',
      ),
    );
  }
```

- [ ] **Step 4: Run reminder tests — confirm all pass**

```bash
cd apps/api && npx jest src/workers/__tests__/reminderWorker.test.js --no-coverage
```

Expected: PASS (7 tests).

- [ ] **Step 5: Add mocks and tests to digestWorker.test.js**

In `apps/api/src/workers/__tests__/digestWorker.test.js`, add to the mock block:

```js
jest.mock('../../utils/email');
jest.mock('../../utils/emailTemplates', () => ({
  dailyDigestEmail: jest.fn().mockReturnValue('<p>digest</p>'),
}));
```

Add these imports after existing ones:

```js
const { sendEmail } = require('../../utils/email');
```

Add this new test in the `processDigestSendJob` describe block:

```js
it('sends email when emailEnabled and appointments exist', async () => {
  User.findById = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: 'u1', fcmToken: 'tok1', email: 'dr@test.com', name: 'Dr. Ali',
      notificationPrefs: { pushEnabled: true, emailEnabled: true },
    }),
  });
  Appointment.countDocuments = jest.fn().mockResolvedValue(2);
  Notification.create = jest.fn().mockResolvedValue({});
  sendPush.mockResolvedValue();
  sendEmail.mockResolvedValue();

  await processDigestSendJob({ data: { doctorUserId: 'u1', doctorTimezone: 'UTC' } });

  expect(sendEmail).toHaveBeenCalledWith('dr@test.com', expect.stringContaining('Schedule'), '<p>digest</p>');
});
```

- [ ] **Step 6: Run to confirm new test fails**

```bash
cd apps/api && npx jest src/workers/__tests__/digestWorker.test.js --no-coverage
```

Expected: 5 pass, 1 fail.

- [ ] **Step 7: Update digestWorker.js**

In `apps/api/src/workers/digestWorker.js`, add at the top after existing requires:

```js
const { sendEmail }     = require('../utils/email');
const { dailyDigestEmail } = require('../utils/emailTemplates');
```

In `processDigestSendJob`, replace the user fetch line and the push block with:

```js
  const user = await User.findById(doctorUserId).select('_id fcmToken email name notificationPrefs');
  if (!user) {
    console.warn('[digest] user not found for doctorUserId:', doctorUserId);
    return;
  }
  if (!user.fcmToken && !user.email) return;

  const prefs = user.notificationPrefs || {};
  const pushEnabled  = prefs.pushEnabled  !== false;
  const emailEnabled = prefs.emailEnabled !== false;

  // ... (existing timezone + count logic unchanged) ...

  if (count === 0) return;

  await Notification.create({
    recipientId: doctorUserId,
    type: 'daily_digest',
    payload: { count, message: `You have ${count} appointment(s) today.` },
  });

  if (pushEnabled && user.fcmToken) {
    await sendPush(user.fcmToken, 'Daily Schedule', `You have ${count} appointment(s) today.`, {});
  }

  if (emailEnabled && user.email) {
    const dateStr = DateTime.now().setZone(tz).toISODate();
    await sendEmail(
      user.email,
      'Your Daily Schedule — MediConnect',
      dailyDigestEmail(user.name || 'Doctor', count, dateStr),
    );
  }
```

- [ ] **Step 8: Run digest tests — confirm all pass**

```bash
cd apps/api && npx jest src/workers/__tests__/digestWorker.test.js --no-coverage
```

Expected: PASS (6 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/workers/reminderWorker.js apps/api/src/workers/__tests__/reminderWorker.test.js apps/api/src/workers/digestWorker.js apps/api/src/workers/__tests__/digestWorker.test.js
git commit -m "feat(api): gate push on pushEnabled, add email for 24h reminder and daily digest"
```

---

### Task 7: Read-event 24h cooldown (notes_viewed)

**Files:**
- Modify: `apps/api/src/routes/notes.js`
- Test: `apps/api/src/routes/__tests__/notes-cooldown.test.js`

**Interfaces:**
- Consumes: `ReadEvent.findOne({ appointmentId, doctorId })` → `{ readAt: Date } | null`
- Consumes: `ReadEvent.findOneAndUpdate(...)` — existing upsert
- Produces: `POST /api/appointments/:apptId/read` now fires `notes_viewed` notification when: `!existing` (first read) OR `Date.now() - existing.readAt >= 24 * 60 * 60 * 1000` (re-read after 24h gap); always updates `readAt`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/routes/__tests__/notes-cooldown.test.js`:

```js
jest.mock('../../models/Appointment');
jest.mock('../../models/ReadEvent');
jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../utils/push');
jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'doc1', role: 'doctor' };
  next();
});

const Appointment  = require('../../models/Appointment');
const ReadEvent    = require('../../models/ReadEvent');
const Notification = require('../../models/Notification');
const User         = require('../../models/User');
const { sendPush } = require('../../utils/push');

const express = require('express');
const request = require('supertest');

const router = require('../notes');
const app = express();
app.use(express.json());
app.use('/api/appointments', router);

beforeEach(() => {
  jest.clearAllMocks();
  Appointment.findOne = jest.fn().mockResolvedValue({
    _id: 'appt1', patientId: 'pat1', doctorId: 'doc1',
  });
  User.findById = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue({ name: 'Dr. Ali', fcmToken: null }),
  });
  Notification.create = jest.fn().mockResolvedValue({});
  sendPush.mockResolvedValue();
});

test('notifies patient on first read (no existing ReadEvent)', async () => {
  ReadEvent.findOne = jest.fn().mockResolvedValue(null);
  ReadEvent.findOneAndUpdate = jest.fn().mockResolvedValue({ readAt: new Date() });

  const res = await request(app).post('/api/appointments/appt1/read');
  expect(res.status).toBe(200);
  expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'notes_viewed' }));
});

test('notifies patient on re-read after 24h gap', async () => {
  const oldReadAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
  ReadEvent.findOne = jest.fn().mockResolvedValue({ readAt: oldReadAt });
  ReadEvent.findOneAndUpdate = jest.fn().mockResolvedValue({ readAt: new Date() });

  const res = await request(app).post('/api/appointments/appt1/read');
  expect(res.status).toBe(200);
  expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'notes_viewed' }));
});

test('skips notification on re-read within 24h cooldown', async () => {
  const recentReadAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
  ReadEvent.findOne = jest.fn().mockResolvedValue({ readAt: recentReadAt });
  ReadEvent.findOneAndUpdate = jest.fn().mockResolvedValue({ readAt: new Date() });

  const res = await request(app).post('/api/appointments/appt1/read');
  expect(res.status).toBe(200);
  expect(Notification.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest src/routes/__tests__/notes-cooldown.test.js --no-coverage
```

Expected: FAIL — the third test fails (currently notifies on every first-time-per-session check, but also may differ).

- [ ] **Step 3: Update the read handler in notes.js**

Find the `// Notify patient only on first read` block in the `POST /:apptId/read` handler and replace:

```js
    // Before: if (!existing) { notify... }
```

With:

```js
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const shouldNotify = !existing || (Date.now() - new Date(existing.readAt).getTime() >= COOLDOWN_MS);

    if (shouldNotify) {
      const doctorUser = await User.findById(req.user.id).select('name');
      const patient    = await User.findById(appt.patientId).select('fcmToken');
      await Notification.create({
        recipientId: appt.patientId,
        type: 'notes_viewed',
        payload: {
          appointmentId: appt._id,
          message: `Dr. ${doctorUser?.name || 'Your doctor'} reviewed your consultation`,
        },
      });
      if (patient?.fcmToken) {
        await sendPush(
          patient.fcmToken,
          'Consultation reviewed',
          `Dr. ${doctorUser?.name || 'Your doctor'} reviewed your consultation`,
          { appointmentId: String(appt._id) }
        );
      }
    }
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd apps/api && npx jest src/routes/__tests__/notes-cooldown.test.js --no-coverage
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/notes.js apps/api/src/routes/__tests__/notes-cooldown.test.js
git commit -m "feat(api): add 24h cooldown for notes_viewed re-notification"
```

---

### Task 8: Mobile UI — notification preference toggles

**Files:**
- Modify: `apps/mobile/src/screens/doctor/SettingsScreen.js`
- Create: `apps/mobile/src/screens/patient/SettingsScreen.js`
- Modify: `apps/mobile/src/api/users.js` (create if not exists)
- Modify: navigation files to register patient settings screen

**Interfaces:**
- Produces: `updateNotificationPrefs(prefs: { pushEnabled?: boolean, emailEnabled?: boolean }) → Promise<{ notificationPrefs }>` in mobile API
- Consumes: `PATCH /api/users/me/notification-prefs`

- [ ] **Step 1: Check if mobile users API client exists**

```bash
ls apps/mobile/src/api/
```

- [ ] **Step 2: Create or update mobile users API client**

Create `apps/mobile/src/api/users.js` (or add to existing):

```js
import client from './client';

export const updateNotificationPrefs = (prefs) =>
  client.patch('/users/me/notification-prefs', prefs).then(r => r.data);
```

- [ ] **Step 3: Add preference toggles to doctor SettingsScreen.js**

Read `apps/mobile/src/screens/doctor/SettingsScreen.js` first to find the existing state and JSX structure.

Add import at top:

```js
import { updateNotificationPrefs } from '../../api/users';
```

Add state alongside existing state variables:

```js
const [pushEnabled,  setPushEnabled]  = useState(true);
const [emailEnabled, setEmailEnabled] = useState(true);
```

In the existing `useEffect` that loads the doctor profile, also load prefs from the user profile endpoint (or store them in Zustand auth state). Since the profile is loaded from `/api/doctors/:id`, add a separate fetch for user prefs. Add after the doctor profile fetch:

```js
      // Load notification prefs from auth store user or fetch separately
      const userRes = await client.get('/users/me/notification-prefs').catch(() => null);
      if (userRes?.data?.notificationPrefs) {
        setPushEnabled(userRes.data.notificationPrefs.pushEnabled);
        setEmailEnabled(userRes.data.notificationPrefs.emailEnabled);
      }
```

> **Note:** Since there is no `GET /api/users/me/notification-prefs` endpoint, add it in the API route (Task 4 only added PATCH). Add a GET to `users.js` route:
> ```js
> router.get('/me/notification-prefs', auth, async (req, res, next) => {
>   try {
>     const user = await User.findById(req.user.id).select('notificationPrefs');
>     res.json({ notificationPrefs: user?.notificationPrefs || { pushEnabled: true, emailEnabled: true } });
>   } catch (err) { next(err); }
> });
> ```
> Add this to `apps/api/src/routes/users.js` before the PATCH handler.

In the save function, also save prefs:

```js
      await updateNotificationPrefs({ pushEnabled, emailEnabled });
```

Add UI section in the JSX `<ScrollView>`, after the timezone section:

```jsx
<View style={{ marginTop: 16, backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12 }}>
  <Text style={{ fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 12 }}>
    Notification Channels
  </Text>
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
    <Text style={{ fontSize: 12, color: C.text2 }}>Push notifications</Text>
    <Switch
      value={pushEnabled}
      onValueChange={async (val) => {
        setPushEnabled(val);
        await updateNotificationPrefs({ pushEnabled: val }).catch(() => setPushEnabled(!val));
      }}
      trackColor={{ false: C.border, true: C.accent }}
      thumbColor="#fff"
    />
  </View>
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    <Text style={{ fontSize: 12, color: C.text2 }}>Email notifications</Text>
    <Switch
      value={emailEnabled}
      onValueChange={async (val) => {
        setEmailEnabled(val);
        await updateNotificationPrefs({ emailEnabled: val }).catch(() => setEmailEnabled(!val));
      }}
      trackColor={{ false: C.border, true: C.accent }}
      thumbColor="#fff"
    />
  </View>
</View>
```

- [ ] **Step 4: Create patient SettingsScreen.js**

Create `apps/mobile/src/screens/patient/SettingsScreen.js` by reading `apps/mobile/src/screens/doctor/SettingsScreen.js` to match the color scheme (C constants) and then writing a minimal patient version:

```js
import React, { useState, useEffect } from 'react';
import { View, Text, Switch, ScrollView, StyleSheet } from 'react-native';
import { updateNotificationPrefs } from '../../api/users';
import client from '../../api/client';
import useAuthStore from '../../store/authStore';

const C = {
  bg:     '#0f172a', bg3: '#1e293b',
  text:   '#f1f5f9', text2: '#94a3b8',
  border: '#334155', accent: '#0ea5e9',
};

export default function PatientSettingsScreen() {
  const { user } = useAuthStore();
  const [pushEnabled,  setPushEnabled]  = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);

  useEffect(() => {
    client.get('/users/me/notification-prefs').then(r => {
      if (r.data?.notificationPrefs) {
        setPushEnabled(r.data.notificationPrefs.pushEnabled);
        setEmailEnabled(r.data.notificationPrefs.emailEnabled);
      }
    }).catch(() => {});
  }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 20 }}>Settings</Text>

      <View style={{ backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 12 }}>
          Notification Channels
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: C.text2 }}>Push notifications</Text>
          <Switch
            value={pushEnabled}
            onValueChange={async (val) => {
              setPushEnabled(val);
              await updateNotificationPrefs({ pushEnabled: val }).catch(() => setPushEnabled(!val));
            }}
            trackColor={{ false: C.border, true: C.accent }}
            thumbColor="#fff"
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, color: C.text2 }}>Email notifications</Text>
          <Switch
            value={emailEnabled}
            onValueChange={async (val) => {
              setEmailEnabled(val);
              await updateNotificationPrefs({ emailEnabled: val }).catch(() => setEmailEnabled(!val));
            }}
            trackColor={{ false: C.border, true: C.accent }}
            thumbColor="#fff"
          />
        </View>
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 5: Register patient SettingsScreen in patient navigation**

Read `apps/mobile/src/navigation/PatientTabs.js` (or equivalent). Find the Stack.Screen list and add:

```jsx
import PatientSettingsScreen from '../screens/patient/SettingsScreen';
// ...
<Stack.Screen name="PatientSettings" component={PatientSettingsScreen} options={{ title: 'Settings' }} />
```

Add a "Settings" button or tab entry so it is reachable from the patient UI (e.g., a gear icon in the header or a tab in the bottom nav — follow existing pattern for how the doctor settings tab is implemented).

- [ ] **Step 6: Add GET /me/notification-prefs to users route**

In `apps/api/src/routes/users.js`, add before the PATCH handler:

```js
// GET /api/users/me/notification-prefs
router.get('/me/notification-prefs', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('notificationPrefs');
    res.json({ notificationPrefs: user?.notificationPrefs || { pushEnabled: true, emailEnabled: true } });
  } catch (err) { next(err); }
});
```

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/api/users.js apps/mobile/src/screens/doctor/SettingsScreen.js apps/mobile/src/screens/patient/SettingsScreen.js apps/mobile/src/navigation/ apps/api/src/routes/users.js
git commit -m "feat(mobile): add notification preference toggles for doctor and patient"
```

---

### Task 9: Web UI — notification preference toggles

**Files:**
- Create: `apps/web/src/api/users.js`
- Modify: `apps/web/src/pages/doctor/DoctorSettingsPage.jsx`
- Create: `apps/web/src/pages/patient/PatientSettingsPage.jsx`
- Modify: `apps/web/src/router.jsx` (or equivalent router file)

**Interfaces:**
- Produces: `updateNotificationPrefs(prefs) → Promise<{ notificationPrefs }>` in web API
- Consumes: `GET /api/users/me/notification-prefs`, `PATCH /api/users/me/notification-prefs`

- [ ] **Step 1: Create web users API client**

Create `apps/web/src/api/users.js`:

```js
import client from './client';

export const getNotificationPrefs = () =>
  client.get('/users/me/notification-prefs').then(r => r.data);

export const updateNotificationPrefs = (prefs) =>
  client.patch('/users/me/notification-prefs', prefs).then(r => r.data);
```

- [ ] **Step 2: Add preference toggles to DoctorSettingsPage.jsx**

Read `apps/web/src/pages/doctor/DoctorSettingsPage.jsx` to understand the existing structure.

Add import:

```js
import { getNotificationPrefs, updateNotificationPrefs } from '../../api/users';
```

Add state:

```js
const [pushEnabled,  setPushEnabled]  = useState(true);
const [emailEnabled, setEmailEnabled] = useState(true);
```

In the `useEffect`, also load notification prefs:

```js
    getNotificationPrefs().then(data => {
      if (data?.notificationPrefs) {
        setPushEnabled(data.notificationPrefs.pushEnabled);
        setEmailEnabled(data.notificationPrefs.emailEnabled);
      }
    }).catch(() => {});
```

Add this section in the JSX, after the Daily Digest Timezone card:

```jsx
<div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 20, marginBottom: 20 }}>
  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>Notification Channels</div>
  {[
    { label: 'Push notifications', value: pushEnabled, key: 'pushEnabled', set: setPushEnabled },
    { label: 'Email notifications', value: emailEnabled, key: 'emailEnabled', set: setEmailEnabled },
  ].map(({ label, value, key, set }) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
      <button
        onClick={async () => {
          set(!value);
          await updateNotificationPrefs({ [key]: !value }).catch(() => set(value));
        }}
        style={{
          width: 38, height: 20, borderRadius: 10,
          background: value ? 'var(--accent, #0ea5e9)' : 'var(--border2, #334155)',
          border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: value ? 20 : 2,
          width: 16, height: 16, borderRadius: 8,
          background: '#fff', transition: 'left .2s', display: 'block',
        }} />
      </button>
    </div>
  ))}
</div>
```

- [ ] **Step 3: Create PatientSettingsPage.jsx**

Create `apps/web/src/pages/patient/PatientSettingsPage.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { getNotificationPrefs, updateNotificationPrefs } from '../../api/users';

export default function PatientSettingsPage() {
  const [pushEnabled,  setPushEnabled]  = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);

  useEffect(() => {
    getNotificationPrefs().then(data => {
      if (data?.notificationPrefs) {
        setPushEnabled(data.notificationPrefs.pushEnabled);
        setEmailEnabled(data.notificationPrefs.emailEnabled);
      }
    }).catch(() => {});
  }, []);

  const Toggle = ({ label, value, onToggle }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 14, color: 'var(--text)' }}>{label}</span>
      <button
        onClick={onToggle}
        style={{
          width: 38, height: 20, borderRadius: 10,
          background: value ? 'var(--accent, #0ea5e9)' : 'var(--border2, #334155)',
          border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: value ? 20 : 2,
          width: 16, height: 16, borderRadius: 8,
          background: '#fff', transition: 'left .2s', display: 'block',
        }} />
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: 'var(--text)' }}>Settings</h2>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12, color: 'var(--text)' }}>Notification Channels</div>
        <Toggle
          label="Push notifications"
          value={pushEnabled}
          onToggle={async () => {
            setPushEnabled(v => !v);
            await updateNotificationPrefs({ pushEnabled: !pushEnabled }).catch(() => setPushEnabled(v => !v));
          }}
        />
        <Toggle
          label="Email notifications"
          value={emailEnabled}
          onToggle={async () => {
            setEmailEnabled(v => !v);
            await updateNotificationPrefs({ emailEnabled: !emailEnabled }).catch(() => setEmailEnabled(v => !v));
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Register the patient settings route in the web router**

Read the router file (find it: `grep -r 'Route\|import.*Page' apps/web/src/router.jsx 2>/dev/null || find apps/web/src -name 'router*'`).

Add import:

```js
import PatientSettingsPage from './pages/patient/PatientSettingsPage';
```

Add the route inside the patient-authenticated section:

```jsx
<Route path="/settings" element={<PatientSettingsPage />} />
```

Add a "Settings" link to the patient sidebar/nav (follow existing patient nav pattern).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/users.js apps/web/src/pages/doctor/DoctorSettingsPage.jsx apps/web/src/pages/patient/PatientSettingsPage.jsx apps/web/src/router.jsx
git commit -m "feat(web): add notification preference toggles for doctor and patient settings"
```

---

## Notes

- **GET /me/notification-prefs** is added in Task 8 (step 6) — the mobile and web both need it to load current prefs on screen mount.
- **Backward compatibility**: existing `notifyUser()` callers that pass no `emailData` will continue to work unchanged (email just won't be sent, push gating is the only change).
- **Test runner**: `cd apps/api && npx jest --no-coverage` runs all API tests.
- **Email in CI**: set `RESEND_API_KEY` to a test value or leave unset — `sendEmail` no-ops when key is absent.
- **TTL index in production**: MongoDB applies the TTL index to the collection on next background sweep (~60s after deploy). Existing documents without `expireAt` are unaffected.
