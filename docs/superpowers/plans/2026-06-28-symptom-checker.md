# Phase 4.1 AI Symptom Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let patients optionally describe symptoms when booking; Claude Haiku extracts urgency + category async via BullMQ; doctor sees raw text + AI badge on appointment detail.

**Architecture:** New fields on `Appointment` model. A `PATCH /:id/symptoms` endpoint saves text and enqueues a `symptom-analysis` BullMQ job. `symptomWorker.js` calls Claude Haiku, writes structured output back to the appointment. Mobile booking flow navigates through a new optional `SymptomInputScreen` between slot selection and confirmation. Doctor detail screens (mobile + web) render a Patient Symptoms card.

**Tech Stack:** Node.js/Express, Mongoose, BullMQ, `@anthropic-ai/sdk`, React Native (Expo), React.js

## Global Constraints

- `@anthropic-ai/sdk` installed in `apps/api` only
- Claude model: `claude-haiku-4-5-20251001`
- CommonJS only in `apps/api` (require/module.exports)
- ESM imports in `apps/mobile` and `apps/web`
- `ANTHROPIC_API_KEY` is server-only env var — never exposed to client
- Worker gated on `process.env.REDIS_URL` (matches existing pattern in `apps/api/src/index.js`)
- `symptomText` max 1000 characters — validated server-side
- AI disclaimer always shown: `"AI-generated — not a substitute for clinical judgment."`
- Urgency colors: low=`#22c55e`, medium=`#f59e0b`, high=`#ef4444`
- All existing tests must continue to pass

---

### Task 1: Appointment model + install SDK

**Files:**
- Modify: `apps/api/package.json` (via npm install)
- Modify: `apps/api/src/models/Appointment.js`
- Test: `apps/api/src/models/__tests__/models.test.js` (extend existing)

**Interfaces:**
- Produces: `Appointment` schema with `symptomText: String (default null)` and `symptomAnalysis: { urgency: String enum low/medium/high default null, category: String default null, processedAt: Date default null }`
- Produces: `@anthropic-ai/sdk` importable in `apps/api/src/`

- [ ] **Step 1: Install SDK**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/api && npm install @anthropic-ai/sdk
```

Expected: `added N packages` with no peer-dep errors.

- [ ] **Step 2: Verify**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/api && node -e "require('@anthropic-ai/sdk'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Write failing model tests**

In `apps/api/src/models/__tests__/models.test.js`, add:

```js
describe('Appointment symptom fields', () => {
  it('has symptomText defaulting to null', () => {
    const Appointment = require('../Appointment');
    const path = Appointment.schema.paths.symptomText;
    expect(path).toBeDefined();
    expect(path.defaultValue).toBeNull();
  });
  it('has symptomAnalysis.urgency enum low/medium/high', () => {
    const Appointment = require('../Appointment');
    const path = Appointment.schema.paths['symptomAnalysis.urgency'];
    expect(path).toBeDefined();
    expect(path.enumValues).toEqual(['low', 'medium', 'high']);
  });
  it('has symptomAnalysis.processedAt defaulting to null', () => {
    const Appointment = require('../Appointment');
    const path = Appointment.schema.paths['symptomAnalysis.processedAt'];
    expect(path).toBeDefined();
    expect(path.defaultValue).toBeNull();
  });
});
```

- [ ] **Step 4: Run to confirm failure**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/api && npx jest src/models/__tests__/models.test.js --no-coverage
```

Expected: FAIL — `symptomText` path is undefined.

- [ ] **Step 5: Add fields to Appointment.js**

In `apps/api/src/models/Appointment.js`, add after `reminder1hJobId`:

```js
  symptomText:     { type: String, default: null },
  symptomAnalysis: {
    urgency:     { type: String, enum: ['low', 'medium', 'high'], default: null },
    category:    { type: String, default: null },
    processedAt: { type: Date,   default: null },
  },
```

