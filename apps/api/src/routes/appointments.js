const router = require('express').Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const { sendPush } = require('../utils/fcm');

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

// PATCH /api/appointments/:id/status
// Doctor: confirmed, cancelled, completed
// Patient: cancelled only
router.patch('/:id/status', auth, async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Not found' });

    const isDoctor = req.user.role === 'doctor' && appt.doctorId.toString() === req.user.id;
    const isPatient = req.user.role === 'patient' && appt.patientId.toString() === req.user.id;

    if (!isDoctor && !isPatient) return res.status(403).json({ message: 'Forbidden' });
    if (isPatient && status !== 'cancelled') return res.status(403).json({ message: 'Patients can only cancel' });

    appt.status = status;
    if (notes) appt.notes = notes;
    await appt.save();
    res.json(appt);

    // Fire-and-forget FCM notification to the other party
    const notifyUserId = req.user.role === 'doctor' ? appt.patientId : appt.doctorId;
    const notifyUser = await User.findById(notifyUserId).select('fcmToken');
    const FCM_MESSAGES = {
      confirmed: { title: 'Appointment Confirmed ✅', body: 'Your appointment has been confirmed.' },
      rejected:  { title: 'Appointment Rejected',    body: 'Your appointment request was not accepted.' },
      cancelled: { title: 'Appointment Cancelled',   body: 'An appointment has been cancelled.' },
      completed: { title: 'Appointment Completed',   body: 'Your appointment is marked complete.' },
    };
    const msg = FCM_MESSAGES[appt.status];
    if (msg && notifyUser?.fcmToken) {
      sendPush(notifyUser.fcmToken, msg.title, msg.body, { appointmentId: appt._id.toString() });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
