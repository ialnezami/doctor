const Appointment = require('../models/Appointment');

const ARCHIVE_STATUSES = ['pending', 'confirmed', 'in_progress'];
const INTERVAL_MS = 60 * 60 * 1000; // every hour

async function archivePastAppointments() {
  try {
    const result = await Appointment.updateMany(
      { date: { $lt: new Date() }, status: { $in: ARCHIVE_STATUSES } },
      { $set: { status: 'archived' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[archive] Archived ${result.modifiedCount} past appointment(s)`);
    }
  } catch (err) {
    console.error('[archive] Failed to archive past appointments:', err.message);
  }
}

function startArchiveWorker() {
  // Run immediately on startup to catch any appointments missed while server was down
  archivePastAppointments();
  setInterval(archivePastAppointments, INTERVAL_MS);
  console.log('[archive] Archive worker started — runs every hour');
}

module.exports = { startArchiveWorker };
