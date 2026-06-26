const router       = require('express').Router();
const mongoose     = require('mongoose');
const auth         = require('../middleware/auth');
const Notification = require('../models/Notification');

// GET /api/notifications
router.get('/', auth, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ recipientId: req.user.id })
      .sort({ createdAt: -1 }).limit(50);
    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ notifications, unreadCount });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/read-all — must be before /:id route
router.patch('/read-all', auth, async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { recipientId: req.user.id, read: false },
      { read: true }
    );
    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', auth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Not found' });
    res.json({ notification });
  } catch (err) { next(err); }
});

module.exports = router;
