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

// ---------------------------------------------------------------------------
// PHI Encryption hooks (HIPAA/GDPR compliance)
// ---------------------------------------------------------------------------
// PHI fields encrypted: content, aiAssist.patientSummary
// Not encrypted: icdCodes (metadata), flags (used for display/search), processedAt
//
// isModified() guards prevent double-encryption on re-save without changes.
// Decrypt errors must not crash reads — only doc ID is logged.
// ---------------------------------------------------------------------------

const { encrypt, decrypt } = require('../utils/fieldEncryption');

noteSchema.pre('save', function (next) {
  try {
    if (this.isModified('content') && this.content != null) {
      this.content = encrypt(this.content);
    }
    if (this.isModified('aiAssist.patientSummary') && this.aiAssist?.patientSummary != null) {
      this.aiAssist.patientSummary = encrypt(this.aiAssist.patientSummary);
    }
    next();
  } catch (err) { next(err); }
});

noteSchema.post('init', function (doc) {
  try {
    if (doc.content != null) doc.content = decrypt(doc.content);
    if (doc.aiAssist?.patientSummary != null) {
      doc.aiAssist.patientSummary = decrypt(doc.aiAssist.patientSummary);
    }
  } catch (err) {
    console.error('[encrypt] ConsultationNote decrypt error on doc', doc._id, ':', err.message);
  }
});

module.exports = mongoose.model('ConsultationNote', noteSchema);
