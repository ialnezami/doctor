const router      = require('express').Router({ mergeParams: true });
const crypto      = require('crypto');
const mongoose    = require('mongoose');
const auth        = require('../middleware/auth');
const Appointment = require('../models/Appointment');

/* POST /api/appointments/:id/video/token
 * Returns a Jitsi room URL for the appointment.
 * Both participants call this endpoint; the room is created on first join (Jitsi is server-less).
 * The random suffix on the room name prevents guessing via MongoDB ObjectID.
 */
router.post('/:id/video/token', auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid appointment id' });
    }

    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });

    const uid       = req.user.id;
    const isDoctor  = String(appt.doctorId)  === uid;
    const isPatient = String(appt.patientId) === uid;
    if (!isDoctor && !isPatient) return res.status(403).json({ message: 'Forbidden' });

    if (!['confirmed', 'in_progress'].includes(appt.status)) {
      return res.status(403).json({ message: 'Video is only available for confirmed or in-progress appointments' });
    }

    if (!appt.videoRoomName) {
      const suffix = crypto.randomBytes(6).toString('hex');
      appt.videoRoomName = `appt-${appt._id}-${suffix}`;
      await appt.save();
    }

    const server  = process.env.JITSI_SERVER || 'meet.jit.si';
    const roomUrl = `https://${server}/${appt.videoRoomName}`;
    res.json({ roomUrl });
  } catch (err) {
    console.error('[video] room error:', err);
    res.status(500).json({ message: 'Could not start video session' });
  }
});

module.exports = router;
