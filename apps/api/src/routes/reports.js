const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const auth   = require('../middleware/auth');
const Report = require('../models/Report');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

const REASONS = ['harassment', 'fraud', 'spam', 'inappropriate_content', 'fake_profile', 'other'];

// POST /api/reports — any authenticated user submits a report
router.post('/', auth, [
  body('targetType').isIn(['user', 'doctor', 'review', 'message']),
  body('targetId').custom(v => mongoose.isValidObjectId(v)).withMessage('Invalid targetId'),
  body('reason').isIn(REASONS),
  body('description').optional().isLength({ max: 1000 }),
], validate, async (req, res, next) => {
  try {
    const { targetType, targetId, reason, description } = req.body;

    // Prevent duplicate pending reports from same user on same target
    const exists = await Report.findOne({ reporterId: req.user.id, targetId, status: 'pending' });
    if (exists) return res.status(409).json({ message: 'You already have a pending report for this.' });

    const report = await Report.create({
      reporterId: req.user.id,
      targetType,
      targetId,
      reason,
      description: description?.trim() || '',
    });
    res.status(201).json({ report });
  } catch (err) { next(err); }
});

module.exports = router;
