const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(idToken) {
  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (originalErr) {
    console.error('[googleAuth] Token verification failed:', originalErr.message);
    const err = new Error('Invalid or expired Google ID token');
    err.status = 401;
    throw err;
  }

  const payload = ticket.getPayload();

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
