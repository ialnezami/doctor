const mongoose = require('mongoose');
const router = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Pharmacy = require('../models/Pharmacy');
const Product  = require('../models/Product');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

const UNIT_ENUM = ['tablet', 'capsule', 'ml', 'mg', 'box', 'sachet', 'other'];

async function getApprovedPharmacy(userId, res) {
  const pharmacy = await Pharmacy.findOne({ userId });
  if (!pharmacy) { res.status(404).json({ message: 'Pharmacy profile not found' }); return null; }
  if (!pharmacy.isApproved) { res.status(403).json({ message: 'Pharmacy account pending approval' }); return null; }
  return pharmacy;
}

// GET /api/products
router.get('/', auth, requireRole('pharmacy'), [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim(),
], validate, async (req, res, next) => {
  try {
    const pharmacy = await getApprovedPharmacy(req.user.id, res);
    if (!pharmacy) return;

    const page  = req.query.page  || 1;
    const limit = req.query.limit || 20;
    const skip  = (page - 1) * limit;

    const filter = { pharmacyId: pharmacy._id };
    if (req.query.search) {
      const re = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.name = re;
    }

    const [products, total] = await Promise.all([
      Product.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json({ products, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// POST /api/products
router.post('/', auth, requireRole('pharmacy'), [
  body('name').notEmpty().trim().withMessage('name required'),
  body('barcode').notEmpty().trim().withMessage('barcode required'),
  body('price').isFloat({ min: 0 }).withMessage('price must be >= 0'),
  body('unit').optional().isIn(UNIT_ENUM).withMessage('invalid unit'),
  body('stockQty').optional().isInt({ min: 0 }),
  body('lowStockThreshold').optional().isInt({ min: 0 }),
  body('currency').optional().isString().trim(),
  body('description').optional().isString().trim(),
], validate, async (req, res, next) => {
  try {
    const pharmacy = await getApprovedPharmacy(req.user.id, res);
    if (!pharmacy) return;

    const { name, barcode, price, unit, stockQty, lowStockThreshold, currency, description } = req.body;
    const product = await Product.create({
      pharmacyId: pharmacy._id,
      name, barcode, price,
      ...(unit              !== undefined && { unit }),
      ...(stockQty          !== undefined && { stockQty }),
      ...(lowStockThreshold !== undefined && { lowStockThreshold }),
      ...(currency          !== undefined && { currency }),
      ...(description       !== undefined && { description }),
    });
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A product with this barcode already exists in your inventory' });
    next(err);
  }
});

// GET /api/products/:id
router.get('/:id', auth, requireRole('pharmacy'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const pharmacy = await getApprovedPharmacy(req.user.id, res);
    if (!pharmacy) return;

    const product = await Product.findOne({ _id: req.params.id, pharmacyId: pharmacy._id });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) { next(err); }
});

// PATCH /api/products/:id
router.patch('/:id', auth, requireRole('pharmacy'), [
  body('name').optional().notEmpty().trim(),
  body('barcode').optional().notEmpty().trim(),
  body('price').optional().isFloat({ min: 0 }),
  body('unit').optional().isIn(UNIT_ENUM),
  body('stockQty').optional().isInt({ min: 0 }),
  body('lowStockThreshold').optional().isInt({ min: 0 }),
  body('currency').optional().isString().trim(),
  body('description').optional().isString().trim(),
], validate, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const pharmacy = await getApprovedPharmacy(req.user.id, res);
    if (!pharmacy) return;

    const allowed = ['name', 'barcode', 'price', 'unit', 'stockQty', 'lowStockThreshold', 'currency', 'description'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, pharmacyId: pharmacy._id },
      { $set: update },
      { new: true }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A product with this barcode already exists in your inventory' });
    next(err);
  }
});

// DELETE /api/products/:id
router.delete('/:id', auth, requireRole('pharmacy'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const pharmacy = await getApprovedPharmacy(req.user.id, res);
    if (!pharmacy) return;

    const product = await Product.findOneAndDelete({ _id: req.params.id, pharmacyId: pharmacy._id });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

// PATCH /api/products/:id/stock — adjust stock by delta (can be negative, floor at 0)
router.patch('/:id/stock', auth, requireRole('pharmacy'), [
  body('delta').isInt().withMessage('delta must be an integer'),
], validate, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const pharmacy = await getApprovedPharmacy(req.user.id, res);
    if (!pharmacy) return;

    const delta = parseInt(req.body.delta);

    if (delta < 0) {
      // Atomic deduction — only succeeds if result >= 0
      const product = await Product.findOneAndUpdate(
        { _id: req.params.id, pharmacyId: pharmacy._id, stockQty: { $gte: -delta } },
        { $inc: { stockQty: delta } },
        { new: true }
      );
      if (!product) {
        const exists = await Product.findOne({ _id: req.params.id, pharmacyId: pharmacy._id });
        if (!exists) return res.status(404).json({ message: 'Product not found' });
        return res.status(409).json({ message: 'Insufficient stock' });
      }
      return res.json(product);
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, pharmacyId: pharmacy._id },
      { $inc: { stockQty: delta } },
      { new: true }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) { next(err); }
});

module.exports = router;
