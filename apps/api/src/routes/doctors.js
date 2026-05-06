const router = require('express').Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const User = require('../models/User');
const Doctor = require('../models/Doctor');

// GET /api/doctors?lat=&lng=&radius=&specialty=
router.get('/', auth, async (req, res, next) => {
  try {
    const { lat, lng, radius = 10000, specialty, page = 1, limit = 20 } = req.query;

    let userQuery = { role: 'doctor' };

    if (lat && lng) {
      userQuery.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(radius),
        },
      };
    }

    const users = await User.find(userQuery).select('-password').limit(parseInt(limit)).skip((page - 1) * limit);
    const userIds = users.map(u => u._id);

    let doctorQuery = { userId: { $in: userIds } };
    if (specialty) doctorQuery.specialty = new RegExp(specialty, 'i');

    const doctors = await Doctor.find(doctorQuery).populate('userId', 'name email location');

    res.json(doctors);
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
