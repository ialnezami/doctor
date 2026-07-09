const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Lab      = require('../models/Lab');
const Pharmacy = require('../models/Pharmacy');
const { sign } = require('../utils/jwt');
const auth = require('../middleware/auth');
const { verifyGoogleToken } = require('../utils/googleAuth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');
const { hmacHash } = require('../utils/blindIndex');
const AuditLog = require('../models/AuditLog');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// POST /api/auth/register
router.post('/register', registerLimiter, [
  body('name').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['doctor', 'patient', 'laboratory', 'pharmacy']),
  // GDPR Article 7 — explicit, unambiguous consent required.
  // Pre-ticked boxes or absent field do not constitute consent.
  body('consentAccepted')
    .custom(v => v === true)
    .withMessage('You must accept the Terms of Service to register'),
], validate, async (req, res, next) => {
  try {
    const { name, email, password, role, specialty, dateOfBirth, location, consentAccepted } = req.body;

    // Switch duplicate check to emailHash: once email is encrypted, plaintext findOne will fail to match.
    if (await User.findOne({ emailHash: hmacHash(email) })) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const user = await User.create({
      name, email, password, role,
      location: location
        ? { type: 'Point', coordinates: [location.lng, location.lat] }
        : undefined,
      // GDPR consent fields — recorded at the moment of registration.
      // consentVersion ties consent to a specific revision of the Terms of Service.
      consentVersion: process.env.TERMS_VERSION || '1.0',
      consentTimestamp: new Date(),
      consentIp: req.ip,
      dataProcessingAllowed: true,
    });

    if (role === 'doctor') {
      await Doctor.create({ userId: user._id, specialty: specialty || 'General' });
    } else if (role === 'laboratory') {
      const { labName } = req.body;
      await Lab.create({ userId: user._id, labName: labName || name });
    } else if (role === 'pharmacy') {
      const { pharmacyName } = req.body;
      await Pharmacy.create({ userId: user._id, pharmacyName: pharmacyName || name });
    } else {
      await Patient.create({ userId: user._id, dateOfBirth });
    }

    // Fire-and-forget audit log for GDPR consent recording.
    // Non-critical: log failure must not block the registration response.
    AuditLog.create({
      actorId: user._id,
      actorRole: user.role,
      action: 'consent',
      resourceType: 'User',
      resourceId: user._id,
      targetUserId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      outcome: 'success',
      meta: { consentVersion: user.consentVersion },
    }).catch(err => console.error('[audit] consent log failed:', err.message));

    const token = sign({ id: user._id, role: user.role });
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, [
  body('email').isEmail(),
  body('password').notEmpty(),
], validate, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    // Switch to emailHash lookup: once the migration (Plan 10) encrypts the email
    // field, findOne({ email: plaintext }) will never match ciphertext values.
    // hmacHash normalizes to lowercase before hashing, matching User model normalization.
    const emailHashValue = hmacHash(email);
    const user = await User.findOne({ emailHash: emailHashValue }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (user.isSuspended) {
      return res.status(403).json({ message: 'Account suspended. Contact support.' });
    }

    // Fire-and-forget audit log for successful login.
    AuditLog.create({
      actorId: user._id,
      actorRole: user.role,
      action: 'login',
      resourceType: 'User',
      resourceId: user._id,
      targetUserId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      outcome: 'success',
    }).catch(err => console.error('[audit] login log failed:', err.message));

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

// POST /api/auth/google
// Body: { idToken: string }  — Google ID token from client
router.post('/google', [
  body('idToken').notEmpty().withMessage('idToken is required'),
], validate, async (req, res, next) => {
  try {
    const { googleId, email, name } = await verifyGoogleToken(req.body.idToken);

    // 1. Already linked to a Google account — fastest path
    let user = await User.findOne({ googleId });
    if (user) {
      const token = sign({ id: user._id, role: user.role });
      return res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    }

    // 2. Email exists — link this Google account to the existing user.
    // Switch to emailHash lookup for the same reason as login (Plan 10 encrypts email).
    user = await User.findOne({ emailHash: hmacHash(email) });
    if (user) {
      user.googleId = googleId;
      await user.save();
      const token = sign({ id: user._id, role: user.role });
      return res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    }

    // 3. New user — create patient (Google sign-up always = patient role).
    // Implicit consent: user accepted Google's ToS and this platform's ToS
    // during the OAuth authorization screen.
    user = await User.create({
      name, email, googleId, role: 'patient',
      consentVersion: process.env.TERMS_VERSION || '1.0',
      consentTimestamp: new Date(),
      consentIp: req.ip,
      dataProcessingAllowed: true,
    });
    try {
      await Patient.create({ userId: user._id });
    } catch (patientErr) {
      await User.deleteOne({ _id: user._id });
      throw patientErr;
    }

    // Fire-and-forget audit log for Google sign-up consent.
    AuditLog.create({
      actorId: user._id,
      actorRole: user.role,
      action: 'consent',
      resourceType: 'User',
      resourceId: user._id,
      targetUserId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      outcome: 'success',
      meta: { consentVersion: user.consentVersion, provider: 'google' },
    }).catch(err => console.error('[audit] google consent log failed:', err.message));

    const token = sign({ id: user._id, role: user.role });
    return res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    if (err.code === 11000) {
      const field = err.keyValue && err.keyValue.googleId ? 'googleId' : 'email';
      const message = field === 'googleId'
        ? 'This Google account is already linked to another user'
        : 'An account with this email already exists';
      return res.status(409).json({ message });
    }
    if (err.status === 401 || err.status === 400) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

module.exports = router;
