# Phase 2.4 Appointment Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BullMQ+Redis delayed-job reminders (24h + 1h before each confirmed appointment) for patients, a doctor daily digest push at local 7 AM, and a per-appointment opt-out toggle for patients.

**Architecture:** On appointment confirmation, two delayed BullMQ jobs are enqueued using computed delays (apptTime-24h and apptTime-1h); job IDs are stored on the Appointment document and removed on cancellation. A repeatable midnight-UTC orchestrator job enqueues per-doctor digest-send jobs with timezone-adjusted delays each day.

**Tech Stack:** Node.js/Express, BullMQ, IORedis, Luxon, Firebase Admin SDK (existing `push.js`), React Native Expo, React.js

## Global Constraints

- New packages `bullmq`, `ioredis`, `luxon` install in `apps/api` only — no changes to mobile/web `package.json` except `@react-native-picker/picker` in Task 9 if not already present
- Always use `apps/api/src/utils/push.js` `sendPush` for FCM — not `fcm.js`
- `REDIS_URL` env var for Redis connection (Railway provides `rediss://` in prod)
- BullMQ job payloads contain MongoDB IDs and scalar values only — no PII
- `timezone` field validated with `luxon` `IANAZone.isValidZone()` before persisting
- All new API routes use existing `auth` + `requireRole` middleware
- No new MongoDB collections — all notifications go to existing `notifications` collection

---

### Task 1: Install dependencies

**Files:**
- Modify: `apps/api/package.json` (via npm install)

**Interfaces:**
- Produces: `bullmq`, `ioredis`, `luxon` importable in `apps/api/src/`

- [ ] **Step 1: Install packages**

```bash
cd apps/api && npm install bullmq ioredis luxon
```

Expected: `added N packages` with no peer-dep errors

- [ ] **Step 2: Verify installed**

```bash
cd apps/api && node -e "require('bullmq'); require('ioredis'); require('luxon'); console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 3: Add REDIS_URL to `.env`**

In `apps/api/.env`, add:
```
REDIS_URL=redis://localhost:6379
```

Also add `REDIS_URL` to Railway environment variables for production (use the `rediss://` URL Railway provides).

- [ ] **Step 4: Start local Redis for dev**

```bash
docker run -d -p 6379:6379 --name mediconnect-redis redis:7-alpine
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json
git commit -m "chore(api): add bullmq, ioredis, luxon dependencies"
```

---

### Task 2: Data model changes

**Files:**
- Modify: `apps/api/src/models/Appointment.js`
- Modify: `apps/api/src/models/Doctor.js`
- Modify: `apps/api/src/models/Notification.js`
- Test: `apps/api/src/models/__tests__/models.test.js`

**Interfaces:**
- Produces: `Appointment` schema has `remindersDisabled: Boolean` (default `false`), `reminder24hJobId: String` (default `null`), `reminder1hJobId: String` (default `null`)
- Produces: `Doctor` schema has `timezone: String` (default `'UTC'`)
- Produces: `Notification.type` enum includes `'appointment_reminder'` and `'daily_digest'`

- [ ] **Step 1: Write failing model tests**

Create `apps/api/src/models/__tests__/models.test.js`:

```js
describe('Appointment model reminder fields', () => {
  it('has remindersDisabled default false', () => {
    const Appointment = require('../Appointment');
    const paths = Appointment.schema.paths;
    expect(paths.remindersDisabled.defaultValue).toBe(false);
    expect(paths.reminder24hJobId.defaultValue).toBeNull();
    expect(paths.reminder1hJobId.defaultValue).toBeNull();
  });
});

describe('Doctor model timezone field', () => {
  it('has timezone default UTC', () => {
    const Doctor = require('../Doctor');
    expect(Doctor.schema.paths.timezone.defaultValue).toBe('UTC');
  });
});

describe('Notification model type enum', () => {
  it('includes appointment_reminder and daily_digest', () => {
    const Notification = require('../Notification');
    const enumValues = Notification.schema.paths.type.enumValues;
    expect(enumValues).toContain('appointment_reminder');
    expect(enumValues).toContain('daily_digest');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest src/models/__tests__/models.test.js --no-coverage
```

Expected: FAIL — `paths.remindersDisabled` is undefined

- [ ] **Step 3: Update Appointment model**

In `apps/api/src/models/Appointment.js`, add these three fields inside `appointmentSchema` after the `videoRoomName` field:

```js
  remindersDisabled: { type: Boolean, default: false },
  reminder24hJobId:  { type: String,  default: null },
  reminder1hJobId:   { type: String,  default: null },
```

- [ ] **Step 4: Update Doctor model**

In `apps/api/src/models/Doctor.js`, add after the `photoUrl` field:

```js
  timezone: { type: String, default: 'UTC' },
```

- [ ] **Step 5: Update Notification model**

In `apps/api/src/models/Notification.js`, replace the `type` field definition with:

```js
  type: {
    type: String,
    enum: [
      'appointment_requested',
      'appointment_confirmed',
      'consultation_validated',
      'notes_viewed',
      'appointment_reminder',
      'daily_digest',
    ],
    required: true,
  },
```

- [ ] **Step 6: Run tests — confirm pass**

```bash
cd apps/api && npx jest src/models/__tests__/models.test.js --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/models/Appointment.js apps/api/src/models/Doctor.js apps/api/src/models/Notification.js apps/api/src/models/__tests__/models.test.js
git commit -m "feat(api): add reminder fields to Appointment, Doctor, and Notification models"
```

---

### Task 3: Delay utilities + queue factory

**Files:**
- Create: `apps/api/src/utils/reminderDelays.js`
- Create: `apps/api/src/queues/reminderQueue.js`
- Test: `apps/api/src/utils/__tests__/reminderDelays.test.js`

