const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Lab = require('../models/Lab');
const { sign } = require('../utils/jwt');
const auth = require('../middleware/auth');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// POST /api/auth/register
router.post('/register', [
  body('name').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['doctor', 'patient', 'laboratory']),
], validate, async (req, res, next) => {
  try {
    const { name, email, password, role, specialty, dateOfBirth, location } = req.body;

    if (await User.findOne({ email })) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const user = await User.create({
      name, email, password, role,
      location: location
        ? { type: 'Point', coordinates: [location.lng, location.lat] }
        : undefined,
    });

    if (role === 'doctor') {
      await Doctor.create({ userId: user._id, specialty: specialty || 'General' });
    } else if (role === 'laboratory') {
      const { labName } = req.body;
      await Lab.create({ userId: user._id, labName: labName || name });
    } else {
      await Patient.create({ userId: user._id, dateOfBirth });
    }

    const token = sign({ id: user._id, role: user.role });
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], validate, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = sign({ id: user._id, role: user.role });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — fetch own name + email
router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('name email role');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) { next(err); }
});

// PATCH /api/auth/me — update own name
router.patch('/me', auth, [
  body('name').notEmpty().withMessage('name is required').trim(),
], validate, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { name: req.body.name } },
      { new: true }
    ).select('name email role');
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) { next(err); }
});

// PATCH /api/auth/change-password
router.patch('/change-password', auth, [
  body('currentPassword').notEmpty().withMessage('currentPassword required'),
  body('newPassword').isLength({ min: 8 }).withMessage('newPassword must be ≥8 chars'),
], validate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const valid = await user.comparePassword(req.body.currentPassword);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect' });
    user.password = req.body.newPassword;
    await user.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/auth/fcm-token — save device push token
router.patch('/fcm-token', auth, async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(422).json({ message: 'fcmToken required' });
    await User.findByIdAndUpdate(req.user.id, { fcmToken });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
