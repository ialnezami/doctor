const router      = require('express').Router();
const { body, validationResult } = require('express-validator');
const mongoose    = require('mongoose');
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Review      = require('../models/Review');
const Doctor      = require('../models/Doctor');
const Appointment = require('../models/Appointment');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

async function recalculateRating(doctorId) {
  const result = await Review.aggregate([
    { $match: { doctorId: new mongoose.Types.ObjectId(String(doctorId)) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = result[0] || {};
  await Doctor.findOneAndUpdate(
    { userId: doctorId },
    { averageRating: Math.round(avg * 10) / 10, reviewCount: count }
  );
}

// POST /api/reviews — patient submits a review
router.post('/', auth, requireRole('patient'), [
  body('appointmentId').notEmpty().withMessage('appointmentId required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be 1–5'),
  body('comment').optional().isLength({ max: 1000 }).escape(),
], validate, async (req, res, next) => {
  try {
    const { appointmentId, rating, comment } = req.body;

    if (!mongoose.isValidObjectId(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointmentId' });
    }

    const appt = await Appointment.findById(appointmentId);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (appt.status !== 'validated') {
      return res.status(409).json({ message: 'Appointment must be validated before reviewing' });
    }
    if (String(appt.patientId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Not your appointment' });
    }

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(appt.updatedAt).getTime() > sevenDaysMs) {
      return res.status(409).json({ message: 'Review window has closed' });
    }

    const review = await Review.create({
      appointmentId: appt._id,
      patientId:     req.user.id,
      doctorId:      appt.doctorId,
      rating,
      comment:       comment || '',
    });

    recalculateRating(appt.doctorId).catch(err =>
      console.error('[reviews] recalculate failed after create:', err.message)
    );

    res.status(201).json({ review });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You already reviewed this appointment' });
    }
    next(err);
  }
});

// PATCH /api/reviews/:id/flag — doctor flags a review on their own profile
router.patch('/:id/flag', auth, requireRole('doctor'), [
  body('flagReason').optional().isLength({ max: 500 }).escape(),
], validate, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid review id' });
    }
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    if (String(review.doctorId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Not your review to flag' });
    }
    review.flagged    = true;
    review.flagReason = req.body.flagReason || '';
    await review.save();
    res.json({ review });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.recalculateRating = recalculateRating;
