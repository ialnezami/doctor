'use strict';
/**
 * HMAC-SHA256 blind index for searchable encrypted fields.
 *
 * Problem: AES-256-GCM with random IV produces different ciphertext each time,
 * making equality queries on encrypted fields impossible (e.g., login by email).
 *
 * Solution: Store a keyed HMAC hash alongside the encrypted value. The HMAC is
 * deterministic for the same input + key, enabling equality lookup without
 * revealing the plaintext. A separate key (BLIND_INDEX_KEY) prevents correlation
 * attacks between the blind index and the encrypted field.
 *
 * Usage: User.findOne({ emailHash: hmacHash(email) })
 *
 * Key source: process.env.BLIND_INDEX_KEY — must be a 64-char hex string (32 bytes).
 * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * NEVER use plain SHA256 — it is rainbow-table-attackable. HMAC is keyed.
 */
const crypto = require('crypto');

function getBlindKey() {
  const hex = process.env.BLIND_INDEX_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('Encryption configuration error: BLIND_INDEX_KEY must be set to a 64-char hex string');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Returns a deterministic HMAC-SHA256 hex digest of the value.
 * Input is lowercased and trimmed before hashing to match the User model's
 * email normalization (lowercase: true, trim: true on the Mongoose schema).
 * Returns null for null/undefined — preserves sparse index behavior.
 */
function hmacHash(value) {
  if (value == null) return null;
  const normalized = String(value).toLowerCase().trim();
  return crypto.createHmac('sha256', getBlindKey()).update(normalized).digest('hex');
}

module.exports = { hmacHash };
