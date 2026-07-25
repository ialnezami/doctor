const admin = require('firebase-admin');

if (!admin.apps.length && process.env.FCM_SERVER_KEY) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FCM_SERVER_KEY)),
    });
  } catch (err) {
    console.error('[FCM] init failed:', err.message);
  }
}

async function sendPush(token, title, body, data = {}) {
  if (!token || !admin.apps.length) return;
  try {
    await admin.messaging().send({ token, notification: { title, body }, data });
  } catch (err) {
    console.error('[FCM] send failed:', err.message);
  }
}

module.exports = { sendPush };
