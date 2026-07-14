const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const { PlatformSettings, SUPPORTED_CURRENCIES } = require('../models/PlatformSettings');
const Appointment = require('../models/Appointment');
const Review = require('../models/Review');
const upload = require('../middleware/upload');
const { uploadBuffer } = require('../utils/cloudinary');
const { IANAZone } = require('luxon');

const PAGE_SIZE = 20;

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

// GET /api/doctors/currencies — available currencies on this platform (for doctor picker)
router.get('/currencies', async (req, res, next) => {
  try {
    const settings = await PlatformSettings.getOrCreate();
    const available = SUPPORTED_CURRENCIES.filter(c => settings.availableCurrencies.includes(c.code));
    res.json({ currencies: available });
  } catch (err) { next(err); }
});

// GET /api/doctors?lat=&lng=&radius=&specialty=&name=
router.get('/', auth, async (req, res, next) => {
  try {
    const { lat, lng, radius = 10000, specialty, name, city, page = 1, limit = 20 } = req.query;

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
    if (city && city.trim()) {
      const escapedCity = city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      doctorQuery.$or = [
        { clinicAddress: new RegExp(escapedCity, 'i') },
        { 'locations.address': new RegExp(escapedCity, 'i') },
      ];
    }

    const doctors = await Doctor.find(doctorQuery).populate('userId', 'name email location');
    res.json(doctors);
  } catch (err) { next(err); }
});

// GET /api/doctors/public/:id — no auth, for shareable doctor profile page
router.get('/public/:id', async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id)
      .populate('userId', 'name email')
      .select('-availabilitySlots -autoAcceptAppointments -timezone');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json(doctor);
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

// POST /api/doctors/me/locations — add a location
router.post('/me/locations', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const { name, address, coordinates, type, contactNote, slots } = req.body;
    if (!name || !type) return res.status(400).json({ message: 'name and type are required' });
    if (!['bookable', 'hospital'].includes(type))
      return res.status(400).json({ message: 'type must be bookable or hospital' });

    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    doctor.locations.push({
      name,
      address:     address || '',
      coordinates: coordinates || { type: 'Point', coordinates: [0, 0] },
      type,
      contactNote: contactNote || '',
      slots:       type === 'bookable' ? (slots || []) : [],
    });
    await doctor.save();
    res.status(201).json(doctor.locations[doctor.locations.length - 1]);
  } catch (err) { next(err); }
});

// PATCH /api/doctors/me/locations/:locId — edit a location
router.patch('/me/locations/:locId', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const loc = doctor.locations.id(req.params.locId);
    if (!loc) return res.status(404).json({ message: 'Location not found' });

    const { name, address, coordinates, type, contactNote, slots } = req.body;
    if (name        !== undefined) loc.name = name;
    if (address     !== undefined) loc.address = address;
    if (coordinates !== undefined) loc.coordinates = coordinates;
    if (type !== undefined) {
      if (!['bookable', 'hospital'].includes(type))
        return res.status(400).json({ message: 'type must be bookable or hospital' });
      loc.type = type;
    }
    if (contactNote !== undefined) loc.contactNote = contactNote;
    if (slots       !== undefined) loc.slots = loc.type === 'bookable' ? slots : [];

    await doctor.save();
    res.json(loc);
  } catch (err) { next(err); }
});

// DELETE /api/doctors/me/locations/:locId — remove a location (guards future appointments)
router.delete('/me/locations/:locId', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const loc = doctor.locations.id(req.params.locId);
    if (!loc) return res.status(404).json({ message: 'Location not found' });

    const future = await Appointment.findOne({
      locationId: loc._id,
      date:       { $gte: new Date() },
      status:     { $nin: ['cancelled', 'completed'] },
    });
    if (future) return res.status(400).json({ message: 'Cannot delete location with upcoming appointments. Cancel them first.' });

    loc.deleteOne();
    await doctor.save();
    res.json({ message: 'Location removed' });
  } catch (err) { next(err); }
});

// GET /api/doctors/:id/locations — public, no auth
router.get('/:id/locations', async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id).select('locations');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json(doctor.locations);
  } catch (err) { next(err); }
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

    const avail = (doctor.availabilitySlots ?? []).find(s => s.dayOfWeek === dayOfWeek);
    if (!avail) return res.json([]);

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