- [ ] **Step 6: Run tests — confirm pass**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/api && npx jest src/models/__tests__/models.test.js --no-coverage
```

Expected: PASS (all existing tests + 3 new).

- [ ] **Step 7: Commit**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && git add apps/api/package.json apps/api/package-lock.json package-lock.json apps/api/src/models/Appointment.js apps/api/src/models/__tests__/models.test.js
git commit -m "feat(api): add symptom fields to Appointment model and install @anthropic-ai/sdk"
```

---

### Task 2: Symptom queue factory + PATCH endpoint

**Files:**
- Modify: `apps/api/src/queues/reminderQueue.js`
- Modify: `apps/api/src/routes/appointments.js`
- Test: `apps/api/src/routes/__tests__/appointments-symptoms.test.js`

**Interfaces:**
- Consumes: `Appointment.symptomText`, `Appointment.symptomAnalysis` (from Task 1)
- Produces: `getSymptomQueue()` — returns BullMQ `Queue` named `'symptom-analysis'`
- Produces: `PATCH /api/appointments/:id/symptoms` — saves `symptomText`, clears `symptomAnalysis`, enqueues job, returns 202

- [ ] **Step 1: Write failing route tests**

Create `apps/api/src/routes/__tests__/appointments-symptoms.test.js`:

```js
jest.mock('../../models/Appointment');
jest.mock('../../queues/reminderQueue', () => ({
  getReminderQueue: jest.fn(),
  getConnection:    jest.fn(),
  getSymptomQueue:  jest.fn(() => ({ add: jest.fn().mockResolvedValue({ id: 'job1' }) })),
}));
jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'pat1', role: 'patient' };
  next();
});

const Appointment = require('../../models/Appointment');
const express     = require('express');
const request     = require('supertest');
const router      = require('../appointments');

const app = express();
app.use(express.json());
app.use('/api/appointments', router);

beforeEach(() => jest.clearAllMocks());

test('PATCH /symptoms saves text and returns 202', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'appt1', patientId: 'pat1', status: 'confirmed', save: jest.fn(),
  });
  const res = await request(app)
    .patch('/api/appointments/appt1/symptoms')
    .send({ symptomText: 'I have a headache' });
  expect(res.status).toBe(202);
});

test('returns 400 if symptomText missing', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'appt1', patientId: 'pat1', status: 'confirmed', save: jest.fn(),
  });
  const res = await request(app)
    .patch('/api/appointments/appt1/symptoms')
    .send({});
  expect(res.status).toBe(400);
});

test('returns 400 if symptomText exceeds 1000 chars', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'appt1', patientId: 'pat1', status: 'confirmed', save: jest.fn(),
  });
  const res = await request(app)
    .patch('/api/appointments/appt1/symptoms')
    .send({ symptomText: 'x'.repeat(1001) });
  expect(res.status).toBe(400);
});

test('returns 403 if patient does not own appointment', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'appt1', patientId: 'other', status: 'confirmed', save: jest.fn(),
  });
  const res = await request(app)
    .patch('/api/appointments/appt1/symptoms')
    .send({ symptomText: 'headache' });
  expect(res.status).toBe(403);
});

test('returns 409 if appointment is validated', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'appt1', patientId: 'pat1', status: 'validated', save: jest.fn(),
  });
  const res = await request(app)
    .patch('/api/appointments/appt1/symptoms')
    .send({ symptomText: 'headache' });
  expect(res.status).toBe(409);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/api && npx jest src/routes/__tests__/appointments-symptoms.test.js --no-coverage
```

Expected: FAIL — `getSymptomQueue` not found / route not found.

- [ ] **Step 3: Add getSymptomQueue to reminderQueue.js**

In `apps/api/src/queues/reminderQueue.js`, add after `getDigestQueue`:

```js
let _symptomQueue;

function getSymptomQueue() {
  if (!_symptomQueue) {
    _symptomQueue = new Queue('symptom-analysis', { connection: getConnection() });
  }
  return _symptomQueue;
}
```

