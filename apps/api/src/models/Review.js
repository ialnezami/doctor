const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  patientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating:        { type: Number, required: true, min: 1, max: 5 },
  comment:       { type: String, maxlength: 1000, default: '' },
  flagged:       { type: Boolean, default: false },
  flagReason:    { type: String, default: '' },
}, { timestamps: true });

reviewSchema.index({ appointmentId: 1 }, { unique: true });
reviewSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
