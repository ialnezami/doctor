const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  homeLocation: {
    type: { type: String, enum: ['Point'] },
    coordinates: [Number],
  },
  city: { type: String, default: '' },
  dateOfBirth: Date,
  bloodType: { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-'] },
  medicalHistory: [String],
  allergies: [String],
  conditions: [String],
  notes: [{
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    createdAt: { type: Date, default: Date.now },
  }],
  photoUrl: { type: String, default: '' },
}, { timestamps: true });

patientSchema.index({ homeLocation: '2dsphere' }, { sparse: true });

module.exports = mongoose.model('Patient', patientSchema);
