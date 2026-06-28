const router           = require('express').Router({ mergeParams: true });
const { body, validationResult } = require('express-validator');
const mongoose         = require('mongoose');
const auth             = require('../middleware/auth');
const Appointment      = require('../models/Appointment');
const ConsultationNote = require('../models/ConsultationNote');
const ReadEvent        = require('../models/ReadEvent');
const Notification     = require('../models/Notification');
const User             = require('../models/User');
const { sendPush }     = require('../utils/push');
const { getNoteQueue } = require('../queues/reminderQueue');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

async function getApptForDoctor(apptId, doctorId) {
  if (!mongoose.isValidObjectId(apptId)) return null;
  return Appointment.findOne({ _id: apptId, doctorId });
}

async function getApptForParty(apptId, userId) {
  if (!mongoose.isValidObjectId(apptId)) return null;
  return Appointment.findOne({ _id: apptId, $or: [{ doctorId: userId }, { patientId: userId }] });
}

// POST /api/appointments/:apptId/notes
router.post('/:apptId/notes', auth, [
  body('content').notEmpty().isLength({ max: 5000 }).withMessage('content required, max 5000 chars'),
  body('visibility').isIn(['private', 'shared']).withMessage('visibility must be private or shared'),
], validate, async (req, res, next) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctors only' });
    const appt = await getApptForDoctor(req.params.apptId, req.user.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (appt.status === 'validated') return res.status(409).json({ message: 'Cannot add notes to a validated appointment' });

    const note = await ConsultationNote.create({
      appointmentId: appt._id,
      authorId: req.user.id,
      content: req.body.content,
      visibility: req.body.visibility,
    });
    res.status(201).json({ note });
  } catch (err) { next(err); }
});

// GET /api/appointments/:apptId/notes
router.get('/:apptId/notes', auth, async (req, res, next) => {
  try {
    const appt = await getApptForParty(req.params.apptId, req.user.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });

    const filter = { appointmentId: appt._id };
    if (req.user.role === 'patient') filter.visibility = 'shared';

    const notes = await ConsultationNote.find(filter).sort({ createdAt: 1 });
    res.json({ notes });
  } catch (err) { next(err); }
});

// PATCH /api/appointments/:apptId/notes/:noteId
router.patch('/:apptId/notes/:noteId', auth, [
  body('content').optional().notEmpty().isLength({ max: 5000 }),
  body('visibility').optional().isIn(['private', 'shared']),
], validate, async (req, res, next) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctors only' });
    const appt = await getApptForDoctor(req.params.apptId, req.user.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (appt.status === 'validated') return res.status(409).json({ message: 'Cannot edit notes on a validated appointment' });

    if (!mongoose.isValidObjectId(req.params.noteId)) return res.status(400).json({ message: 'Invalid noteId' });
    const { content, visibility } = req.body;
    const update = {};
    if (content !== undefined) update.content = content;
    if (visibility !== undefined) update.visibility = visibility;

    const note = await ConsultationNote.findOneAndUpdate(
      { _id: req.params.noteId, appointmentId: appt._id },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!note) return res.status(404).json({ message: 'Note not found' });
    res.json({ note });
  } catch (err) { next(err); }
});

// DELETE /api/appointments/:apptId/notes/:noteId
router.delete('/:apptId/notes/:noteId', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctors only' });
    const appt = await getApptForDoctor(req.params.apptId, req.user.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (appt.status === 'validated') return res.status(409).json({ message: 'Cannot delete notes on a validated appointment' });

    if (!mongoose.isValidObjectId(req.params.noteId)) return res.status(400).json({ message: 'Invalid noteId' });
    const note = await ConsultationNote.findOneAndDelete({ _id: req.params.noteId, appointmentId: appt._id });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/appointments/:apptId/notes/:noteId/analyze — queue AI analysis
router.post('/:apptId/notes/:noteId/analyze', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctors only' });
    if (!mongoose.isValidObjectId(req.params.noteId)) return res.status(400).json({ message: 'Invalid noteId' });

    const appt = await getApptForDoctor(req.params.apptId, req.user.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });

    const note = await ConsultationNote.findOne({ _id: req.params.noteId, appointmentId: appt._id });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (String(note.authorId) !== String(req.user.id)) return res.status(403).json({ message: 'Not the note author' });

    await getNoteQueue().add('analyze-note', { noteId: String(note._id) });

    res.status(202).json({ message: 'Analysis queued' });
  } catch (err) { next(err); }
});

// POST /api/appointments/:apptId/read — doctor marks notes as read
router.post('/:apptId/read', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctors only' });
    const appt = await getApptForDoctor(req.params.apptId, req.user.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });

    const existing = await ReadEvent.findOne({ appointmentId: appt._id, doctorId: req.user.id });
    const readEvent = await ReadEvent.findOneAndUpdate(
      { appointmentId: appt._id, doctorId: req.user.id },
      { readAt: new Date() },
      { upsert: true, new: true }
    );

    // Notify patient on first read OR re-read after 24 h cooldown
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const shouldNotify = !existing || (Date.now() - new Date(existing.readAt).getTime() >= COOLDOWN_MS);
    if (shouldNotify) {
      const doctorUser = await User.findById(req.user.id).select('name');
      const patient    = await User.findById(appt.patientId).select('fcmToken notificationPrefs');
      await Notification.create({
        recipientId: appt.patientId,
        type: 'notes_viewed',
        payload: {
          appointmentId: appt._id,
          message: `Dr. ${doctorUser?.name || 'Your doctor'} reviewed your consultation`,
        },
      });
      const patientPrefs = patient?.notificationPrefs || {};
      if (patient?.fcmToken && patientPrefs.pushEnabled !== false) {
        await sendPush(
          patient.fcmToken,
          'Consultation reviewed',
          `Dr. ${doctorUser?.name || 'Your doctor'} reviewed your consultation`,
          { appointmentId: String(appt._id) }
        );
      }
    }

    res.json({ readEvent });
  } catch (err) { next(err); }
});

module.exports = router;