// GET /api/doctors/:id/reviews — public, paginated
// :id is the Doctor document _id; reviews store doctorId as User._id
router.get('/:id/reviews', async (req, res, next) => {
  try {
    const mongoose = require('mongoose');
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid doctor id' });
    }
    const doctor = await Doctor.findById(req.params.id).select('userId averageRating reviewCount');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const skip  = (page - 1) * PAGE_SIZE;
    const total = await Review.countDocuments({ doctorId: doctor.userId });
    const reviews = await Review.find({ doctorId: doctor.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .populate('patientId', 'name');

    res.json({
      reviews,
      averageRating: doctor.averageRating,
      reviewCount:   doctor.reviewCount,
      page,
      totalPages:    Math.ceil(total / PAGE_SIZE) || 1,
    });
  } catch (err) { next(err); }
});

// PUT /api/doctors/:id — doctor updates own profile
router.put('/:id', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Not found' });
    if (doctor.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    const { specialty, clinicAddress, bio, consultationFee, yearsOfExperience,
            licenseNumber, languages, education, achievements } = req.body;
    Object.assign(doctor, { specialty, clinicAddress, bio, consultationFee, yearsOfExperience,
      ...(licenseNumber  !== undefined && { licenseNumber }),
      ...(languages      !== undefined && { languages }),
      ...(education      !== undefined && { education }),
      ...(achievements   !== undefined && { achievements }),
    });
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

    const {
      autoAcceptAppointments, availabilitySlots, timezone, consultationFee, appointmentTypes,
      bio, licenseNumber, languages, education, achievements, yearsOfExperience, currency,
    } = req.body;

    if (timezone !== undefined) {
      if (!IANAZone.isValidZone(timezone)) {
        return res.status(400).json({ message: 'Invalid timezone. Use a valid IANA timezone string (e.g. "Asia/Riyadh").' });
      }
    }

    if (consultationFee !== undefined) {
      const fee = Number(consultationFee);
      if (isNaN(fee) || fee < 0) return res.status(400).json({ message: 'consultationFee must be a non-negative number.' });
      doctor.consultationFee = fee;
    }

    if (currency !== undefined) {
      const settings = await PlatformSettings.getOrCreate();
      if (!settings.availableCurrencies.includes(currency)) {
        return res.status(400).json({ message: `Currency '${currency}' is not available on this platform.` });
      }
      doctor.currency = currency;
    }

    if (yearsOfExperience !== undefined) {
      const yoe = Number(yearsOfExperience);
      if (isNaN(yoe) || yoe < 0) return res.status(400).json({ message: 'yearsOfExperience must be a non-negative number.' });
      doctor.yearsOfExperience = yoe;
    }

    if (autoAcceptAppointments !== undefined) doctor.autoAcceptAppointments = autoAcceptAppointments;
    if (availabilitySlots !== undefined) doctor.availabilitySlots = availabilitySlots;
    if (timezone !== undefined && IANAZone.isValidZone(timezone)) doctor.timezone = timezone;
    if (appointmentTypes !== undefined) doctor.appointmentTypes = appointmentTypes;
    if (bio !== undefined) doctor.bio = bio.trim();
    if (licenseNumber !== undefined) doctor.licenseNumber = licenseNumber.trim();
    if (Array.isArray(languages)) doctor.languages = languages.filter(l => typeof l === 'string' && l.trim()).map(l => l.trim());
    if (Array.isArray(achievements)) doctor.achievements = achievements.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim());
    if (Array.isArray(education)) doctor.education = education.map(e => ({
      degree:      (e.degree || '').trim(),
      institution: (e.institution || '').trim(),
      year:        e.year ? Number(e.year) : null,
    }));

    await doctor.save();
    res.json({
      autoAcceptAppointments: doctor.autoAcceptAppointments,
      availabilitySlots: doctor.availabilitySlots,
      timezone: doctor.timezone,
      consultationFee: doctor.consultationFee,
      currency: doctor.currency,
      appointmentTypes: doctor.appointmentTypes,
      bio: doctor.bio,
      licenseNumber: doctor.licenseNumber,
      languages: doctor.languages,
      education: doctor.education,
      achievements: doctor.achievements,
      yearsOfExperience: doctor.yearsOfExperience,
    });
  } catch (err) { next(err); }
});

// GET /api/doctors/:id/slots?locationId=&date=
router.get('/:id/slots', auth, async (req, res, next) => {
  try {
    const { locationId, date } = req.query;
    if (!locationId) return res.status(400).json({ message: 'locationId is required' });
    if (!date)       return res.status(400).json({ message: 'date is required' });

    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const loc = doctor.locations.id(locationId);
    if (!loc) return res.status(404).json({ message: 'Location not found' });
    if (loc.type !== 'bookable')
      return res.status(400).json({ message: 'This location does not accept online bookings' });

    const d = new Date(date);
    const dayOfWeek = d.getUTCDay();
    const avail = loc.slots.find(s => s.dayOfWeek === dayOfWeek);
    if (!avail) return res.json([]);

    const allSlots = generateSlots(avail.startTime, avail.endTime);

    const startOfDay = new Date(date + 'T00:00:00.000Z');
    const endOfDay   = new Date(date + 'T23:59:59.999Z');

    const booked = await Appointment.find({
      doctorId:   doctor.userId,
      locationId: loc._id,
      date:       { $gte: startOfDay, $lte: endOfDay },
      status:     { $nin: ['cancelled'] },
    }).select('timeSlot');

    const bookedTimes = new Set(booked.map(a => a.timeSlot.start));
    res.json(allSlots.filter(s => !bookedTimes.has(s)));
  } catch (err) { next(err); }
});

// POST /api/doctors/:id/slots — doctor sets availability
// PATCH /api/doctors/:id/photo — upload profile photo
router.patch('/:id/photo', auth, requireRole('doctor'), upload.single('photo'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Not found' });
    if (doctor.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
    if (!req.file) return res.status(422).json({ message: 'photo file required' });

    const uploadResult = await uploadBuffer(req.file.buffer, 'mediconnect/doctors');
    const photoUrl = uploadResult.secure_url;
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
