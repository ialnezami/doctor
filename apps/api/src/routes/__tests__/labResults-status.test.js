'use strict';

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'labuser1', role: 'lab' };
  next();
});
jest.mock('../../middleware/requireRole', () => () => (_r, _s, next) => next());
jest.mock('../../models/LabResult');
jest.mock('../../models/SharedLink');
jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../utils/fcm', () => ({ sendPush: jest.fn().mockResolvedValue(null) }));

const express      = require('express');
const request      = require('supertest');
const LabResult    = require('../../models/LabResult');
const SharedLink   = require('../../models/SharedLink');
const Notification = require('../../models/Notification');
const User         = require('../../models/User');
const { sendPush } = require('../../utils/fcm');
const router       = require('../labResults');

const app = express();
app.use(express.json());
app.use('/api/lab-results', router);

beforeEach(() => jest.clearAllMocks());

const fakeLR = {
  _id: 'lr1',
  doctorId: { toString: () => 'labuser1' },
  patientId: 'pat1',
  labName: 'مختبر الأمل',
  status: 'pending',
  tests: [],
  save: jest.fn().mockResolvedValue(true),
};

describe('PATCH /api/lab-results/:id/status', () => {
  it('returns 200 and sets status to processing', async () => {
    LabResult.findById.mockResolvedValue({ ...fakeLR });

    const res = await request(app)
      .patch('/api/lab-results/lr1/status')
      .send({ status: 'processing' });

    expect(res.status).toBe(200);
    expect(res.body.labResult).toBeDefined();
  });

  it('returns 200, creates SharedLink and Notification when marking ready', async () => {
    const lr = { ...fakeLR, save: jest.fn().mockResolvedValue(true) };
    LabResult.findById.mockResolvedValue(lr);
    SharedLink.create.mockResolvedValue({ token: 'tok123' });
    Notification.create.mockResolvedValue({});
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ fcmToken: null }) });

    const res = await request(app)
      .patch('/api/lab-results/lr1/status')
      .send({
        status: 'ready',
        tests: [{ name: 'CBC', value: '14.2', unit: 'g/dL', referenceRange: '12-16', flag: 'normal' }],
      });

    expect(res.status).toBe(200);
    expect(SharedLink.create).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'lab_result', ownerId: 'pat1' })
    );
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'pat1', type: 'lab_ready' })
    );
  });

  it('returns 422 if marking ready with empty test value', async () => {
    LabResult.findById.mockResolvedValue({ ...fakeLR });

    const res = await request(app)
      .patch('/api/lab-results/lr1/status')
      .send({ status: 'ready', tests: [{ name: 'CBC', value: '', flag: 'normal' }] });

    expect(res.status).toBe(422);
  });

  it('returns 403 if lab does not own the result', async () => {
    LabResult.findById.mockResolvedValue({
      ...fakeLR,
      doctorId: { toString: () => 'other_lab_user' },
    });

    const res = await request(app)
      .patch('/api/lab-results/lr1/status')
      .send({ status: 'processing' });

    expect(res.status).toBe(403);
  });

  it('returns 422 for unknown status value', async () => {
    LabResult.findById.mockResolvedValue({ ...fakeLR });

    const res = await request(app)
      .patch('/api/lab-results/lr1/status')
      .send({ status: 'cancelled' });

    expect(res.status).toBe(422);
  });
});
