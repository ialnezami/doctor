const express  = require('express');
const multer   = require('multer');
const mongoose = require('mongoose');
const { v2: cloudinary } = require('cloudinary');
const auth        = require('../middleware/auth');
const Appointment = require('../models/Appointment');
const Message     = require('../models/Message');

const router = express.Router();

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Only images (JPEG/PNG/WebP) and PDFs are allowed'));
    }
    cb(null, true);
  },
});

async function assertParty(appointmentId, userId, res) {
  if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
    res.status(400).json({ message: 'Invalid appointment id' });
    return null;
  }
  const appt = await Appointment.findById(appointmentId).lean();
  if (!appt) {
    res.status(404).json({ message: 'Appointment not found' });
    return null;
  }
  const isParty = String(appt.doctorId) === userId || String(appt.patientId) === userId;
  if (!isParty) {
    res.status(403).json({ message: 'Forbidden' });
    return null;
  }
  return appt;
}

/* GET /api/appointments/:id/messages?before=<msgId>&limit=20 */
router.get('/:id/messages', auth, async (req, res) => {
  try {
    const appt = await assertParty(req.params.id, req.user.id, res);
    if (!appt) return;

    const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
    const filter = { appointmentId: req.params.id };

    if (req.query.before) {
      if (!mongoose.Types.ObjectId.isValid(req.query.before)) {
        return res.status(400).json({ message: 'Invalid before cursor' });
      }
      filter._id = { $lt: new mongoose.Types.ObjectId(req.query.before) };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error('[messages] GET error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* POST /api/appointments/:id/messages/upload */
router.post('/:id/messages/upload', auth, chatUpload.single('file'), async (req, res) => {
  try {
    const appt = await assertParty(req.params.id, req.user.id, res);
    if (!appt) return;

    if (!req.file) return res.status(400).json({ message: 'No file provided' });

    const isPdf  = req.file.mimetype === 'application/pdf';
    const folder = 'mediconnect/chat';

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: isPdf ? 'raw' : 'image' },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    res.json({
      fileUrl:  uploadResult.secure_url,
      fileName: req.file.originalname,
      type:     isPdf ? 'file' : 'image',
    });
  } catch (err) {
    console.error('[messages] upload error:', err);
    res.status(500).json({ message: 'Upload failed' });
  }
});

module.exports = router;
