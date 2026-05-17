const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(idToken) {
  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch {
    const err = new Error('Invalid or expired Google ID token');
    err.status = 401;
    throw err;
  }

  const payload = ticket.getPayload();

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
