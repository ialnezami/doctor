const mongoose = require('mongoose');

const labSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  labName:       { type: String, required: true },
  licenseNumber: { type: String, default: '' },
  address:       { type: String, default: '' },
  isApproved:    { type: Boolean, default: false },
  location: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },
}, { timestamps: true });

labSchema.index({ isApproved: 1 });
labSchema.index({ location: '2dsphere' }, { sparse: true });

module.exports = mongoose.model('Lab', labSchema);
