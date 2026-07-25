const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { hmacHash } = require('../utils/blindIndex');
const { normalizePhone } = require('../utils/phoneUtils');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: false, sparse: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false },           // optional — Google-only users have no password
  googleId: { type: String, sparse: true, unique: true }, // sparse: only index documents that have this field
  role: { type: String, enum: ['doctor', 'patient', 'laboratory', 'pharmacy'], required: true },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },
  fcmToken: { type: String, default: null },
  photoUrl: { type: String, default: '' },
  notificationPrefs: {
    pushEnabled:  { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: true },
  },
  isSuspended: { type: Boolean, default: false },

  // GDPR Article 7 — explicit consent tracking
  consentVersion:        { type: String,  default: null },  // e.g. "2024-01" — bump when terms change
  consentTimestamp:      { type: Date,    default: null },  // when consent was given
  consentIp:             { type: String,  default: null },  // IP at time of consent
  consentWithdrawnAt:    { type: Date,    default: null },  // null = consent active; set = withdrawn
  dataProcessingAllowed: { type: Boolean, default: false }, // false until explicit consent given

  // GDPR Article 17 — erasure flag
  // Set by erasureService; auth middleware rejects tokens when this is non-null
  erasedAt: { type: Date, default: null },

  // Email blind index for login lookup after email is encrypted
  // HMAC-SHA256 of email.toLowerCase().trim() using BLIND_INDEX_KEY env var
  // Populated by pre-save hook below; unique sparse index for login queries
  emailHash: { type: String, default: null },

  // Phone number in E.164 format — set when a doctor/lab creates a patient account
  phone:     { type: String, default: null },
  phoneHash: { type: String, default: null },
}, { timestamps: true });

userSchema.index({ location: '2dsphere' });
userSchema.index({ emailHash: 1 }, { unique: true, sparse: true });
userSchema.index({ phoneHash: 1 }, { unique: true, sparse: true });

// Hash password before saving (unchanged)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next(); // skip if no password set
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Maintain emailHash blind index whenever email changes.
// Fails loudly if BLIND_INDEX_KEY is misconfigured — stale emailHash must never be silently stored.
userSchema.pre('save', function (next) {
  if (this.isModified('email') && this.email) {
    try {
      this.emailHash = hmacHash(this.email);
    } catch (err) {
      // BLIND_INDEX_KEY not set or invalid — propagate to caller so the save is rejected
      return next(err);
    }
  }
  next();
});

// Normalize phone to E.164 and maintain phoneHash blind index.
userSchema.pre('save', function (next) {
  try {
    if (this.isModified('phone') && this.phone) {
      this.phone = normalizePhone(this.phone);
      this.phoneHash = hmacHash(this.phone);
    } else if (this.isModified('phone') && !this.phone) {
      this.phone = null;
      this.phoneHash = null;
    }
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.methods.comparePassword = function (candidate) {
  if (!this.password) return Promise.resolve(false); // Google-only user — always reject password login
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
