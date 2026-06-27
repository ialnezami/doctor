'use strict';

let _resend;

function getResend() {
  if (!_resend) {
    const { Resend } = require('resend');
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await getResend().emails.send({
      from: process.env.EMAIL_FROM || 'MediConnect <notifications@mediconnect.app>',
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[email] send failed to', to, ':', err.message);
  }
}

module.exports = { sendEmail };
