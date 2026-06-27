'use strict';

const router = require('express').Router();
const auth   = require('../middleware/auth');
const User   = require('../models/User');

// PATCH /api/users/me/notification-prefs
router.patch('/me/notification-prefs', auth, async (req, res, next) => {
  try {
    const { pushEnabled, emailEnabled } = req.body;

    if (pushEnabled !== undefined && typeof pushEnabled !== 'boolean') {
      return res.status(400).json({ message: 'pushEnabled must be a boolean' });
    }
    if (emailEnabled !== undefined && typeof emailEnabled !== 'boolean') {
      return res.status(400).json({ message: 'emailEnabled must be a boolean' });
    }

    const update = {};
    if (pushEnabled  !== undefined) update['notificationPrefs.pushEnabled']  = pushEnabled;
    if (emailEnabled !== undefined) update['notificationPrefs.emailEnabled'] = emailEnabled;

    // Guard: if no fields to update, fetch current prefs and return
    if (Object.keys(update).length === 0) {
      const current = await User.findById(req.user.id).select('notificationPrefs');
      return res.json({ notificationPrefs: current?.notificationPrefs || { pushEnabled: true, emailEnabled: true } });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, select: 'notificationPrefs' }
    );

    // Guard: return 404 if authenticated user ID doesn't exist
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ notificationPrefs: user.notificationPrefs });
  } catch (err) { next(err); }
});

module.exports = router;
