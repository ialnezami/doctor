# Chatbot Tool Use — Doctor Search, Availability & Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the AI patient chatbot to search nearby doctors, fetch their availability, and book appointments via Anthropic tool use — all executed server-side, streamed to the frontend as structured SSE events.

**Architecture:** A new `streamChatWithTools` function in `chatbotService.js` runs a streaming tool-use loop (max 3 rounds) against the Anthropic API directly, emitting `tool_call` and `tool_result` SSE events alongside existing `delta` events. Tool definitions, validation, and execution live in a new `chatbotTools.js` util. Pending booking confirmation state is stored in `sessionStore.js` with a 10-minute TTL. The route switches to `streamChatWithTools` when the request includes `lat`/`lng`.

**Tech Stack:** Node.js, Express, Anthropic SDK v0.106, MongoDB/Mongoose, node-cache, Jest

## Global Constraints

- Never log tool inputs or outputs (PHI) — log only `requestId`, `userId`, `toolName`, `durationMs`, success/failure
- Tool definitions are passed to Anthropic only — this is Anthropic-specific, not abstracted through `getProvider()`
- All tool execution is server-side; frontend only receives SSE events
- `book_appointment` requires `pendingBooking` in session — never book without explicit confirmation
- Slot conflict check must exclude `cancelled` and `archived` statuses
- `radius` capped at 50,000 metres in tool input validation
- `date` inputs: ISO8601 `YYYY-MM-DD`; `timeSlot` inputs: `/^\d{2}:\d{2}$/`
- `visitType` must be one of `['initial', 'follow-up', 'check-up', 'urgent']`
- `doctorId` / `locationId` must be valid MongoDB ObjectId (24-hex chars)
- Max 3 tool call rounds per conversation turn — prevents infinite loops
- Emergency guard: after each streaming round, parse `accumulatedText` for emergency triage — if detected, break the tool loop before the next round
- Test command: `cd apps/api && npx jest --testPathPattern=<file> --no-coverage`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `apps/api/src/utils/sessionStore.js` | Add `setPendingBooking`, `getPendingBooking`, `clearPendingBooking` |
| Create | `apps/api/src/utils/chatbotTools.js` | Tool definitions, input validation, tool executor functions |
| Modify | `apps/api/src/services/chatbotService.js` | Add `streamChatWithTools` — Anthropic streaming tool-use loop |
| Modify | `apps/api/src/routes/chatbot.js` | Pass `toolContext` to `streamChatWithTools` when lat/lng present |
| Create | `apps/api/src/utils/__tests__/sessionStore.pendingBooking.test.js` | Unit tests for pending booking methods |
| Create | `apps/api/src/utils/__tests__/chatbotTools.test.js` | Unit tests for validation and executor functions |
| Create | `apps/api/src/services/__tests__/chatbotService.tools.test.js` | Unit tests for `streamChatWithTools` SSE behavior |
| Modify | `apps/api/src/routes/__tests__/chatbot.test.js` | Add route tests for tool-use path |

---

### Task 1: Pending Booking Support in sessionStore

**Files:**
- Modify: `apps/api/src/utils/sessionStore.js`
- Create: `apps/api/src/utils/__tests__/sessionStore.pendingBooking.test.js`

**Interfaces:**
- Produces:
  - `setPendingBooking(userId: string, data: object): void` — stores booking proposal, TTL 600s
  - `getPendingBooking(userId: string): object | null` — returns stored booking or null
  - `clearPendingBooking(userId: string): void` — deletes stored booking
  - All three exported from `sessionStore.js`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/utils/__tests__/sessionStore.pendingBooking.test.js`:

```javascript
'use strict';

