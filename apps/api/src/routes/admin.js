const mongoose = require('mongoose');
const router   = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const adminAuth  = require('../middleware/adminAuth');
const User    = require('../models/User');
const Doctor  = require('../models/Doctor');
const Patient = require('../models/Patient');
const Lab      = require('../models/Lab');
const Pharmacy = require('../models/Pharmacy');
const Review  = require('../models/Review');
const Appointment = require('../models/Appointment');
const { recalculateRating } = require('./reviews');
const Report = require('../models/Report');
const { PlatformSettings, SUPPORTED_CURRENCIES, SUPPORTED_CODES, SUPPORTED_LANGUAGES } = require('../models/PlatformSettings');

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
    const [totalUsers, doctors, patients, labs, pharmacies, appointments, flaggedReviews, pendingDoctors, pendingLabs, pendingPharmacies] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'doctor' }),
      User.countDocuments({ role: 'patient' }),
      User.countDocuments({ role: 'laboratory' }),
      User.countDocuments({ role: 'pharmacy' }),
      Appointment.countDocuments(),
      Review.countDocuments({ flagged: true }),
      Doctor.countDocuments({ isVerified: false }),
      Lab.countDocuments({ isApproved: false }),
      Pharmacy.countDocuments({ isApproved: false }),
    ]);
    res.json({ totalUsers, doctors, patients, labs, pharmacies, appointments, flaggedReviews, pendingDoctors, pendingLabs, pendingPharmacies });
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

// GET /api/admin/labs — all labs
router.get('/labs', adminAuth, async (req, res, next) => {
  try {
    const labs = await Lab.find().populate('userId', 'name email createdAt isSuspended').sort({ createdAt: -1 });
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

// PATCH /api/admin/labs/:id/unapprove
router.patch('/labs/:id/unapprove', adminAuth, async (req, res, next) => {
  try {
    const lab = await Lab.findByIdAndUpdate(req.params.id, { isApproved: false }, { new: true });
    if (!lab) return res.status(404).json({ message: 'Lab not found' });
    res.json(lab);
  } catch (err) { next(err); }
});

// GET /api/admin/pharmacies — all pharmacies
router.get('/pharmacies', adminAuth, async (req, res, next) => {
  try {
    const pharmacies = await Pharmacy.find().populate('userId', 'name email createdAt isSuspended').sort({ createdAt: -1 });
    res.json(pharmacies);
  } catch (err) { next(err); }
});

// PATCH /api/admin/pharmacies/:id/approve
router.patch('/pharmacies/:id/approve', adminAuth, async (req, res, next) => {
  try {
    const pharmacy = await Pharmacy.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
    if (!pharmacy) return res.status(404).json({ message: 'Pharmacy not found' });
    res.json(pharmacy);
  } catch (err) { next(err); }
});

// PATCH /api/admin/pharmacies/:id/unapprove
router.patch('/pharmacies/:id/unapprove', adminAuth, async (req, res, next) => {
  try {
    const pharmacy = await Pharmacy.findByIdAndUpdate(req.params.id, { isApproved: false }, { new: true });
    if (!pharmacy) return res.status(404).json({ message: 'Pharmacy not found' });
    res.json(pharmacy);
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

// GET /api/admin/reports?status=pending|resolved|dismissed
router.get('/reports', adminAuth, async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const reports = await Report.find(filter)
      .populate('reporterId', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);
    const pending = await Report.countDocuments({ status: 'pending' });
    res.json({ reports, pending });
  } catch (err) { next(err); }
});

// PATCH /api/admin/reports/:id/resolve
router.patch('/reports/:id/resolve', adminAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid report id' });
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status: 'resolved', adminNote: req.body.note || '', resolvedAt: new Date() },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json(report);
  } catch (err) { next(err); }
});

// PATCH /api/admin/reports/:id/dismiss
router.patch('/reports/:id/dismiss', adminAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid report id' });
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status: 'dismissed', adminNote: req.body.note || '', resolvedAt: new Date() },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json(report);
  } catch (err) { next(err); }
});

