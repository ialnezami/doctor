const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Lab = require('../models/Lab');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// GET /api/labs/me
router.get('/me', auth, requireRole('laboratory'), async (req, res, next) => {
  try {
    const lab = await Lab.findOne({ userId: req.user.id });
    if (!lab) return res.status(404).json({ message: 'Lab profile not found' });
    res.json(lab);
  } catch (err) { next(err); }
});

// PATCH /api/labs/me
router.patch('/me', auth, requireRole('laboratory'), [
  body('labName').optional().notEmpty().trim().withMessage('labName cannot be empty'),
  body('address').optional().isString().trim(),
  body('licenseNumber').optional().isString().trim(),
], validate, async (req, res, next) => {
  try {
    const { labName, address, licenseNumber } = req.body;
    const update = {};
    if (labName !== undefined)       update.labName       = labName;
    if (address !== undefined)       update.address       = address;
    if (licenseNumber !== undefined) update.licenseNumber = licenseNumber;

    const lab = await Lab.findOneAndUpdate(
      { userId: req.user.id },
      { $set: update },
      { new: true }
    );
    if (!lab) return res.status(404).json({ message: 'Lab profile not found' });
    res.json(lab);
  } catch (err) { next(err); }
});

module.exports = router;
