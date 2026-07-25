const mongoose = require('mongoose');

const chatReadMarkerSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User',        required: true },
  lastReadAt:    { type: Date, default: Date.now },
}, { timestamps: false });

chatReadMarkerSchema.index({ appointmentId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('ChatReadMarker', chatReadMarkerSchema);
