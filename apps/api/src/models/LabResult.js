const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  value:          { type: String, required: false, default: '' },
  unit:           { type: String, default: '' },
  referenceRange: { type: String, default: '' },
  flag:           { type: String, enum: ['normal', 'high', 'low', 'critical'], default: 'normal' },
}, { _id: false });

const labResultSchema = new mongoose.Schema({
  patientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', default: null },
  labName:       { type: String, required: true },
  tests:         { type: [testSchema], default: [] },
  reportFile:    { type: String, default: null },
  status:        { type: String, enum: ['pending', 'processing', 'ready'], default: 'pending' },
  notes:         { type: String, default: '' },
  issuedAt:      { type: Date, default: Date.now },
  aiInterpretation: {
    summary:     { type: String, default: null },
    processedAt: { type: Date,   default: null },
  },
}, { timestamps: true });

// Text index on non-encrypted fields (tests.name, labName remain plaintext for search)
labResultSchema.index({ 'tests.name': 'text', labName: 'text' });
labResultSchema.index({ patientId: 1, issuedAt: -1 });
labResultSchema.index({ doctorId: 1, issuedAt: -1 });

// ---------------------------------------------------------------------------
// PHI Encryption hooks (HIPAA/GDPR compliance)
// ---------------------------------------------------------------------------
// PHI fields encrypted: tests[].value, notes, aiInterpretation.summary
// NOT encrypted: tests[].name, tests[].unit, tests[].referenceRange, tests[].flag
//   — these are display metadata and flag-based sorting/AI-worker search targets.
//   tests.name is also indexed for text search (labResultSchema index above).
//
// isModified() guards prevent double-encryption on re-save without changes.
// Sentinel check on tests[].value prevents re-encrypting already-encrypted values.
// Decrypt errors must not crash reads — only doc ID is logged.
// ---------------------------------------------------------------------------

const { encrypt, decrypt } = require('../utils/fieldEncryption');

labResultSchema.pre('save', function (next) {
  try {
    if (this.isModified('notes') && this.notes != null) {
      this.notes = encrypt(this.notes);
    }
    if (this.isModified('aiInterpretation.summary') && this.aiInterpretation?.summary != null) {
      this.aiInterpretation.summary = encrypt(this.aiInterpretation.summary);
    }
    if (this.isModified('tests') && Array.isArray(this.tests)) {
      this.tests = this.tests.map(t => {
        const test = t.toObject ? t.toObject() : { ...t };
        if (test.value != null && !String(test.value).includes('|')) {
          test.value = encrypt(String(test.value));
        }
        return test;
      });
    }
    next();
  } catch (err) { next(err); }
});

labResultSchema.post('init', function (doc) {
  try {
    if (doc.notes != null) doc.notes = decrypt(doc.notes);
    if (doc.aiInterpretation?.summary != null) {
      doc.aiInterpretation.summary = decrypt(doc.aiInterpretation.summary);
    }
    if (Array.isArray(doc.tests)) {
      doc.tests = doc.tests.map(t => {
        if (t.value != null) t.value = decrypt(String(t.value));
        return t;
      });
    }
  } catch (err) {
    console.error('[encrypt] LabResult decrypt error on doc', doc._id, ':', err.message);
  }
});

module.exports = mongoose.model('LabResult', labResultSchema);
