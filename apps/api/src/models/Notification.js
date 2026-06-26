const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['appointment_requested', 'appointment_confirmed', 'consultation_validated', 'notes_viewed'],
    required: true,
  },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  read:    { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
