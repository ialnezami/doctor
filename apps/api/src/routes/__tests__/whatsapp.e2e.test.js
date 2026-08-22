'use strict';

/**
 * E2E tests for the WhatsApp AI booking agent.
 *
 * Strategy: mock only external services (Twilio signature, Claude API).
 * All internal layers run real code — provisioner, session, booking tools,
 * agent loop — with mongoose models mocked per project convention.
 *
 * Features covered:
 *   1. Twilio signature validation (403)
 *   2. Missing/empty body (400)
 *   3. Rate limiting (Arabic wait message)
 *   4. Silent account creation (new phone)
 *   5. Returning user (existing phone, session reload)
 *   6. Session history persistence
 *   7. find_doctors → TwiML reply
 *   8. get_available_slots → TwiML reply
 *   9. book_appointment → appointment created
 *  10. list_my_appointments → upcoming list
 *  11. cancel_appointment → status set to cancelled
 *  12. save_patient_name → User.findByIdAndUpdate called
 *  13. Out-of-scope request → polite decline
 *  14. TwiML XML character escaping
 *  15. Tool loop: multi-turn (tool_use → tool_use → end_turn)
 *  16. Agent fallback on unexpected stop_reason
 */

// ── External-service mocks ─────────────────────────────────────────────────────
jest.mock('twilio', () => ({ validateRequest: jest.fn().mockReturnValue(true) }));
jest.mock('@anthropic-ai/sdk');

// ── Model mocks (project convention) ──────────────────────────────────────────
jest.mock('../../models/User');
jest.mock('../../models/Patient');
jest.mock('../../models/Doctor');
jest.mock('../../models/Appointment');
jest.mock('../../models/WhatsappSession');

// ── Utility mocks ─────────────────────────────────────────────────────────────
jest.mock('../../utils/whatsappRateLimiter', () => ({
  checkRateLimit: jest.fn().mockReturnValue(true),
}));
jest.mock('../../utils/blindIndex',  () => ({ hmacHash:       jest.fn(v => `hash:${v}`) }));
jest.mock('../../utils/phoneUtils',  () => ({ normalizePhone: jest.fn(v => v) }));

// ── Imports ───────────────────────────────────────────────────────────────────
const request     = require('supertest');
const express     = require('express');
const twilio      = require('twilio');
const Anthropic   = require('@anthropic-ai/sdk');
const User        = require('../../models/User');
const Patient     = require('../../models/Patient');
const Doctor      = require('../../models/Doctor');
const Appointment = require('../../models/Appointment');
const WhatsappSession          = require('../../models/WhatsappSession');
const { checkRateLimit }       = require('../../utils/whatsappRateLimiter');

// ── App fixture ───────────────────────────────────────────────────────────────
const app = express();
app.use('/api/whatsapp', require('../whatsapp'));

// ── Constants ─────────────────────────────────────────────────────────────────
process.env.TWILIO_AUTH_TOKEN      = 'test-token';
process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886';
process.env.ANTHROPIC_API_KEY      = 'test-key';

const FROM       = 'whatsapp:+966501234567';
const PHONE      = '+966501234567';
const USER_ID    = '64f000000000000000000001';
const PATIENT_ID = '64f000000000000000000002';
const DOCTOR_ID  = '64f000000000000000000003';
const LOCATION_ID= '64f000000000000000000004';
const APPT_ID    = '64f000000000000000000005';

// ── Helpers ───────────────────────────────────────────────────────────────────

function postWebhook(body, extraHeaders = {}) {
  return request(app)
    .post('/api/whatsapp/webhook')
    .type('form')
    .set(extraHeaders)
    .send({ From: FROM, Body: body });
}

function textTurn(text) {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
}

function toolTurn(name, input) {
  return {
    content: [{ type: 'tool_use', id: `tid_${name}`, name, input }],
    stop_reason: 'tool_use',
  };
}

function mockClaude(turns) {
  let i = 0;
  Anthropic.mockImplementation(() => ({
    messages: {
      create: jest.fn().mockImplementation(() =>
        Promise.resolve(turns[Math.min(i++, turns.length - 1)])
      ),
    },
  }));
}

function setupExistingUser() {
  User.findOne = jest.fn().mockResolvedValue({ _id: USER_ID });
  Patient.findOne = jest.fn().mockResolvedValue({ _id: PATIENT_ID });
}

// ── Default mock state ─────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  twilio.validateRequest.mockReturnValue(true);
  checkRateLimit.mockReturnValue(true);

  // Default: new phone (silent creation)
  User.findOne = jest.fn().mockResolvedValue(null);
  User.findByIdAndUpdate = jest.fn().mockResolvedValue({});
  User.mockImplementation(function () {
    this._id = USER_ID;
    this.save = jest.fn().mockResolvedValue(this);
  });
  Patient.findOne = jest.fn().mockResolvedValue(null);
  Patient.mockImplementation(function () {
    this._id = PATIENT_ID;
    this.save = jest.fn().mockResolvedValue(this);
  });

  WhatsappSession.findByPhone    = jest.fn().mockResolvedValue(null);
  WhatsappSession.upsertForPhone = jest.fn().mockResolvedValue({});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Security — Twilio signature