And add `getSymptomQueue` to the `module.exports` line:

```js
module.exports = { getConnection, getReminderQueue, getDigestQueue, getSymptomQueue };
```

- [ ] **Step 4: Add PATCH /:id/symptoms to appointments.js**

In `apps/api/src/routes/appointments.js`, require `getSymptomQueue` at the top (add to the existing reminderQueue require):

```js
const { getReminderQueue, getSymptomQueue } = require('../queues/reminderQueue');
```

Then add the route before `module.exports`:

```js
// PATCH /api/appointments/:id/symptoms — patient submits symptoms (async analysis)
router.patch('/:id/symptoms', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ message: 'Patients only' });

    const { symptomText } = req.body;
    if (!symptomText || typeof symptomText !== 'string' || symptomText.trim().length === 0) {
      return res.status(400).json({ message: 'symptomText is required' });
    }
    if (symptomText.length > 1000) {
      return res.status(400).json({ message: 'symptomText must be 1000 characters or fewer' });
    }

    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (String(appt.patientId) !== req.user.id) {
      return res.status(403).json({ message: 'Not your appointment' });
    }
    if (['validated', 'cancelled'].includes(appt.status)) {
      return res.status(409).json({ message: 'Cannot update symptoms for a validated or cancelled appointment' });
    }

    appt.symptomText = symptomText.trim();
    appt.symptomAnalysis = { urgency: null, category: null, processedAt: null };
    await appt.save();

    await getSymptomQueue().add('analyse', { appointmentId: String(appt._id) }, {
      jobId: `symptom-${appt._id}`,
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    res.status(202).json({ message: 'Symptoms received' });
  } catch (err) { next(err); }
});
```

- [ ] **Step 5: Run tests — confirm pass**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/api && npx jest src/routes/__tests__/appointments-symptoms.test.js --no-coverage
```

Expected: PASS (5 tests).

- [ ] **Step 6: Run existing appointment tests to confirm no regressions**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/api && npx jest src/routes/__tests__/appointments-reminders.test.js src/routes/__tests__/appointments-notify.test.js --no-coverage
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && git add apps/api/src/queues/reminderQueue.js apps/api/src/routes/appointments.js apps/api/src/routes/__tests__/appointments-symptoms.test.js
git commit -m "feat(api): add symptom queue factory and PATCH /appointments/:id/symptoms endpoint"
```

---

### Task 3: Symptom worker (Claude Haiku)

**Files:**
- Create: `apps/api/src/workers/symptomWorker.js`
- Modify: `apps/api/src/index.js`
- Test: `apps/api/src/workers/__tests__/symptomWorker.test.js`

**Interfaces:**
- Consumes: `getSymptomQueue()` from `../queues/reminderQueue`
- Consumes: `Appointment.findById(id)` → `{ symptomText, save() }`
- Produces: `startSymptomWorker()` — starts the BullMQ worker, exported for `index.js`
- Produces: `processSymptomJob(job)` — exported for testing

- [ ] **Step 1: Write failing worker tests**

Create `apps/api/src/workers/__tests__/symptomWorker.test.js`:

