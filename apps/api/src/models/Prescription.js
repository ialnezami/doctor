const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  dosage:    { type: String, required: true }, // "5mg"
  frequency: { type: String, required: true }, // "1×/day"
  duration:  { type: String, required: true }, // "30 days"
}, { _id: false });

const prescriptionSchema = new mongoose.Schema({
  doctorId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patientId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  medications:       { type: [medicationSchema], required: true },
  instructions:      String,
  validUntil:        Date,
  verificationToken: { type: String, unique: true, sparse: true, index: true },
}, { timestamps: true });

module.exports = mongoose.model('Prescription', prescriptionSchema);
