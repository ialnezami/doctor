const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: [
      'appointment_requested',
      'appointment_confirmed',
      'consultation_validated',
      'notes_viewed',
      'appointment_reminder',
      'daily_digest',
      'gdpr_export_ready',
      'lab_ready',
    ],
    required: true,
  },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  read:    { type: Boolean, default: false },
  expireAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
}, { timestamps: true });

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
