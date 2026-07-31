'use strict';

const crypto     = require('crypto');
const { isValidObjectId } = require('mongoose');
const router     = require('express').Router();
const { body, validationResult } = require('express-validator');
const auth       = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { requireDoctorOrSecretary } = require('../middleware/secretaryAuth');
const User       = require('../models/User');
const { sendEmail } = require('../utils/email');
const { hmacHash }  = require('../utils/blindIndex');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// GET /api/staff — list secretaries linked to this doctor (also accessible by secretary)
router.get('/', auth, requireDoctorOrSecretary, async (req, res, next) => {
  try {
    const secretaries = await User.find({
      role: 'secretary',
      linkedDoctorId: req.doctorUserId,
    }).select('name email isActive createdAt').lean();
    res.json({ secretaries });
  } catch (err) { next(err); }
});

// POST /api/staff/invite — doctor invites a secretary by email
router.post('/invite', auth, requireRole('doctor'), [
  body('email').isEmail().normalizeEmail(),
], validate, async (req, res, next) => {
  try {
    const { email } = req.body;

    const existing = await User.findOne({ emailHash: hmacHash(email) });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const secretary = await User.create({
      name:          email.split('@')[0],
      email,
      role:          'secretary',
      linkedDoctorId: req.user.id,
      isActive:      false,
      inviteToken:   tokenHash,
      inviteExpiry:  new Date(Date.now() + 72 * 60 * 60 * 1000),
      // GDPR defaults — secretary consents on accept-invite
      consentVersion:       null,
      dataProcessingAllowed: false,
    });

    const inviteUrl = `${process.env.WEB_URL || 'http://localhost:5173'}/accept-invite?token=${rawToken}`;
    await sendEmail(
      email,
      'دعوة للانضمام إلى سلامتك',
      `<div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0d9488">مرحباً بك في سلامتك</h2>
        <p>تمت دعوتك للعمل كسكرتيرة في عيادة على منصة سلامتك.</p>
        <p><a href="${inviteUrl}" style="background:#0d9488;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">تفعيل الحساب</a></p>
        <p style="color:#64748b;font-size:12px">الرابط صالح لمدة 72 ساعة.</p>
      </div>`
    );

    res.status(201).json({ message: 'تم إرسال الدعوة', secretaryId: secretary._id });
  } catch (err) { next(err); }
});

// DELETE /api/staff/:userId — doctor revokes secretary access
router.delete('/:userId', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.userId)) {
      return res.status(400).json({ message: 'معرف غير صالح' });
    }
    const secretary = await User.findOneAndUpdate(
      { _id: req.params.userId, role: 'secretary', linkedDoctorId: req.user.id },
      { isActive: false, inviteToken: null, inviteExpiry: null },
      { new: true }
    );
    if (!secretary) return res.status(404).json({ message: 'لم يتم العثور على السكرتيرة' });
    res.json({ message: 'تم إلغاء الوصول' });
  } catch (err) { next(err); }
});

module.exports = router;
