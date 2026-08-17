const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phoneHash: { type: String, required: true },
  codeHash:  { type: String, required: true },   // SHA-256 of the 6-digit OTP
  expiresAt: { type: Date,   required: true },
  attempts:  { type: Number, default: 0 },
  used:      { type: Boolean, default: false },
}, { timestamps: true });

otpSchema.index({ phoneHash: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto-delete expired

module.exports = mongoose.model('OtpCode', otpSchema);
