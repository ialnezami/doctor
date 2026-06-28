const mongoose = require('mongoose');
const router   = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const adminAuth  = require('../middleware/adminAuth');
const User    = require('../models/User');
const Doctor  = require('../models/Doctor');
const Lab     = require('../models/Lab');
const Review  = require('../models/Review');
const Appointment = require('../models/Appointment');
const { recalculateRating } = require('./reviews');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// POST /api/admin/auth — validate secret (no adminAuth; this IS the login)
router.post('/auth', async (req, res) => {
  const { secret } = req.body;
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ message: 'Invalid admin secret' });
  }
  res.json({ ok: true });
});

// GET /api/admin/stats
router.get('/stats', adminAuth, async (req, res, next) => {
  try {
    const [totalUsers, doctors, patients, labs, appointments, flaggedReviews, pendingDoctors, pendingLabs] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'doctor' }),
      User.countDocuments({ role: 'patient' }),
      User.countDocuments({ role: 'laboratory' }),
      Appointment.countDocuments(),
      Review.countDocuments({ flagged: true }),
      Doctor.countDocuments({ isVerified: false }),
      Lab.countDocuments({ isApproved: false }),
    ]);
    res.json({ totalUsers, doctors, patients, labs, appointments, flaggedReviews, pendingDoctors, pendingLabs });
  } catch (err) { next(err); }
});

// GET /api/admin/users?search=&role=&page=1&limit=20
router.get('/users', adminAuth, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
], validate, async (req, res, next) => {
  try {
    const page  = req.query.page  || 1;
    const limit = req.query.limit || 20;
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.role)   filter.role = req.query.role;
    if (req.query.search) {
      const re = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { email: re }];
    }

    const [users, total] = await Promise.all([
      User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id/suspend — toggle isSuspended
router.patch('/users/:id/suspend', adminAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user id' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isSuspended = !user.isSuspended;
    await user.save();
    res.json({ isSuspended: user.isSuspended });
  } catch (err) { next(err); }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', adminAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user id' });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

// GET /api/admin/doctors/pending — unverified doctors
router.get('/doctors/pending', adminAuth, async (req, res, next) => {
  try {
    const doctors = await Doctor.find({ isVerified: false })
      .populate('userId', 'name email createdAt')
      .sort({ createdAt: 1 });
    res.json({ doctors });
  } catch (err) { next(err); }
});

// GET /api/admin/doctors — all doctors
router.get('/doctors', adminAuth, async (req, res, next) => {
  try {
    const doctors = await Doctor.find()
      .populate('userId', 'name email isSuspended createdAt')
      .sort({ createdAt: -1 });
    res.json({ doctors });
  } catch (err) { next(err); }
});

// PATCH /api/admin/doctors/:id/verify
router.patch('/doctors/:id/verify', adminAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid doctor id' });
    const doc = await Doctor.findByIdAndUpdate(req.params.id, { isVerified: true }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Doctor not found' });
    res.json(doc);
  } catch (err) { next(err); }
});

// PATCH /api/admin/doctors/:id/unverify
router.patch('/doctors/:id/unverify', adminAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid doctor id' });
    const doc = await Doctor.findByIdAndUpdate(req.params.id, { isVerified: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Doctor not found' });
    res.json(doc);
  } catch (err) { next(err); }
});

// GET /api/admin/labs — pending labs
router.get('/labs', adminAuth, async (req, res, next) => {
  try {
    const labs = await Lab.find({ isApproved: false }).populate('userId', 'name email createdAt');
    res.json(labs);
  } catch (err) { next(err); }
});

// PATCH /api/admin/labs/:id/approve
router.patch('/labs/:id/approve', adminAuth, async (req, res, next) => {
  try {
    const lab = await Lab.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
    if (!lab) return res.status(404).json({ message: 'Lab not found' });
    res.json(lab);
  } catch (err) { next(err); }
});

// GET /api/admin/reviews/flagged
router.get('/reviews/flagged', adminAuth, async (req, res, next) => {
  try {
    const reviews = await Review.find({ flagged: true })
      .populate('patientId', 'name')
      .populate('doctorId', 'userId')
      .sort({ createdAt: -1 });
    res.json({ reviews });
  } catch (err) { next(err); }
});

// DELETE /api/admin/reviews/:id — delete a flagged review
router.delete('/reviews/:id', adminAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid review id' });
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    if (!review.flagged) return res.status(409).json({ message: 'Review must be flagged before deletion' });
    const doctorId = review.doctorId;
    await review.deleteOne();
    recalculateRating(doctorId).catch(err => console.error('[admin] recalculate failed:', err.message));
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
