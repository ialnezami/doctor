const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const upload = require('../middleware/upload');
const { uploadBuffer } = require('../utils/cloudinary');

function generateSlots(startTime, endTime) {
  const slots = [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let cur = sh * 60 + sm;
  const endMin = eh * 60 + em;
  while (cur + 30 <= endMin) {
    slots.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`);
    cur += 30;
  }
  return slots;
}

const router = require('express').Router();

// GET /api/doctors?lat=&lng=&radius=&specialty=&name=
router.get('/', auth, async (req, res, next) => {
  try {
    const { lat, lng, radius = 10000, specialty, name, page = 1, limit = 20 } = req.query;

    let resolvedLat = lat ? parseFloat(lat) : null;
    let resolvedLng = lng ? parseFloat(lng) : null;

    // Fall back to patient's saved homeLocation
    if (!resolvedLat && req.user.role === 'patient') {
      const Patient = require('../models/Patient');
      const p = await Patient.findOne({ userId: req.user.id }).select('homeLocation');
      if (p?.homeLocation?.coordinates?.length === 2) {
        [resolvedLng, resolvedLat] = p.homeLocation.coordinates;
      }
    }

    let userQuery = { role: 'doctor' };
    if (name) userQuery.name = new RegExp(name, 'i');

    if (resolvedLat && resolvedLng) {
      userQuery.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [resolvedLng, resolvedLat] },
          $maxDistance: parseInt(radius),
        },
      };
    }

    const users = await User.find(userQuery).select('-password').limit(parseInt(limit)).skip((page - 1) * parseInt(limit));
    const userIds = users.map(u => u._id);

    let doctorQuery = { userId: { $in: userIds } };
    if (specialty) doctorQuery.specialty = new RegExp(specialty, 'i');

    const doctors = await Doctor.find(doctorQuery).populate('userId', 'name email location');
    res.json(doctors);
  } catch (err) { next(err); }
});

// GET /api/doctors/me — doctor fetches own full profile (must be before /:id)
router.get('/me', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id }).populate('userId', 'name email');
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });
    res.json(doctor);
  } catch (err) {
    next(err);
  }
});

// GET /api/doctors/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id).populate('userId', 'name email location');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json(doctor);
  } catch (err) {
    next(err);
  }
});

// GET /api/doctors/:id/available-slots?date=YYYY-MM-DD
router.get('/:id/available-slots', auth, async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(422).json({ message: 'date query param required (YYYY-MM-DD)' });

    const doctor = await Doctor.findById(req.params.id).select('availabilitySlots userId');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const d = new Date(date);
    const dayOfWeek = d.getUTCDay(); // 0=Sun

    const avail = doctor.availabilitySlots.find(s => s.dayOfWeek === dayOfWeek);
    if (!avail) return res.json([]); // doctor not available that day

    const allSlots = generateSlots(avail.startTime, avail.endTime);

    // Find already-booked start times for this doctor on this date
    const startOfDay = new Date(date + 'T00:00:00.000Z');
    const endOfDay   = new Date(date + 'T23:59:59.999Z');
    const booked = await Appointment.find({
      doctorId: doctor.userId,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['pending', 'confirmed'] },
    }).select('timeSlot');

    const bookedTimes = new Set(booked.map(a => a.timeSlot.start));

    const result = allSlots.map(time => ({ time, available: !bookedTimes.has(time) }));
    res.json(result);
  } catch (err) { next(err); }
});

// PUT /api/doctors/:id — doctor updates own profile
router.put('/:id', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Not found' });
    if (doctor.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    const { specialty, clinicAddress, bio, consultationFee, yearsOfExperience } = req.body;
    Object.assign(doctor, { specialty, clinicAddress, bio, consultationFee, yearsOfExperience });
    await doctor.save();
    res.json(doctor);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/doctors/:id/settings
router.patch('/:id/settings', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Not found' });
    if (doctor.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    const { autoAcceptAppointments, availabilitySlots } = req.body;
    if (autoAcceptAppointments !== undefined) doctor.autoAcceptAppointments = autoAcceptAppointments;
    if (availabilitySlots !== undefined) doctor.availabilitySlots = availabilitySlots;
    await doctor.save();
    res.json({ autoAcceptAppointments: doctor.autoAcceptAppointments, availabilitySlots: doctor.availabilitySlots });
  } catch (err) { next(err); }
});

// GET /api/doctors/:id/slots
router.get('/:id/slots', auth, async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id).select('availabilitySlots');
    if (!doctor) return res.status(404).json({ message: 'Not found' });
    res.json(doctor.availabilitySlots);
  } catch (err) {
    next(err);
  }
});

// POST /api/doctors/:id/slots — doctor sets availability
// PATCH /api/doctors/:id/photo — upload profile photo
router.patch('/:id/photo', auth, requireRole('doctor'), upload.single('photo'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Not found' });
    if (doctor.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
    if (!req.file) return res.status(422).json({ message: 'photo file required' });

    const photoUrl = await uploadBuffer(req.file.buffer, 'mediconnect/doctors');
    doctor.photoUrl = photoUrl;
    await doctor.save();
    res.json({ photoUrl });
  } catch (err) { next(err); }
});

router.post('/:id/slots', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Not found' });
    if (doctor.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    doctor.availabilitySlots = req.body.slots;
    await doctor.save();
    res.json(doctor.availabilitySlots);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
