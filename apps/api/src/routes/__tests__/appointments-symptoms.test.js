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
