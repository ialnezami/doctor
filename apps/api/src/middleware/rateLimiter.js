'use strict';

const rateLimit = require('express-rate-limit');
// ipKeyGenerator normalises IPv6 addresses for consistent rate-limit keying.
// Required by express-rate-limit@8+ when using a custom keyGenerator that
// can fall back to req.ip — avoids the ERR_ERL_KEY_GEN_IPV6 ValidationError.
const { ipKeyGenerator } = require('express-rate-limit');

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
  // Primary key: authenticated user ID (JWT sub) — bypasses IP cycling.
  // Fallback to ipKeyGenerator only if auth middleware hasn't populated req.user
  // (should not happen in normal flow since auth runs before this limiter).
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Chatbot rate limit exceeded — 30 messages per hour allowed.' },
});

module.exports = { apiLimiter, registerLimiter, loginLimiter, chatbotLimiter };