// GET /api/admin/platform-settings/public — no auth, returns only public-facing defaults
router.get('/platform-settings/public', async (req, res, next) => {
  try {
    const settings = await PlatformSettings.getOrCreate();
    res.json({ defaultLanguage: settings.defaultLanguage });
  } catch (err) { next(err); }
});

// GET /api/admin/platform-settings
router.get('/platform-settings', adminAuth, async (req, res, next) => {
  try {
    const settings = await PlatformSettings.getOrCreate();
    res.json({
      availableCurrencies: settings.availableCurrencies,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      defaultLanguage: settings.defaultLanguage,
      supportedLanguages: SUPPORTED_LANGUAGES,
    });
  } catch (err) { next(err); }
});

// PATCH /api/admin/platform-settings
router.patch('/platform-settings', adminAuth, [
  body('availableCurrencies').optional().isArray({ min: 1 }).withMessage('At least one currency is required'),
  body('availableCurrencies.*').optional().isIn(SUPPORTED_CODES).withMessage('Unsupported currency code'),
  body('defaultLanguage').optional().isIn(SUPPORTED_LANGUAGES).withMessage('Unsupported language code'),
], validate, async (req, res, next) => {
  try {
    const { availableCurrencies, defaultLanguage } = req.body;
    if (!availableCurrencies && !defaultLanguage) {
      return res.status(400).json({ message: 'Nothing to update' });
    }
    const settings = await PlatformSettings.findOne();
    const update = {};
    if (availableCurrencies) update.availableCurrencies = availableCurrencies;
    if (defaultLanguage)     update.defaultLanguage     = defaultLanguage;

    if (settings) {
      Object.assign(settings, update);
      await settings.save();
      res.json({ availableCurrencies: settings.availableCurrencies, defaultLanguage: settings.defaultLanguage });
    } else {
      const created = await PlatformSettings.create(update);
      res.json({ availableCurrencies: created.availableCurrencies, defaultLanguage: created.defaultLanguage });
    }
  } catch (err) { next(err); }
});

// GET /api/admin/map/users?role= — pins for admin Leaflet map
router.get('/map/users', adminAuth, async (req, res, next) => {
  try {
    const { role } = req.query;
    const roleFilter = role ? { role } : { role: { $in: ['doctor', 'patient'] } };

    const users = await User.find(roleFilter).select('name role location').lean();
    const uids  = users.map(u => u._id);

    const [doctors, patients] = await Promise.all([
      Doctor.find({ userId: { $in: uids } }).select('userId locations clinicAddress').lean(),
      Patient.find({ userId: { $in: uids } }).select('userId homeLocation city').lean(),
    ]);

    const doctorMap  = Object.fromEntries(doctors.map(d => [d.userId.toString(), d]));
    const patientMap = Object.fromEntries(patients.map(p => [p.userId.toString(), p]));

    const pins = [];
    for (const user of users) {
      const uid = user._id.toString();
      let coordinates = null;
      let address     = '';

      if (user.role === 'doctor') {
        const doc      = doctorMap[uid];
        const bookable = doc?.locations?.find(
          l => l.type === 'bookable' && l.coordinates?.coordinates?.some(c => c !== 0)
        );
        if (bookable) {
          coordinates = bookable.coordinates.coordinates;
          address     = bookable.address || bookable.name;
        } else if (user.location?.coordinates?.some(c => c !== 0)) {
          coordinates = user.location.coordinates;
          address     = doc?.clinicAddress || '';
        }
      } else if (user.role === 'patient') {
        const pat = patientMap[uid];
        if (pat?.homeLocation?.coordinates?.some(c => c !== 0)) {
          coordinates = pat.homeLocation.coordinates;
          address     = pat.city || '';
        }
      }

      if (coordinates) {
        pins.push({ _id: user._id, name: user.name, role: user.role, coordinates, address });
      }
    }

    res.json(pins);
  } catch (err) { next(err); }
});

module.exports = router;
