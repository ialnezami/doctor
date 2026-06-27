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

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, select: 'notificationPrefs' }
    );

    res.json({ notificationPrefs: user.notificationPrefs });
  } catch (err) { next(err); }
});

module.exports = router;
