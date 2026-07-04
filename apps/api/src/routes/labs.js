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

// PUT /api/labs/me/location
router.put('/me/location', auth, requireRole('laboratory'), [
  body('lat').isFloat({ min: -90, max: 90 }).withMessage('lat must be between -90 and 90'),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('lng must be between -180 and 180'),
], validate, async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    const lab = await Lab.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { 'location.type': 'Point', 'location.coordinates': [lng, lat] } },
      { new: true }
    );
    if (!lab) return res.status(404).json({ message: 'Lab profile not found' });
    res.json({ message: 'Location updated', location: lab.location });
  } catch (err) { next(err); }
});

module.exports = router;