**Interfaces:**
- Produces: `computeReminderDelays(appointmentDate: Date) → { delay24h: number, delay1h: number }` — milliseconds, clamped to ≥ 0
- Produces: `nextLocalSevenAmDelay(timezone: string) → number` — milliseconds until next 7:00 AM in the given IANA timezone
- Produces: `getReminderQueue() → BullMQ.Queue` — queue named `'appointment-reminders'`
- Produces: `getDigestQueue() → BullMQ.Queue` — queue named `'daily-digest'`
- Produces: `getConnection() → IORedis` — shared Redis connection

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/utils/__tests__/reminderDelays.test.js`:

```js
const { computeReminderDelays, nextLocalSevenAmDelay } = require('../reminderDelays');

describe('computeReminderDelays', () => {
  it('returns correct delays for appointment 48h away', () => {
    const now = Date.now();
    const apptDate = new Date(now + 48 * 60 * 60 * 1000);
    const { delay24h, delay1h } = computeReminderDelays(apptDate);
    // 24h delay should be ~24h (48h - 24h)
    expect(delay24h).toBeGreaterThan(23 * 60 * 60 * 1000 - 500);
    expect(delay24h).toBeLessThan(25 * 60 * 60 * 1000);
    // 1h delay should be ~47h (48h - 1h)
    expect(delay1h).toBeGreaterThan(46 * 60 * 60 * 1000 - 500);
    expect(delay1h).toBeLessThan(48 * 60 * 60 * 1000);
  });

  it('clamps to 0 when appointment is in the past', () => {
    const pastDate = new Date(Date.now() - 60 * 60 * 1000);
    const { delay24h, delay1h } = computeReminderDelays(pastDate);
    expect(delay24h).toBe(0);
    expect(delay1h).toBe(0);
  });
});

describe('nextLocalSevenAmDelay', () => {
  it('returns a positive delay in ms', () => {
    const delay = nextLocalSevenAmDelay('UTC');
    expect(delay).toBeGreaterThan(0);
  });

  it('returns delay of at most 24h + 1s', () => {
    const delay = nextLocalSevenAmDelay('Asia/Riyadh');
    expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
  });

  it('falls back to UTC for invalid timezone', () => {
    expect(() => nextLocalSevenAmDelay('Not/AZone')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest src/utils/__tests__/reminderDelays.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../reminderDelays'`

- [ ] **Step 3: Create `reminderDelays.js`**

Create `apps/api/src/utils/reminderDelays.js`:

```js
const { DateTime, IANAZone } = require('luxon');

function computeReminderDelays(appointmentDate) {
  const now = Date.now();
  const apptMs = new Date(appointmentDate).getTime();
  return {
    delay24h: Math.max(0, apptMs - 24 * 60 * 60 * 1000 - now),
    delay1h:  Math.max(0, apptMs -      60 * 60 * 1000 - now),
  };
}

function nextLocalSevenAmDelay(timezone) {
  const tz = IANAZone.isValidZone(timezone) ? timezone : 'UTC';
  const now = DateTime.now().setZone(tz);
  let target = now.set({ hour: 7, minute: 0, second: 0, millisecond: 0 });
  if (target <= now) target = target.plus({ days: 1 });
  return target.toMillis() - Date.now();
}

module.exports = { computeReminderDelays, nextLocalSevenAmDelay };
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd apps/api && npx jest src/utils/__tests__/reminderDelays.test.js --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Create `reminderQueue.js`**

Create `apps/api/src/queues/reminderQueue.js`:

```js
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

let _connection;

function getConnection() {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    _connection.on('error', (err) =>
      console.error('[redis] connection error:', err.message)
    );
  }
  return _connection;
}

let _reminderQueue;
let _digestQueue;

function getReminderQueue() {
  if (!_reminderQueue) {
    _reminderQueue = new Queue('appointment-reminders', { connection: getConnection() });
  }
  return _reminderQueue;
}

function getDigestQueue() {
  if (!_digestQueue) {
    _digestQueue = new Queue('daily-digest', { connection: getConnection() });
  }
  return _digestQueue;
}

module.exports = { getConnection, getReminderQueue, getDigestQueue };
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/utils/reminderDelays.js apps/api/src/utils/__tests__/reminderDelays.test.js apps/api/src/queues/reminderQueue.js
git commit -m "feat(api): add reminder delay utilities and BullMQ queue factory"
```

---

### Task 4: Reminder worker

**Files:**
- Create: `apps/api/src/workers/reminderWorker.js`
- Test: `apps/api/src/workers/__tests__/reminderWorker.test.js`

**Interfaces:**
- Consumes: `getReminderQueue()` → `{ connection: IORedis }` from Task 3
- Consumes: `Appointment.findById(id)` → `{ _id, status, remindersDisabled, patientId, date, timeSlot }`
- Consumes: `sendPush(fcmToken, title, body, data)` from `src/utils/push.js`
- Produces: `processReminderJob(job: { data: { appointmentId: string, reminderType: '24h'|'1h' } })` — async, exported for testing
- Produces: `startReminderWorker()` — starts BullMQ Worker on `'appointment-reminders'` queue

- [ ] **Step 1: Write failing worker tests**

Create `apps/api/src/workers/__tests__/reminderWorker.test.js`:

```js
jest.mock('../../models/Appointment');
jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../utils/push');
jest.mock('../../queues/reminderQueue', () => ({
  getConnection: jest.fn(),
  getReminderQueue: jest.fn(),
}));

const Appointment  = require('../../models/Appointment');
const Notification = require('../../models/Notification');
const User         = require('../../models/User');
const { sendPush } = require('../../utils/push');

const { processReminderJob } = require('../reminderWorker');

beforeEach(() => jest.clearAllMocks());

test('skips when appointment not found', async () => {
  Appointment.findById = jest.fn().mockResolvedValue(null);
  await processReminderJob({ data: { appointmentId: 'abc', reminderType: '24h' } });
  expect(Notification.create).not.toHaveBeenCalled();
});

test('skips when appointment is cancelled', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    status: 'cancelled', remindersDisabled: false, patientId: 'p1',
    date: new Date(Date.now() + 2 * 3600 * 1000), timeSlot: { start: '10:00' },
  });
  await processReminderJob({ data: { appointmentId: 'abc', reminderType: '24h' } });
  expect(Notification.create).not.toHaveBeenCalled();
});

test('skips when remindersDisabled is true', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    status: 'confirmed', remindersDisabled: true, patientId: 'p1',
    date: new Date(Date.now() + 2 * 3600 * 1000), timeSlot: { start: '10:00' },
  });
  await processReminderJob({ data: { appointmentId: 'abc', reminderType: '24h' } });
  expect(Notification.create).not.toHaveBeenCalled();
});

