const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const Lab = require('../models/Lab');

// GET /api/admin/labs — list pending labs
router.get('/labs', adminAuth, async (req, res, next) => {
  try {
    const labs = await Lab.find({ isApproved: false }).populate('userId', 'name email createdAt');
    res.json(labs);
  } catch (err) { next(err); }
});

// PATCH /api/admin/labs/:id/approve
router.patch('/labs/:id/approve', adminAuth, async (req, res, next) => {
  try {
    const lab = await Lab.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
    if (!lab) return res.status(404).json({ message: 'Lab not found' });
    res.json(lab);
  } catch (err) { next(err); }
});

module.exports = router;