```js
jest.mock('../../models/Appointment');
jest.mock('../../queues/reminderQueue', () => ({
  getConnection:   jest.fn(() => ({})),
  getSymptomQueue: jest.fn(() => ({})),
}));
jest.mock('@anthropic-ai/sdk');

const Appointment     = require('../../models/Appointment');
const Anthropic       = require('@anthropic-ai/sdk');
const { processSymptomJob } = require('../symptomWorker');

beforeEach(() => jest.clearAllMocks());

function mockAppt(overrides = {}) {
  const appt = { _id: 'a1', symptomText: 'I have a fever', save: jest.fn(), ...overrides };
  Appointment.findById = jest.fn().mockResolvedValue(appt);
  return appt;
}

function mockClaude(json) {
  Anthropic.mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: JSON.stringify(json) }],
      }),
    },
  }));
}

test('writes urgency and category to appointment', async () => {
  const appt = mockAppt();
  mockClaude({ urgency: 'low', category: 'fever' });
  process.env.ANTHROPIC_API_KEY = 'test-key';

  await processSymptomJob({ data: { appointmentId: 'a1' } });

  expect(appt.symptomAnalysis.urgency).toBe('low');
  expect(appt.symptomAnalysis.category).toBe('fever');
  expect(appt.symptomAnalysis.processedAt).toBeInstanceOf(Date);
  expect(appt.save).toHaveBeenCalled();
});

test('skips if appointment not found', async () => {
  Appointment.findById = jest.fn().mockResolvedValue(null);
  await expect(processSymptomJob({ data: { appointmentId: 'missing' } })).resolves.toBeUndefined();
});

test('skips if symptomText is null', async () => {
  mockAppt({ symptomText: null });
  await expect(processSymptomJob({ data: { appointmentId: 'a1' } })).resolves.toBeUndefined();
});

test('sets null analysis on JSON parse failure', async () => {
  const appt = mockAppt();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  Anthropic.mockImplementation(() => ({
    messages: { create: jest.fn().mockResolvedValue({ content: [{ text: 'not json' }] }) },
  }));

  await processSymptomJob({ data: { appointmentId: 'a1' } });

  expect(appt.symptomAnalysis.urgency).toBeNull();
  expect(appt.symptomAnalysis.category).toBeNull();
  expect(appt.symptomAnalysis.processedAt).toBeInstanceOf(Date);
  expect(appt.save).toHaveBeenCalled();
});

test('skips if ANTHROPIC_API_KEY not set', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const appt = mockAppt();
  await processSymptomJob({ data: { appointmentId: 'a1' } });
  expect(appt.save).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/api && npx jest src/workers/__tests__/symptomWorker.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../symptomWorker'`.

- [ ] **Step 3: Create symptomWorker.js**

Create `apps/api/src/workers/symptomWorker.js`:

```js
'use strict';

const { Worker }    = require('bullmq');
const Appointment   = require('../models/Appointment');
const { getConnection } = require('../queues/reminderQueue');

const SYSTEM_PROMPT = `You are a medical triage assistant. Extract two things from the patient's symptom description and return ONLY valid JSON — no other text, no markdown.
Schema: { "urgency": "low" | "medium" | "high", "category": "<one short phrase>" }
Rules:
- urgency=high only for: chest pain, difficulty breathing, severe bleeding, loss of consciousness, or stroke signs.
- urgency=medium for moderate pain, fever >39°C, persistent vomiting, or worsening chronic symptoms.
- urgency=low for everything else.
- category: one short phrase, e.g. "respiratory", "joint pain", "skin rash", "digestive".
- Never diagnose. Never suggest medications.`;

async function processSymptomJob(job) {
  const { appointmentId } = job.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[symptom] ANTHROPIC_API_KEY not set — skipping');
    return;
  }

  const appt = await Appointment.findById(appointmentId);
  if (!appt || !appt.symptomText) return;

  let urgency = null;
  let category = null;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic(process.env.ANTHROPIC_API_KEY);
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: appt.symptomText }],
    });
    const parsed = JSON.parse(response.content[0].text);
    if (['low', 'medium', 'high'].includes(parsed.urgency)) urgency = parsed.urgency;
    if (typeof parsed.category === 'string') category = parsed.category.slice(0, 100);
  } catch (err) {
    console.error('[symptom] analysis failed:', err.message);
  }

  appt.symptomAnalysis = { urgency, category, processedAt: new Date() };
  await appt.save();
}

function startSymptomWorker() {
  const worker = new Worker('symptom-analysis', processSymptomJob, { connection: getConnection() });
  worker.on('failed', (job, err) =>
    console.error('[symptom] job failed:', job?.id, err.message)
  );
  console.log('[symptom] worker started');
  return worker;
}

module.exports = { startSymptomWorker, processSymptomJob };
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/api && npx jest src/workers/__tests__/symptomWorker.test.js --no-coverage
```

