const crypto = require('crypto');
const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name:      { type: String, required: true },
  qty:       { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },
}, { _id: false });

const saleSchema = new mongoose.Schema({
  pharmacyId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  items:          { type: [saleItemSchema], required: true },
  prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', default: null },
  patientId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  totalAmount:    { type: Number, required: true },
  currency:       { type: String, required: true, default: 'SAR' },
  paymentMethod:  { type: String, enum: ['cash', 'card'], required: true },
  dispensedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiptNumber:  { type: String, unique: true, required: true },
}, { timestamps: true });

saleSchema.pre('validate', function (next) {
  if (!this.receiptNumber) {
    this.receiptNumber = crypto.randomBytes(6).toString('hex').toUpperCase();
  }
  next();
});

saleSchema.index({ pharmacyId: 1 });
saleSchema.index({ patientId: 1 });
saleSchema.index({ prescriptionId: 1 });
saleSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Sale', saleSchema);
