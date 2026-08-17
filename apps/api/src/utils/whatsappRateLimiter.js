'use strict';

const NodeCache = require('node-cache');
// TTL of 3600s = 1 hour window
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 300 });

const LIMIT = 20;

/**
 * Returns true if the phone is within the rate limit, false if exceeded.
 * Uses in-memory sliding window — good enough for single-instance; use Redis for multi-instance.
 */
function checkRateLimit(phone) {
  const count = cache.get(phone) || 0;
  if (count >= LIMIT) return false;
  const remainingTtl = cache.getTtl(phone);
  const ttl = remainingTtl ? Math.ceil((remainingTtl - Date.now()) / 1000) : 3600;
  cache.set(phone, count + 1, ttl);
  return true;
}

module.exports = { checkRateLimit };
