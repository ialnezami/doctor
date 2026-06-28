const router       = require('express').Router();
const auth         = require('../middleware/auth');
const requireRole  = require('../middleware/rbac');
const Appointment  = require('../models/Appointment');
const Doctor       = require('../models/Doctor');
const Notification = require('../models/Notification');
const User         = require('../models/User');
const { sendPush } = require('../utils/push');
const { getReminderQueue, getSymptomQueue } = require('../queues/reminderQueue');
const { computeReminderDelays } = require('../utils/reminderDelays');
const { sendEmail }             = require('../utils/email');
const { appointmentConfirmedEmail, consultationValidatedEmail } = require('../utils/emailTemplates');

async function notifyUser(recipientId, type, payload, emailData) {
  const notif = await Notification.create({ recipientId, type, payload });
  const user  = await User.findById(recipientId).select('fcmToken email name notificationPrefs');
  if (!user) return notif;

  const prefs        = user.notificationPrefs || {};
  const pushEnabled  = prefs.pushEnabled  !== false;
  const emailEnabled = prefs.emailEnabled !== false;

  if (pushEnabled && user.fcmToken) {
    const titles = {
      appointment_requested:  'New appointment request',
      appointment_confirmed:  'Appointment confirmed',
      consultation_validated: 'Consultation summary ready',
      notes_viewed:           'Doctor reviewed your consultation',
    };
    await sendPush(user.fcmToken, titles[type], payload.message || '', {
      appointmentId: String(payload.appointmentId),
    });
  }

  if (emailEnabled && emailData) {
    await sendEmail(emailData.to, emailData.subject, emailData.html);
  }

  return notif;
}

async function scheduleReminders(appt) {
  try {
    const queue = getReminderQueue();
    const { delay24h, delay1h } = computeReminderDelays(appt.date);

    const [job24h, job1h] = await Promise.all([
      queue.add(
        'reminder-24h',
        { appointmentId: String(appt._id), reminderType: '24h' },
        { delay: delay24h, jobId: `reminder-${appt._id}-24h` }
      ),
      queue.add(
        'reminder-1h',
        { appointmentId: String(appt._id), reminderType: '1h' },
        { delay: delay1h, jobId: `reminder-${appt._id}-1h` }
      ),
    ]);

    appt.reminder24hJobId = job24h.id;
    appt.reminder1hJobId  = job1h.id;
    await appt.save();
  } catch (err) {
    console.error('[reminders] enqueue failed:', String(appt._id), err.message);
  }
}

async function cancelReminders(appt) {
  try {
    const queue = getReminderQueue();
    if (appt.reminder24hJobId) await queue.remove(appt.reminder24hJobId);
    if (appt.reminder1hJobId)  await queue.remove(appt.reminder1hJobId);
  } catch (err) {
    console.error('[reminders] cancel failed:', err.message);
  }
}

// POST /api/appointments — patient books
router.post('/', auth, requireRole('patient'), async (req, res, next) => {
  try {
    const { doctorId, date, timeSlot, visitType, reason } = req.body;

    // Atomic double-booking check
    const conflict = await Appointment.findOne({
      doctorId,
      date: new Date(date),
      'timeSlot.start': timeSlot.start,
      status: { $in: ['pending', 'confirmed'] },
    });

    if (conflict) {
      return res.status(409).json({ message: 'This slot is already booked' });
    }

    // Auto-accept if doctor has autoAcceptAppointments enabled
    const doctorProfile = await Doctor.findOne({ userId: doctorId }).select('autoAcceptAppointments');
    const status = doctorProfile?.autoAcceptAppointments ? 'confirmed' : 'pending';

    const appt = await Appointment.create({
      doctorId,
      patientId: req.user.id,
      date: new Date(date),
      timeSlot,
      visitType,
      reason,
      status,
    });

    if (appt.status === 'confirmed') {
      await scheduleReminders(appt);
    }

    res.status(201).json(appt);
  } catch (err) {
    next(err);
  }
});