test('skips 1h reminder when appointment is < 30 min away', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'a1', status: 'confirmed', remindersDisabled: false, patientId: 'p1',
    date: new Date(Date.now() + 10 * 60 * 1000), timeSlot: { start: '10:00' },
  });
  await processReminderJob({ data: { appointmentId: 'a1', reminderType: '1h' } });
  expect(Notification.create).not.toHaveBeenCalled();
});

test('creates Notification and sends FCM push when eligible', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'a1', status: 'confirmed', remindersDisabled: false, patientId: 'p1',
    date: new Date(Date.now() + 2 * 3600 * 1000), timeSlot: { start: '10:00' },
  });
  User.findById = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue({ fcmToken: 'tok123' }),
  });
  Notification.create = jest.fn().mockResolvedValue({});
  sendPush.mockResolvedValue();

  await processReminderJob({ data: { appointmentId: 'a1', reminderType: '24h' } });

  expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
    recipientId: 'p1',
    type: 'appointment_reminder',
    payload: expect.objectContaining({ reminderType: '24h' }),
  }));
  expect(sendPush).toHaveBeenCalledWith(
    'tok123',
    'Reminder: Appointment Tomorrow',
    expect.stringContaining('10:00'),
    expect.objectContaining({ appointmentId: 'a1', reminderType: '24h' })
  );
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest src/workers/__tests__/reminderWorker.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../reminderWorker'`

- [ ] **Step 3: Create `reminderWorker.js`**

Create `apps/api/src/workers/reminderWorker.js`:

```js
const { Worker } = require('bullmq');
const Appointment  = require('../models/Appointment');
const Notification = require('../models/Notification');
const User         = require('../models/User');
const { sendPush } = require('../utils/push');
const { getConnection } = require('../queues/reminderQueue');

const THIRTY_MIN_MS = 30 * 60 * 1000;

async function processReminderJob(job) {
  const { appointmentId, reminderType } = job.data;

  const appt = await Appointment.findById(appointmentId);
  if (!appt) return;
  if (appt.status === 'cancelled') return;
  if (appt.remindersDisabled) return;

  if (reminderType === '1h') {
    const msUntilAppt = new Date(appt.date).getTime() - Date.now();
    if (msUntilAppt < THIRTY_MIN_MS) return;
  }

  const titles = {
    '24h': 'Reminder: Appointment Tomorrow',
    '1h':  'Reminder: Appointment in 1 Hour',
  };
  const bodies = {
    '24h': `Your appointment is scheduled for tomorrow at ${appt.timeSlot.start}.`,
    '1h':  `Your appointment starts in about 1 hour at ${appt.timeSlot.start}.`,
  };

  await Notification.create({
    recipientId: appt.patientId,
    type: 'appointment_reminder',
    payload: {
      appointmentId: appt._id,
      reminderType,
      message: bodies[reminderType],
    },
  });

  const user = await User.findById(appt.patientId).select('fcmToken');
  if (user?.fcmToken) {
    await sendPush(
      user.fcmToken,
      titles[reminderType],
      bodies[reminderType],
      { appointmentId: String(appt._id), reminderType }
    );
  }
}

function startReminderWorker() {
  const worker = new Worker('appointment-reminders', processReminderJob, {
    connection: getConnection(),
    concurrency: 5,
  });
  worker.on('failed', (job, err) =>
    console.error(`[reminders] job ${job?.id} failed:`, err.message)
  );
  console.log('[reminders] worker started');
  return worker;
}

module.exports = { startReminderWorker, processReminderJob };
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd apps/api && npx jest src/workers/__tests__/reminderWorker.test.js --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/reminderWorker.js apps/api/src/workers/__tests__/reminderWorker.test.js
git commit -m "feat(api): add appointment reminder BullMQ worker with guard checks"
```

---

### Task 5: Digest worker

**Files:**
- Create: `apps/api/src/workers/digestWorker.js`
- Test: `apps/api/src/workers/__tests__/digestWorker.test.js`

**Interfaces:**
- Consumes: `getDigestQueue()` from Task 3
- Consumes: `nextLocalSevenAmDelay(timezone: string) → number` from Task 3
- Consumes: `Doctor.find({}).populate('userId', '_id fcmToken')` → `[{ _id, timezone, userId: { _id, fcmToken } }]`
- Consumes: `Appointment.countDocuments({ doctorId, date: { $gte, $lte }, status: { $in } }) → number`
- Produces: `processOrchestratorJob(job)` — queries all doctors, enqueues per-doctor `digest-send` delayed jobs; exported for testing
- Produces: `processDigestSendJob(job: { data: { doctorUserId: string, doctorTimezone: string } })` — sends digest push if count > 0; exported for testing
- Produces: `startDigestWorker()` — BullMQ Worker on `'daily-digest'` queue
- Produces: `registerDigestOrchestrator()` — registers repeatable `orchestrate-digest` job (`0 0 * * *` UTC)

