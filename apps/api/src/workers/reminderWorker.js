const { Worker } = require('bullmq');
const Appointment  = require('../models/Appointment');
const Notification = require('../models/Notification');
const User         = require('../models/User');
const { sendPush } = require('../utils/push');
const { sendEmail } = require('../utils/email');
const { appointmentReminderEmail } = require('../utils/emailTemplates');
const { getConnection } = require('../queues/reminderQueue');

const THIRTY_MIN_MS = 30 * 60 * 1000;

async function processReminderJob(job) {
  const { appointmentId, reminderType } = job.data;

  const appt = await Appointment.findById(appointmentId);
  if (!appt) return;
  if (appt.status === 'cancelled') return;
  if (appt.remindersDisabled) return;

  if (reminderType === '1h') {
    const msUntilAppt = new Date(appt.date).getTime() - Date.now();
    if (msUntilAppt < THIRTY_MIN_MS) return;
  }

  const titles = {
    '24h': 'Reminder: Appointment Tomorrow',
    '1h':  'Reminder: Appointment in 1 Hour',
  };
  const bodies = {
    '24h': `Your appointment is scheduled for tomorrow at ${appt.timeSlot.start}.`,
    '1h':  `Your appointment starts in about 1 hour at ${appt.timeSlot.start}.`,
  };

  await Notification.create({
    recipientId: appt.patientId,
    type: 'appointment_reminder',
    payload: {
      appointmentId: appt._id,
      reminderType,
      message: bodies[reminderType],
    },
  });

  const user = await User.findById(appt.patientId).select('fcmToken email name notificationPrefs');

  const prefs = user?.notificationPrefs || {};
  const pushEnabled  = prefs.pushEnabled  !== false;
  const emailEnabled = prefs.emailEnabled !== false;

  if (pushEnabled && user?.fcmToken) {
    try {
      await sendPush(
        user.fcmToken,
        titles[reminderType],
        bodies[reminderType],
        { appointmentId: String(appt._id), reminderType }
      );
    } catch (fcmErr) {
      // FCM failure must not bubble up — doing so would cause BullMQ to retry
      // the job and duplicate the Notification record already saved above.
      console.error('[reminders] FCM push failed (notification already saved):', fcmErr.message);
    }
  }

  if (emailEnabled && reminderType === '24h' && user?.email) {
    const apptDate = new Date(appt.date).toISOString().split('T')[0];
    const doctorUser = await User.findById(appt.doctorId).select('name');
    await sendEmail(
      user.email,
      'Appointment Reminder — MediConnect',
      appointmentReminderEmail(
        user.name || 'Patient',
        `Dr. ${doctorUser?.name || 'Your doctor'}`,
        apptDate,
        appt.timeSlot?.start || '',
      ),
    );
  }
}

function startReminderWorker() {
  const worker = new Worker('appointment-reminders', processReminderJob, {
    connection: getConnection(),
    concurrency: 5,
  });
  worker.on('failed', (job, err) =>
    console.error(`[reminders] job ${job?.id} failed:`, err.message)
  );
  console.log('[reminders] worker started');
  return worker;
}

module.exports = { startReminderWorker, processReminderJob };