// GET /api/appointments — list for current user
router.get('/', auth, async (req, res, next) => {
  try {
    const filter = req.user.role === 'doctor'
      ? { doctorId: req.user.id }
      : { patientId: req.user.id };

    if (req.query.status) filter.status = req.query.status;

    const appointments = await Appointment.find(filter)
      .populate('doctorId', 'name')
      .populate('patientId', 'name')
      .sort({ date: 1 });

    res.json(appointments);
  } catch (err) {
    next(err);
  }
});

// GET /api/appointments/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const appt = await Appointment.findById(req.params.id)
      .populate('doctorId', 'name email')
      .populate('patientId', 'name email');

    if (!appt) return res.status(404).json({ message: 'Not found' });

    const isOwner = [appt.doctorId._id.toString(), appt.patientId._id.toString()].includes(req.user.id);
    if (!isOwner) return res.status(403).json({ message: 'Forbidden' });

    res.json(appt);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/appointments/:id/status — generic status update (legacy)
// Doctor: confirmed, cancelled, completed; Patient: cancelled only
router.patch('/:id/status', auth, async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Not found' });

    const isDoctor  = req.user.role === 'doctor'  && appt.doctorId.toString()  === req.user.id;
    const isPatient = req.user.role === 'patient' && appt.patientId.toString() === req.user.id;

    if (!isDoctor && !isPatient) return res.status(403).json({ message: 'Forbidden' });
    if (isPatient && status !== 'cancelled') return res.status(403).json({ message: 'Patients can only cancel' });

    appt.status = status;
    if (notes) appt.notes = notes;
    await appt.save();
    res.json(appt);

    // Fire-and-forget FCM to the other party
    const otherPartyId = req.user.role === 'doctor' ? appt.patientId : appt.doctorId;
    const otherUser = await User.findById(otherPartyId).select('fcmToken');
    const FCM_MESSAGES = {
      confirmed: { title: 'Appointment Confirmed ✅', body: 'Your appointment has been confirmed.' },
      cancelled: { title: 'Appointment Cancelled',   body: 'An appointment has been cancelled.' },
      completed: { title: 'Appointment Completed',   body: 'Your appointment is marked complete.' },
    };
    const msg = FCM_MESSAGES[appt.status];
    if (msg && otherUser?.fcmToken) {
      sendPush(otherUser.fcmToken, msg.title, msg.body, { appointmentId: appt._id.toString() });
    }
  } catch (err) {
    next(err);
  }
});

// PATCH /api/appointments/:id/confirm — doctor confirms a pending appointment
router.patch('/:id/confirm', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const appt = await Appointment.findOne({ _id: req.params.id, doctorId: req.user.id });
    if (!appt) return res.status(404).json({ message: 'Not found' });
    if (appt.status !== 'pending') return res.status(409).json({ message: 'Can only confirm pending appointments' });

    appt.status = 'confirmed';
    await appt.save();

    await scheduleReminders(appt);

    const patientForEmail = await User.findById(appt.patientId).select('email name');
    const doctorUser      = await User.findById(req.user.id).select('name');
    const apptDate        = new Date(appt.date).toISOString().split('T')[0];
    await notifyUser(appt.patientId, 'appointment_confirmed', {
      appointmentId: appt._id,
      message: 'Your appointment has been confirmed.',
    }, patientForEmail?.email ? {
      to:      patientForEmail.email,
      subject: 'Appointment Confirmed — MediConnect',
      html:    appointmentConfirmedEmail(
        patientForEmail.name || 'Patient',
        `Dr. ${doctorUser?.name || 'Your doctor'}`,
        apptDate,
        appt.timeSlot?.start || '',
      ),
    } : undefined);

    res.json(appt);
  } catch (err) { next(err); }
});