- [ ] **Step 1: Write failing digest worker tests**

Create `apps/api/src/workers/__tests__/digestWorker.test.js`:

```js
jest.mock('../../models/Doctor');
jest.mock('../../models/User');
jest.mock('../../models/Appointment');
jest.mock('../../models/Notification');
jest.mock('../../utils/push');
jest.mock('../../queues/reminderQueue', () => ({
  getConnection: jest.fn(),
  getDigestQueue: jest.fn(),
}));
jest.mock('../../utils/reminderDelays', () => ({
  nextLocalSevenAmDelay: jest.fn().mockReturnValue(3600000),
}));

const Doctor       = require('../../models/Doctor');
const User         = require('../../models/User');
const Appointment  = require('../../models/Appointment');
const Notification = require('../../models/Notification');
const { sendPush } = require('../../utils/push');
const { getDigestQueue } = require('../../queues/reminderQueue');

const { processOrchestratorJob, processDigestSendJob } = require('../digestWorker');

beforeEach(() => jest.clearAllMocks());

describe('processOrchestratorJob', () => {
  it('enqueues digest-send only for doctors with fcmToken', async () => {
    const mockAdd = jest.fn().mockResolvedValue({});
    getDigestQueue.mockReturnValue({ add: mockAdd });
    Doctor.find = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue([
        { _id: 'd1', timezone: 'UTC',         userId: { _id: 'u1', fcmToken: 'tok1' } },
        { _id: 'd2', timezone: 'Asia/Riyadh', userId: { _id: 'u2', fcmToken: null  } },
      ]),
    });

    await processOrchestratorJob({});

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      'digest-send',
      { doctorUserId: 'u1', doctorTimezone: 'UTC' },
      { delay: 3600000 }
    );
  });
});

describe('processDigestSendJob', () => {
  it('skips push and notification when no appointments today', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', fcmToken: 'tok1' }),
    });
    Appointment.countDocuments = jest.fn().mockResolvedValue(0);

    await processDigestSendJob({ data: { doctorUserId: 'u1', doctorTimezone: 'UTC' } });

    expect(sendPush).not.toHaveBeenCalled();
    expect(Notification.create).not.toHaveBeenCalled();
  });

  it('sends push and creates Notification when appointments exist', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', fcmToken: 'tok1' }),
    });
    Appointment.countDocuments = jest.fn().mockResolvedValue(3);
    Notification.create = jest.fn().mockResolvedValue({});
    sendPush.mockResolvedValue();

    await processDigestSendJob({ data: { doctorUserId: 'u1', doctorTimezone: 'UTC' } });

    expect(sendPush).toHaveBeenCalledWith(
      'tok1',
      'Daily Schedule',
      'You have 3 appointment(s) today.',
      {}
    );
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'u1',
      type: 'daily_digest',
      payload: expect.objectContaining({ count: 3 }),
    }));
  });

  it('skips when user has no fcmToken', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', fcmToken: null }),
    });
    await processDigestSendJob({ data: { doctorUserId: 'u1', doctorTimezone: 'UTC' } });
    expect(sendPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest src/workers/__tests__/digestWorker.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../digestWorker'`

- [ ] **Step 3: Create `digestWorker.js`**

Create `apps/api/src/workers/digestWorker.js`:

```js
const { Worker } = require('bullmq');
const { DateTime } = require('luxon');
const Doctor       = require('../models/Doctor');
const User         = require('../models/User');
const Appointment  = require('../models/Appointment');
const Notification = require('../models/Notification');
const { sendPush } = require('../utils/push');
const { getConnection, getDigestQueue } = require('../queues/reminderQueue');
const { nextLocalSevenAmDelay } = require('../utils/reminderDelays');

async function processOrchestratorJob(_job) {
  const doctors = await Doctor.find({}).populate('userId', '_id fcmToken');
  const queue = getDigestQueue();

  for (const doctor of doctors) {
    if (!doctor.userId?.fcmToken) continue;
    const delay = nextLocalSevenAmDelay(doctor.timezone || 'UTC');
    await queue.add(
      'digest-send',
      { doctorUserId: String(doctor.userId._id), doctorTimezone: doctor.timezone || 'UTC' },
      { delay }
    );
  }
}

async function processDigestSendJob(job) {
  const { doctorUserId, doctorTimezone } = job.data;

  const user = await User.findById(doctorUserId).select('_id fcmToken');
  if (!user?.fcmToken) return;

  const tz = doctorTimezone || 'UTC';
  const now = DateTime.now().setZone(tz);
  const startOfDay = now.startOf('day').toJSDate();
  const endOfDay   = now.endOf('day').toJSDate();

  const count = await Appointment.countDocuments({
    doctorId: doctorUserId,
    date:     { $gte: startOfDay, $lte: endOfDay },
    status:   { $in: ['confirmed', 'in_progress'] },
  });

  if (count === 0) return;

  await Notification.create({
    recipientId: doctorUserId,
    type: 'daily_digest',
    payload: { count, message: `You have ${count} appointment(s) today.` },
  });

  await sendPush(user.fcmToken, 'Daily Schedule', `You have ${count} appointment(s) today.`, {});
}

async function registerDigestOrchestrator() {
  const queue = getDigestQueue();
  await queue.add(
    'orchestrate-digest',
    {},
    {
      repeat:  { pattern: '0 0 * * *', utc: true },
      jobId:   'digest-orchestrator',
    }
  );
  console.log('[digest] orchestrator repeatable job registered');
}

function startDigestWorker() {
  const worker = new Worker('daily-digest', async (job) => {
    if (job.name === 'orchestrate-digest') return processOrchestratorJob(job);
    if (job.name === 'digest-send')        return processDigestSendJob(job);
  }, {
    connection: getConnection(),
    concurrency: 5,
  });
  worker.on('failed', (job, err) =>
    console.error(`[digest] job ${job?.id} (${job?.name}) failed:`, err.message)
  );
  console.log('[digest] worker started');
  return worker;
}

module.exports = {
  startDigestWorker,
  registerDigestOrchestrator,
  processOrchestratorJob,
  processDigestSendJob,
};
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd apps/api && npx jest src/workers/__tests__/digestWorker.test.js --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/digestWorker.js apps/api/src/workers/__tests__/digestWorker.test.js
git commit -m "feat(api): add daily digest BullMQ worker with timezone-aware scheduling"
```

