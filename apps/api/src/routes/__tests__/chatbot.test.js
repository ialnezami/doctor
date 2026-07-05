'use strict';

// chatbot route tests — RED state (production files not yet implemented).
// Uses supertest + mocked middleware/services.

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'patient-1', role: 'patient' };
  next();
});

jest.mock('../../middleware/rbac', () => (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ message: 'Forbidden' });
  next();
});

jest.mock('../../middleware/rateLimiter', () => ({
  apiLimiter:      (_req, _res, next) => next(),
  registerLimiter: (_req, _res, next) => next(),
  loginLimiter:    (_req, _res, next) => next(),
  chatbotLimiter:  (_req, _res, next) => next(),
}));

jest.mock('../../services/chatbotService', () => ({
  TRIAGE_SYSTEM_PROMPT: 'mock-system-prompt',
  streamChatResponse: jest.fn(),
}));

jest.mock('../../utils/sessionStore', () => ({
  snapshotHistory: jest.fn(() => []),
  appendAndSave:   jest.fn(),
  clearSession:    jest.fn(),
  getHistory:      jest.fn(() => []),
}));

jest.mock('../../utils/triageParser', () => ({
  parseTriage: jest.fn(() => null),
}));

jest.mock('../../utils/doctorRanking', () => ({
  getRankedDoctors: jest.fn(() => Promise.resolve({ doctors: [], specialtyFallback: false })),
}));

const express = require('express');
const request = require('supertest');

// We need to build the app after mocks are established
function buildApp() {
  const app = express();
  app.use(express.json());
  const chatbotRouter = require('../chatbot');
  app.use('/api/chatbot', chatbotRouter);
  return app;
}

const { streamChatResponse } = require('../../services/chatbotService');
const { parseTriage }         = require('../../utils/triageParser');
const { clearSession }        = require('../../utils/sessionStore');

let app;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  // Re-apply mocks needed after resetModules
  jest.mock('../../middleware/auth', () => (req, _res, next) => {
    req.user = { id: 'patient-1', role: 'patient' };
    next();
  });
  jest.mock('../../middleware/rbac', () => (...roles) => (req, res, next) => {
    if (!roles.includes(req.user?.role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  });
  jest.mock('../../middleware/rateLimiter', () => ({
    apiLimiter:      (_req, _res, next) => next(),
    registerLimiter: (_req, _res, next) => next(),
    loginLimiter:    (_req, _res, next) => next(),
    chatbotLimiter:  (_req, _res, next) => next(),
  }));
  jest.mock('../../services/chatbotService', () => ({
    TRIAGE_SYSTEM_PROMPT: 'mock-system-prompt',
    streamChatResponse: jest.fn(async (res) => {
      // Default: writes nothing, returns accumulated text
      return 'AI response text';
    }),
  }));
  jest.mock('../../utils/sessionStore', () => ({
    snapshotHistory: jest.fn(() => []),
    appendAndSave:   jest.fn(),
    clearSession:    jest.fn(),
    getHistory:      jest.fn(() => []),
  }));
  jest.mock('../../utils/triageParser', () => ({
    parseTriage: jest.fn(() => null),
  }));
  jest.mock('../../utils/doctorRanking', () => ({
    getRankedDoctors: jest.fn(() => Promise.resolve({ doctors: [], specialtyFallback: false })),
  }));

  app = buildApp();
});

describe('POST /api/chatbot/message — auth guards', () => {
  it('rejects non-patient role (doctor) with 403', async () => {
    jest.resetModules();
    jest.mock('../../middleware/auth', () => (req, _res, next) => {
      req.user = { id: 'doc-1', role: 'doctor' };
      next();
    });
    jest.mock('../../middleware/rbac', () => (...roles) => (req, res, next) => {
      if (!roles.includes(req.user?.role)) return res.status(403).json({ message: 'Forbidden' });
      next();
    });
    jest.mock('../../middleware/rateLimiter', () => ({
      apiLimiter: (_req, _res, next) => next(),
      registerLimiter: (_req, _res, next) => next(),
      loginLimiter: (_req, _res, next) => next(),
      chatbotLimiter: (_req, _res, next) => next(),
    }));
    jest.mock('../../services/chatbotService', () => ({
      TRIAGE_SYSTEM_PROMPT: 'mock',
      streamChatResponse: jest.fn(),
    }));
    jest.mock('../../utils/sessionStore', () => ({
      snapshotHistory: jest.fn(() => []),
      appendAndSave: jest.fn(),
      clearSession: jest.fn(),
      getHistory: jest.fn(() => []),
    }));
    jest.mock('../../utils/triageParser', () => ({ parseTriage: jest.fn(() => null) }));
    jest.mock('../../utils/doctorRanking', () => ({
      getRankedDoctors: jest.fn(() => Promise.resolve({ doctors: [], specialtyFallback: false })),
    }));
    const doctorApp = buildApp();
    const res = await request(doctorApp)
      .post('/api/chatbot/message')
      .send({ message: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/chatbot/message — validation', () => {
  it('returns 422 when message is missing', async () => {
    const res = await request(app)
      .post('/api/chatbot/message')
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.errors).toBeDefined();
  });

  it('returns 422 when message exceeds 2000 chars', async () => {
    const res = await request(app)
      .post('/api/chatbot/message')
      .send({ message: 'a'.repeat(2001) });
    expect(res.status).toBe(422);
  });

  it('accepts message at exactly 2000 chars', async () => {
    const { streamChatResponse: mockStream } = require('../../services/chatbotService');
    mockStream.mockImplementation(async (res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      return 'response';
    });
    const res = await request(app)
      .post('/api/chatbot/message')
      .send({ message: 'a'.repeat(2000) });
    // Should not be 422
    expect(res.status).not.toBe(422);
  });
});

describe('DELETE /api/chatbot/session', () => {
  it('returns 204 and clears session', async () => {
    const res = await request(app)
      .delete('/api/chatbot/session');
    expect(res.status).toBe(204);
  });
});

describe('GET /api/chatbot/doctors', () => {
  it('returns 422 when lat/lng missing', async () => {
    const res = await request(app)
      .get('/api/chatbot/doctors')
      .query({ specialty: 'cardiology' });
    expect(res.status).toBe(422);
  });

  it('returns 200 with doctors array when lat/lng provided', async () => {
    const { getRankedDoctors } = require('../../utils/doctorRanking');
    getRankedDoctors.mockResolvedValue({ doctors: [{ _id: 'd1' }], specialtyFallback: false });

    const res = await request(app)
      .get('/api/chatbot/doctors')
      .query({ lat: 24.7136, lng: 46.6753 });
    expect(res.status).toBe(200);
    expect(res.body.doctors).toBeDefined();
  });
});