Expected: PASS (5 tests).

- [ ] **Step 5: Wire worker into index.js**

In `apps/api/src/index.js`, add alongside the existing worker requires (around line 8):

```js
const { startSymptomWorker } = require('./workers/symptomWorker');
```

Inside the `if (process.env.REDIS_URL)` block, add:

```js
    startSymptomWorker();
```

- [ ] **Step 6: Run all API tests**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/api && npx jest --no-coverage
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && git add apps/api/src/workers/symptomWorker.js apps/api/src/workers/__tests__/symptomWorker.test.js apps/api/src/index.js
git commit -m "feat(api): add Claude Haiku symptom analysis worker"
```

---

### Task 4: Mobile — SymptomInputScreen + booking flow

**Files:**
- Create: `apps/mobile/src/screens/patient/SymptomInputScreen.js`
- Modify: `apps/mobile/src/screens/patient/BookAppointmentScreen.js`
- Modify: `apps/mobile/src/navigation/PatientStack.js`
- Modify: `apps/mobile/src/api/appointments.js` (add `submitSymptoms`)

**Interfaces:**
- Consumes: `PATCH /api/appointments/:id/symptoms` via new `submitSymptoms(id, text)` API call
- Produces: `SymptomInputScreen` — receives `{ appointmentId, doctorUserId, doctorName, specialty, date, slot, visitType, reason }` as route params; on Skip/Continue navigates to `BookConfirmed`
- Produces: `BookAppointmentScreen` navigates to `SymptomInput` (not directly to `BookConfirmed`)

- [ ] **Step 1: Add submitSymptoms to mobile appointments API**

Read `apps/mobile/src/api/appointments.js` first to see the existing pattern, then add:

```js
export const submitSymptoms = (appointmentId, symptomText) =>
  client.patch(`/appointments/${appointmentId}/symptoms`, { symptomText });
```

- [ ] **Step 2: Create SymptomInputScreen.js**

Create `apps/mobile/src/screens/patient/SymptomInputScreen.js`:

```js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { submitSymptoms } from '../../api/appointments';
import C from '../../constants/colors';

const MAX = 1000;

export default function SymptomInputScreen({ route, navigation }) {
  const { appointmentId, status } = route.params;
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);

  const proceed = async () => {
    if (text.trim().length > 0) {
      setLoading(true);
      try {
        await submitSymptoms(appointmentId, text.trim());
      } catch (_) {
        // silent — booking already succeeded
      } finally { setLoading(false); }
    }
    navigation.replace('BookConfirmed', { status });
  };

  const skip = () => navigation.replace('BookConfirmed', { status });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <TouchableOpacity onPress={skip} style={{ marginBottom: 16 }}>
          <Text style={{ color: C.mint, fontSize: 14 }}>← Skip</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 6 }}>
          Describe your symptoms
        </Text>
        <Text style={{ fontSize: 14, color: C.text2, marginBottom: 20 }}>
          Optional — helps your doctor prepare for the visit.
        </Text>

        <TextInput
          multiline
          value={text}
          onChangeText={t => setText(t.slice(0, MAX))}
          placeholder="e.g. I've had a sore throat and fever for 3 days…"
          placeholderTextColor={C.text3}
          style={{
            backgroundColor: C.bg2, borderColor: C.border, borderWidth: 1,
            borderRadius: 8, padding: 12, color: C.text, fontSize: 14,
            minHeight: 140, textAlignVertical: 'top',
          }}
        />
        <Text style={{ fontSize: 12, color: C.text2, textAlign: 'right', marginTop: 4 }}>
          {text.length} / {MAX}
        </Text>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
          <TouchableOpacity
            onPress={skip}
            style={{ flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}
          >
            <Text style={{ color: C.text2, fontWeight: '600' }}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={proceed}
            disabled={loading}
            style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: C.mint, alignItems: 'center' }}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: '600' }}>Continue</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Update BookAppointmentScreen.js**

