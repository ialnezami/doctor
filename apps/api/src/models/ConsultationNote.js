const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  authorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:       { type: String, required: true, maxlength: 5000 },
  visibility:    { type: String, enum: ['private', 'shared'], required: true },
  aiAssist: {
    icdCodes:       { type: [{ code: String, description: String }], default: [] },
    patientSummary: { type: String, default: null },
    flags:          { type: [String], default: [] },
    processedAt:    { type: Date, default: null },
  },
}, { timestamps: true });

noteSchema.index({ appointmentId: 1, createdAt: 1 });

module.exports = mongoose.model('ConsultationNote', noteSchema);
