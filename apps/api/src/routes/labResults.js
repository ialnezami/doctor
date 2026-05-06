const router = require('express').Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const LabResult = require('../models/LabResult');

// L-02: create lab result (doctor only)
router.post('/', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const { patientId, appointmentId, labName, tests, reportFile, status, issuedAt } = req.body;
    const result = await LabResult.create({
      patientId,
      doctorId: req.user.id,
      appointmentId: appointmentId || null,
      labName,
      tests: tests || [],
      reportFile: reportFile || null,
      status: status || 'pending',
      issuedAt: issuedAt || Date.now(),
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// L-06: search (must be before /:id)
router.get('/search', auth, async (req, res, next) => {
  try {
    const { q, patientId, from, to } = req.query;
    const filter = {};

    if (req.user.role === 'patient') {
      filter.patientId = req.user.id;
    } else if (req.user.role === 'doctor') {
      if (patientId) filter.patientId = patientId;
      else filter.doctorId = req.user.id;
    }

    if (q) filter.$text = { $search: q };
    if (from || to) {
      filter.issuedAt = {};
      if (from) filter.issuedAt.$gte = new Date(from);
      if (to)   filter.issuedAt.$lte = new Date(to);
    }

    const results = await LabResult.find(filter)
      .sort({ score: q ? { $meta: 'textScore' } : undefined, issuedAt: -1 })
      .limit(50)
      .populate('patientId', 'name email')
      .populate('doctorId', 'name email');
    res.json(results);
  } catch (err) { next(err); }
});

// L-03: list
router.get('/', auth, async (req, res, next) => {
  try {
    const filter = req.user.role === 'patient'
      ? { patientId: req.user.id }
      : { doctorId: req.user.id };

    const results = await LabResult.find(filter)
      .sort({ issuedAt: -1 })
      .populate('patientId', 'name email')
      .populate('doctorId', 'name email');
    res.json(results);
  } catch (err) { next(err); }
});

// L-04: detail
router.get('/:id', auth, async (req, res, next) => {
  try {
    const result = await LabResult.findById(req.params.id)
      .populate('patientId', 'name email')
      .populate('doctorId', 'name email');
    if (!result) return res.status(404).json({ message: 'Not found' });

    const uid = req.user.id.toString();
    const isOwner = result.patientId._id.toString() === uid || result.doctorId._id.toString() === uid;
    if (!isOwner) return res.status(403).json({ message: 'Forbidden' });

    res.json(result);
  } catch (err) { next(err); }
});

// L-05: doctor adds interpretation notes
router.patch('/:id/notes', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const result = await LabResult.findById(req.params.id);
    if (!result) return res.status(404).json({ message: 'Not found' });
    if (result.doctorId.toString() !== req.user.id)
      return res.status(403).json({ message: 'Forbidden' });

    result.notes = req.body.notes ?? result.notes;
    result.status = 'ready';
    await result.save();
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
