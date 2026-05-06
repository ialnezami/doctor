const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, min: 0, max: 6 }, // 0=Sun
  startTime: String, // "09:00"
  endTime: String,   // "17:00"
}, { _id: false });

const ratingSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  score: { type: Number, min: 1, max: 5 },
  comment: String,
}, { timestamps: true });

const doctorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialty: { type: String, required: true },
  clinicAddress: String,
  bio: String,
  availabilitySlots: [slotSchema],
  ratings: [ratingSchema],
  isVerified: { type: Boolean, default: false },
  autoAcceptAppointments: { type: Boolean, default: false },
  consultationFee: { type: Number, default: 0 },
  yearsOfExperience: { type: Number, default: 0 },
}, { timestamps: true });

doctorSchema.virtual('averageRating').get(function () {
  if (!this.ratings.length) return 0;
  return (this.ratings.reduce((s, r) => s + r.score, 0) / this.ratings.length).toFixed(1);
});

doctorSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Doctor', doctorSchema);
