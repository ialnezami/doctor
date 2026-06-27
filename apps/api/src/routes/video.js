const router     = require('express').Router({ mergeParams: true });
const mongoose   = require('mongoose');
const auth       = require('../middleware/auth');
const Appointment = require('../models/Appointment');

const DAILY_API = 'https://api.daily.co/v1';

async function dailyFetch(path, options = {}) {
  const res = await fetch(`${DAILY_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Daily.co ${res.status}`), { dailyStatus: res.status });
  return data;
}

function computeRoomExp(appointmentDate) {
  const d = new Date(appointmentDate);
  d.setHours(23, 59, 59, 999);
  return Math.floor(d.getTime() / 1000);
}

function computeTokenExp(appointmentDate, timeSlotEnd) {
  const [hours, minutes] = timeSlotEnd.split(':').map(Number);
  const endDate = new Date(appointmentDate);
  endDate.setHours(hours, minutes, 0, 0);
  const endMs = endDate.getTime() + 90 * 60 * 1000;
  const capMs = Date.now()        + 4  * 60 * 60 * 1000;
  return Math.floor(Math.min(endMs, capMs) / 1000);
}

/* POST /api/appointments/:id/video/token */
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
      const roomName = `appt-${appt._id}`;
      await dailyFetch('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: roomName,
          privacy: 'private',
          properties: {
            exp: computeRoomExp(appt.date),
            enable_recording: false,
          },
        }),
      });
      appt.videoRoomName = roomName;
      await appt.save();
    }

    const tokenExp = computeTokenExp(appt.date, appt.timeSlot.end);
    const { token } = await dailyFetch('/meeting-tokens', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          room_name: appt.videoRoomName,
          is_owner:  isDoctor,
          exp:       tokenExp,
        },
      }),
    });

    const roomUrl = `https://${process.env.DAILY_DOMAIN}/${appt.videoRoomName}`;
    res.json({ roomUrl, token });
  } catch (err) {
    console.error('[video] token error:', err);
    res.status(500).json({ message: 'Could not start video session' });
  }
});

module.exports = router;