Read `apps/mobile/src/screens/patient/BookAppointmentScreen.js`. In the `submit` function, replace:

```js
      navigation.replace('BookConfirmed', { status: appt.status });
```

With:

```js
      navigation.replace('SymptomInput', {
        appointmentId: appt._id || appt.id,
        status: appt.status,
      });
```

- [ ] **Step 4: Register SymptomInputScreen in PatientStack.js**

In `apps/mobile/src/navigation/PatientStack.js`:

Add import:
```js
import SymptomInputScreen from '../screens/patient/SymptomInputScreen';
```

Add screen between `BookAppointment` and `BookConfirmed`:
```jsx
<Stack.Screen name="SymptomInput" component={SymptomInputScreen} />
```

- [ ] **Step 5: Verify the app compiles (no JS syntax errors)**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/mobile && npx expo export --platform ios --output-dir /tmp/expo-check 2>&1 | tail -5
```

Expected: no module-not-found or syntax errors. (Build may warn about missing native modules — that's fine.)

- [ ] **Step 6: Commit**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && git add apps/mobile/src/screens/patient/SymptomInputScreen.js apps/mobile/src/screens/patient/BookAppointmentScreen.js apps/mobile/src/navigation/PatientStack.js apps/mobile/src/api/appointments.js
git commit -m "feat(mobile): add optional SymptomInputScreen in patient booking flow"
```

---

### Task 5: Mobile — Doctor Patient Symptoms card

**Files:**
- Modify: `apps/mobile/src/screens/doctor/AppointmentDetailScreen.js`

**Interfaces:**
- Consumes: `appointment.symptomText: string | null`
- Consumes: `appointment.symptomAnalysis: { urgency: 'low'|'medium'|'high'|null, category: string|null, processedAt: Date|null }`
- Produces: Patient Symptoms card visible when `symptomText` non-null; urgency pill colored; disclaimer shown

- [ ] **Step 1: Read AppointmentDetailScreen.js**

Read `apps/mobile/src/screens/doctor/AppointmentDetailScreen.js` fully to understand where to insert the card (add it after appointment status info, before the notes section — find the JSX return point).

- [ ] **Step 2: Add Patient Symptoms card**

Insert the following component inline in the JSX, inside the ScrollView, after the appointment header/status block and before any notes section:

```jsx
{/* Patient Symptoms card */}
{appt?.symptomText ? (
  <View style={{
    backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border,
    borderRadius: 8, padding: 14, marginBottom: 16,
  }}>
    <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 8 }}>
      Patient Symptoms
    </Text>
    <Text style={{ fontSize: 13, color: C.text, marginBottom: 12, lineHeight: 20 }}>
      {appt.symptomText}
    </Text>
    {appt.symptomAnalysis?.processedAt ? (
      appt.symptomAnalysis.urgency ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
            backgroundColor:
              appt.symptomAnalysis.urgency === 'high'   ? '#ef4444' :
              appt.symptomAnalysis.urgency === 'medium'  ? '#f59e0b' : '#22c55e',
          }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
              {appt.symptomAnalysis.urgency}
            </Text>
          </View>
          {appt.symptomAnalysis.category ? (
            <Text style={{ fontSize: 13, color: C.text2 }}>{appt.symptomAnalysis.category}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: C.text2 }}>Analysis unavailable</Text>
      )
    ) : (
      <Text style={{ fontSize: 12, color: C.text2 }}>Analysis pending…</Text>
    )}
    <Text style={{ fontSize: 11, color: C.text3, marginTop: 10 }}>
      AI-generated — not a substitute for clinical judgment.
    </Text>
  </View>
) : null}
```

