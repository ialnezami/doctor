const mongoose = require('mongoose');

const sharedLinkSchema = new mongoose.Schema({
  resourceType: { type: String, enum: ['lab_result', 'prescription'], required: true },
  resourceId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  ownerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token:        { type: String, required: true, unique: true },
  passwordHash: { type: String, default: null },
  expiresAt:    { type: Date, default: null },
  viewCount:    { type: Number, default: 0 },
  revokedAt:    { type: Date, default: null },
}, { timestamps: true });

sharedLinkSchema.index({ token: 1 }, { unique: true });

module.exports = mongoose.model('SharedLink', sharedLinkSchema);