describe('sessionStore — pending booking', () => {
  let setPendingBooking, getPendingBooking, clearPendingBooking;

  beforeAll(() => {
    jest.resetModules();
    const mod = require('../sessionStore');
    setPendingBooking  = mod.setPendingBooking;
    getPendingBooking  = mod.getPendingBooking;
    clearPendingBooking = mod.clearPendingBooking;
  });

  afterEach(() => {
    clearPendingBooking('u1');
  });

  it('returns null when no pending booking exists', () => {
    expect(getPendingBooking('u1')).toBeNull();
  });

  it('stores and retrieves a pending booking', () => {
    const data = { doctorId: 'abc', date: '2026-08-01', timeSlot: '10:00' };
    setPendingBooking('u1', data);
    expect(getPendingBooking('u1')).toEqual(data);
  });

  it('clearPendingBooking removes the booking', () => {
    setPendingBooking('u1', { doctorId: 'abc' });
    clearPendingBooking('u1');
    expect(getPendingBooking('u1')).toBeNull();
  });

  it('overwrites an existing pending booking', () => {
    setPendingBooking('u1', { doctorId: 'old' });
    setPendingBooking('u1', { doctorId: 'new' });
    expect(getPendingBooking('u1')).toEqual({ doctorId: 'new' });
  });

  it('isolates bookings per user', () => {
    setPendingBooking('u1', { doctorId: 'for-u1' });
    expect(getPendingBooking('u2')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest --testPathPattern=sessionStore.pendingBooking --no-coverage
```

Expected: FAIL — `setPendingBooking is not a function`

- [ ] **Step 3: Add pending booking cache and functions to sessionStore.js**

Open `apps/api/src/utils/sessionStore.js`. After the existing `cache` declaration (around line 12), add a second cache and three functions. Then extend the `module.exports`.

Add after the existing `const cache = ...` line:

```javascript
const PENDING_BOOKING_TTL = 600; // 10-minute confirmation window

const pendingBookingCache = new NodeCache({
  stdTTL: PENDING_BOOKING_TTL,
  checkperiod: 60,
  useClones: false,
});
```

Add after the existing `clearSession` function:

```javascript
function setPendingBooking(userId, data) {
  pendingBookingCache.set(userId, data);
}

function getPendingBooking(userId) {
  return pendingBookingCache.get(userId) ?? null;
}

function clearPendingBooking(userId) {
  pendingBookingCache.del(userId);
}
```

Update `module.exports` at the bottom:

```javascript
module.exports = {
  getHistory,
  snapshotHistory,
  appendAndSave,
  clearSession,
  setPendingBooking,
  getPendingBooking,
  clearPendingBooking,
  MAX_TURNS,
  TTL_SECONDS,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx jest --testPathPattern=sessionStore.pendingBooking --no-coverage
```

Expected: PASS — 5 tests pass

- [ ] **Step 5: Verify existing sessionStore tests still pass**

```bash
cd apps/api && npx jest --testPathPattern=sessionStore --no-coverage
```

Expected: PASS — all existing tests unaffected

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/utils/sessionStore.js apps/api/src/utils/__tests__/sessionStore.pendingBooking.test.js
git commit -m "feat(chatbot): add pending booking cache to sessionStore (10-min TTL)"
```

---

### Task 2: chatbotTools.js — Definitions, Validation & Executors

**Files:**
- Create: `apps/api/src/utils/chatbotTools.js`
- Create: `apps/api/src/utils/__tests__/chatbotTools.test.js`

**Interfaces:**
- Consumes:
  - `getRankedDoctors({ specialty, lat, lng, limit })` from `../utils/doctorRanking`
  - `getPendingBooking(userId)`, `clearPendingBooking(userId)` from `./sessionStore`
  - `Doctor` model from `../models/Doctor`
  - `Appointment` model from `../models/Appointment`
  - `User` model from `../models/User`
- Produces:
  - `TOOL_DEFINITIONS: Array` — array of Anthropic tool definition objects
  - `validateToolInput(name: string, input: object): void` — throws `Error` on invalid input
  - `executeTool(name: string, input: object, context: { userId: string, lat: number, lng: number, requestId: string }): Promise<object>` — returns result object or `{ error: string }`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/utils/__tests__/chatbotTools.test.js`:

```javascript
'use strict';

jest.mock('../doctorRanking', () => ({
  getRankedDoctors: jest.fn(),
}));

jest.mock('../sessionStore', () => ({
  getPendingBooking: jest.fn(),
  clearPendingBooking: jest.fn(),
}));

jest.mock('../../models/Doctor', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../../models/Appointment', () => ({
  exists: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  find: jest.fn(),
}));

describe('chatbotTools — validateToolInput', () => {
  let validateToolInput;

  beforeAll(() => {
    jest.resetModules();
    // Re-require after mocks are set
    const mod = require('../chatbotTools');
    validateToolInput = mod.validateToolInput;
  });

  it('throws on unknown tool name', () => {
    expect(() => validateToolInput('unknown_tool', {})).toThrow('Unknown tool');
  });

  it('throws when search_doctors missing lat', () => {
    expect(() => validateToolInput('search_doctors', { lng: 46.7 }))
      .toThrow('lat');
  });

  it('throws when search_doctors missing lng', () => {
    expect(() => validateToolInput('search_doctors', { lat: 24.7 }))
      .toThrow('lng');
  });

  it('throws when search_doctors radius exceeds 50000', () => {
    expect(() => validateToolInput('search_doctors', { lat: 24.7, lng: 46.7, radius: 99999 }))
      .toThrow('radius');
  });

  it('passes valid search_doctors input', () => {
    expect(() => validateToolInput('search_doctors', { lat: 24.7, lng: 46.7 })).not.toThrow();
  });

  it('throws when get_availability missing doctorId', () => {
    expect(() => validateToolInput('get_availability', { from_date: '2026-08-01', to_date: '2026-08-07' }))
      .toThrow('doctorId');
  });

  it('throws when get_availability doctorId is not a valid ObjectId', () => {
    expect(() => validateToolInput('get_availability', { doctorId: 'notanid', from_date: '2026-08-01', to_date: '2026-08-07' }))
      .toThrow('doctorId');
  });

  it('throws when get_availability from_date missing', () => {
    expect(() => validateToolInput('get_availability', { doctorId: '507f1f77bcf86cd799439011', to_date: '2026-08-07' }))
      .toThrow('from_date');
  });

  it('throws when get_availability to_date missing', () => {
    expect(() => validateToolInput('get_availability', { doctorId: '507f1f77bcf86cd799439011', from_date: '2026-08-01' }))
      .toThrow('to_date');
  });

  it('throws when book_appointment doctorId invalid', () => {
    expect(() => validateToolInput('book_appointment', {
      doctorId: 'bad', locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'initial',
    })).toThrow('doctorId');
  });

  it('throws when book_appointment date format invalid', () => {
    expect(() => validateToolInput('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011', locationId: '507f1f77bcf86cd799439011',
      date: '01-08-2026', timeSlot: '10:00', visitType: 'initial',
    })).toThrow('date');
  });

  it('throws when book_appointment timeSlot format invalid', () => {
    expect(() => validateToolInput('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011', locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00am', visitType: 'initial',
    })).toThrow('timeSlot');
  });

  it('throws when book_appointment visitType invalid', () => {
    expect(() => validateToolInput('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011', locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'telehealth',
    })).toThrow('visitType');
  });

  it('passes valid book_appointment input', () => {
    expect(() => validateToolInput('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011', locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'initial',
    })).not.toThrow();
  });
});

