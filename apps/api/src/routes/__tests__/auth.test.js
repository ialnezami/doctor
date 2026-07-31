'use strict';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

jest.mock('../../middleware/rateLimiter', () => ({
  loginLimiter:    (_req, _res, next) => next(),
  registerLimiter: (_req, _res, next) => next(),
}));
jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: '507f1f77bcf86cd799439011', role: 'doctor' };
  next();
});
jest.mock('../../models/User');
jest.mock('../../models/Doctor',   () => ({ create: jest.fn() }));
jest.mock('../../models/Patient',  () => ({ create: jest.fn() }));
jest.mock('../../models/Lab',      () => ({ create: jest.fn() }));
jest.mock('../../models/Pharmacy', () => ({ create: jest.fn() }));
jest.mock('../../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../utils/jwt',         () => ({ sign: jest.fn().mockReturnValue('fake.jwt.token') }));
jest.mock('../../utils/blindIndex',  () => ({ hmacHash: jest.fn().mockReturnValue('hash123') }));
jest.mock('../../utils/googleAuth',  () => ({ verifyGoogleToken: jest.fn() }));
jest.mock('../../utils/phoneUtils',  () => ({ normalizePhone: jest.fn(p => p) }));

const express = require('express');
const request = require('supertest');
const User    = require('../../models/User');
const router  = require('../auth');

const app = express();
app.use(express.json());
app.use('/api/auth', router);

beforeEach(() => {
  jest.clearAllMocks();
});

// ── POST /api/auth/accept-invite ─────────────────────────────────────────────

describe('POST /api/auth/accept-invite', () => {
  const VALID_TOKEN    = 'a'.repeat(64);
  const VALID_PASSWORD = 'SecurePass1';

  // Helper: a user object whose invite is still valid (expiry in the future)
  const makeActiveUser = (overrides = {}) => ({
    _id:           '507f1f77bcf86cd799439022',
    name:          'Sara',
    email:         'sara@clinic.com',
    role:          'secretary',
    linkedDoctorId: '507f1f77bcf86cd799439011',
    isActive:      false,
    inviteToken:   'hashed-token',
    inviteExpiry:  new Date(Date.now() + 72 * 60 * 60 * 1000), // future
    save:          jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  it('returns 200 and a JWT on a valid token', async () => {
    User.findOne = jest.fn().mockResolvedValue(makeActiveUser());

    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token: VALID_TOKEN, password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('fake.jwt.token');
    expect(res.body.user.role).toBe('secretary');
  });

  it('returns 422 when token field is missing', async () => {
    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({ password: VALID_PASSWORD });

    expect(res.status).toBe(422);
    expect(res.body.errors).toBeDefined();
  });

  it('returns 422 when password is shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token: VALID_TOKEN, password: 'short' });

    expect(res.status).toBe(422);
    expect(res.body.errors).toBeDefined();
  });

  it('returns 400 when token does not match any pending invite', async () => {
    // findOne returns null — no matching secretary record
    User.findOne = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token: VALID_TOKEN, password: VALID_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('رابط الدعوة غير صالح أو منتهي الصلاحية');
  });

  it('returns 400 when invite token is expired', async () => {
    // The route queries { inviteExpiry: { $gt: new Date() } }, so an expired
    // user would simply not be returned by the DB. Simulate that.
    User.findOne = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token: VALID_TOKEN, password: VALID_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('رابط الدعوة غير صالح أو منتهي الصلاحية');
  });
});
