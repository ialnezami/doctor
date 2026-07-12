'use strict';

const nodeCrypto = require('crypto');

const SERVICE = 'MediConnect-Desktop';
const ACCOUNT = 'db-encryption-key';
const KEY_LEN  = 32; // AES-256

let _key = null; // Buffer, set by initKey()

// ---------------------------------------------------------------------------
// Key bootstrap
// ---------------------------------------------------------------------------

async function _keytarKey() {
  try {
    const keytar = require('keytar');
    let hex = await keytar.getPassword(SERVICE, ACCOUNT);
    if (!hex) {
      hex = nodeCrypto.randomBytes(KEY_LEN).toString('hex');
      await keytar.setPassword(SERVICE, ACCOUNT, hex);
    }
    return Buffer.from(hex, 'hex');
  } catch {
    return null; // keytar not available (headless / CI)
  }
}

async function _machineKey() {
  try {
    const { machineId } = require('node-machine-id');
    const id = await machineId(true); // returns hex string
    return nodeCrypto.createHash('sha256').update(id).digest();
  } catch {
    return nodeCrypto
      .createHash('sha256')
      .update(require('os').hostname())
      .digest();
  }
}

async function initKey() {
  const kt = await _keytarKey();
  _key = kt ?? (await _machineKey());
}

// ---------------------------------------------------------------------------
// AES-256-GCM helpers
// ---------------------------------------------------------------------------

/**
 * Encrypts plaintext → "iv:authTag:ciphertext" (hex-encoded).
 * Null/empty values pass through unchanged so nullable PHI columns stay null.
 */
function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;
  if (!_key) throw new Error('crypto.initKey() must be called before encrypt()');

  const iv     = nodeCrypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', _key, iv);

  const enc = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 16-byte GCM auth tag

  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * Decrypts "iv:authTag:ciphertext" → plaintext.
 * Strings not matching that format pass through unchanged (un-encrypted legacy rows).
 * GCM auth-tag mismatch throws — tampered data must never silently succeed.
 */
function decrypt(str) {
  if (str == null || str === '') return str;
  if (!_key) throw new Error('crypto.initKey() must be called before decrypt()');

  const parts = str.split(':');
  if (parts.length !== 3) return str; // not encrypted — pass through

  const [ivHex, tagHex, encHex] = parts;
  try {
    const iv      = Buffer.from(ivHex,  'hex');
    const tag     = Buffer.from(tagHex, 'hex');
    const encData = Buffer.from(encHex, 'hex');

    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', _key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encData), decipher.final()]).toString('utf8');
  } catch (err) {
    throw new Error(`PHI decryption failed (GCM auth tag mismatch): ${err.message}`);
  }
}

module.exports = { initKey, encrypt, decrypt };