---

### Task 6: Appointment route — job lifecycle + opt-out endpoint

**Files:**
- Modify: `apps/api/src/routes/appointments.js`
- Test: `apps/api/src/routes/__tests__/appointments-reminders.test.js`

**Interfaces:**
- Consumes: `computeReminderDelays(date)` from Task 3 → `{ delay24h: number, delay1h: number }`
- Consumes: `getReminderQueue()` from Task 3 → BullMQ Queue with `.add(name, data, opts)` and `.remove(jobId)`
- Produces: `scheduleReminders(appt)` — exported on `router` for testing; enqueues two jobs and saves IDs to `appt`
- Produces: `cancelReminders(appt)` — exported on `router` for testing; removes both jobs
- Produces: `PATCH /api/appointments/:id/reminders-opt-out` with body `{ disabled: boolean }` → `{ remindersDisabled: boolean }`

- [ ] **Step 1: Write failing route tests**

Create `apps/api/src/routes/__tests__/appointments-reminders.test.js`:

```js
jest.mock('../../queues/reminderQueue');
jest.mock('../../utils/reminderDelays');
jest.mock('../../models/Appointment');
jest.mock('../../models/Doctor');
jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../utils/push');

const { getReminderQueue }      = require('../../queues/reminderQueue');
const { computeReminderDelays } = require('../../utils/reminderDelays');

const router = require('../appointments');
const { scheduleReminders, cancelReminders } = router;

beforeEach(() => jest.clearAllMocks());

describe('scheduleReminders', () => {
  it('enqueues two jobs and stores their IDs on the appointment', async () => {
    const mockAdd = jest.fn()
      .mockResolvedValueOnce({ id: 'job-24h' })
      .mockResolvedValueOnce({ id: 'job-1h' });
    const mockSave = jest.fn().mockResolvedValue({});
    getReminderQueue.mockReturnValue({ add: mockAdd });
    computeReminderDelays.mockReturnValue({ delay24h: 5000, delay1h: 1000 });

    const appt = { _id: 'a1', date: new Date(), reminder24hJobId: null, reminder1hJobId: null, save: mockSave };
    await scheduleReminders(appt);

    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledWith(
      'reminder-24h',
      { appointmentId: 'a1', reminderType: '24h' },
      { delay: 5000, jobId: 'reminder-a1-24h' }
    );
    expect(mockAdd).toHaveBeenCalledWith(
      'reminder-1h',
      { appointmentId: 'a1', reminderType: '1h' },
      { delay: 1000, jobId: 'reminder-a1-1h' }
    );
    expect(appt.reminder24hJobId).toBe('job-24h');
    expect(appt.reminder1hJobId).toBe('job-1h');
    expect(mockSave).toHaveBeenCalled();
  });

  it('swallows errors without throwing (Redis down)', async () => {
    getReminderQueue.mockReturnValue({
      add: jest.fn().mockRejectedValue(new Error('Redis down')),
    });
    computeReminderDelays.mockReturnValue({ delay24h: 1000, delay1h: 500 });
    const appt = { _id: 'a1', date: new Date(), save: jest.fn() };
    await expect(scheduleReminders(appt)).resolves.toBeUndefined();
  });
});

describe('cancelReminders', () => {
  it('removes both jobs by stored IDs', async () => {
    const mockRemove = jest.fn().mockResolvedValue(true);
    getReminderQueue.mockReturnValue({ remove: mockRemove });

    await cancelReminders({ reminder24hJobId: 'job-24h', reminder1hJobId: 'job-1h' });

    expect(mockRemove).toHaveBeenCalledWith('job-24h');
    expect(mockRemove).toHaveBeenCalledWith('job-1h');
  });

  it('is a no-op when no job IDs stored', async () => {
    const mockRemove = jest.fn();
    getReminderQueue.mockReturnValue({ remove: mockRemove });
    await cancelReminders({ reminder24hJobId: null, reminder1hJobId: null });
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest src/routes/__tests__/appointments-reminders.test.js --no-coverage
```

Expected: FAIL — `scheduleReminders` is undefined

- [ ] **Step 3: Add imports at the top of `appointments.js`**

In `apps/api/src/routes/appointments.js`, add these two lines after the existing `require` statements at the top:

```js
const { getReminderQueue }      = require('../queues/reminderQueue');
const { computeReminderDelays } = require('../utils/reminderDelays');
```

- [ ] **Step 4: Add `scheduleReminders` and `cancelReminders` helpers**

In `apps/api/src/routes/appointments.js`, add these two functions immediately after the existing `notifyUser` function:

```js
async function scheduleReminders(appt) {
  try {
    const queue = getReminderQueue();
    const { delay24h, delay1h } = computeReminderDelays(appt.date);

    const job24h = await queue.add(
      'reminder-24h',
      { appointmentId: String(appt._id), reminderType: '24h' },
      { delay: delay24h, jobId: `reminder-${appt._id}-24h` }
    );
    const job1h = await queue.add(
      'reminder-1h',
      { appointmentId: String(appt._id), reminderType: '1h' },
      { delay: delay1h,  jobId: `reminder-${appt._id}-1h`  }
    );

    appt.reminder24hJobId = job24h.id;
    appt.reminder1hJobId  = job1h.id;
    await appt.save();
  } catch (err) {
    console.error('[reminders] enqueue failed:', String(appt._id), err.message);
  }
}

async function cancelReminders(appt) {
  try {
    const queue = getReminderQueue();
    if (appt.reminder24hJobId) await queue.remove(appt.reminder24hJobId);
    if (appt.reminder1hJobId)  await queue.remove(appt.reminder1hJobId);
  } catch (err) {
    console.error('[reminders] cancel failed:', err.message);
  }
}
```

- [ ] **Step 5: Call `scheduleReminders` in the `POST /` handler (auto-accept path)**

In the `POST /` handler, find this line:
```js
    res.status(201).json(appt);
```

Replace it with:
```js
    if (appt.status === 'confirmed') {
      await scheduleReminders(appt);
    }

    res.status(201).json(appt);
```

- [ ] **Step 6: Call `scheduleReminders` in the `PATCH /:id/confirm` handler**

In the `PATCH /:id/confirm` handler, find:
```js
    appt.status = 'confirmed';
    await appt.save();

    await notifyUser(appt.patientId, 'appointment_confirmed', {
```

Add `scheduleReminders` call between `appt.save()` and `notifyUser`:
```js
    appt.status = 'confirmed';
    await appt.save();

    await scheduleReminders(appt);

    await notifyUser(appt.patientId, 'appointment_confirmed', {
```

- [ ] **Step 7: Call `cancelReminders` in the `PATCH /:id/cancel` handler**

In the `PATCH /:id/cancel` handler, find the ownership check block. Add `cancelReminders` call right before the status change:

```js
    if (!isParty) return res.status(403).json({ message: 'Forbidden' });
    if (appt.status === 'validated') return res.status(409).json({ message: 'Cannot cancel a validated appointment' });

    await cancelReminders(appt);   // ← add this line

    appt.status = 'cancelled';
```

- [ ] **Step 8: Add `PATCH /:id/reminders-opt-out` endpoint**

In `apps/api/src/routes/appointments.js`, add this endpoint after the `PATCH /:id/cancel` handler:

```js
// PATCH /api/appointments/:id/reminders-opt-out — patient toggles per-appointment reminders
router.patch('/:id/reminders-opt-out', auth, requireRole('patient'), async (req, res, next) => {
  try {
    const { disabled } = req.body;
    if (typeof disabled !== 'boolean') {
      return res.status(400).json({ message: 'disabled must be a boolean' });
    }

    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Not found' });
    if (appt.patientId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (appt.status !== 'confirmed' || new Date(appt.date) <= new Date()) {
      return res.status(400).json({ message: 'Reminders can only be toggled for future confirmed appointments' });
    }

    appt.remindersDisabled = disabled;
    await appt.save();

    res.json({ remindersDisabled: appt.remindersDisabled });
  } catch (err) { next(err); }
});
```

- [ ] **Step 9: Export helpers for testing**

At the very bottom of `apps/api/src/routes/appointments.js`, after `module.exports = router;`, add:

```js
router.scheduleReminders = scheduleReminders;
router.cancelReminders   = cancelReminders;
```

- [ ] **Step 10: Run tests — confirm pass**

```bash
cd apps/api && npx jest src/routes/__tests__/appointments-reminders.test.js --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/routes/appointments.js apps/api/src/routes/__tests__/appointments-reminders.test.js
git commit -m "feat(api): schedule/cancel BullMQ reminders on appointment lifecycle; add opt-out endpoint"
```

---

### Task 7: Doctor route — accept `timezone` field

**Files:**
- Modify: `apps/api/src/routes/doctors.js`

**Interfaces:**
- Consumes: `IANAZone.isValidZone(timezone: string) → boolean` from `luxon`
- Produces: Existing `PATCH /api/doctors/:id` now accepts and validates `timezone` string before saving to `Doctor.timezone`

- [ ] **Step 1: Find the PATCH doctor handler**

```bash
grep -n 'router.patch\|findByIdAndUpdate\|autoAcceptAppointments' apps/api/src/routes/doctors.js | head -20
```

Note the line number where the handler reads `autoAcceptAppointments` from `req.body`.

- [ ] **Step 2: Add `luxon` import**

At the top of `apps/api/src/routes/doctors.js`, add:

```js
const { IANAZone } = require('luxon');
```

- [ ] **Step 3: Add `timezone` extraction and validation in the PATCH handler**

In the PATCH handler body, find where `autoAcceptAppointments` and `availabilitySlots` are extracted from `req.body`. Add `timezone` to the destructure and add a validation block before the DB update:

```js
    const { autoAcceptAppointments, availabilitySlots, timezone } = req.body;

    if (timezone !== undefined) {
      if (!IANAZone.isValidZone(timezone)) {
        return res.status(400).json({ message: 'Invalid timezone. Use a valid IANA timezone string (e.g. "Asia/Riyadh").' });
      }
      // set on the doctor doc before saving
    }
```

Where the doctor document is updated (either via `findByIdAndUpdate` or by setting properties and calling `.save()`), add:

```js
    if (timezone !== undefined && IANAZone.isValidZone(timezone)) {
      doctor.timezone = timezone;
    }
```

- [ ] **Step 4: Verify module loads without error**

