jest.mock('../../models/Appointment');
jest.mock('../../models/ReadEvent');
jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../utils/push');
jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'doc1', role: 'doctor' };
  next();
});
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return { ...actual, isValidObjectId: jest.fn().mockReturnValue(true) };
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
