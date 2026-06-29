'use strict';
const { verify } = require('../utils/jwt');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'No token' });

  let decoded;
  try {
    decoded = verify(header.slice(7));
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }

  req.user = decoded;

  // GDPR erasure check: erased users' JWTs remain cryptographically valid until expiry.
  // We must reject them at the application layer via a DB lookup.
  // .lean() returns a plain JS object — no Mongoose overhead.
  // select('erasedAt isSuspended') — minimal field fetch to keep the query lightweight.
  // Future optimization: cache erasedAt=true entries in Redis with a short TTL
  // to avoid a DB round-trip on every request for known-erased users.
  try {
    const user = await User.findById(decoded.id).select('erasedAt isSuspended').lean();
    if (!user) return res.status(401).json({ message: 'User not found' });
    if (user.erasedAt) return res.status(401).json({ message: 'Account has been erased' });
    // isSuspended previously checked only at login; enforcing here blocks suspended
    // users on every request, not just the next login attempt.
    if (user.isSuspended) return res.status(403).json({ message: 'Account suspended. Contact support.' });
  } catch (err) {
    // DB failure: fail-closed is the secure choice — fail-open would allow erased/suspended
    // users through if the DB is temporarily unavailable.
    console.error('[auth] DB check failed:', err.message);
    return res.status(503).json({ message: 'Service temporarily unavailable' });
  }

  next();
};
