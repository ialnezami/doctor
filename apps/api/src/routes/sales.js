const mongoose = require('mongoose');
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Pharmacy     = require('../models/Pharmacy');
const Product      = require('../models/Product');
const Sale         = require('../models/Sale');
const Prescription = require('../models/Prescription');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

async function getApprovedPharmacy(userId, res) {
  const pharmacy = await Pharmacy.findOne({ userId });
  if (!pharmacy) { res.status(404).json({ message: 'Pharmacy profile not found' }); return null; }
  if (!pharmacy.isApproved) { res.status(403).json({ message: 'Pharmacy account pending approval' }); return null; }
  return pharmacy;
}

// GET /api/sales/receipt/:receiptNumber — must come before /:id to avoid conflict
router.get('/receipt/:receiptNumber', auth, requireRole('pharmacy'), async (req, res, next) => {
  try {
    const pharmacy = await getApprovedPharmacy(req.user.id, res);
    if (!pharmacy) return;

    const sale = await Sale.findOne({ receiptNumber: req.params.receiptNumber, pharmacyId: pharmacy._id })
      .populate('dispensedBy', 'name');
    if (!sale) return res.status(404).json({ message: 'Receipt not found' });
    res.json(sale);
  } catch (err) { next(err); }
});

// POST /api/sales
router.post('/', auth, requireRole('pharmacy'), [
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('items.*.name').notEmpty().withMessage('each item requires a name'),
  body('items.*.qty').isInt({ min: 1 }).withMessage('each item requires qty >= 1'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('each item requires unitPrice >= 0'),
  body('paymentMethod').isIn(['cash', 'card']).withMessage('paymentMethod must be cash or card'),
  body('totalAmount').isFloat({ min: 0 }).withMessage('totalAmount must be >= 0'),
  body('currency').optional().isString().trim(),
  body('prescriptionId').optional().isMongoId(),
  body('patientId').optional().isMongoId(),
], validate, async (req, res, next) => {
  try {
    const pharmacy = await getApprovedPharmacy(req.user.id, res);
    if (!pharmacy) return;

    const { items, paymentMethod, totalAmount, currency, prescriptionId, patientId } = req.body;

    // Verify prescription if provided — check not already dispensed
    if (prescriptionId) {
      if (!mongoose.isValidObjectId(prescriptionId)) {
        return res.status(400).json({ message: 'Invalid prescriptionId' });
      }
      const rx = await Prescription.findById(prescriptionId);
      if (!rx) return res.status(404).json({ message: 'Prescription not found' });
      if (rx.dispensedAt) return res.status(409).json({ message: 'Prescription already dispensed' });
    }

    // Atomically deduct stock for each item that has a productId
    const stockErrors = [];
    for (const item of items) {
      if (!item.productId) continue;
      if (!mongoose.isValidObjectId(item.productId)) {
        return res.status(400).json({ message: `Invalid productId for item "${item.name}"` });
      }
      const updated = await Product.findOneAndUpdate(
        { _id: item.productId, pharmacyId: pharmacy._id, stockQty: { $gte: item.qty } },
        { $inc: { stockQty: -item.qty } },
        { new: true }
      );
      if (!updated) {
        // Check if product exists at all to give a useful error
        const exists = await Product.findOne({ _id: item.productId, pharmacyId: pharmacy._id });
        if (!exists) {
          stockErrors.push(`Product not found: ${item.name}`);
        } else {
          stockErrors.push(`Insufficient stock for ${item.name}`);
        }
      }
    }

    if (stockErrors.length > 0) {
      return res.status(409).json({ message: stockErrors[0], errors: stockErrors });
    }

    const sale = await Sale.create({
      pharmacyId:    pharmacy._id,
      items,
      prescriptionId: prescriptionId || null,
      patientId:      patientId      || null,
      totalAmount,
      currency:       currency || 'SAR',
      paymentMethod,
      dispensedBy:   req.user.id,
    });

    // Mark prescription as dispensed (atomic — only if still not dispensed)
    if (prescriptionId) {
      await Prescription.findOneAndUpdate(
        { _id: prescriptionId, dispensedAt: null },
        { $set: { dispensedAt: new Date(), dispensedBy: pharmacy._id } }
      );
    }

    res.status(201).json(sale);
  } catch (err) { next(err); }
});

// GET /api/sales
router.get('/', auth, requireRole('pharmacy'), async (req, res, next) => {
  try {
    const pharmacy = await getApprovedPharmacy(req.user.id, res);
    if (!pharmacy) return;

    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const [sales, total] = await Promise.all([
      Sale.find({ pharmacyId: pharmacy._id })
        .populate('dispensedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Sale.countDocuments({ pharmacyId: pharmacy._id }),
    ]);
    res.json({ sales, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// GET /api/sales/:id
router.get('/:id', auth, requireRole('pharmacy'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const pharmacy = await getApprovedPharmacy(req.user.id, res);
    if (!pharmacy) return;

    const sale = await Sale.findOne({ _id: req.params.id, pharmacyId: pharmacy._id })
      .populate('dispensedBy', 'name');
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json(sale);
  } catch (err) { next(err); }
});

module.exports = router;
