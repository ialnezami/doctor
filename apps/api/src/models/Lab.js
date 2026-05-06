const mongoose = require('mongoose');

const labSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  labName:       { type: String, required: true },
  licenseNumber: { type: String, default: '' },
  address:       { type: String, default: '' },
  isApproved:    { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Lab', labSchema);
