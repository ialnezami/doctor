const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  value:          { type: String, required: true },
  unit:           { type: String, default: '' },
  referenceRange: { type: String, default: '' },
  flag:           { type: String, enum: ['normal', 'high', 'low', 'critical'], default: 'normal' },
}, { _id: false });

const labResultSchema = new mongoose.Schema({
  patientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  labName:       { type: String, required: true },
  tests:         { type: [testSchema], default: [] },
  reportFile:    { type: String, default: null },
  status:        { type: String, enum: ['pending', 'ready'], default: 'pending' },
  notes:         { type: String, default: '' },
  issuedAt:      { type: Date, default: Date.now },
}, { timestamps: true });

labResultSchema.index({ 'tests.name': 'text', labName: 'text' });
labResultSchema.index({ patientId: 1, issuedAt: -1 });
labResultSchema.index({ doctorId: 1, issuedAt: -1 });

module.exports = mongoose.model('LabResult', labResultSchema);
