'use strict';

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: '507f1f77bcf86cd799439011', role: 'doctor' };
  next();
});
jest.mock('../../middleware/rbac', () => () => (_req, _res, next) => next());
jest.mock('../../middleware/secretaryAuth', () => ({
  requireSecretary: (_req, _res, next) => next(),
  requireDoctorOrSecretary: (req, _res, next) => {
    req.doctorUserId = req.user.id;
    next();
  },
}));
jest.mock('../../models/User');
jest.mock('../../utils/email', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../utils/blindIndex', () => ({ hmacHash: jest.fn().mockReturnValue('hash123') }));
jest.mock('../../utils/jwt', () => ({ sign: jest.fn().mockReturnValue('fake.jwt.token') }));

const express  = require('express');
const request  = require('supertest');
const User     = require('../../models/User');
const router   = require('../staff');

const app = express();
app.use(express.json());
app.use('/api/staff', router);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/staff', () => {
  it('returns 200 with secretary list', async () => {
    User.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'sec1', name: 'Sara', email: 'sara@test.com', isActive: true },
        ]),
      }),
    });
    const res = await request(app).get('/api/staff');
    expect(res.status).toBe(200);
    expect(res.body.secretaries).toHaveLength(1);
    expect(res.body.secretaries[0].email).toBe('sara@test.com');
  });
});

describe('POST /api/staff/invite', () => {
  it('returns 201 when email not taken', async () => {
    User.findOne = jest.fn().mockResolvedValue(null);
    User.create  = jest.fn().mockResolvedValue({ _id: 'newsec' });
    const res = await request(app)
      .post('/api/staff/invite')
      .send({ email: 'new@clinic.com' });
    expect(res.status).toBe(201);
    expect(res.body.secretaryId).toBe('newsec');
  });

  it('returns 409 when email already registered', async () => {
    User.findOne = jest.fn().mockResolvedValue({ _id: 'existing' });
    const res = await request(app)
      .post('/api/staff/invite')
      .send({ email: 'taken@clinic.com' });
    expect(res.status).toBe(409);
  });

  it('returns 422 for invalid email', async () => {
    const res = await request(app)
      .post('/api/staff/invite')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/staff/:userId', () => {
  it('returns 200 when secretary found', async () => {
    User.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439012' });
    const res = await request(app).delete('/api/staff/507f1f77bcf86cd799439012');
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found or wrong doctor', async () => {
    User.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    const res = await request(app).delete('/api/staff/507f1f77bcf86cd799439099');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid ObjectId', async () => {
    const res = await request(app).delete('/api/staff/not-a-valid-id');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('معرف غير صالح');
  });

  it('clears inviteToken and inviteExpiry on revoke', async () => {
    User.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439012' });

    await request(app).delete('/api/staff/507f1f77bcf86cd799439012');

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: '507f1f77bcf86cd799439012' }),
      expect.objectContaining({ isActive: false, inviteToken: null, inviteExpiry: null }),
      expect.any(Object),
    );
  });
});
