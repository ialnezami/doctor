const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, min: 0, max: 6 },
  startTime:  String,
  endTime:    String,
}, { _id: false });

const locationSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  address:  { type: String, default: '' },
  coordinates: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },
  type:        { type: String, enum: ['bookable', 'hospital'], required: true },
  contactNote: { type: String, default: '' },
  slots:       { type: [slotSchema], default: [] },
});

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
  locations:              { type: [locationSchema], default: [] },
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

doctorSchema.index({ 'locations.coordinates': '2dsphere' }, { sparse: true });

module.exports = mongoose.model('Doctor', doctorSchema);
