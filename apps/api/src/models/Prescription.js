const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  dosage:    { type: String, required: true },
  frequency: { type: String, required: true },
  duration:  { type: String, required: true },
}, { _id: false });

const analysisSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  instructions: { type: String, default: '' },
}, { _id: false });

const prescriptionSchema = new mongoose.Schema({
  doctorId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patientId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  medications:       { type: [medicationSchema], required: true },
  analyses:          { type: [analysisSchema], default: [] },
  instructions:      String,
  validUntil:        Date,
  dispensedAt:       { type: Date, default: null },
  dispensedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', default: null },
  verificationToken: { type: String, unique: true, sparse: true, index: true },
}, { timestamps: true });

// ---------------------------------------------------------------------------
// PHI Encryption hooks (HIPAA/GDPR compliance)
// ---------------------------------------------------------------------------
// PHI fields encrypted: instructions, medications[].name/dosage/frequency/duration
//
// Medication subdoc fields are iterated explicitly via MED_FIELDS. The sentinel
// check (!String(field).includes('|')) is an additional guard against re-encrypting
// already-encrypted values when only unrelated prescription fields are modified.
// isModified('medications') is the primary guard.
//
// Decrypt errors must not crash reads — only doc ID is logged.
// ---------------------------------------------------------------------------

const { encrypt, decrypt } = require('../utils/fieldEncryption');

const MED_FIELDS = ['name', 'dosage', 'frequency', 'duration'];

prescriptionSchema.pre('save', function (next) {
  try {
    if (this.isModified('instructions') && this.instructions != null) {
      this.instructions = encrypt(this.instructions);
    }
    if (this.isModified('medications') && Array.isArray(this.medications)) {
      this.medications = this.medications.map(med => {
        const m = med.toObject ? med.toObject() : { ...med };
        MED_FIELDS.forEach(f => {
          if (m[f] != null && !String(m[f]).includes('|')) m[f] = encrypt(String(m[f]));
        });
        return m;
      });
    }
    if (this.isModified('analyses') && Array.isArray(this.analyses)) {
      this.analyses = this.analyses.map(a => {
        const item = a.toObject ? a.toObject() : { ...a };
        if (item.name != null && !String(item.name).includes('|')) item.name = encrypt(String(item.name));
        if (item.instructions != null && !String(item.instructions).includes('|')) item.instructions = encrypt(String(item.instructions));
        return item;
      });
    }
    next();
  } catch (err) { next(err); }
});

prescriptionSchema.post('init', function (doc) {
  try {
    if (doc.instructions != null) doc.instructions = decrypt(doc.instructions);
    if (Array.isArray(doc.medications)) {
      doc.medications = doc.medications.map(med => {
        MED_FIELDS.forEach(f => { if (med[f] != null) med[f] = decrypt(String(med[f])); });
        return med;
      });
    }
    if (Array.isArray(doc.analyses)) {
      doc.analyses = doc.analyses.map(a => ({
        name:         a.name != null ? decrypt(String(a.name)) : a.name,
        instructions: a.instructions != null ? decrypt(String(a.instructions)) : a.instructions,
      }));
    }
  } catch (err) {
    console.error('[encrypt] Prescription decrypt error on doc', doc._id, ':', err.message);
  }
});

module.exports = mongoose.model('Prescription', prescriptionSchema);
