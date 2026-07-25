const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporterId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType:  { type: String, enum: ['user', 'doctor', 'review', 'message'], required: true },
  targetId:    { type: mongoose.Schema.Types.ObjectId, required: true },
  reason:      { type: String, enum: ['harassment', 'fraud', 'spam', 'inappropriate_content', 'fake_profile', 'other'], required: true },
  description: { type: String, maxlength: 1000, default: '' },
  status:      { type: String, enum: ['pending', 'resolved', 'dismissed'], default: 'pending' },
  adminNote:   { type: String, default: '' },
  resolvedAt:  { type: Date },
}, { timestamps: true });

reportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
