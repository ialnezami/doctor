const router = require('express').Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Patient = require('../models/Patient');

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
