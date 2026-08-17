jest.mock('twilio', () => ({
  validateRequest: jest.fn(),
}));
jest.mock('../../services/patientProvisioner');
jest.mock('../../models/WhatsappSession');
jest.mock('../../services/whatsappAgent');
jest.mock('../../utils/whatsappRateLimiter');

const request    = require('supertest');
const express    = require('express');
const twilio     = require('twilio');
const { findOrCreatePatient } = require('../../services/patientProvisioner');
const WhatsappSession = require('../../models/WhatsappSession');
const { runAgent }    = require('../../services/whatsappAgent');
const { checkRateLimit } = require('../../utils/whatsappRateLimiter');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use('/api/whatsapp', require('../whatsapp'));

const VALID_BODY = { From: 'whatsapp:+966501234567', Body: 'مرحبا' };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TWILIO_AUTH_TOKEN    = 'test-token';
  process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886';
  twilio.validateRequest.mockReturnValue(true);
  checkRateLimit.mockReturnValue(true);
  findOrCreatePatient.mockResolvedValue({ userId: 'u1', patientId: 'p1' });
  WhatsappSession.findByPhone = jest.fn().mockResolvedValue(null);
  WhatsappSession.upsertForPhone = jest.fn().mockResolvedValue({});
  runAgent.mockResolvedValue({ reply: 'أهلاً!', history: [] });
});

test('returns TwiML with agent reply on valid request', async () => {
  const res = await request(app)
    .post('/api/whatsapp/webhook')
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .send(VALID_BODY);

  expect(res.status).toBe(200);
  expect(res.text).toContain('<Message>أهلاً!</Message>');
});

test('rejects with 403 on invalid Twilio signature', async () => {
  twilio.validateRequest.mockReturnValue(false);
  const res = await request(app)
    .post('/api/whatsapp/webhook')
    .send(VALID_BODY);
  expect(res.status).toBe(403);
});

test('returns rate-limit message when limit exceeded', async () => {
  checkRateLimit.mockReturnValue(false);
  const res = await request(app)
    .post('/api/whatsapp/webhook')
    .send(VALID_BODY);
  expect(res.status).toBe(200);
  expect(res.text).toContain('يرجى الانتظار');
});

test('returns 400 if From or Body missing', async () => {
  const res = await request(app)
    .post('/api/whatsapp/webhook')
    .send({ From: 'whatsapp:+966501234567' }); // missing Body
  expect(res.status).toBe(400);
});
