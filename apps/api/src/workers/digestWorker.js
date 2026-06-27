'use strict';

const { Worker } = require('bullmq');
const { DateTime } = require('luxon');
const Doctor       = require('../models/Doctor');
const User         = require('../models/User');
const Appointment  = require('../models/Appointment');
const Notification = require('../models/Notification');
const { sendPush } = require('../utils/push');
const { getConnection, getDigestQueue } = require('../queues/reminderQueue');
const { nextLocalSevenAmDelay } = require('../utils/reminderDelays');

/**
 * Runs at midnight UTC. Queries all doctors, enqueues a per-doctor
 * 'digest-send' job delayed until 7 AM local time for each doctor
 * who has an FCM token registered.
 *
 * @param {object} _job - BullMQ job (unused)
 */
async function processOrchestratorJob(_job) {
  const doctors = await Doctor.find({}).populate('userId', '_id fcmToken');
  const queue = getDigestQueue();

  for (const doctor of doctors) {
    if (!doctor.userId?.fcmToken) continue;

    const timezone = doctor.timezone || 'UTC';
    const delay = nextLocalSevenAmDelay(timezone);

    await queue.add(
      'digest-send',
      {
        doctorUserId:    String(doctor.userId._id),
        doctorTimezone:  timezone,
      },
      { delay }
    );
  }
}

/**
 * Sends a daily appointment digest push notification to a single doctor.
 * Skips silently if: user not found, no FCM token, or zero appointments today.
 *
 * @param {{ data: { doctorUserId: string, doctorTimezone: string } }} job
 */
async function processDigestSendJob(job) {
  const { doctorUserId, doctorTimezone } = job.data;

  const user = await User.findById(doctorUserId).select('_id fcmToken');
  if (!user?.fcmToken) return;

  const tz = doctorTimezone || 'UTC';
  const now = DateTime.now().setZone(tz);
  const startOfDay = now.startOf('day').toJSDate();
  const endOfDay   = now.endOf('day').toJSDate();

  const count = await Appointment.countDocuments({
    doctorId: doctorUserId,
    date:     { $gte: startOfDay, $lte: endOfDay },
    status:   { $in: ['confirmed', 'in_progress'] },
  });

  if (count === 0) return;

  const message = `You have ${count} appointment(s) today.`;

  await Notification.create({
    recipientId: doctorUserId,
    type:        'daily_digest',
    payload:     { count, message },
  });

  await sendPush(user.fcmToken, 'Daily Schedule', message, {});
}

/**
 * Registers the midnight UTC orchestrator as a repeatable BullMQ job.
 * Idempotent — BullMQ deduplicates by jobId.
 */
async function registerDigestOrchestrator() {
  const queue = getDigestQueue();
  await queue.add(
    'orchestrate-digest',
    {},
    {
      repeat: { pattern: '0 0 * * *', utc: true },
      jobId:  'digest-orchestrator',
    }
  );
  console.log('[digest] orchestrator repeatable job registered');
}

/**
 * Creates and returns a BullMQ Worker for the 'daily-digest' queue.
 * Routes:
 *   orchestrate-digest → processOrchestratorJob
 *   digest-send        → processDigestSendJob
 */
function startDigestWorker() {
  const worker = new Worker(
    'daily-digest',
    async (job) => {
      if (job.name === 'orchestrate-digest') return processOrchestratorJob(job);
      if (job.name === 'digest-send')        return processDigestSendJob(job);
    },
    {
      connection:  getConnection(),
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[digest] job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  console.log('[digest] worker started');
  return worker;
}

module.exports = {
  startDigestWorker,
  registerDigestOrchestrator,
  processOrchestratorJob,
  processDigestSendJob,
};
