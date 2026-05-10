const router = require('express').Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Patient = require('../models/Patient');
const { body, validationResult } = require('express-validator');
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};
const BLOOD_TYPES = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

// GET /api/patients/me
router.get('/me', auth, requireRole('patient'), async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ userId: req.user.id });
    if (!patient) return res.status(404).json({ message: 'Profile not found' });
    res.json(patient);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/patients/me/location
router.patch('/me/location', auth, requireRole('patient'), async (req, res, next) => {
  try {
    const { city, lat, lng } = req.body;
    if (!city) return res.status(422).json({ message: 'city is required' });
    const update = { city };
    if (lat != null && lng != null) {
      update.homeLocation = { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] };
    }
    const patient = await Patient.findOneAndUpdate(
      { userId: req.user.id },
      { $set: update },
      { new: true }
    );
    res.json(patient);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/patients/me/profile — update medical profile fields
router.patch('/me/profile', auth, requireRole('patient'), [
  body('bloodType').optional().isIn(BLOOD_TYPES).withMessage('invalid bloodType'),
  body('dateOfBirth').optional().isISO8601().withMessage('dateOfBirth must be ISO8601'),
  body('allergies').optional().isArray().withMessage('allergies must be an array'),
  body('allergies.*').optional().isString().trim(),
  body('conditions').optional().isArray().withMessage('conditions must be an array'),
  body('conditions.*').optional().isString().trim(),
], validate, async (req, res, next) => {
  try {
    const { bloodType, dateOfBirth, allergies, conditions } = req.body;
    const update = {};
    if (bloodType !== undefined)   update.bloodType   = bloodType;
    if (dateOfBirth !== undefined) update.dateOfBirth = new Date(dateOfBirth);
    if (allergies !== undefined)   update.allergies   = allergies;
    if (conditions !== undefined)  update.conditions  = conditions;

    const patient = await Patient.findOneAndUpdate(
      { userId: req.user.id },
      { $set: update },
      { new: true }
    );
    if (!patient) return res.status(404).json({ message: 'Profile not found' });
    res.json(patient);
  } catch (err) { next(err); }
});

// GET /api/patients/:id — doctor or own patient
router.get('/:id', auth, async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id).populate('userId', 'name email');
    if (!patient) return res.status(404).json({ message: 'Not found' });

    const isOwnRecord = patient.userId._id.toString() === req.user.id;
    if (req.user.role === 'patient' && !isOwnRecord) return res.status(403).json({ message: 'Forbidden' });

    res.json(patient);
  } catch (err) {
    next(err);
  }
});

// GET /api/patients/:id/notes
router.get('/:id/notes', auth, async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id).select('notes').populate('notes.doctorId', 'name');
    if (!patient) return res.status(404).json({ message: 'Not found' });
    res.json(patient.notes);
  } catch (err) {
    next(err);
  }
});

// POST /api/patients/:id/notes — doctors only
router.post('/:id/notes', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Not found' });

    patient.notes.push({ doctorId: req.user.id, content: req.body.content });
    await patient.save();
    res.status(201).json(patient.notes[patient.notes.length - 1]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
