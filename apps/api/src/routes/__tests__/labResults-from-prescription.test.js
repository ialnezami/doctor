'use strict';

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'labuser1', role: 'lab' };
  next();
});
jest.mock('../../middleware/requireRole', () => () => (_r, _s, next) => next());
jest.mock('../../models/SharedLink');
jest.mock('../../models/Prescription');
jest.mock('../../models/LabResult');
jest.mock('../../models/Lab');

const express    = require('express');
const request    = require('supertest');
const SharedLink = require('../../models/SharedLink');
const Prescription = require('../../models/Prescription');
const LabResult  = require('../../models/LabResult');
const Lab        = require('../../models/Lab');
const router     = require('../labResults');

const app = express();
app.use(express.json());
app.use('/api/lab-results', router);

beforeEach(() => jest.clearAllMocks());

const validLink = {
  token: 'abc'.repeat(21) + 'a',
  revokedAt: null,
  expiresAt: null,
  resourceId: 'rx1',
};

const validRx = {
  _id: 'rx1',
  patientId: 'pat1',
  doctorId: 'doc1',
  analyses: [{ name: 'Complete Blood Count', instructions: '' }],
};

describe('POST /api/lab-results/from-prescription', () => {
  it('returns 201 with created LabResult for valid token with analyses', async () => {
    SharedLink.findOne.mockResolvedValue(validLink);
    Prescription.findById.mockResolvedValue(validRx);
    LabResult.findOne.mockResolvedValue(null);
    Lab.findOne.mockResolvedValue({ labName: 'مختبر الأمل' });
    LabResult.create.mockResolvedValue({ _id: 'lr1', status: 'pending' });

    const res = await request(app)
      .post('/api/lab-results/from-prescription')
      .send({ shareToken: 'abc'.repeat(21) + 'a' });

    expect(res.status).toBe(201);
    expect(LabResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'pat1',
        status: 'pending',
        prescriptionId: 'rx1',
        labName: 'مختبر الأمل',
      })
    );
  });

  it('returns 422 if shareToken missing', async () => {
    const res = await request(app).post('/api/lab-results/from-prescription').send({});
    expect(res.status).toBe(422);
  });

  it('returns 404 if token not found', async () => {
    SharedLink.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/lab-results/from-prescription')
      .send({ shareToken: 'x'.repeat(64) });
    expect(res.status).toBe(404);
  });

  it('returns 422 if prescription has no analyses', async () => {
    SharedLink.findOne.mockResolvedValue(validLink);
    Prescription.findById.mockResolvedValue({ ...validRx, analyses: [] });
    const res = await request(app)
      .post('/api/lab-results/from-prescription')
      .send({ shareToken: 'abc'.repeat(21) + 'a' });
    expect(res.status).toBe(422);
  });

  it('returns 409 if LabResult already exists for this prescription', async () => {
    SharedLink.findOne.mockResolvedValue(validLink);
    Prescription.findById.mockResolvedValue(validRx);
    LabResult.findOne.mockResolvedValue({ _id: 'existing' });
    const res = await request(app)
      .post('/api/lab-results/from-prescription')
      .send({ shareToken: 'abc'.repeat(21) + 'a' });
    expect(res.status).toBe(409);
  });
});
