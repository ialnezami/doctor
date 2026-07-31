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
