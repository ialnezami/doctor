jest.mock('../../models/User');
jest.mock('../../models/OtpCode');
jest.mock('twilio');
jest.mock('../../utils/blindIndex', () => ({ hmacHash: jest.fn(v => `hash:${v}`) }));
jest.mock('../../utils/phoneUtils',  () => ({ normalizePhone: jest.fn(v => v) }));
jest.mock('../../utils/jwt',         () => ({ sign: jest.fn(() => 'jwt-token') }));

const request  = require('supertest');
const express  = require('express');
const User     = require('../../models/User');
const OtpCode  = require('../../models/OtpCode');
const twilio   = require('twilio');

const authRouter = require('../auth');
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TWILIO_ACCOUNT_SID     = 'AC123';
  process.env.TWILIO_AUTH_TOKEN      = 'token';
  process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886';
  twilio.mockImplementation(() => ({
    messages: { create: jest.fn().mockResolvedValue({ sid: 'SM123' }) },
  }));
});

test('POST /claim-account returns 404 if phone not registered', async () => {
  User.findOne = jest.fn().mockResolvedValue(null);
  const res = await request(app).post('/api/auth/claim-account').send({ phone: '+966501234567' });
  expect(res.status).toBe(404);
});

test('POST /claim-account sends OTP and returns 200', async () => {
  User.findOne = jest.fn().mockResolvedValue({ _id: 'u1' });
  OtpCode.deleteMany  = jest.fn().mockResolvedValue({});
  OtpCode.mockImplementation(() => ({ save: jest.fn() }));

  const res = await request(app).post('/api/auth/claim-account').send({ phone: '+966501234567' });
  expect(res.status).toBe(200);
});

test('POST /claim-account/verify returns 400 on wrong OTP', async () => {
  User.findOne  = jest.fn().mockResolvedValue({ _id: 'u1' });
  OtpCode.findOne = jest.fn().mockResolvedValue({
    codeHash: 'wronghash', attempts: 0, expiresAt: new Date(Date.now() + 60000),
    used: false, save: jest.fn(),
  });

  const res = await request(app)
    .post('/api/auth/claim-account/verify')
    .send({ phone: '+966501234567', otp: '000000', password: 'newpass123' });
  expect(res.status).toBe(400);
});

test('POST /claim-account/verify returns JWT on correct OTP', async () => {
  const fakeUser = { _id: 'u1', role: 'patient', whatsappLinked: false, save: jest.fn() };
  User.findOne  = jest.fn().mockResolvedValue(fakeUser);
  const otp     = '482931';
  const hash    = require('crypto').createHash('sha256').update(otp).digest('hex');
  OtpCode.findOne = jest.fn().mockResolvedValue({
    codeHash: hash, attempts: 0, expiresAt: new Date(Date.now() + 60000),
    used: false, save: jest.fn(),
  });

  const res = await request(app)
    .post('/api/auth/claim-account/verify')
    .send({ phone: '+966501234567', otp, password: 'newpass123' });
  expect(res.status).toBe(200);
  expect(res.body.token).toBe('jwt-token');
});