```bash
cd apps/api && node -e "require('./src/routes/doctors')" && echo 'ok'
```

Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/doctors.js
git commit -m "feat(api): accept and validate IANA timezone in doctor profile update"
```

---

### Task 8: Wire workers into `index.js`

**Files:**
- Modify: `apps/api/src/index.js`

**Interfaces:**
- Consumes: `startReminderWorker()` from Task 4
- Consumes: `startDigestWorker()`, `registerDigestOrchestrator()` from Task 5
- Produces: Both workers started and orchestrator registered after MongoDB connects; guarded by `REDIS_URL` presence so test environments without Redis don't attempt connection

- [ ] **Step 1: Add worker imports**

In `apps/api/src/index.js`, add after the existing `require` statements:

```js
const { startReminderWorker }                          = require('./workers/reminderWorker');
const { startDigestWorker, registerDigestOrchestrator } = require('./workers/digestWorker');
```

- [ ] **Step 2: Start workers after DB connects**

In `apps/api/src/index.js`, inside the `.then(() => { httpServer.listen(...) })` callback, add after the `httpServer.listen(...)` call:

```js
    if (process.env.REDIS_URL) {
      startReminderWorker();
      startDigestWorker();
      registerDigestOrchestrator().catch(err =>
        console.error('[digest] orchestrator registration failed:', err.message)
      );
    } else {
      console.warn('[reminders] REDIS_URL not set — reminder workers disabled');
    }
```

- [ ] **Step 3: Start server and check logs**

```bash
cd apps/api && REDIS_URL=redis://localhost:6379 node src/index.js
```

Expected log lines:
```
[reminders] worker started
[digest] worker started
[digest] orchestrator repeatable job registered
```

Kill with Ctrl+C after verifying.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.js
git commit -m "feat(api): start BullMQ reminder and digest workers on server boot"
```

---

### Task 9: Mobile — API client + patient opt-out + doctor timezone

**Files:**
- Modify: `apps/mobile/src/api/appointments.js`
- Modify: `apps/mobile/src/screens/patient/MyAppointmentsScreen.js`
- Modify: `apps/mobile/src/screens/doctor/SettingsScreen.js`

**Interfaces:**
- Consumes: `PATCH /api/appointments/:id/reminders-opt-out` (body `{ disabled: boolean }`) → `{ remindersDisabled: boolean }`
- Consumes: Existing `updateDoctorSettings(doctorId, data)` in `src/api/doctors.js` — now passes `timezone`
- Produces: `toggleReminderOptOut(id: string, disabled: boolean) → Promise<{ remindersDisabled: boolean }>`

- [ ] **Step 1: Check if `@react-native-picker/picker` is installed**

```bash
grep 'picker' apps/mobile/package.json
```

If not found, install:
```bash
cd apps/mobile && npx expo install @react-native-picker/picker
```

- [ ] **Step 2: Add `toggleReminderOptOut` to mobile appointments API**

In `apps/mobile/src/api/appointments.js`, add:

```js
export const toggleReminderOptOut = (id, disabled) =>
  client.patch(`/appointments/${id}/reminders-opt-out`, { disabled }).then(r => r.data);
```

- [ ] **Step 3: Add reminder toggle to `MyAppointmentsScreen.js`**

In `apps/mobile/src/screens/patient/MyAppointmentsScreen.js`:

Update the React Native import to include `Switch`:
```js
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Switch } from 'react-native';
```

Update the appointments API import:
```js
import { getAppointments, updateStatus, toggleReminderOptOut } from '../../api/appointments';
```

Inside the appointment card render function (the `Item` component or inline render where each appointment `a` is rendered), add the toggle below the cancel button — visible only on future confirmed appointments:

```js
{a.status === 'confirmed' && new Date(a.date) > new Date() && (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
    <Text style={{ fontSize: 11, color: C.text2 }}>Disable reminders</Text>
    <Switch
      value={!!a.remindersDisabled}
      onValueChange={async (val) => {
        await toggleReminderOptOut(a._id, val);
        load();
      }}
      trackColor={{ false: C.border, true: C.rose }}
      thumbColor="#fff"
    />
  </View>
)}
```

- [ ] **Step 4: Add timezone picker to `SettingsScreen.js`**

In `apps/mobile/src/screens/doctor/SettingsScreen.js`:

Add import at top:
```js
import { Picker } from '@react-native-picker/picker';
```

Add timezone constant before the component:
```js
const TIMEZONES = [
  { label: 'UTC',                 value: 'UTC' },
  { label: 'Riyadh (AST +3)',     value: 'Asia/Riyadh' },
  { label: 'Dubai (GST +4)',      value: 'Asia/Dubai' },
  { label: 'Kuwait (AST +3)',     value: 'Asia/Kuwait' },
  { label: 'Cairo (EET +2)',      value: 'Africa/Cairo' },
  { label: 'London (GMT)',        value: 'Europe/London' },
  { label: 'Paris (CET +1)',      value: 'Europe/Paris' },
  { label: 'New York (ET -5)',    value: 'America/New_York' },
  { label: 'Los Angeles (PT -8)', value: 'America/Los_Angeles' },
  { label: 'Karachi (PKT +5)',    value: 'Asia/Karachi' },
  { label: 'Mumbai (IST +5:30)', value: 'Asia/Kolkata' },
  { label: 'Singapore (SGT +8)', value: 'Asia/Singapore' },
];
```

Add state inside the component (alongside existing `autoAccept` state):
```js
const [timezone, setTimezone] = useState('UTC');
```

In the `useEffect` that loads doctor profile (where `setAutoAccept` is called), also add:
```js
setTimezone(profile.timezone || 'UTC');
```

In the `save` function (where `updateDoctorSettings` is called), add `timezone`:
```js
await updateDoctorSettings(doctorId, {
  autoAcceptAppointments: autoAccept,
  availabilitySlots: slots,
  timezone,
});
```

