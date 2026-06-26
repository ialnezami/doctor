const mongoose = require('mongoose');
const router   = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const Lab    = require('../models/Lab');
const Review = require('../models/Review');
const { recalculateRating } = require('./reviews');

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

// DELETE /api/admin/reviews/:id — admin deletes a flagged review
router.delete('/reviews/:id', adminAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid review id' });
    }
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    if (!review.flagged) {
      return res.status(409).json({ message: 'Review must be flagged before deletion' });
    }
    const doctorId = review.doctorId;
    await review.deleteOne();
    recalculateRating(doctorId).catch(err =>
      console.error('[admin] recalculate failed after delete:', err.message)
    );
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
