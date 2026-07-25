const router = require('express').Router();
const { query, validationResult } = require('express-validator');
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Doctor      = require('../models/Doctor');
const Lab         = require('../models/Lab');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// GET /api/map/nearby?swLat&swLng&neLat&neLng[&specialty]
router.get('/nearby', auth, requireRole('patient'), [
  query('swLat').isFloat().withMessage('swLat required'),
  query('swLng').isFloat().withMessage('swLng required'),
  query('neLat').isFloat().withMessage('neLat required'),
  query('neLng').isFloat().withMessage('neLng required'),
  query('neLat').custom((v, { req }) => {
    if (parseFloat(v) <= parseFloat(req.query.swLat))
      throw new Error('neLat must be greater than swLat');
    return true;
  }),
  query('neLng').custom((v, { req }) => {
    if (parseFloat(v) <= parseFloat(req.query.swLng))
      throw new Error('neLng must be greater than swLng');
    return true;
  }),
], validate, async (req, res, next) => {
  try {
    const { swLat, swLng, neLat, neLng, specialty } = req.query;
    const box = [
      [parseFloat(swLng), parseFloat(swLat)],
      [parseFloat(neLng), parseFloat(neLat)],
    ];

    const doctorFilter = { 'locations.coordinates': { $geoWithin: { $box: box } } };
    if (specialty && specialty !== 'All') doctorFilter.specialty = specialty;

    const [doctorDocs, labDocs] = await Promise.all([
      Doctor.find(doctorFilter)
        .select('userId specialty averageRating reviewCount photoUrl locations')
        .populate('userId', 'name')
        .limit(50)
        .lean(),
      Lab.find({
        location: { $geoWithin: { $box: box } },
        'location.coordinates': { $ne: [0, 0] },
        isApproved: true,
      })
        .select('labName address location')
        .limit(20)
        .lean(),
    ]);

    const doctors = doctorDocs.map(d => {
      const loc = d.locations?.find(l => l.type === 'bookable') || d.locations?.[0];
      return {
        _id:         d._id,
        name:        d.userId?.name || 'Doctor',
        specialty:   d.specialty,
        rating:      d.averageRating,
        reviewCount: d.reviewCount,
        photoUrl:    d.photoUrl || '',
        coordinates: loc?.coordinates?.coordinates || [0, 0],
        type:        'doctor',
      };
    });

    const labs = labDocs.map(l => ({
      _id:         l._id,
      name:        l.labName,
      address:     l.address,
      coordinates: l.location?.coordinates || [0, 0],
      type:        'lab',
    }));

    res.json({ doctors, labs });
  } catch (err) { next(err); }
});

module.exports = router;
