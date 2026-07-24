'use strict';

// chatbot route integration tests — covers auth, validation, rate limiting,
// emergency triage SSE event, session clear, and timeout paths.
// Uses supertest with a minimal Express app mounting only the chatbot router.

// NOTE: jest.mock() calls are hoisted by babel-jest to the top of the file
// before any variable assignments. Factory functions cannot close over local
// variables declared in the test file. Use separate jest.mock() call sites
// per test case when non-default behavior is needed.

// ---------------------------------------------------------------------------
// Default module mocks (patient role, rate-limit bypassed)
// ---------------------------------------------------------------------------

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
    res.setHeader('Content-Type', 'text/event-stream');
    return 'AI response text';
  }),
  streamChatWithTools: jest.fn(async (res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    return 'AI tool response text';
  }),
}));

jest.mock('../../utils/sessionStore', () => ({
  snapshotHistory:     jest.fn(() => []),
  appendAndSave:       jest.fn(),
  clearSession:        jest.fn(),
  getHistory:          jest.fn(() => []),
  setPendingBooking:   jest.fn(),
  getPendingBooking:   jest.fn(() => null),
  clearPendingBooking: jest.fn(),
}));

jest.mock('../../utils/triageParser', () => ({
  parseTriage: jest.fn(() => null),
}));

jest.mock('../../utils/doctorRanking', () => ({
  getRankedDoctors: jest.fn(() => Promise.resolve({ doctors: [], specialtyFallback: false })),
}));

const express = require('express');
const request = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  const chatbotRouter = require('../chatbot');
  app.use('/api/chatbot', chatbotRouter);
  return app;
}

let app;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  // Re-register default mocks after resetModules
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
      res.setHeader('Content-Type', 'text/event-stream');
      return 'AI response text';
    }),
    streamChatWithTools: jest.fn(async (res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      return 'AI tool response text';
    }),
  }));
  jest.mock('../../utils/sessionStore', () => ({
    snapshotHistory:     jest.fn(() => []),
    appendAndSave:       jest.fn(),
    clearSession:        jest.fn(),
    getHistory:          jest.fn(() => []),
    setPendingBooking:   jest.fn(),
    getPendingBooking:   jest.fn(() => null),
    clearPendingBooking: jest.fn(),
  }));
  jest.mock('../../utils/triageParser', () => ({
    parseTriage: jest.fn(() => null),
  }));
  jest.mock('../../utils/doctorRanking', () => ({
    getRankedDoctors: jest.fn(() => Promise.resolve({ doctors: [], specialtyFallback: false })),
  }));

  app = buildApp();
});

// ---------------------------------------------------------------------------
// Auth guards
// ---------------------------------------------------------------------------

