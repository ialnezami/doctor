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
    Appointment.findOne = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id:         'appt1',
        checkedInAt: null,
        date:        new Date(), // today
        status:      'confirmed',
        timeSlot:    '10:30',
        patientId:   { name: 'Ahmed' },
      }),
    });
    Appointment.findOneAndUpdate = jest.fn().mockResolvedValue({
      _id:         'appt1',
      checkedInAt: new Date(),
    });

    const res = await request(app)
      .post('/api/appointments/checkin')
      .send({ token: 'a'.repeat(64) });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('تم تسجيل حضورك بنجاح');
    expect(res.body.patientName).toBe('Ahmed');
    expect(res.body.appointmentTime).toBe('10:30');
  });

  it('returns 404 when token not found', async () => {
    Appointment.findOne = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app)
      .post('/api/appointments/checkin')
      .send({ token: 'b'.repeat(64) });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('رمز غير صالح');
  });

  it('returns 422 when token missing', async () => {
    const res = await request(app)
      .post('/api/appointments/checkin')
      .send({});
    expect(res.status).toBe(422);
  });

  it('returns 409 when already checked in', async () => {
    Appointment.findOne = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id:         'appt1',
        checkedInAt: new Date('2026-07-31T08:00:00Z'), // already stamped
        date:        new Date(), // today
        status:      'confirmed',
        timeSlot:    '09:00',
        patientId:   { name: 'أحمد' },
      }),
    });
    const res = await request(app)
      .post('/api/appointments/checkin')
      .send({ token: 'a'.repeat(64) });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('تم تسجيل حضورك مسبقاً');
  });

  it('returns 400 when appointment is not today', async () => {
    Appointment.findOne = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id:         'appt2',
        checkedInAt: null,
        date:        new Date('2026-01-01T10:00:00Z'), // past date
        status:      'confirmed',
        timeSlot:    '10:00',
        patientId:   { name: 'سارة' },
      }),
    });
    const res = await request(app)
      .post('/api/appointments/checkin')
      .send({ token: 'b'.repeat(64) });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('هذا الموعد ليس اليوم');
  });

  it('returns 400 when appointment is cancelled', async () => {
    Appointment.findOne = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id:         'appt3',
        checkedInAt: null,
        date:        new Date(), // today
        status:      'cancelled',
        timeSlot:    '11:00',
        patientId:   { name: 'خالد' },
      }),
    });
    const res = await request(app)
      .post('/api/appointments/checkin')
      .send({ token: 'c'.repeat(64) });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('تم إلغاء هذا الموعد');
  });
});
