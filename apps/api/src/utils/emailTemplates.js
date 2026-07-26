'use strict';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function base(title, body) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">
<h2 style="color:#0ea5e9">${esc(title)}</h2>
${body}
<hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"/>
<p style="font-size:12px;color:#94a3b8">Salamtak &mdash; Your health, connected.</p>
</body></html>`;
}

function appointmentConfirmedEmail(patientName, doctorName, date, timeSlot) {
  return base('Appointment Confirmed', `
    <p>Hi ${esc(patientName)},</p>
    <p>Your appointment with <strong>${esc(doctorName)}</strong> has been confirmed.</p>
    <p><strong>Date:</strong> ${esc(date)}<br/><strong>Time:</strong> ${esc(timeSlot)}</p>
    <p>Please arrive a few minutes early. You can view or manage your appointment in the Salamtak app.</p>
  `);
}

function appointmentReminderEmail(patientName, doctorName, date, timeSlot) {
  return base('Appointment Reminder', `
    <p>Hi ${esc(patientName)},</p>
    <p>This is a reminder that you have an appointment with <strong>${esc(doctorName)}</strong> tomorrow.</p>
    <p><strong>Date:</strong> ${esc(date)}<br/><strong>Time:</strong> ${esc(timeSlot)}</p>
    <p>Open the Salamtak app to view details or join via video call.</p>
  `);
}

function consultationValidatedEmail(patientName, doctorName, date) {
  return base('Consultation Summary Ready', `
    <p>Hi ${esc(patientName)},</p>
    <p>Your consultation with <strong>${esc(doctorName)}</strong> on <strong>${esc(date)}</strong> has been completed.</p>
    <p>Your consultation summary, including any shared notes and prescriptions, is now available in the Salamtak app.</p>
  `);
}

function dailyDigestEmail(doctorName, count, date) {
  return base('Your Daily Schedule', `
    <p>Good morning, ${esc(doctorName)},</p>
    <p>You have <strong>${esc(count)} appointment(s)</strong> scheduled for today, <strong>${esc(date)}</strong>.</p>
    <p>Open the Salamtak app to review your schedule and patient details.</p>
  `);
}

module.exports = {
  appointmentConfirmedEmail,
  appointmentReminderEmail,
  consultationValidatedEmail,
  dailyDigestEmail,
};
