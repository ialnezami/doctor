const mongoose = require('mongoose');
const router = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Pharmacy = require('../models/Pharmacy');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// GET /api/pharmacies/me
router.get('/me', auth, requireRole('pharmacy'), async (req, res, next) => {
  try {
    const pharmacy = await Pharmacy.findOne({ userId: req.user.id });
    if (!pharmacy) return res.status(404).json({ message: 'Pharmacy profile not found' });
    res.json(pharmacy);
  } catch (err) { next(err); }
});

// PATCH /api/pharmacies/me
router.patch('/me', auth, requireRole('pharmacy'), [
  body('pharmacyName').optional().notEmpty().trim().withMessage('pharmacyName cannot be empty'),
  body('address').optional().isString().trim(),
  body('licenseNumber').optional().isString().trim(),
], validate, async (req, res, next) => {
  try {
    const { pharmacyName, address, licenseNumber } = req.body;
    const update = {};
    if (pharmacyName  !== undefined) update.pharmacyName  = pharmacyName;
    if (address       !== undefined) update.address       = address;
    if (licenseNumber !== undefined) update.licenseNumber = licenseNumber;

    const pharmacy = await Pharmacy.findOneAndUpdate(
      { userId: req.user.id },
      { $set: update },
      { new: true }
    );
    if (!pharmacy) return res.status(404).json({ message: 'Pharmacy profile not found' });
    res.json(pharmacy);
  } catch (err) { next(err); }
});

// PUT /api/pharmacies/me/location
router.put('/me/location', auth, requireRole('pharmacy'), [
  body('lat').isFloat({ min: -90,  max: 90  }).withMessage('lat must be between -90 and 90'),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('lng must be between -180 and 180'),
], validate, async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    const pharmacy = await Pharmacy.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { 'location.type': 'Point', 'location.coordinates': [lng, lat] } },
      { new: true }
    );
    if (!pharmacy) return res.status(404).json({ message: 'Pharmacy profile not found' });
    res.json({ message: 'Location updated', location: pharmacy.location });
  } catch (err) { next(err); }
});

// GET /api/pharmacies — public list of approved pharmacies (geo search optional)
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('lat').optional().isFloat({ min: -90,  max: 90  }),
  query('lng').optional().isFloat({ min: -180, max: 180 }),
  query('maxDistance').optional().isInt({ min: 1 }),
], validate, async (req, res, next) => {
  try {
    const page  = req.query.page  || 1;
    const limit = req.query.limit || 20;
    const skip  = (page - 1) * limit;
    const { lat, lng, maxDistance } = req.query;

    let filter = { isApproved: true };
    let sort   = { createdAt: -1 };

    if (lat != null && lng != null) {
      filter.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: maxDistance ? parseInt(maxDistance) : 50000,
        },
      };
      sort = {};
    }

    const [pharmacies, total] = await Promise.all([
      Pharmacy.find(filter).populate('userId', 'name').sort(sort).skip(skip).limit(limit),
      Pharmacy.countDocuments({ isApproved: true }),
    ]);
    res.json({ pharmacies, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// GET /api/pharmacies/:id — public single pharmacy
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const pharmacy = await Pharmacy.findById(req.params.id).populate('userId', 'name');
    if (!pharmacy) return res.status(404).json({ message: 'Pharmacy not found' });
    res.json(pharmacy);
  } catch (err) { next(err); }
});

module.exports = router;