Replace `C.bg2`, `C.border`, `C.text`, `C.text2`, `C.text3` with the exact constant names used in `AppointmentDetailScreen.js` — read the file to find them before editing.

- [ ] **Step 3: Verify no syntax errors**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor/apps/mobile && node -e "require('./src/screens/doctor/AppointmentDetailScreen.js')" 2>&1 | head -5
```

Expected: no output (ESM file will silently fail this check — that's fine; the expo export check below confirms it).

- [ ] **Step 4: Commit**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && git add apps/mobile/src/screens/doctor/AppointmentDetailScreen.js
git commit -m "feat(mobile): add Patient Symptoms card to doctor AppointmentDetailScreen"
```

---

### Task 6: Web — Doctor Patient Symptoms card

**Files:**
- Modify: `apps/web/src/pages/doctor/AppointmentsPage.jsx`

**Interfaces:**
- Consumes: `appointment.symptomText: string | null`
- Consumes: `appointment.symptomAnalysis: { urgency, category, processedAt }`
- Produces: Patient Symptoms card in the appointment detail view; urgency pill colored with CSS vars

- [ ] **Step 1: Read AppointmentsPage.jsx**

Read `apps/web/src/pages/doctor/AppointmentsPage.jsx` fully. Find where the appointment detail panel renders (likely a selected-appointment drawer or expanded row). Identify the CSS variable names in use (e.g. `var(--card)`, `var(--border)`, `var(--text2)`).

- [ ] **Step 2: Add SymptomCard helper component**

At the top of `AppointmentsPage.jsx` (before the default export), add:

```jsx
function SymptomCard({ appt }) {
  if (!appt?.symptomText) return null;
  const { urgency, category, processedAt } = appt.symptomAnalysis || {};
  const pillColor = urgency === 'high' ? '#ef4444' : urgency === 'medium' ? '#f59e0b' : '#22c55e';
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', padding: 16, marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--text)' }}>
        Patient Symptoms
      </div>
      <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 12 }}>
        {appt.symptomText}
      </p>
      {processedAt ? (
        urgency ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: pillColor, color: '#fff',
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 10,
            }}>
              {urgency}
            </span>
            {category && (
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{category}</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Analysis unavailable</span>
        )
      ) : (
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>Analysis pending…</span>
      )}
      <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10 }}>
        AI-generated — not a substitute for clinical judgment.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Render SymptomCard in the detail view**

In the appointment detail panel JSX (where the selected appointment's info is shown), add:

```jsx
<SymptomCard appt={selectedAppointment} />
```

Place it after the appointment header/status section and before notes or action buttons. Use the exact variable name for the selected appointment object — read the file to find it.

- [ ] **Step 4: Commit**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor && git add apps/web/src/pages/doctor/AppointmentsPage.jsx
git commit -m "feat(web): add Patient Symptoms card to doctor AppointmentsPage"
```

---

## Notes

- **`C.bg2` / `C.text3`:** Read `apps/mobile/src/constants/colors.js` before Task 5 to confirm exact key names — use whatever exists, don't invent new ones.
- **Web CSS vars:** Read `AppointmentsPage.jsx` before Task 6 to confirm var names (`--card`, `--border`, `--r`, `--text`, `--text2`).
- **Expo build check:** The mobile `npx expo export` check in Task 4 Step 5 may take a minute. It is the most reliable way to catch import errors without a device.
- **Re-submission:** The PATCH endpoint accepts a second submission — it overwrites `symptomText`, clears `symptomAnalysis`, and re-queues. The `jobId: symptom-${appt._id}` deduplication in BullMQ means a second submission replaces the queued job if it hasn't started yet.
- **No new MongoDB collection:** All data lives on the `Appointment` document.
- **Full test run:** After all tasks, run `cd apps/api && npx jest --no-coverage` to confirm all 45+ tests pass.
