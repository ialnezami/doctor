let messaging;

function getMessaging() {
  if (messaging) return messaging;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  messaging = admin.messaging();
  return messaging;
}

async function sendPush(fcmToken, title, body, data = {}) {
  if (!fcmToken || !process.env.FIREBASE_SERVICE_ACCOUNT) return;
  try {
    await getMessaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    });
  } catch (err) {
    console.error('[push] FCM send failed:', err.message);
  }
}

module.exports = { sendPush };
