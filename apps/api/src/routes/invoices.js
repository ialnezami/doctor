'use strict';

const router      = require('express').Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Appointment = require('../models/Appointment');
const Doctor      = require('../models/Doctor');
const User        = require('../models/User');
const mongoose    = require('mongoose');

const doctorOnly = [auth, requireRole('doctor')];

// GET /api/invoices
router.get('/', doctorOnly, async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id }).select('_id');
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const { status = 'all', page = 1, limit = 20 } = req.query;
    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.min(100, parseInt(limit) || 20);

    const filter = { doctorId: doctor._id };
    if (status === 'paid')   filter.paymentStatus = 'paid';
    if (status === 'unpaid') filter.paymentStatus = 'unpaid';

    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .sort({ date: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('patientId', 'name')
        .lean(),
      Appointment.countDocuments(filter),
    ]);

    // Summary always over ALL statuses for this doctor (ignore page filter)
    const [summary] = await Appointment.aggregate([
      { $match: { doctorId: doctor._id } },
      { $group: {
        _id: null,
        total:       { $sum: '$invoiceAmount' },
        collected:   { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$invoiceAmount', 0] } },
        outstanding: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'unpaid'] }, '$invoiceAmount', 0] } },
      }},
    ]);

    const invoices = appointments.map(a => ({
      _id:           a._id,
      patientName:   a.patientId?.name || 'مجهول',
      date:          a.date,
      visitType:     a.visitType,
      invoiceAmount: a.invoiceAmount,
      paymentStatus: a.paymentStatus,
      locationName:  a.locationName || '',
      status:        a.status,
    }));

    res.json({
      invoices,
      summary: summary
        ? { total: summary.total, collected: summary.collected, outstanding: summary.outstanding }
        : { total: 0, collected: 0, outstanding: 0 },
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) { next(err); }
});

// PATCH /api/invoices/:appointmentId/pay
router.patch('/:appointmentId/pay', doctorOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const doctor = await Doctor.findOne({ userId: req.user.id }).select('_id');
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.appointmentId, doctorId: doctor._id },
      { paymentStatus: 'paid' },
      { new: true }
    ).populate('patientId', 'name');

    if (!appt) return res.status(404).json({ message: 'Invoice not found' });

    res.json({
      invoice: {
        _id:           appt._id,
        patientName:   appt.patientId?.name || 'مجهول',
        date:          appt.date,
        visitType:     appt.visitType,
        invoiceAmount: appt.invoiceAmount,
        paymentStatus: appt.paymentStatus,
        locationName:  appt.locationName || '',
        status:        appt.status,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
