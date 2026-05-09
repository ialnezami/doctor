const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Lab = require('../models/Lab');
const { sign } = require('../utils/jwt');

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

module.exports = router;
