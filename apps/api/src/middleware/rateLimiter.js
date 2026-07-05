'use strict';

const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests — please try again later.' },
});

// Register: 20 per 15 min (prevents account-farming bots)
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts — please try again later.' },
});

// Login: 10 per 15 min, failed attempts only — brute-force protection
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Too many failed login attempts — account temporarily locked. Try again in 15 minutes.' },
});

// Chatbot: 30 messages per user per hour.
// MUST be applied AFTER auth middleware so req.user.id is populated.
// Keyed by user ID (not IP) — IP cycling cannot bypass per-user limits.
const chatbotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Chatbot rate limit exceeded — 30 messages per hour allowed.' },
});

module.exports = { apiLimiter, registerLimiter, loginLimiter, chatbotLimiter };
