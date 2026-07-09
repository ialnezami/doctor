const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  pharmacyId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  name:              { type: String, required: true },
  barcode:           { type: String, required: true },
  description:       { type: String, default: '' },
  unit:              { type: String, enum: ['tablet', 'capsule', 'ml', 'mg', 'box', 'sachet', 'other'], default: 'tablet' },
  stockQty:          { type: Number, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 10 },
  price:             { type: Number, required: true, min: 0 },
  currency:          { type: String, default: 'SAR' },
}, { timestamps: true });

productSchema.index({ pharmacyId: 1, barcode: 1 }, { unique: true });
productSchema.index({ pharmacyId: 1, name: 1 });

module.exports = mongoose.model('Product', productSchema);