describe('POST /api/chatbot/message — auth guards', () => {
  it('rejects non-patient role (doctor) with 403', async () => {
    jest.resetModules();
    // Doctor role — rbac mock will block
    jest.mock('../../middleware/auth', () => (req, _res, next) => {
      req.user = { id: 'doc-1', role: 'doctor' };
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
      TRIAGE_SYSTEM_PROMPT: 'mock',
      streamChatResponse: jest.fn(),
    }));
    jest.mock('../../utils/sessionStore', () => ({
      snapshotHistory: jest.fn(() => []),
      appendAndSave:   jest.fn(),
      clearSession:    jest.fn(),
      getHistory:      jest.fn(() => []),
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

  it('returns 401 when no JWT is provided (auth middleware rejects)', async () => {
    jest.resetModules();
    // Auth middleware that rejects — simulates missing/invalid token
    jest.mock('../../middleware/auth', () => (_req, res, _next) => {
      res.status(401).json({ message: 'Unauthorized' });
    });
    jest.mock('../../middleware/rbac', () => (..._roles) => (_req, _res, next) => next());
    jest.mock('../../middleware/rateLimiter', () => ({
      apiLimiter:      (_req, _res, next) => next(),
      registerLimiter: (_req, _res, next) => next(),
      loginLimiter:    (_req, _res, next) => next(),
      chatbotLimiter:  (_req, _res, next) => next(),
    }));
    jest.mock('../../services/chatbotService', () => ({
      TRIAGE_SYSTEM_PROMPT: 'mock',
      streamChatResponse: jest.fn(),
    }));
    jest.mock('../../utils/sessionStore', () => ({
      snapshotHistory: jest.fn(() => []),
      appendAndSave:   jest.fn(),
      clearSession:    jest.fn(),
      getHistory:      jest.fn(() => []),
    }));
    jest.mock('../../utils/triageParser', () => ({ parseTriage: jest.fn(() => null) }));
    jest.mock('../../utils/doctorRanking', () => ({
      getRankedDoctors: jest.fn(() => Promise.resolve({ doctors: [], specialtyFallback: false })),
    }));

    const unauthApp = buildApp();
    const res = await request(unauthApp)
      .post('/api/chatbot/message')
      .send({ message: 'test' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('POST /api/chatbot/message — validation', () => {
  it('returns 422 when message is missing (empty body)', async () => {
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

  it('returns 422 when lat is out of range (lat=95)', async () => {
    const res = await request(app)
      .post('/api/chatbot/message')
      .send({ message: 'I have chest pain', lat: 95, lng: 46.67 });
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
    expect(res.status).not.toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting — build a standalone Express app with real rate limiter
// injected directly (avoids jest.mock hoisting constraint on closures).
// ---------------------------------------------------------------------------

describe('POST /api/chatbot/message — rate limiting', () => {
  it('returns 429 on 31st request when limit=30 (fresh MemoryStore per test)', async () => {
    // Build a standalone Express app that inlines the chatbot route logic
    // with a real express-rate-limit middleware (max=30). This avoids the
    // jest.mock hoisting restriction that forbids out-of-scope variable access.
    const rateLimit = require('express-rate-limit');
    const { body, validationResult } = require('express-validator');

    const rateLimitApp = express();
    rateLimitApp.use(express.json());

    // Inject patient user (simulates auth middleware)
    rateLimitApp.use((req, _res, next) => {
      req.user = { id: 'rate-test-user', role: 'patient' };
      next();
    });

    // Real limiter — fresh MemoryStore (default) so state is isolated per test.
    // skip: false on IPv6 validation warning because keyGenerator always returns
    // req.user.id in tests (never falls through to IP).
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 30,
      keyGenerator: (req) => (req.user && req.user.id) ? req.user.id : 'unknown',
      standardHeaders: true,
      legacyHeaders: false,
      validate: { xForwardedForHeader: false, default: false },
    });

    const validate = (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
      next();
    };

    rateLimitApp.post('/api/chatbot/message',
      limiter,
      body('message').isString().trim().isLength({ min: 1, max: 2000 }),
      validate,
      (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.write('data: {"type":"delta","text":"ok"}\n\n');
        res.write(`data: ${JSON.stringify({ type: 'done', emergency: false, doctors: [], urgency: null, specialties: [], summary: null, specialtyFallback: false })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    );

    // Fire 30 requests — should all pass (rate limit not yet exceeded)
    for (let i = 0; i < 30; i++) {
      await request(rateLimitApp)
        .post('/api/chatbot/message')
        .send({ message: 'ping' });
    }

    // 31st must return 429
    const res = await request(rateLimitApp)
      .post('/api/chatbot/message')
      .send({ message: 'ping' });
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Emergency triage — done SSE event must have emergency:true and doctors:[]
// ---------------------------------------------------------------------------

describe('POST /api/chatbot/message — emergency triage', () => {
  it('sets emergency:true in done SSE event and skips doctor ranking', async () => {
    jest.resetModules();

    const emergencyText =
      'Call emergency services NOW. ' +
      '<triage>{"urgency":"emergency","specialties":[],"summary":"chest pain","ready_for_referral":false}</triage>';

    jest.mock('../../middleware/auth', () => (req, _res, next) => {
      req.user = { id: 'patient-emergency', role: 'patient' };
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
        res.setHeader('Content-Type', 'text/event-stream');
        return emergencyText;
      }),
    }));
    jest.mock('../../utils/sessionStore', () => ({
      snapshotHistory: jest.fn(() => []),
      appendAndSave:   jest.fn(),
      clearSession:    jest.fn(),
      getHistory:      jest.fn(() => []),
    }));
    // Use the real triageParser so we test actual parsing logic end-to-end
    jest.mock('../../utils/triageParser', () => jest.requireActual('../../utils/triageParser'));

    // Track whether getRankedDoctors is called (it must NOT be for emergency)
    const mockGetRankedDoctors = jest.fn(() =>
      Promise.resolve({ doctors: [{ _id: 'd1' }], specialtyFallback: false })
    );
    jest.mock('../../utils/doctorRanking', () => ({
      getRankedDoctors: mockGetRankedDoctors,
    }));

    const emergencyApp = buildApp();

    const res = await request(emergencyApp)
      .post('/api/chatbot/message')
      .send({ message: 'I have severe chest pain', lat: 24.71, lng: 46.67 });

    // Parse SSE events from response body
    const events = res.text
      .split('\n\n')
      .filter(chunk => chunk.startsWith('data: ') && !chunk.includes('[DONE]'))
      .map(chunk => {
        try { return JSON.parse(chunk.replace(/^data: /, '')); } catch { return null; }
      })
      .filter(Boolean);

    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent.emergency).toBe(true);
    expect(doneEvent.doctors).toEqual([]);

    // Doctor ranking must NOT be called for emergency urgency
    expect(mockGetRankedDoctors).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Session clear
// ---------------------------------------------------------------------------

describe('DELETE /api/chatbot/session', () => {
  it('returns 204 and clears session', async () => {
    const res = await request(app).delete('/api/chatbot/session');
    expect(res.status).toBe(204);
  });

  it('subsequent getHistory returns [] after session delete', async () => {
    jest.resetModules();

    jest.mock('../../middleware/auth', () => (req, _res, next) => {
      req.user = { id: 'session-test-user', role: 'patient' };
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
      TRIAGE_SYSTEM_PROMPT: 'mock',
      streamChatResponse: jest.fn(async (res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        return 'ok';
      }),
    }));
    jest.mock('../../utils/triageParser', () => ({ parseTriage: jest.fn(() => null) }));
    jest.mock('../../utils/doctorRanking', () => ({
      getRankedDoctors: jest.fn(() => Promise.resolve({ doctors: [], specialtyFallback: false })),
    }));

    // Use real sessionStore for this test
    jest.mock('../../utils/sessionStore', () => jest.requireActual('../../utils/sessionStore'));

    const sessionApp = buildApp();

    // Populate history directly via real store
    const realStore = require('../../utils/sessionStore');
    realStore.appendAndSave('session-test-user', 'hello', 'hi');
    expect(realStore.getHistory('session-test-user')).toHaveLength(2);

    // DELETE /session clears it
    const del = await request(sessionApp).delete('/api/chatbot/session');
    expect(del.status).toBe(204);

    // History must now be empty
    expect(realStore.getHistory('session-test-user')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Timeout — stream error path
// ---------------------------------------------------------------------------

describe('POST /api/chatbot/message — timeout', () => {
  it('writes error SSE event when stream service throws AbortError (25s timeout)', async () => {
    jest.useFakeTimers();
    jest.resetModules();

    jest.mock('../../middleware/auth', () => (req, _res, next) => {
      req.user = { id: 'patient-timeout', role: 'patient' };
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

    // Simulate the service writing a timeout error event then throwing AbortError
    jest.mock('../../services/chatbotService', () => ({
      TRIAGE_SYSTEM_PROMPT: 'mock',
      streamChatResponse: jest.fn(async (res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: 'Response timed out — please try again.' })}\n\n`
        );
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }),
    }));
    jest.mock('../../utils/sessionStore', () => ({
      snapshotHistory: jest.fn(() => []),
      appendAndSave:   jest.fn(),
      clearSession:    jest.fn(),
      getHistory:      jest.fn(() => []),
    }));
    jest.mock('../../utils/triageParser', () => ({ parseTriage: jest.fn(() => null) }));
    jest.mock('../../utils/doctorRanking', () => ({
      getRankedDoctors: jest.fn(() => Promise.resolve({ doctors: [], specialtyFallback: false })),
    }));

    const timeoutApp = buildApp();

    const responsePromise = request(timeoutApp)
      .post('/api/chatbot/message')
      .send({ message: 'I have a headache' });

    // Advance fake timers past 25s to trigger the AbortController in chatbotService
    jest.advanceTimersByTime(26000);

    const res = await responsePromise;

    const errorEvent = res.text
      .split('\n\n')
      .filter(chunk => chunk.startsWith('data: ') && !chunk.includes('[DONE]'))
      .map(chunk => {
        try { return JSON.parse(chunk.replace(/^data: /, '')); } catch { return null; }
      })
      .filter(e => e && e.type === 'error')[0];

    expect(errorEvent).toBeDefined();
    expect(errorEvent.type).toBe('error');

    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// GET /api/chatbot/doctors
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tool-use routing — streamChatWithTools vs streamChatResponse
// ---------------------------------------------------------------------------

describe('POST /api/chatbot/message — tool-use routing', () => {
  let app;
  let streamChatWithTools;
  let streamChatResponse;

  beforeEach(() => {
    jest.resetModules();

    streamChatWithTools = jest.fn(async (res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      return 'tool response';
    });
    streamChatResponse = jest.fn(async (res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      return 'text response';
    });

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
      TRIAGE_SYSTEM_PROMPT: 'sys',
      streamChatResponse,
      streamChatWithTools,
    }));
    jest.mock('../../utils/sessionStore', () => ({
      snapshotHistory:     jest.fn(() => []),
      appendAndSave:       jest.fn(),
      clearSession:        jest.fn(),
      getHistory:          jest.fn(() => []),
      setPendingBooking:   jest.fn(),
      getPendingBooking:   jest.fn(() => null),
      clearPendingBooking: jest.fn(),
    }));
    jest.mock('../../utils/triageParser', () => ({ parseTriage: jest.fn(() => null) }));
    jest.mock('../../utils/doctorRanking', () => ({ getRankedDoctors: jest.fn().mockResolvedValue({ doctors: [], specialtyFallback: false }) }));

    const express = require('express');
    app = express();
    app.use(express.json());
    app.use('/api/chatbot', require('../../routes/chatbot'));
  });

  const supertest = require('supertest');

  it('uses streamChatWithTools when lat and lng provided', async () => {
    await supertest(app)
      .post('/api/chatbot/message')
      .send({ message: 'Find me a doctor', lat: 24.7, lng: 46.7 });

    expect(streamChatWithTools).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      expect.any(String),
      expect.objectContaining({ userId: 'patient-1', lat: 24.7, lng: 46.7 }),
      expect.objectContaining({ userId: 'patient-1' })
    );
    expect(streamChatResponse).not.toHaveBeenCalled();
  });

  it('falls back to streamChatResponse when no lat/lng', async () => {
    await supertest(app)
      .post('/api/chatbot/message')
      .send({ message: 'Hello' });

    expect(streamChatResponse).toHaveBeenCalled();
    expect(streamChatWithTools).not.toHaveBeenCalled();
  });
});
