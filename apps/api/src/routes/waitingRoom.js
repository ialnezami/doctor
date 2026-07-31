'use strict';

const router     = require('express').Router();
const auth       = require('../middleware/auth');
const { requireDoctorOrSecretary } = require('../middleware/secretaryAuth');
const Appointment = require('../models/Appointment');
const Doctor      = require('../models/Doctor');

const guard = [auth, requireDoctorOrSecretary];

// GET /api/waiting-room — today's checked-in patients, ordered by check-in time
router.get('/', guard, async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.doctorUserId }).select('_id');
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const appointments = await Appointment.find({
      doctorId:    doctor._id,
      date:        { $gte: todayStart, $lte: todayEnd },
      checkedInAt: { $ne: null },
    })
      .sort({ checkedInAt: 1 })
      .populate('patientId', 'name')
      .lean();

    const queue = appointments.map(a => ({
      _id:             a._id,
      patientName:     a.patientId?.name || 'مجهول',
      appointmentTime: a.timeSlot?.start,
      visitType:       a.visitType,
      checkedInAt:     a.checkedInAt,
      status:          a.status,
    }));

    res.json({ queue });
  } catch (err) { next(err); }
});

// PATCH /api/waiting-room/:id/call — mark patient as called (in_progress)
router.patch('/:id/call', guard, async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.doctorUserId }).select('_id');
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, doctorId: doctor._id },
      { status: 'in_progress' },
      { new: true }
    ).populate('patientId', 'name');

    if (!appt) return res.status(404).json({ message: 'لم يتم العثور على الموعد' });

    res.json({
      appointment: {
        _id:         appt._id,
        status:      appt.status,
        patientName: appt.patientId?.name,
        timeSlot:    appt.timeSlot,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