describe('chatbotTools — executeTool', () => {
  let executeTool, getRankedDoctors, getPendingBooking, clearPendingBooking;
  let Doctor, Appointment, User;

  beforeEach(() => {
    jest.resetModules();

    getRankedDoctors = jest.fn();
    getPendingBooking = jest.fn();
    clearPendingBooking = jest.fn();
    Doctor = { find: jest.fn(), findById: jest.fn() };
    Appointment = { exists: jest.fn(), create: jest.fn() };
    User = { find: jest.fn() };

    jest.mock('../doctorRanking', () => ({ getRankedDoctors }));
    jest.mock('../sessionStore', () => ({ getPendingBooking, clearPendingBooking }));
    jest.mock('../../models/Doctor', () => Doctor);
    jest.mock('../../models/Appointment', () => Appointment);
    jest.mock('../../models/User', () => User);

    const mod = require('../chatbotTools');
    executeTool = mod.executeTool;
  });

  const ctx = { userId: '507f1f77bcf86cd799439011', lat: 24.7, lng: 46.7, requestId: 'req-1' };

  it('search_doctors delegates to getRankedDoctors when no name', async () => {
    getRankedDoctors.mockResolvedValue({ doctors: [{ _id: 'doc1' }], specialtyFallback: false });
    const result = await executeTool('search_doctors', { lat: 24.7, lng: 46.7, specialty: 'cardiology' }, ctx);
    expect(getRankedDoctors).toHaveBeenCalledWith({ specialty: 'cardiology', lat: 24.7, lng: 46.7, limit: 5 });
    expect(result.doctors).toHaveLength(1);
  });

  it('search_doctors does name-based search when name provided', async () => {
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([{ _id: 'u1', name: 'Dr. Ahmed' }]) }),
    });
    Doctor.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([{
            _id: 'doc1', specialty: 'cardiology', consultationFee: 200,
            averageRating: 4.5, photoUrl: '', locations: [],
            userId: { name: 'Dr. Ahmed' },
          }]),
        }),
      }),
    });
    const result = await executeTool('search_doctors', { lat: 24.7, lng: 46.7, name: 'Ahmed' }, ctx);
    expect(User.find).toHaveBeenCalledWith({ name: expect.any(RegExp), role: 'doctor' });
    expect(result.doctors).toHaveLength(1);
    expect(result.doctors[0].name).toBe('Dr. Ahmed');
  });

  it('search_doctors returns error object on exception', async () => {
    getRankedDoctors.mockRejectedValue(new Error('DB down'));
    const result = await executeTool('search_doctors', { lat: 24.7, lng: 46.7 }, ctx);
    expect(result).toEqual({ error: expect.stringContaining('DB down') });
  });

  it('book_appointment returns error when no pendingBooking', async () => {
    getPendingBooking.mockReturnValue(null);
    const result = await executeTool('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011',
      locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'initial',
    }, ctx);
    expect(result).toEqual({ error: 'No pending booking to confirm. Please confirm the details first.' });
    expect(Appointment.create).not.toHaveBeenCalled();
  });

  it('book_appointment returns conflict error when slot taken', async () => {
    getPendingBooking.mockReturnValue({ doctorId: '507f1f77bcf86cd799439011' });
    Appointment.exists.mockResolvedValue(true);
    Doctor.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ locations: [], appointmentTypes: [] }),
    });
    const result = await executeTool('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011',
      locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'initial',
    }, ctx);
    expect(result).toEqual({ error: expect.stringContaining('no longer available') });
    expect(Appointment.create).not.toHaveBeenCalled();
  });

  it('book_appointment creates appointment and clears pendingBooking on success', async () => {
    getPendingBooking.mockReturnValue({ doctorId: '507f1f77bcf86cd799439011' });
    Appointment.exists.mockResolvedValue(false);
    Doctor.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        locations: [{ _id: { equals: () => true }, name: 'Clinic A', address: '123 St', type: 'bookable' }],
        appointmentTypes: [{ key: 'initial', duration: 30 }],
      }),
    });
    Appointment.create.mockResolvedValue({ _id: 'appt1', status: 'pending' });

    const result = await executeTool('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011',
      locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'initial',
    }, ctx);

    expect(Appointment.create).toHaveBeenCalledWith(expect.objectContaining({
      timeSlot: { start: '10:00', end: '10:30' },
      status: 'pending',
      initiatedBy: 'patient',
    }));
    expect(clearPendingBooking).toHaveBeenCalledWith(ctx.userId);
    expect(result.appointmentId).toBe('appt1');
  });

  it('returns error object for unknown tool name', async () => {
    const result = await executeTool('unknown_tool', {}, ctx);
    expect(result).toEqual({ error: expect.stringContaining('Unknown tool') });
  });
});

