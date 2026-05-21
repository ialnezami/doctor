const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client();

const ACCEPTED_AUDIENCES = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
].filter(Boolean);

async function verifyGoogleToken(idToken) {
  if (!idToken) {
    const err = new Error('idToken is required');
    err.status = 400;
    throw err;
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: ACCEPTED_AUDIENCES,
    });
  } catch (originalErr) {
    console.error('[googleAuth] Token verification failed:', originalErr.message);
    const err = new Error('Invalid or expired Google ID token');
    err.status = 401;
    throw err;
  }

  const payload = ticket.getPayload();

  if (!payload) {
    const err = new Error('Failed to extract Google token payload');
    err.status = 401;
    throw err;
  }

  if (!payload.sub || !payload.email || !payload.name) {
    const err = new Error('Invalid Google token payload');
    err.status = 401;
    throw err;
  }

  if (!payload.email_verified) {
    const err = new Error('Google account email is not verified');
    err.status = 401;
    throw err;
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
  };
}

module.exports = { verifyGoogleToken };
