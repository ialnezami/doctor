'use strict';

const express = require('express');
const router  = express.Router();
const twilio  = require('twilio');

// Parse both urlencoded (Twilio production) and JSON (tests/integrations)
router.use(express.urlencoded({ extended: false }));
router.use(express.json());
const crypto  = require('crypto');
const { findOrCreatePatient } = require('../services/patientProvisioner');
const WhatsappSession         = require('../models/WhatsappSession');
const { runAgent }            = require('../services/whatsappAgent');
const { checkRateLimit }      = require('../utils/whatsappRateLimiter');

function twiml(message) {
  const safe = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

function validateTwilioSignature(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const url       = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const signature = req.headers['x-twilio-signature'] || '';
  return twilio.validateRequest(authToken, signature, url, req.body);
}

// POST /api/whatsapp/webhook
router.post('/webhook', async (req, res) => {
  // 1. Validate Twilio signature
  if (!validateTwilioSignature(req)) {
    return res.status(403).send('Forbidden');
  }

  const { From, Body } = req.body;

  // 2. Validate required fields
  if (!From || !Body || typeof Body !== 'string' || !Body.trim()) {
    return res.status(400).send('Bad Request');
  }

  // Strip "whatsapp:" prefix from Twilio's From field
  const phone = From.replace(/^whatsapp:/, '');

  // 3. Rate limit — never log Body content
  if (!checkRateLimit(phone)) {
    res.type('text/xml');
    return res.send(twiml('يرجى الانتظار قليلاً قبل إرسال رسالة جديدة. / Please wait before sending another message.'));
  }

  try {
    // 4. Find or create patient account
    const { userId, patientId } = await findOrCreatePatient(phone);

    // 5. Load conversation history
    const session = await WhatsappSession.findByPhone(phone);
    const history = session?.history || [];

    // 6. Run Claude agent
    const { reply, history: updatedHistory } = await runAgent(Body.trim(), history, { userId, patientId });

    // 7. Persist updated session
    await WhatsappSession.upsertForPhone(phone, userId, updatedHistory);

    // 8. Reply with TwiML
    res.type('text/xml');
    res.send(twiml(reply));
  } catch (err) {
    // Log phone hash only — never the message body
    const phoneHash = crypto.createHash('sha256').update(phone).digest('hex').slice(0, 12);
    console.error(`[whatsapp] error phone=${phoneHash}`, err.message);
    res.type('text/xml');
    res.send(twiml('عذراً، حدث خطأ. يرجى المحاولة مرة أخرى. / Sorry, an error occurred. Please try again.'));
  }
});

module.exports = router;