describe('chatbotTools — TOOL_DEFINITIONS', () => {
  it('exports an array of 3 tool definitions with correct names', () => {
    const { TOOL_DEFINITIONS } = require('../chatbotTools');
    expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
    expect(TOOL_DEFINITIONS).toHaveLength(3);
    const names = TOOL_DEFINITIONS.map(t => t.name);
    expect(names).toContain('search_doctors');
    expect(names).toContain('get_availability');
    expect(names).toContain('book_appointment');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx jest --testPathPattern=chatbotTools --no-coverage
```

Expected: FAIL — `Cannot find module '../chatbotTools'`

- [ ] **Step 3: Create chatbotTools.js**

Create `apps/api/src/utils/chatbotTools.js`:

```javascript
'use strict';

const { getRankedDoctors } = require('./doctorRanking');
const { getPendingBooking, clearPendingBooking } = require('./sessionStore');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const User = require('../models/User');

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const VISIT_TYPES = ['initial', 'follow-up', 'check-up', 'urgent'];

// ---------------------------------------------------------------------------
// Tool definitions — passed verbatim to the Anthropic messages API
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: 'search_doctors',
    description: 'Search for nearby doctors. Use when the patient asks to find, recommend, or look up doctors. Returns a list of doctors ranked by proximity and rating.',
    input_schema: {
      type: 'object',
      properties: {
        specialty: { type: 'string', description: 'Medical specialty to filter by (e.g. "cardiology", "dermatology")' },
        name: { type: 'string', description: 'Doctor name to search for (partial match)' },
        lat:  { type: 'number', description: 'Patient latitude' },
        lng:  { type: 'number', description: 'Patient longitude' },
        radius: { type: 'number', description: 'Search radius in meters (max 50000, default 10000)' },
      },
      required: ['lat', 'lng'],
    },
  },
  {
    name: 'get_availability',
    description: 'Get available appointment slots for a specific doctor within a date range. Use after the patient has selected a doctor.',
    input_schema: {
      type: 'object',
      properties: {
        doctorId:  { type: 'string', description: 'MongoDB ObjectId of the doctor' },
        from_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        to_date:   { type: 'string', description: 'End date in YYYY-MM-DD format (max 30 days from from_date)' },
      },
      required: ['doctorId', 'from_date', 'to_date'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Book an appointment ONLY after the patient has explicitly confirmed the details. Never call this without patient confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        doctorId:   { type: 'string', description: 'MongoDB ObjectId of the doctor' },
        locationId: { type: 'string', description: 'MongoDB ObjectId of the clinic location' },
        date:       { type: 'string', description: 'Appointment date in YYYY-MM-DD format' },
        timeSlot:   { type: 'string', description: 'Start time in HH:MM format (24-hour)' },
        visitType:  { type: 'string', enum: VISIT_TYPES, description: 'Type of visit' },
        reason:     { type: 'string', description: 'Optional reason for the appointment' },
      },
      required: ['doctorId', 'locationId', 'date', 'timeSlot', 'visitType'],
    },
  },
];

// ---------------------------------------------------------------------------
// Input validation — throws Error on invalid input
// ---------------------------------------------------------------------------

function validateToolInput(name, input) {
  if (name === 'search_doctors') {
    if (input.lat == null || typeof input.lat !== 'number') throw new Error('lat is required and must be a number');
    if (input.lng == null || typeof input.lng !== 'number') throw new Error('lng is required and must be a number');
    if (input.radius != null && input.radius > 50000) throw new Error('radius must not exceed 50000 metres');
    return;
  }

  if (name === 'get_availability') {
    if (!input.doctorId) throw new Error('doctorId is required');
    if (!OBJECT_ID_RE.test(input.doctorId)) throw new Error('doctorId must be a valid MongoDB ObjectId (24 hex chars)');
    if (!input.from_date) throw new Error('from_date is required (YYYY-MM-DD)');
    if (!DATE_RE.test(input.from_date)) throw new Error('from_date must be in YYYY-MM-DD format');
    if (!input.to_date) throw new Error('to_date is required (YYYY-MM-DD)');
    if (!DATE_RE.test(input.to_date)) throw new Error('to_date must be in YYYY-MM-DD format');
    return;
  }

  if (name === 'book_appointment') {
    if (!input.doctorId || !OBJECT_ID_RE.test(input.doctorId))   throw new Error('doctorId must be a valid MongoDB ObjectId');
    if (!input.locationId || !OBJECT_ID_RE.test(input.locationId)) throw new Error('locationId must be a valid MongoDB ObjectId');
    if (!input.date || !DATE_RE.test(input.date))   throw new Error('date must be in YYYY-MM-DD format');
    if (!input.timeSlot || !TIME_RE.test(input.timeSlot)) throw new Error('timeSlot must be in HH:MM format');
    if (!VISIT_TYPES.includes(input.visitType)) throw new Error(`visitType must be one of: ${VISIT_TYPES.join(', ')}`);
    return;
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function searchDoctors(input, context) {
  const { specialty, name, lat, lng, radius = 10000 } = input;

  if (name) {
    const users = await User.find({
      name: new RegExp(name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      role: 'doctor',
    }).select('_id name').limit(5);

    if (users.length === 0) return { doctors: [], message: 'No doctor found with that name' };

    const userIds = users.map(u => u._id);
    const doctors = await Doctor.find({ userId: { $in: userIds } })
      .populate('userId', 'name')
      .select('specialty consultationFee averageRating photoUrl locations')
      .limit(5);

    return {
      doctors: doctors.map(d => ({
        _id: d._id,
        name: d.userId?.name,
        specialty: d.specialty,
        consultationFee: d.consultationFee,
        averageRating: d.averageRating,
        locations: d.locations,
      })),
    };
  }

  // Geo-ranked search (radius capped at 50,000 by getRankedDoctors internally)
  const { doctors, specialtyFallback } = await getRankedDoctors({ specialty, lat, lng, limit: 5 });
  return { doctors, specialtyFallback };
}

async function getAvailability(input, context) {
  const { doctorId, from_date, to_date } = input;

  const doctor = await Doctor.findById(doctorId).select('availabilitySlots');
  if (!doctor) return { error: 'Doctor not found' };

  const fromDate = new Date(from_date + 'T00:00:00.000Z');
  const toDate   = new Date(to_date   + 'T00:00:00.000Z');

  // Cap range at 30 days to prevent runaway DB queries
  const maxDate = new Date(fromDate);
  maxDate.setUTCDate(maxDate.getUTCDate() + 30);
  const endDate = toDate <= maxDate ? toDate : maxDate;

  const availableSlots = [];

  for (const d = new Date(fromDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const dayOfWeek = d.getUTCDay(); // 0=Sun … 6=Sat
    const dateStr   = d.toISOString().slice(0, 10);

    const daySlots = doctor.availabilitySlots.filter(s => s.dayOfWeek === dayOfWeek);

    for (const slot of daySlots) {
      const slotDateStart = new Date(dateStr + 'T00:00:00.000Z');
      const slotDateEnd   = new Date(dateStr + 'T23:59:59.999Z');

      const isBooked = await Appointment.exists({
        doctorId,
        date: { $gte: slotDateStart, $lte: slotDateEnd },
        'timeSlot.start': slot.startTime,
        status: { $nin: ['cancelled', 'archived'] },
      });

      if (!isBooked) {
        availableSlots.push({ date: dateStr, time: slot.startTime, endTime: slot.endTime });
      }
    }
  }

  return { doctorId, availableSlots };
}

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const endH  = Math.floor(total / 60) % 24;
  const endM  = total % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

async function bookAppointment(input, context) {
  const { doctorId, locationId, date, timeSlot, visitType, reason } = input;
  const { userId } = context;

  // Require explicit confirmation via pendingBooking
  const pending = getPendingBooking(userId);
  if (!pending) {
    return { error: 'No pending booking to confirm. Please confirm the details first.' };
  }

  // Slot conflict check
  const slotDateStart = new Date(date + 'T00:00:00.000Z');
  const slotDateEnd   = new Date(date + 'T23:59:59.999Z');
  const conflict = await Appointment.exists({
    doctorId,
    date: { $gte: slotDateStart, $lte: slotDateEnd },
    'timeSlot.start': timeSlot,
    status: { $nin: ['cancelled', 'archived'] },
  });
  if (conflict) {
    return { error: 'That slot is no longer available. Please choose a different time.' };
  }

  // Look up location and appointment type for duration
  const doctor = await Doctor.findById(doctorId).select('locations appointmentTypes');
  const location   = doctor?.locations.find(l => l._id.equals(locationId));
  const apptType   = doctor?.appointmentTypes.find(t => t.key === visitType);
  const duration   = apptType?.duration ?? 30;
  const timeSlotEnd = addMinutes(timeSlot, duration);

  const appointment = await Appointment.create({
    doctorId,
    patientId: userId,
    date: slotDateStart,
    timeSlot: { start: timeSlot, end: timeSlotEnd },
    status: 'pending',
    visitType,
    reason: reason || '',
    initiatedBy: 'patient',
    locationId: locationId || null,
    locationName:    location?.name    || '',
    locationAddress: location?.address || '',
    locationType:    location?.type    || null,
  });

  clearPendingBooking(userId);

  return {
    appointmentId: appointment._id,
    date,
    timeSlot,
    visitType,
    location: location?.name || '',
    status: 'pending',
  };
}

// ---------------------------------------------------------------------------
// Dispatcher — catches all errors, returns { error } so Claude can respond naturally
// ---------------------------------------------------------------------------

async function executeTool(name, input, context) {
  const startedAt = Date.now();
  try {
    validateToolInput(name, input);

    let result;
    if (name === 'search_doctors')   result = await searchDoctors(input, context);
    else if (name === 'get_availability') result = await getAvailability(input, context);
    else if (name === 'book_appointment') result = await bookAppointment(input, context);
    else result = { error: `Unknown tool: ${name}` };

    console.log(`[chatbot:tool] requestId=${context.requestId} userId=${context.userId} tool=${name} durationMs=${Date.now() - startedAt} status=success`);
    return result;
  } catch (err) {
    console.error(`[chatbot:tool] requestId=${context.requestId} userId=${context.userId} tool=${name} durationMs=${Date.now() - startedAt} status=error err=${err.name}: ${String(err.message).slice(0, 200)}`);
    return { error: err.message };
  }
}

module.exports = { TOOL_DEFINITIONS, validateToolInput, executeTool };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx jest --testPathPattern=chatbotTools --no-coverage
```

Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/utils/chatbotTools.js apps/api/src/utils/__tests__/chatbotTools.test.js
git commit -m "feat(chatbot): add chatbotTools — tool definitions, validation, and executors"
```

---

### Task 3: streamChatWithTools in chatbotService.js

**Files:**
- Modify: `apps/api/src/services/chatbotService.js`
- Create: `apps/api/src/services/__tests__/chatbotService.tools.test.js`

**Interfaces:**
- Consumes:
  - `TOOL_DEFINITIONS`, `executeTool` from `../utils/chatbotTools`
  - `parseTriage` from `../utils/triageParser` (emergency guard)
  - `@anthropic-ai/sdk` directly (bypasses provider abstraction — tool use is Anthropic-specific)
- Produces:
  - `streamChatWithTools(res, history, systemPrompt, toolContext, { requestId, userId }): Promise<string | null>`
    - Sets SSE headers; writes `delta`, `tool_call`, `tool_result`, `error` events
    - Returns accumulated text string, or `null` if Anthropic not configured (sends 503 JSON, no SSE)
    - Re-throws on error after writing SSE error event
    - Same stream lifecycle contract as `streamChatResponse`: caller owns `done` event and stream close

- [ ] **Step 1: Write the failing tests**

Create directory and test file:

```bash
mkdir -p apps/api/src/services/__tests__
```

Create `apps/api/src/services/__tests__/chatbotService.tools.test.js`:

```javascript
'use strict';

// Helper to collect SSE events from a mock response
function mockRes() {
  const events = [];
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
    write: jest.fn((data) => {
      if (data.startsWith('data: ') && !data.includes('[DONE]')) {
        try {
          events.push(JSON.parse(data.replace(/^data: /, '').trim()));
        } catch (_) {}
      }
    }),
    end: jest.fn(),
    _events: events,
  };
}

// Build a minimal Anthropic streaming event sequence
function makeStreamEvents(blocks) {
  const events = [];
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text' } });
      for (const chunk of block.chunks) {
        events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: chunk } });
      }
      events.push({ type: 'content_block_stop', index });
    } else if (block.type === 'tool_use') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
      events.push({ type: 'content_block_stop', index });
    }
  });
  events.push({ type: 'message_delta', delta: { stop_reason: blocks.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn' } });
  return events;
}

function makeAsyncIterable(events) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const e of events) yield e;
    },
  };
}

describe('streamChatWithTools', () => {
  let streamChatWithTools;
  let mockStream;
  let executeTool;

  beforeEach(() => {
    jest.resetModules();

    executeTool = jest.fn().mockResolvedValue({ doctors: [] });

    jest.mock('../../utils/chatbotTools', () => ({
      TOOL_DEFINITIONS: [{ name: 'search_doctors' }],
      executeTool,
    }));

    jest.mock('../../utils/triageParser', () => ({
      parseTriage: jest.fn(() => null),
    }));

    mockStream = null;

    jest.mock('@anthropic-ai/sdk', () => {
      return jest.fn().mockImplementation(() => ({
        messages: {
          stream: jest.fn((...args) => mockStream),
        },
      }));
    });

    process.env.ANTHROPIC_API_KEY = 'test-key';

    const mod = require('../../services/chatbotService');
    streamChatWithTools = mod.streamChatWithTools;
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns null and sends 503 when ANTHROPIC_API_KEY not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = mockRes();
    const result = await streamChatWithTools(res, [], 'sys', { userId: 'u1', lat: 0, lng: 0, requestId: 'r1' });
    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ message: 'AI service unavailable' });
  });

  it('sets SSE headers and returns accumulated text for text-only response', async () => {
    const events = makeStreamEvents([{ type: 'text', chunks: ['Hello ', 'world'] }]);
    mockStream = makeAsyncIterable(events);
    const res = mockRes();

    const result = await streamChatWithTools(
      res, [{ role: 'user', content: 'hi' }], 'sys',
      { userId: 'u1', lat: 24.7, lng: 46.7, requestId: 'r1' },
      { requestId: 'r1', userId: 'u1' }
    );

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(result).toBe('Hello world');
    const deltaEvents = res._events.filter(e => e.type === 'delta');
    expect(deltaEvents).toHaveLength(2);
    expect(deltaEvents[0].text).toBe('Hello ');
    expect(deltaEvents[1].text).toBe('world');
  });

  it('emits tool_call and tool_result events when Claude calls a tool', async () => {
    let callCount = 0;
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        stream: jest.fn(() => {
          callCount++;
          if (callCount === 1) {
            // First round: tool_use
            return makeAsyncIterable(makeStreamEvents([
              { type: 'tool_use', id: 'tu_1', name: 'search_doctors', input: { lat: 24.7, lng: 46.7 } },
            ]));
          }
          // Second round: text response
          return makeAsyncIterable(makeStreamEvents([{ type: 'text', chunks: ['I found some doctors.'] }]));
        }),
      },
    }));

    jest.resetModules();
    jest.mock('../../utils/chatbotTools', () => ({
      TOOL_DEFINITIONS: [{ name: 'search_doctors' }],
      executeTool: jest.fn().mockResolvedValue({ doctors: [{ _id: 'doc1' }] }),
    }));
    jest.mock('../../utils/triageParser', () => ({ parseTriage: jest.fn(() => null) }));

    const mod = require('../../services/chatbotService');
    const res = mockRes();

    const result = await mod.streamChatWithTools(
      res, [], 'sys',
      { userId: 'u1', lat: 24.7, lng: 46.7, requestId: 'r1' },
      { requestId: 'r1', userId: 'u1' }
    );

    const toolCallEvents   = res._events.filter(e => e.type === 'tool_call');
    const toolResultEvents = res._events.filter(e => e.type === 'tool_result');
    expect(toolCallEvents).toHaveLength(1);
    expect(toolCallEvents[0].name).toBe('search_doctors');
    expect(toolResultEvents).toHaveLength(1);
    expect(result).toBe('I found some doctors.');
  });

  it('stops tool loop when emergency triage detected in accumulated text', async () => {
    let callCount = 0;
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        stream: jest.fn(() => {
          callCount++;
          return makeAsyncIterable(makeStreamEvents([
            { type: 'text', chunks: ['<triage>{"urgency":"emergency","specialties":[],"summary":"emergency","ready_for_referral":false}</triage>'] },
            { type: 'tool_use', id: 'tu_1', name: 'search_doctors', input: { lat: 24.7, lng: 46.7 } },
          ]));
        }),
      },
    }));

    const mockExecuteTool = jest.fn().mockResolvedValue({ doctors: [] });
    jest.resetModules();
    jest.mock('../../utils/chatbotTools', () => ({
      TOOL_DEFINITIONS: [{ name: 'search_doctors' }],
      executeTool: mockExecuteTool,
    }));
    jest.mock('../../utils/triageParser', () => ({
      parseTriage: jest.fn((text) =>
        text.includes('"emergency"') ? { urgency: 'emergency' } : null
      ),
    }));

    const mod = require('../../services/chatbotService');
    const res = mockRes();

    await mod.streamChatWithTools(
      res, [], 'sys',
      { userId: 'u1', lat: 24.7, lng: 46.7, requestId: 'r1' },
      { requestId: 'r1', userId: 'u1' }
    );

    // Tools should not be executed when emergency triage is detected
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('writes SSE error event and re-throws on stream error', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    const err = new Error('network failure');
    Anthropic.mockImplementation(() => ({
      messages: {
        stream: jest.fn(() => {
          throw err;
        }),
      },
    }));

    jest.resetModules();
    jest.mock('../../utils/chatbotTools', () => ({ TOOL_DEFINITIONS: [], executeTool: jest.fn() }));
    jest.mock('../../utils/triageParser', () => ({ parseTriage: jest.fn(() => null) }));

    const mod = require('../../services/chatbotService');
    const res = mockRes();

    await expect(
      mod.streamChatWithTools(res, [], 'sys', { userId: 'u1', lat: 0, lng: 0, requestId: 'r1' })
    ).rejects.toThrow('network failure');

    const errorEvents = res._events.filter(e => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx jest --testPathPattern="services/__tests__/chatbotService.tools" --no-coverage
```

Expected: FAIL — `streamChatWithTools is not a function`

- [ ] **Step 3: Add streamChatWithTools to chatbotService.js**

Open `apps/api/src/services/chatbotService.js`. Add these requires at the top of the file (after existing requires):

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const { TOOL_DEFINITIONS, executeTool } = require('../utils/chatbotTools');
const { parseTriage } = require('../utils/triageParser');

const TOOL_MODEL         = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
const TOOL_MAX_ROUNDS    = 3;
const TOOL_TIMEOUT_MS    = 60000; // 60s — longer than text-only (tool rounds add latency)
```

Then, before the existing `module.exports`, add the `streamChatWithTools` function:

```javascript
/**
 * Streams an AI response with Anthropic tool use (doctor search, availability, booking).
 *
 * STREAM LIFECYCLE CONTRACT: Same as streamChatResponse.
 * - Sets SSE headers and writes delta / tool_call / tool_result / error events.
 * - Does NOT finalize the stream (no done event, no stream close) — caller owns that.
 * - Returns accumulated text string, or null if not configured (503 sent, no SSE headers).
 * - Re-throws on error after writing SSE error event.
 *
 * Emergency guard: after each streaming round, if accumulated text contains an emergency
 * triage block, tool execution for that round is skipped and the loop terminates.
 *
 * @param {import('express').Response} res
 * @param {Array<{role:string,content:string|Array}>} history
 * @param {string} systemPrompt
 * @param {{ userId: string, lat: number, lng: number, requestId: string }} toolContext
 * @param {{ requestId: string, userId: string }} meta
 * @returns {Promise<string|null>}
 */
async function streamChatWithTools(res, history, systemPrompt, toolContext, { requestId, userId } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ message: 'AI service unavailable' });
    return null;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  const client     = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let messages        = [...history];
  let accumulatedText = '';
  let toolRounds      = 0;
  const startedAt     = Date.now();

  try {
    while (true) {
      const includeTools = toolRounds < TOOL_MAX_ROUNDS;

      const stream = client.messages.stream(
        {
          model: TOOL_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          ...(includeTools ? { tools: TOOL_DEFINITIONS } : {}),
        },
        { signal: controller.signal }
      );

      // Accumulate content blocks for this round to build the next assistant message
      const assistantBlocks   = [];
      const pendingTools       = []; // { id, name, input }
      let   currentBlockIndex  = -1;
      let   currentBlockType   = null;
      let   toolInputBuffer    = '';
      let   stopReason         = 'end_turn';

      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start':
            currentBlockIndex = event.index;
            currentBlockType  = event.content_block.type;
            if (currentBlockType === 'text') {
              assistantBlocks[event.index] = { type: 'text', text: '' };
            } else if (currentBlockType === 'tool_use') {
              assistantBlocks[event.index] = {
                type: 'tool_use',
                id:   event.content_block.id,
                name: event.content_block.name,
                input: {},
              };
              toolInputBuffer = '';
            }
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              const text = event.delta.text;
              accumulatedText += text;
              if (assistantBlocks[event.index]) assistantBlocks[event.index].text += text;
              res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
            } else if (event.delta.type === 'input_json_delta') {
              toolInputBuffer += event.delta.partial_json;
            }
            break;

          case 'content_block_stop':
            if (currentBlockType === 'tool_use') {
              let parsedInput = {};
              try { parsedInput = JSON.parse(toolInputBuffer); } catch (_) { /* malformed JSON — use empty input */ }
              assistantBlocks[currentBlockIndex].input = parsedInput;
              pendingTools.push({
                id:    assistantBlocks[currentBlockIndex].id,
                name:  assistantBlocks[currentBlockIndex].name,
                input: parsedInput,
              });
              toolInputBuffer = '';
            }
            break;

          case 'message_delta':
            stopReason = event.delta.stop_reason || 'end_turn';
            break;
        }
      }

      // No tool calls — conversation turn is complete
      if (pendingTools.length === 0 || stopReason !== 'tool_use') break;

      // Emergency guard — never execute tools if emergency triage detected
      const triage = parseTriage(accumulatedText);
      if (triage?.urgency === 'emergency') break;

      toolRounds++;

      // Execute tools and emit SSE events
      const toolResults = [];
      for (const tool of pendingTools) {
        res.write(`data: ${JSON.stringify({ type: 'tool_call', name: tool.name, input: tool.input })}\n\n`);

        const result = await executeTool(tool.name, tool.input, toolContext);

        res.write(`data: ${JSON.stringify({ type: 'tool_result', name: tool.name, data: result })}\n\n`);

        toolResults.push({
          type:        'tool_result',
          tool_use_id: tool.id,
          content:     typeof result === 'object' ? JSON.stringify(result) : String(result),
        });
      }

      // Build next message round — include tool results as user message
      messages = [
        ...messages,
        { role: 'assistant', content: assistantBlocks.filter(Boolean) },
        { role: 'user',      content: toolResults },
      ];

      if (toolRounds >= TOOL_MAX_ROUNDS) break;
    }

    console.log(
      `[chatbot:tools] requestId=${requestId} userId=${userId} toolRounds=${toolRounds} ` +
      `durationMs=${Date.now() - startedAt} tokens_approx=${Math.ceil(accumulatedText.length / 4)}`
    );

    return accumulatedText;
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'APIUserAbortError') {
      console.error(`[chatbot:tools] requestId=${requestId} userId=${userId} error=timeout durationMs=${Date.now() - startedAt}`);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Response timed out — please try again.' })}\n\n`);
    } else {
      console.error(`[chatbot:tools] requestId=${requestId} userId=${userId} error=${err.name}: ${String(err.message).slice(0, 200)} durationMs=${Date.now() - startedAt}`);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service temporarily unavailable' })}\n\n`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Update `module.exports` at the bottom of the file:

```javascript
module.exports = { streamChatResponse, streamChatWithTools, TRIAGE_SYSTEM_PROMPT };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx jest --testPathPattern="services/__tests__/chatbotService.tools" --no-coverage
```

Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/chatbotService.js apps/api/src/services/__tests__/chatbotService.tools.test.js
git commit -m "feat(chatbot): add streamChatWithTools — Anthropic tool-use SSE streaming loop"
```

---

### Task 4: Wire toolContext into the Chatbot Route

**Files:**
- Modify: `apps/api/src/routes/chatbot.js`
- Modify: `apps/api/src/routes/__tests__/chatbot.test.js`

**Interfaces:**
- Consumes:
  - `streamChatWithTools` from `../services/chatbotService`
  - `setPendingBooking` from `../utils/sessionStore` (exported in Task 1)

- [ ] **Step 1: Write the failing tests**

Open `apps/api/src/routes/__tests__/chatbot.test.js` and add these test cases. Find the top-level `jest.mock('../../services/chatbotService', ...)` block and update it to also expose `streamChatWithTools`:

```javascript
jest.mock('../../services/chatbotService', () => ({
  TRIAGE_SYSTEM_PROMPT: 'mock-system-prompt',
  streamChatResponse: jest.fn(async (res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    return 'AI response text';
  }),
  streamChatWithTools: jest.fn(async (res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    return 'AI tool response text';
  }),
}));
```

Also update the `jest.mock('../../utils/sessionStore', ...)` block to expose the new functions:

```javascript
jest.mock('../../utils/sessionStore', () => ({
  snapshotHistory:     jest.fn(() => []),
  appendAndSave:       jest.fn(),
  clearSession:        jest.fn(),
  getHistory:          jest.fn(() => []),
  setPendingBooking:   jest.fn(),
  getPendingBooking:   jest.fn(() => null),
  clearPendingBooking: jest.fn(),
}));
```

Then add new test cases at the end of the existing test file (before the final closing `}`):

```javascript
describe('POST /api/chatbot/message — tool-use routing', () => {
  let app;
  let streamChatWithTools;
  let streamChatResponse;

  beforeEach(() => {
    jest.resetModules();

    streamChatWithTools = jest.fn(async (res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      return 'tool response';
    });
    streamChatResponse = jest.fn(async (res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      return 'text response';
    });

    jest.mock('../../middleware/auth', () => (req, _res, next) => {
      req.user = { id: 'patient-1', role: 'patient' };
      next();
    });
    jest.mock('../../middleware/rbac', () => (...roles) => (req, res, next) => {
      if (!roles.includes(req.user?.role)) return res.status(403).json({ message: 'Forbidden' });
      next();
    });
    jest.mock('../../middleware/rateLimiter', () => ({
      apiLimiter:      (_req, _res, next) => next(),
      registerLimiter: (_req, _res, next) => next(),
      loginLimiter:    (_req, _res, next) => next(),
      chatbotLimiter:  (_req, _res, next) => next(),
    }));
    jest.mock('../../services/chatbotService', () => ({
      TRIAGE_SYSTEM_PROMPT: 'sys',
      streamChatResponse,
      streamChatWithTools,
    }));
    jest.mock('../../utils/sessionStore', () => ({
      snapshotHistory:     jest.fn(() => []),
      appendAndSave:       jest.fn(),
      clearSession:        jest.fn(),
      getHistory:          jest.fn(() => []),
      setPendingBooking:   jest.fn(),
      getPendingBooking:   jest.fn(() => null),
      clearPendingBooking: jest.fn(),
    }));
    jest.mock('../../utils/triageParser', () => ({ parseTriage: jest.fn(() => null) }));
    jest.mock('../../utils/doctorRanking', () => ({ getRankedDoctors: jest.fn().mockResolvedValue({ doctors: [], specialtyFallback: false }) }));

    const express = require('express');
    app = express();
    app.use(express.json());
    app.use('/api/chatbot', require('../../routes/chatbot'));
  });

  const supertest = require('supertest');

  it('uses streamChatWithTools when lat and lng provided', async () => {
    await supertest(app)
      .post('/api/chatbot/message')
      .send({ message: 'Find me a doctor', lat: 24.7, lng: 46.7 });

    expect(streamChatWithTools).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      expect.any(String),
      expect.objectContaining({ userId: 'patient-1', lat: 24.7, lng: 46.7 }),
      expect.objectContaining({ userId: 'patient-1' })
    );
    expect(streamChatResponse).not.toHaveBeenCalled();
  });

  it('falls back to streamChatResponse when no lat/lng', async () => {
    await supertest(app)
      .post('/api/chatbot/message')
      .send({ message: 'Hello' });

    expect(streamChatResponse).toHaveBeenCalled();
    expect(streamChatWithTools).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx jest --testPathPattern="routes/__tests__/chatbot" --no-coverage
```

Expected: FAIL — new tool-use routing tests fail (streamChatWithTools not yet called)

- [ ] **Step 3: Update chatbot.js route**

Open `apps/api/src/routes/chatbot.js`.

**3a.** Update the import line for chatbotService to also import `streamChatWithTools`:

```javascript
const { streamChatResponse, streamChatWithTools, TRIAGE_SYSTEM_PROMPT } = require('../services/chatbotService');
```

**3b.** Update the import line for sessionStore to include pending booking functions:

```javascript
const { snapshotHistory, appendAndSave, clearSession, setPendingBooking, getPendingBooking, clearPendingBooking } = require('../utils/sessionStore');
```

**3c.** In the `POST /api/chatbot/message` route handler, find this block:

```javascript
    let accumulated;

    try {
      accumulated = await streamChatResponse(res, historyForClaude, TRIAGE_SYSTEM_PROMPT, { requestId, userId });
    } catch (err) {
```

Replace it with:

```javascript
    let accumulated;

    const hasLocation = lat != null && lng != null;

    try {
      if (hasLocation) {
        accumulated = await streamChatWithTools(
          res,
          historyForClaude,
          TRIAGE_SYSTEM_PROMPT,
          { userId, lat, lng, requestId },
          { requestId, userId }
        );
      } else {
        accumulated = await streamChatResponse(res, historyForClaude, TRIAGE_SYSTEM_PROMPT, { requestId, userId });
      }
    } catch (err) {
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx jest --testPathPattern="routes/__tests__/chatbot" --no-coverage
```

Expected: PASS — all tests pass including new routing tests

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npx jest --no-coverage
```

Expected: PASS — all tests across all files pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/chatbot.js apps/api/src/routes/__tests__/chatbot.test.js
git commit -m "feat(chatbot): wire tool-use route — streamChatWithTools when lat/lng present"
```

---

## Self-Review

### Spec Coverage

| Spec Section | Covered By |
|---|---|
| 3 tools: search_doctors, get_availability, book_appointment | Task 2 — TOOL_DEFINITIONS |
| Tool input schemas | Task 2 — TOOL_DEFINITIONS.input_schema |
| Server-side tool execution | Task 2 — executeTool; Task 3 — streamChatWithTools |
| tool_call + tool_result SSE events | Task 3 — streamChatWithTools stream loop |
| delta SSE events unchanged | Task 3 — content_block_delta text_delta handler |
| Max 3 tool call rounds | Task 3 — TOOL_MAX_ROUNDS = 3, toolRounds guard |
| pendingBooking TTL 10 min | Task 1 — PENDING_BOOKING_TTL = 600 |
| setPendingBooking / getPendingBooking / clearPendingBooking | Task 1 |
| book_appointment requires pendingBooking | Task 2 — bookAppointment guard |
| Slot conflict check (exclude cancelled/archived) | Task 2 — Appointment.exists |
| Emergency short-circuit | Task 3 — parseTriage(accumulatedText) check before tool execution |
| Server-side input validation | Task 2 — validateToolInput |
| ObjectId validation | Task 2 — OBJECT_ID_RE |
| date YYYY-MM-DD validation | Task 2 — DATE_RE |
| timeSlot HH:MM validation | Task 2 — TIME_RE |
| visitType enum validation | Task 2 — VISIT_TYPES |
| radius capped at 50,000 | Task 2 — validateToolInput |
| Tool failures return { error } non-fatal | Task 2 — executeTool catch |
| No PHI logging | Task 2 — executeTool logs only tool name/duration/status; Task 3 — same |
| initiatedBy: 'patient' | Task 2 — Appointment.create |
| Route passes toolContext when lat/lng present | Task 4 |
| Fallback to streamChatResponse when no lat/lng | Task 4 |

### Gaps

None identified. All spec sections are covered.

### Placeholder Scan

No TBD, TODO, "add appropriate error handling", or "similar to Task N" patterns present.

### Type Consistency

- `executeTool(name, input, context)` — used consistently in Task 2 implementation and Task 3 call site
- `toolContext: { userId, lat, lng, requestId }` — passed from Task 4 route, consumed in Task 2 executor functions
- `streamChatWithTools(res, history, systemPrompt, toolContext, { requestId, userId })` — defined in Task 3, called in Task 4
- `setPendingBooking/getPendingBooking/clearPendingBooking` — exported in Task 1, imported in Task 2 and Task 4
- SSE event shapes: `{ type: 'tool_call', name, input }` and `{ type: 'tool_result', name, data }` — consistent across Task 3 (emit) and spec
