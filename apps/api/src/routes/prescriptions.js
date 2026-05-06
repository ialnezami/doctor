const router = require('express').Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Prescription = require('../models/Prescription');

// POST /api/prescriptions — doctor creates
router.post('/', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const { patientId, appointmentId, medications, instructions, validUntil } = req.body;
    const rx = await Prescription.create({
      doctorId: req.user.id,
      patientId,
      appointmentId,
      medications,
      instructions,
      validUntil: validUntil ? new Date(validUntil) : undefined,
    });
    res.status(201).json(rx);
  } catch (err) {
    next(err);
  }
});

// GET /api/prescriptions — list for current user
router.get('/', auth, async (req, res, next) => {
  try {
    const filter = req.user.role === 'doctor'
      ? { doctorId: req.user.id }
      : { patientId: req.user.id };

    const rxList = await Prescription.find(filter)
      .populate('doctorId', 'name')
      .populate('patientId', 'name')
      .sort({ createdAt: -1 });

    res.json(rxList);
  } catch (err) {
    next(err);
  }
});

// GET /api/prescriptions/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const rx = await Prescription.findById(req.params.id)
      .populate('doctorId', 'name')
      .populate('patientId', 'name');

    if (!rx) return res.status(404).json({ message: 'Not found' });

    const isOwner = [rx.doctorId._id.toString(), rx.patientId._id.toString()].includes(req.user.id);
    if (!isOwner) return res.status(403).json({ message: 'Forbidden' });

    res.json(rx);
  } catch (err) {
    next(err);
  }
});

// GET /api/prescriptions/:id/pdf — returns prescription data for PDF generation
router.get('/:id/pdf', auth, async (req, res, next) => {
  try {
    const rx = await Prescription.findById(req.params.id)
      .populate('doctorId', 'name')
      .populate('patientId', 'name');

    if (!rx) return res.status(404).json({ message: 'Not found' });

    const isOwner = [rx.doctorId._id.toString(), rx.patientId._id.toString()].includes(req.user.id);
    if (!isOwner) return res.status(403).json({ message: 'Forbidden' });

    // Return structured data — PDF rendering handled by frontend
    res.json({
      id: rx._id,
      doctor: rx.doctorId.name,
      patient: rx.patientId.name,
      medications: rx.medications,
      instructions: rx.instructions,
      validUntil: rx.validUntil,
      issuedAt: rx.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