// PATCH /api/appointments/:id/validate — doctor validates, compiles shared notes, notifies patient
router.patch('/:id/validate', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, doctorId: req.user.id, status: { $ne: 'validated' } },
      { status: 'validated' },
      { new: true }
    );
    if (!appt) return res.status(404).json({ message: 'Not found or already validated' });

    const ConsultationNote = require('../models/ConsultationNote');
    const sharedNotes = await ConsultationNote.find({ appointmentId: appt._id, visibility: 'shared' }).sort({ createdAt: 1 });
    const summary = sharedNotes.map(n => n.content);

    const patientForEmail2 = await User.findById(appt.patientId).select('email name');
    const doctorUser2      = await User.findById(req.user.id).select('name');
    const apptDate2        = new Date(appt.date).toISOString().split('T')[0];
    await notifyUser(appt.patientId, 'consultation_validated', {
      appointmentId: appt._id,
      message: 'Your consultation summary is ready.',
      summary,
    }, patientForEmail2?.email ? {
      to:      patientForEmail2.email,
      subject: 'Consultation Summary Ready — MediConnect',
      html:    consultationValidatedEmail(
        patientForEmail2.name || 'Patient',
        `Dr. ${doctorUser2?.name || 'Your doctor'}`,
        apptDate2,
      ),
    } : undefined);

    res.json({ appointment: appt, summary });
  } catch (err) { next(err); }
});

// PATCH /api/appointments/:id/cancel — patient or doctor cancels
router.patch('/:id/cancel', auth, async (req, res, next) => {
  try {
    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Not found' });

    const isParty =
      appt.patientId.toString() === req.user.id ||
      appt.doctorId.toString() === req.user.id;
    if (!isParty) return res.status(403).json({ message: 'Forbidden' });
    if (appt.status === 'validated') return res.status(409).json({ message: 'Cannot cancel a validated appointment' });

    await cancelReminders(appt);

    appt.status = 'cancelled';
    await appt.save();
    res.json(appt);
  } catch (err) { next(err); }
});

// PATCH /api/appointments/:id/reminders-opt-out — patient toggles per-appointment reminders
router.patch('/:id/reminders-opt-out', auth, requireRole('patient'), async (req, res, next) => {
  try {
    const { disabled } = req.body;
    if (typeof disabled !== 'boolean') {
      return res.status(400).json({ message: 'disabled must be a boolean' });
    }

    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Not found' });
    if (appt.patientId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (appt.status !== 'confirmed' || new Date(appt.date) <= new Date()) {
      return res.status(400).json({ message: 'Reminders can only be toggled for future confirmed appointments' });
    }

    appt.remindersDisabled = disabled;
    await appt.save();

    res.json({ remindersDisabled: appt.remindersDisabled });
  } catch (err) { next(err); }
});

// PATCH /api/appointments/:id/symptoms — patient submits symptoms (async analysis)
router.patch('/:id/symptoms', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ message: 'Patients only' });

    const { symptomText } = req.body;
    if (!symptomText || typeof symptomText !== 'string' || symptomText.trim().length === 0) {
      return res.status(400).json({ message: 'symptomText is required' });
    }
    if (symptomText.length > 1000) {
      return res.status(400).json({ message: 'symptomText must be 1000 characters or fewer' });
    }

    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (String(appt.patientId) !== req.user.id) {
      return res.status(403).json({ message: 'Not your appointment' });
    }
    if (['validated', 'cancelled'].includes(appt.status)) {
      return res.status(409).json({ message: 'Cannot update symptoms for a validated or cancelled appointment' });
    }

    appt.symptomText = symptomText.trim();
    appt.symptomAnalysis = { urgency: null, category: null, processedAt: null };
    await appt.save();

    await getSymptomQueue().add('analyse', { appointmentId: String(appt._id) }, {
      jobId: `symptom-${appt._id}`,
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    res.status(202).json({ message: 'Symptoms received' });
  } catch (err) { next(err); }
});

module.exports = router;

router.scheduleReminders = scheduleReminders;
router.cancelReminders   = cancelReminders;
router.notifyUser        = notifyUser;
