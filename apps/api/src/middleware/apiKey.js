'use strict';

const API_KEY = process.env.API_KEY;

// Validates x-api-key header on every request.
// /health is excluded — Railway's internal healthcheck doesn't send the key.
module.exports = (req, res, next) => {
  // /health — Railway internal healthcheck has no key
  // /socket.io — socket.io handshake; JWT is validated inside initSocket instead
  if (req.path === '/health' || req.path.startsWith('/socket.io')) return next();

  if (!API_KEY) {
    console.error('[apiKey] API_KEY env var is not set — rejecting all client requests');
    return res.status(503).json({ message: 'Service misconfigured' });
  }

  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ message: 'Invalid or missing API key' });
  }

  next();
};