In the JSX inside `ScrollView`, add this section after the existing auto-accept section:
```js
<View style={{ marginTop: 16, backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12 }}>
  <Text style={{ fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 4 }}>
    Daily Digest Timezone
  </Text>
  <Text style={{ fontSize: 11, color: C.text2, marginBottom: 8 }}>
    Your morning schedule summary will arrive at 7:00 AM in this timezone.
  </Text>
  <Picker selectedValue={timezone} onValueChange={setTimezone} style={{ color: C.text }}>
    {TIMEZONES.map(tz => (
      <Picker.Item key={tz.value} label={tz.label} value={tz.value} />
    ))}
  </Picker>
</View>
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/api/appointments.js apps/mobile/src/screens/patient/MyAppointmentsScreen.js apps/mobile/src/screens/doctor/SettingsScreen.js
git commit -m "feat(mobile): add reminder opt-out toggle and doctor timezone picker"
```

---

### Task 10: Web — API client + patient opt-out + doctor timezone

**Files:**
- Modify: `apps/web/src/api/appointments.js`
- Modify: `apps/web/src/pages/patient/MyAppointmentsPage.jsx`
- Modify: `apps/web/src/pages/doctor/DoctorSettingsPage.jsx`

**Interfaces:**
- Consumes: `PATCH /api/appointments/:id/reminders-opt-out` (body `{ disabled: boolean }`) → `{ remindersDisabled: boolean }`
- Consumes: Existing `updateDoctorSettings(doctorId, data)` — now passes `timezone`
- Produces: `toggleReminderOptOut(id: string, disabled: boolean) → Promise<{ remindersDisabled: boolean }>`

- [ ] **Step 1: Add `toggleReminderOptOut` to web appointments API**

In `apps/web/src/api/appointments.js`, add:

```js
export const toggleReminderOptOut = (id, disabled) =>
  client.patch(`/appointments/${id}/reminders-opt-out`, { disabled }).then(r => r.data);
```

- [ ] **Step 2: Add reminder toggle to `MyAppointmentsPage.jsx`**

In `apps/web/src/pages/patient/MyAppointmentsPage.jsx`:

Update the appointments import:
```js
import { getAppointments, updateStatus, toggleReminderOptOut } from '../../api/appointments';
```

Inside the `Card` component, find where the video call button is rendered (inside `{!isPast && a.status === 'confirmed' && ...}`). After that block, add the reminder toggle row:

```jsx
{!isPast && a.status === 'confirmed' && (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' }}>
    <span>Disable reminders</span>
    <button
      onClick={async () => {
        await toggleReminderOptOut(a._id, !a.remindersDisabled);
        load();
      }}
      style={{
        width: 38, height: 20, borderRadius: 10,
        background: a.remindersDisabled ? 'var(--rose, #f43f5e)' : 'var(--border2, #334155)',
        border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s'
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: a.remindersDisabled ? 20 : 2,
        width: 16, height: 16, borderRadius: 8,
        background: '#fff', transition: 'left .2s', display: 'block',
      }} />
    </button>
  </div>
)}
```

- [ ] **Step 3: Add timezone selector to `DoctorSettingsPage.jsx`**

In `apps/web/src/pages/doctor/DoctorSettingsPage.jsx`:

Add timezone constant before the component:
```js
const TIMEZONES = [
  { label: 'UTC',                 value: 'UTC' },
  { label: 'Riyadh (AST +3)',     value: 'Asia/Riyadh' },
  { label: 'Dubai (GST +4)',      value: 'Asia/Dubai' },
  { label: 'Kuwait (AST +3)',     value: 'Asia/Kuwait' },
  { label: 'Cairo (EET +2)',      value: 'Africa/Cairo' },
  { label: 'London (GMT)',        value: 'Europe/London' },
  { label: 'Paris (CET +1)',      value: 'Europe/Paris' },
  { label: 'New York (ET -5)',    value: 'America/New_York' },
  { label: 'Los Angeles (PT -8)', value: 'America/Los_Angeles' },
  { label: 'Karachi (PKT +5)',    value: 'Asia/Karachi' },
  { label: 'Mumbai (IST +5:30)', value: 'Asia/Kolkata' },
  { label: 'Singapore (SGT +8)', value: 'Asia/Singapore' },
];
```

Add state alongside existing state:
```js
const [timezone, setTimezone] = useState('UTC');
```

In the `useEffect` that loads the doctor profile (where `setAutoAccept` is called), also add:
```js
setTimezone(profile.timezone || 'UTC');
```

In the `save` function, add `timezone`:
```js
await updateDoctorSettings(doctorId, {
  autoAcceptAppointments: autoAccept,
  availabilitySlots: slots,
  timezone,
});
```

Add the timezone section in the JSX return, after the auto-accept card:
```jsx
<div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 20, marginBottom: 20 }}>
  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Daily Digest Timezone</div>
  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
    Your morning schedule summary arrives at 7:00 AM in this timezone.
  </div>
  <select
    value={timezone}
    onChange={e => setTimezone(e.target.value)}
    style={{
      width: '100%', padding: '8px 10px', borderRadius: 6,
      border: '1px solid var(--border)', background: 'var(--bg3)',
      color: 'var(--text)', fontSize: 13, cursor: 'pointer',
    }}
  >
    {TIMEZONES.map(tz => (
      <option key={tz.value} value={tz.value}>{tz.label}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/appointments.js apps/web/src/pages/patient/MyAppointmentsPage.jsx apps/web/src/pages/doctor/DoctorSettingsPage.jsx
git commit -m "feat(web): add reminder opt-out toggle and doctor timezone selector"
```

---

## Notes

- **Appointment reschedule:** No reschedule (date-change) endpoint exists in the current codebase. If one is added in future, call `cancelReminders(appt)` then update the date then `scheduleReminders(appt)` within the same handler.
- **Test runner:** `cd apps/api && npx jest --no-coverage` runs all tests.
- **Redis in CI:** Set `REDIS_URL` env var in CI or omit it — worker startup is gated on `process.env.REDIS_URL`.
