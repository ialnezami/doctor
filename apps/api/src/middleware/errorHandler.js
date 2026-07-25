module.exports = (err, req, res, next) => {
  console.error(err);
  const raw = err.status || 500;
  // Intentional 401/403 responses are always sent via res.status().json() directly
  // in route handlers — never via next(err). An error reaching here with status 401
  // or 403 originates from an external service (e.g. Anthropic SDK auth failure)
  // and must NOT be forwarded as-is: the mobile client treats any 401 as a session
  // expiry and calls logout(), which would kick a perfectly valid patient out.
  const status = raw === 401 || raw === 403 ? 503 : raw;
  res.status(status).json({ message: err.message || 'Internal server error' });
};
