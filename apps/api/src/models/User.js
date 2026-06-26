const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false },           // optional — Google-only users have no password
  googleId: { type: String, sparse: true, unique: true }, // sparse: only index documents that have this field
  role: { type: String, enum: ['doctor', 'patient', 'laboratory'], required: true },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },
  fcmToken: { type: String, default: null },
  photoUrl: { type: String, default: '' },
}, { timestamps: true });

userSchema.index({ location: '2dsphere' });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next(); // skip if no password set
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  if (!this.password) return Promise.resolve(false); // Google-only user — always reject password login
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
