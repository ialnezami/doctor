const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const SharedLink = require('../models/SharedLink');
const LabResult = require('../models/LabResult');
const Prescription = require('../models/Prescription');

const EXPIRY_PRESETS = { '1h': 60 * 60, '24h': 24 * 60 * 60, '7d': 7 * 24 * 60 * 60 };

async function fetchResource(resourceType, resourceId) {
  if (resourceType === 'lab_result') return LabResult.findById(resourceId);
  if (resourceType === 'prescription') return Prescription.findById(resourceId);
  return null;
}

// L-14: create share link (auth required, owner only)
router.post('/', auth, async (req, res, next) => {
  try {
    const { resourceType, resourceId, password, expiry } = req.body;

    if (!['lab_result', 'prescription'].includes(resourceType))
      return res.status(400).json({ message: 'Invalid resourceType' });

    const resource = await fetchResource(resourceType, resourceId);
    if (!resource) return res.status(404).json({ message: 'Resource not found' });

    const uid = req.user.id.toString();
    const isOwner = resource.patientId?.toString() === uid || resource.doctorId?.toString() === uid;
    if (!isOwner) return res.status(403).json({ message: 'Forbidden' });

    const token = crypto.randomBytes(32).toString('hex');
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    let expiresAt = null;
    if (expiry && EXPIRY_PRESETS[expiry]) {
      expiresAt = new Date(Date.now() + EXPIRY_PRESETS[expiry] * 1000);
    }

    const link = await SharedLink.create({
      resourceType,
      resourceId,
      ownerId: req.user.id,
      token,
      passwordHash,
      expiresAt,
    });

    res.status(201).json({
      token: link.token,
      url: `/s/${link.token}`,
      expiresAt: link.expiresAt,
      hasPassword: !!password,
    });
  } catch (err) { next(err); }
});

// L-15: public viewer (no auth, password gate if set)
router.get('/:token', async (req, res, next) => {
  try {
    const link = await SharedLink.findOne({ token: req.params.token });
    if (!link) return res.status(404).json({ message: 'Link not found' });
    if (link.revokedAt) return res.status(410).json({ message: 'Link revoked' });
    if (link.expiresAt && link.expiresAt < new Date())
      return res.status(410).json({ message: 'Link expired' });

    if (link.passwordHash) {
      const provided = req.headers['x-share-password'] || req.query.password;
      if (!provided) return res.status(401).json({ message: 'Password required' });
      const ok = await bcrypt.compare(provided, link.passwordHash);
      if (!ok) return res.status(401).json({ message: 'Wrong password' });
    }

    const resource = await fetchResource(link.resourceType, link.resourceId);
    if (!resource) return res.status(404).json({ message: 'Resource not found' });

    link.viewCount += 1;
    await link.save();

    res.json({ resourceType: link.resourceType, resource });
  } catch (err) { next(err); }
});

// L-16: revoke link (auth required, owner only)
router.delete('/:token', auth, async (req, res, next) => {
  try {
    const link = await SharedLink.findOne({ token: req.params.token });
    if (!link) return res.status(404).json({ message: 'Link not found' });
    if (link.ownerId.toString() !== req.user.id)
      return res.status(403).json({ message: 'Forbidden' });

    link.revokedAt = new Date();
    await link.save();
    res.json({ message: 'Link revoked' });
  } catch (err) { next(err); }
});

module.exports = router;
