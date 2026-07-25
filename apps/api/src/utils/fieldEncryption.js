'use strict';
/**
 * AES-256-GCM field-level encryption for PHI fields.
 *
 * Key source: process.env.FIELD_ENCRYPTION_KEY — must be a 64-char hex string (32 bytes).
 * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Ciphertext format: iv|ciphertext|authTag (pipe-delimited, all hex).
 * Migration: if stored value has no '|', it is legacy plaintext — returned as-is.
 * Security: GCM auth tag detects tampering; decipher.final() throws on mismatch.
 *
 * NEVER log the key — getKey() throws a generic error to avoid key exposure.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;    // 128-bit IV (NIST recommendation for GCM)
const KEY_LENGTH = 32;   // 256-bit key

function getKey() {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  // Fail loudly at startup if key is missing/wrong length — never silently use a weak key
  if (!hex || hex.length !== 64) {
    throw new Error('Encryption configuration error: FIELD_ENCRYPTION_KEY must be set to a 64-char hex string');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plaintext string.
 * Returns pipe-delimited hex string: iv|ciphertext|authTag
 * Returns null if value is null or undefined (preserves sparse Mongoose fields).
 * Coerces non-string values via String() — consistent round-trip with decrypt.
 */
function encrypt(plaintext) {
  if (plaintext == null) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('hex'),
    encrypted.toString('hex'),
    authTag.toString('hex'),
  ].join('|');
}

/**
 * Decrypts a pipe-delimited ciphertext string back to plaintext.
 * Returns null for null/undefined input.
 * Returns raw value unchanged if it does not contain '|' — backward-compat for
 * plaintext records that existed before encryption was deployed (lazy migration).
 * Throws Error if ciphertext is malformed or auth tag is invalid (tamper detection).
 */
function decrypt(ciphertext) {
  if (ciphertext == null) return null;
  // Legacy plaintext sentinel: no '|' means unencrypted record — safe to return raw
  if (!String(ciphertext).includes('|')) return ciphertext;

  const parts = String(ciphertext).split('|');
  if (parts.length !== 3) {
    throw new Error('Encryption configuration error: malformed ciphertext');
  }
  const [ivHex, encHex, tagHex] = parts;
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  try {
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encHex, 'hex')),
      decipher.final(), // throws if auth tag does not match (tamper detected)
    ]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('Encryption configuration error: decryption failed — possible tampering');
  }
}

module.exports = { encrypt, decrypt };
