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

module.exports = { apiLimiter, registerLimiter, loginLimiter };
