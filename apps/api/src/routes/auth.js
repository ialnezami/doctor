const crypto = require('crypto');
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
const { normalizePhone } = require('../utils/phoneUtils');
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

    const payload = { id: user._id, role: user.role };
    const token = sign(payload);
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, linkedDoctorId: null } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
// Accepts { identifier, password } where identifier is email or phone.
// Also accepts legacy { email, password } for backward compatibility.
router.post('/login', loginLimiter, [
  body('identifier').optional().notEmpty(),
  body('email').optional().isEmail(),
  body('password').notEmpty(),
], validate, async (req, res, next) => {
  try {
    const { identifier, email: legacyEmail, password } = req.body;
    const raw = identifier || legacyEmail;
    if (!raw) return res.status(422).json({ message: 'identifier or email is required' });

    let user;
    if (raw.includes('@')) {
      // Email login — look up by emailHash blind index
      const emailHashValue = hmacHash(raw.toLowerCase().trim());
      user = await User.findOne({ emailHash: emailHashValue }).select('+password');
    } else {
      // Phone login — normalize to E.164 then look up by phoneHash blind index
      let normalizedPhone;
      try { normalizedPhone = normalizePhone(raw); } catch {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      const phoneHashValue = hmacHash(normalizedPhone);
      user = await User.findOne({ phoneHash: phoneHashValue }).select('+password');
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (user.isSuspended) {
      return res.status(403).json({ message: 'Account suspended. Contact support.' });
    }
    if (user.role === 'secretary' && !user.isActive) {
      return res.status(403).json({ message: 'تم إلغاء صلاحيات وصولك' });
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

    const payload = { id: user._id, role: user.role };
    if (user.role === 'secretary' && user.linkedDoctorId) {
      payload.linkedDoctorId = user.linkedDoctorId;
    }
    const token = sign(payload);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, linkedDoctorId: user.linkedDoctorId || null } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/create-patient — doctor or lab creates a patient account with phone + temp password
router.post('/create-patient', auth, [
  body('name').notEmpty().trim().withMessage('name is required'),
  body('phone').notEmpty().withMessage('phone is required'),
  body('password').isLength({ min: 8 }).withMessage('password must be at least 8 characters'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('invalid email format'),
], validate, async (req, res, next) => {
  try {
    if (!['doctor', 'laboratory'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only doctors and labs can create patient accounts' });
    }

    const { name, phone, password, email } = req.body;

    // Normalize and hash phone upfront — fail fast before any DB writes
    let normalizedPhone;
    try { normalizedPhone = normalizePhone(phone); } catch {
      return res.status(422).json({ message: 'Invalid phone number format' });
    }
    const phoneHashValue = hmacHash(normalizedPhone);

    // Uniqueness checks before writes
    if (await User.findOne({ phoneHash: phoneHashValue })) {
      return res.status(409).json({ message: 'Phone number already registered' });
    }
    if (email) {
      const emailHashValue = hmacHash(email.toLowerCase().trim());
      if (await User.findOne({ emailHash: emailHashValue })) {
        return res.status(409).json({ message: 'Email already registered' });
      }
    }

    // Create User
    const userData = { name, phone: normalizedPhone, password, role: 'patient' };
    if (email) userData.email = email.toLowerCase().trim();
    const user = new User(userData);
    await user.save();

    // Create Patient profile — delete User on failure to avoid orphaned user records
    try {
      await Patient.create({ userId: user._id });
    } catch (patientErr) {
      await User.findByIdAndDelete(user._id);
      throw patientErr;
    }

    AuditLog.create({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'create_patient',
      resourceType: 'User',
      resourceId: user._id,
      targetUserId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      outcome: 'success',
      meta: { createdPatientId: user._id },
    }).catch(err => console.error('[audit] create_patient log failed:', err.message));

    res.status(201).json({
      id: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email || null,
      createdAt: user.createdAt,
    });
  } catch (err) { next(err); }
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

// POST /api/auth/accept-invite — secretary sets password and activates account
router.post('/accept-invite', [
  body('token').notEmpty().withMessage('token is required'),
  body('password').isLength({ min: 8 }).withMessage('password must be at least 8 characters'),
], validate, async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      inviteToken:  tokenHash,
      inviteExpiry: { $gt: new Date() },
      role:         'secretary',
      isActive:     false,
    });

    if (!user) {
      return res.status(400).json({ message: 'رابط الدعوة غير صالح أو منتهي الصلاحية' });
    }

    user.password    = password; // pre-save hook hashes it
    user.isActive    = true;
    user.inviteToken  = null;
    user.inviteExpiry = null;
    // Record consent at activation
    user.consentVersion       = process.env.TERMS_VERSION || '1.0';
    user.consentTimestamp     = new Date();
    user.consentIp            = req.ip;
    user.dataProcessingAllowed = true;
    await user.save();

    const payload = { id: user._id, role: user.role, linkedDoctorId: user.linkedDoctorId };
    const jwtToken = sign(payload);

    res.json({
      token: jwtToken,
      user: {
        id:              user._id,
        name:            user.name,
        email:           user.email,
        role:            user.role,
        linkedDoctorId:  user.linkedDoctorId,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