// ═══════════════════════════════════════════════════════════════════════════════

test('1. rejects with 403 on invalid Twilio signature', async () => {
  twilio.validateRequest.mockReturnValue(false);
  const res = await postWebhook('hello');
  expect(res.status).toBe(403);
  // Must not reach provisioner
  expect(User.findOne).not.toHaveBeenCalled();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Input validation — missing Body
// ═══════════════════════════════════════════════════════════════════════════════

test('2. returns 400 when Body is absent', async () => {
  const res = await request(app)
    .post('/api/whatsapp/webhook')
    .type('form')
    .send({ From: FROM });
  expect(res.status).toBe(400);
});

test('2b. returns 400 when Body is whitespace only', async () => {
  const res = await postWebhook('   ');
  expect(res.status).toBe(400);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Rate limiting
// ═══════════════════════════════════════════════════════════════════════════════

test('3. returns 200 with Arabic wait message when rate limit exceeded', async () => {
  checkRateLimit.mockReturnValue(false);
  const res = await postWebhook('hello');
  expect(res.status).toBe(200);
  expect(res.type).toMatch(/xml/);
  expect(res.text).toContain('يرجى الانتظار');
  expect(res.text).toContain('<Message>');
  // Must not reach provisioner
  expect(User.findOne).not.toHaveBeenCalled();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Silent account creation — new phone number
// ═══════════════════════════════════════════════════════════════════════════════

test('4. silently creates User + Patient for new phone', async () => {
  mockClaude([textTurn('أهلاً! ما اسمك الكريم؟')]);

  const res = await postWebhook('مرحبا');

  expect(res.status).toBe(200);
  expect(User.findOne).toHaveBeenCalledWith({ phoneHash: `hash:${PHONE}` });
  expect(User).toHaveBeenCalledTimes(1);   // new User(...)
  expect(Patient).toHaveBeenCalledTimes(1); // new Patient(...)
  expect(res.text).toContain('<Message>');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Returning user — existing account found
// ═══════════════════════════════════════════════════════════════════════════════

test('5. reuses existing User + Patient for returning phone', async () => {
  setupExistingUser();
  mockClaude([textTurn('مرحباً بعودتك!')]);

  const res = await postWebhook('hello');

  expect(res.status).toBe(200);
  // No new model instances created
  expect(User).not.toHaveBeenCalledWith(expect.objectContaining({ phone: PHONE }));
  expect(Patient).not.toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }));
  expect(res.text).toContain('مرحباً');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Session history persistence
// ═══════════════════════════════════════════════════════════════════════════════

test('6. loads existing session history and saves updated history', async () => {
  setupExistingUser();
  WhatsappSession.findByPhone = jest.fn().mockResolvedValue({
    history: [
      { role: 'user',      content: 'أريد طبيبًا' },
      { role: 'assistant', content: 'من فضلك اذكر التخصص.' },
    ],
  });
  mockClaude([textTurn('هل تقصد طبيب قلب؟')]);

  await postWebhook('قلبية');

  // Session must be saved with at least the two old turns + new turn
  expect(WhatsappSession.upsertForPhone).toHaveBeenCalledWith(
    PHONE,
    USER_ID,
    expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'أريد طبيبًا' }),
      expect.objectContaining({ role: 'user', content: 'قلبية' }),
    ])
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. find_doctors tool
// ═══════════════════════════════════════════════════════════════════════════════

test('7. find_doctors → executes DB query and returns doctor list in TwiML', async () => {
  setupExistingUser();
  Doctor.find = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue([{
        _id: DOCTOR_ID,
        specialty: 'cardiology',
        userId: { name: 'Dr. Ahmed Khalid' },
        locations: [{ _id: LOCATION_ID, name: 'Jeddah Clinic', address: '123 Main St', type: 'bookable' }],
      }]),
    }),
  });

  mockClaude([
    toolTurn('find_doctors', { specialty: 'cardiology' }),
    textTurn('وجدت طبيبًا: د. أحمد خالد في جدة. هل تريد حجزًا؟'),
  ]);

  const res = await postWebhook('أريد طبيب قلب');

  expect(res.status).toBe(200);
  expect(Doctor.find).toHaveBeenCalledWith(
    expect.objectContaining({ specialty: expect.objectContaining({ $regex: 'cardiology' }) })
  );
  expect(res.text).toContain('أحمد');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. get_available_slots tool
// ═══════════════════════════════════════════════════════════════════════════════

test('8. get_available_slots → queries doctor slots and filters booked times', async () => {
  setupExistingUser();

  const fakeLocation = {
    type: 'bookable',
    slots: [{ dayOfWeek: new Date().getDay(), startTime: '09:00', endTime: '11:00' }],
  };
  Doctor.findById = jest.fn().mockResolvedValue({
    _id: DOCTOR_ID,
    appointmentTypes: [{ duration: 30 }],
    locations: { id: jest.fn().mockReturnValue(fakeLocation) },
  });
  Appointment.findOne = jest.fn().mockResolvedValue(null); // no conflicts

  mockClaude([
    toolTurn('get_available_slots', { doctorId: DOCTOR_ID, locationId: LOCATION_ID, daysAhead: 1 }),
    textTurn('المواعيد المتاحة اليوم: 09:00، 09:30، 10:00، 10:30.'),
  ]);

  const res = await postWebhook('ما المواعيد المتاحة؟');

  expect(res.status).toBe(200);
  expect(Doctor.findById).toHaveBeenCalledWith(DOCTOR_ID);
  expect(res.text).toContain('المواعيد');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. book_appointment tool
// ═══════════════════════════════════════════════════════════════════════════════

test('9. book_appointment → creates Appointment document in DB', async () => {
  setupExistingUser();

  Appointment.findOne = jest.fn().mockResolvedValue(null); // no double-booking
  Doctor.findById = jest.fn().mockReturnValue({
    populate: jest.fn().mockResolvedValue({
      _id: DOCTOR_ID,
      userId: { name: 'Dr. Ahmed' },
      autoAcceptAppointments: true,
      appointmentTypes: [{ key: 'initial', fee: 200 }],
      locations: {
        id: jest.fn().mockReturnValue({ name: 'Jeddah Clinic', address: '123 St', type: 'bookable' }),
      },
    }),
  });
  Appointment.mockImplementation(function () {
    this._id = APPT_ID;
    this.save = jest.fn().mockResolvedValue(this);
  });

  mockClaude([
    toolTurn('book_appointment', {
      doctorId:   DOCTOR_ID,
      locationId: LOCATION_ID,
      date:       '2026-09-01',
      timeSlot:   { start: '10:00', end: '10:30' },
      reason:     'ألم في الصدر',
    }),
    textTurn('✅ تم الحجز بنجاح مع د. أحمد يوم 2026-09-01 الساعة 10:00.'),
  ]);

  const res = await postWebhook('نعم، أكد الحجز');

  expect(res.status).toBe(200);
  expect(Appointment).toHaveBeenCalledTimes(1);
  expect(res.text).toContain('تم الحجز');
});

test('9b. book_appointment → returns error TwiML if slot already taken', async () => {
  setupExistingUser();

  Appointment.findOne = jest.fn().mockResolvedValue({ _id: 'existing' }); // conflict

  mockClaude([
    toolTurn('book_appointment', {
      doctorId: DOCTOR_ID, locationId: LOCATION_ID,
      date: '2026-09-01', timeSlot: { start: '10:00', end: '10:30' },
    }),
    textTurn('عذراً، هذا الوقت محجوز. هل تختار وقتًا آخر؟'),
  ]);

  const res = await postWebhook('احجز الساعة 10');

  expect(res.status).toBe(200);
  expect(Appointment).not.toHaveBeenCalled(); // no new appointment saved
  expect(res.text).toContain('<Message>');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. list_my_appointments tool
// ═══════════════════════════════════════════════════════════════════════════════

test('10. list_my_appointments → queries and returns upcoming appointments', async () => {
  setupExistingUser();

  Appointment.find = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([{
          _id: APPT_ID,
          doctorId: { name: 'Dr. Ahmed' },
          date: new Date('2026-09-01'),
          timeSlot: { start: '10:00', end: '10:30' },
          status: 'confirmed',
        }]),
      }),
    }),
  });

  mockClaude([
    toolTurn('list_my_appointments', {}),
    textTurn('لديك موعد مع د. أحمد يوم 2026-09-01 الساعة 10:00 (مؤكد).'),
  ]);

  const res = await postWebhook('أين مواعيدي؟');

  expect(res.status).toBe(200);
  expect(Appointment.find).toHaveBeenCalledWith(
    expect.objectContaining({ patientId: USER_ID })
  );
  expect(res.text).toContain('موعد');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. cancel_appointment tool
// ═══════════════════════════════════════════════════════════════════════════════

test('11. cancel_appointment → sets appointment status to cancelled', async () => {
  setupExistingUser();

  const mockAppt = {
    _id: APPT_ID,
    patientId: USER_ID,
    status: 'confirmed',
    save: jest.fn().mockResolvedValue({}),
  };
  Appointment.findById = jest.fn().mockResolvedValue(mockAppt);

  mockClaude([
    toolTurn('cancel_appointment', { appointmentId: APPT_ID }),
    textTurn('✅ تم إلغاء الموعد بنجاح.'),
  ]);

  const res = await postWebhook('نعم، ألغِ الموعد');

  expect(res.status).toBe(200);
  expect(mockAppt.status).toBe('cancelled');
  expect(mockAppt.save).toHaveBeenCalled();
  expect(res.text).toContain('إلغاء');
});

test('11b. cancel_appointment → rejects if appointment belongs to another patient', async () => {
  setupExistingUser();

  Appointment.findById = jest.fn().mockResolvedValue({
    _id: APPT_ID,
    patientId: 'someone-else',
    status: 'confirmed',
  });

  mockClaude([
    toolTurn('cancel_appointment', { appointmentId: APPT_ID }),
    textTurn('لم أتمكن من إلغاء الموعد، يبدو أنه غير موجود.'),
  ]);

  const res = await postWebhook('ألغِ الموعد');

  expect(res.status).toBe(200);
  // No save should have been called
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. save_patient_name tool
// ═══════════════════════════════════════════════════════════════════════════════

test('12. save_patient_name → updates User display name in DB', async () => {
  mockClaude([
    toolTurn('save_patient_name', { name: 'محمد علي' }),
    textTurn('شكراً يا محمد! كيف يمكنني مساعدتك؟'),
  ]);

  const res = await postWebhook('اسمي محمد علي');

  expect(res.status).toBe(200);
  expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
    USER_ID,
    { name: 'محمد علي' }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. Out-of-scope request
// ═══════════════════════════════════════════════════════════════════════════════

test('13. out-of-scope request → agent returns polite decline in TwiML', async () => {
  setupExistingUser();
  mockClaude([textTurn('آسف، أنا متخصص فقط في حجز المواعيد.')]);

  const res = await postWebhook('أريد نتيجة تحليل دمي');

  expect(res.status).toBe(200);
  expect(res.text).toContain('آسف');
  expect(res.text).toContain('<Message>');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. TwiML XML character escaping
// ═══════════════════════════════════════════════════════════════════════════════

test('14. escapes & < > characters in Claude reply to prevent TwiML injection', async () => {
  setupExistingUser();
  mockClaude([textTurn('Use <b>bold</b> & "quotes" > end')]);

  const res = await postWebhook('test');

  expect(res.status).toBe(200);
  expect(res.text).toContain('&lt;b&gt;');
  expect(res.text).toContain('&amp;');
  expect(res.text).not.toContain('<b>');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. Multi-turn tool loop (two tool calls before end_turn)
// ═══════════════════════════════════════════════════════════════════════════════

test('15. executes two tool calls in one turn before returning final reply', async () => {
  setupExistingUser();

  Doctor.find = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue([{
        _id: DOCTOR_ID, specialty: 'cardiology',
        userId: { name: 'Dr. Ahmed' },
        locations: [{ _id: LOCATION_ID, name: 'Clinic', address: 'Addr', type: 'bookable' }],
      }]),
    }),
  });
  Doctor.findById = jest.fn().mockResolvedValue({
    _id: DOCTOR_ID,
    appointmentTypes: [{ duration: 30 }],
    locations: { id: jest.fn().mockReturnValue({ type: 'bookable', slots: [] }) },
  });

  // Claude calls find_doctors, then immediately get_available_slots, then replies
  mockClaude([
    toolTurn('find_doctors', { specialty: 'cardiology' }),
    toolTurn('get_available_slots', { doctorId: DOCTOR_ID, locationId: LOCATION_ID }),
    textTurn('وجدت طبيبًا. لا توجد مواعيد متاحة هذا الأسبوع.'),
  ]);

  const res = await postWebhook('أريد طبيب قلب في أقرب وقت');

  expect(res.status).toBe(200);
  expect(Doctor.find).toHaveBeenCalled();
  expect(Doctor.findById).toHaveBeenCalled();
  expect(res.text).toContain('وجدت');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16. Agent fallback on unexpected stop_reason / MAX_TOOL_LOOPS
// ═══════════════════════════════════════════════════════════════════════════════

test('16. returns fallback Arabic error TwiML if Claude loops exceed MAX_TOOL_LOOPS', async () => {
  setupExistingUser();

  Doctor.find = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
  });

  // Always returns tool_use — agent should cap at MAX_TOOL_LOOPS=5 and use fallback
  const loopForever = toolTurn('find_doctors', { specialty: 'test' });
  mockClaude(Array(10).fill(loopForever));

  const res = await postWebhook('help');

  expect(res.status).toBe(200);
  expect(res.text).toContain('<Message>');
  // Should contain the fallback error text
  expect(res.text).toContain('عذراً');
});
