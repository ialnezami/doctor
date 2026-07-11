'use strict';

function normalizePhone(raw) {
  const stripped = String(raw).trim().replace(/[\s\-().]/g, '');
  const e164 = stripped.startsWith('+') ? stripped : `+${stripped}`;
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 7) throw new Error('Invalid phone number');
  return e164;
}

module.exports = { normalizePhone };
