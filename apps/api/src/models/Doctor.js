const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, min: 0, max: 6 },
  startTime: String,
  endTime:   String,
}, { _id: false });

const educationSchema = new mongoose.Schema({
  degree:      { type: String, default: '' },
  institution: { type: String, default: '' },
  year:        { type: Number, default: null },
}, { _id: false });

const doctorSchema = new mongoose.Schema({
  userId:                 { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialty:              { type: String, required: true },
  clinicAddress:          String,
  bio:                    String,
  availabilitySlots:      [slotSchema],
  averageRating:          { type: Number, default: 0 },
  reviewCount:            { type: Number, default: 0 },
  isVerified:             { type: Boolean, default: false },
  autoAcceptAppointments: { type: Boolean, default: false },
  consultationFee:        { type: Number, default: 0 },
  yearsOfExperience:      { type: Number, default: 0 },
  photoUrl:               { type: String, default: '' },
  timezone:               { type: String, default: 'UTC' },
  // Rich profile fields
  licenseNumber:          { type: String, default: '' },
  languages:              { type: [String], default: [] },
  education:              { type: [educationSchema], default: [] },
  achievements:           { type: [String], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Doctor', doctorSchema);
