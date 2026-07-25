const mongoose = require('mongoose');

const pharmacySchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  pharmacyName:  { type: String, required: true },
  licenseNumber: { type: String, default: '' },
  address:       { type: String, default: '' },
  isApproved:    { type: Boolean, default: false },
  location: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
  },
}, { timestamps: true });

pharmacySchema.index({ isApproved: 1 });
pharmacySchema.index({ location: '2dsphere' }, { sparse: true });

module.exports = mongoose.model('Pharmacy', pharmacySchema);
