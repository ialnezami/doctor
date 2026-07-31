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
