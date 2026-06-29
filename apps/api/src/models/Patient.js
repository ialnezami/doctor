const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  homeLocation: {
    type: { type: String, enum: ['Point'] },
    coordinates: [Number],
  },
  city: { type: String, default: '' },
  dateOfBirth: { type: mongoose.Schema.Types.Mixed }, // stored as encrypted string; decrypted to Date on read
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

// ---------------------------------------------------------------------------
// PHI Encryption hooks (HIPAA/GDPR compliance)
// ---------------------------------------------------------------------------
// All PHI fields are encrypted at rest using AES-256-GCM (fieldEncryption.js).
// The encrypt/decrypt utility uses a "|" sentinel to distinguish ciphertext from
// legacy plaintext so existing records remain readable with zero downtime.
//
// Security notes:
//   - isModified() guards prevent double-encryption when a doc is re-saved
//     without touching the PHI field (otherwise ciphertext would be encrypted
//     again, corrupting data permanently).
//   - bloodType enum validation runs BEFORE pre-save, so Mongoose sees plaintext
//     during validation; MongoDB stores ciphertext.
//   - dateOfBirth is stored as encrypted ISO string (Mixed type) and restored
//     to a Date object in post('init').
//   - Decrypt errors in post('init') are logged without PHI content and must not
//     crash the application — callers receive the raw (possibly encrypted) value.
// ---------------------------------------------------------------------------

const { encrypt, decrypt } = require('../utils/fieldEncryption');

// Scalar PHI fields encrypted as strings
const SCALAR_PHI = ['bloodType'];
// Array PHI fields where each element is an encrypted string
const ARRAY_PHI = ['medicalHistory', 'allergies', 'conditions'];

patientSchema.pre('save', function (next) {
  try {
    SCALAR_PHI.forEach(field => {
      if (this.isModified(field) && this[field] != null) {
        this[field] = encrypt(String(this[field]));
      }
    });

    ARRAY_PHI.forEach(field => {
      if (this.isModified(field) && Array.isArray(this[field])) {
        this[field] = this[field].map(v => (v != null ? encrypt(String(v)) : v));
      }
    });

    // dateOfBirth: encrypt as ISO string; stored as Mixed (not Date) after encryption
    if (this.isModified('dateOfBirth') && this.dateOfBirth != null) {
      this.dateOfBirth = encrypt(new Date(this.dateOfBirth).toISOString());
    }

    // notes[].content: encrypt each doctor note embedded in the patient profile.
    // The `includes('|')` sentinel check prevents re-encrypting already-encrypted
    // content when only other notes fields change, providing additional safety
    // beyond the isModified guard.
    if (this.isModified('notes') && Array.isArray(this.notes)) {
      this.notes = this.notes.map(note => {
        if (note.content && !String(note.content).includes('|')) {
          return { ...note.toObject ? note.toObject() : note, content: encrypt(note.content) };
        }
        return note;
      });
    }

    next();
  } catch (err) {
    next(err);
  }
});

patientSchema.post('init', function (doc) {
  try {
    SCALAR_PHI.forEach(field => {
      if (doc[field] != null) doc[field] = decrypt(doc[field]);
    });

    ARRAY_PHI.forEach(field => {
      if (Array.isArray(doc[field])) {
        doc[field] = doc[field].map(v => (v != null ? decrypt(String(v)) : v));
      }
    });

    if (doc.dateOfBirth != null) {
      const decrypted = decrypt(String(doc.dateOfBirth));
      doc.dateOfBirth = decrypted ? new Date(decrypted) : null;
    }

    if (Array.isArray(doc.notes)) {
      doc.notes = doc.notes.map(note => {
        if (note.content) note.content = decrypt(note.content);
        return note;
      });
    }
  } catch (err) {
    // Decrypt failure must not crash reads — log doc ID only, never PHI content
    console.error('[encrypt] Patient decrypt error on doc', doc._id, ':', err.message);
  }
});

module.exports = mongoose.model('Patient', patientSchema);
