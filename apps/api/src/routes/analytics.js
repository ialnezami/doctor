'use strict';

const router      = require('express').Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Appointment = require('../models/Appointment');
const Doctor      = require('../models/Doctor');

const doctorOnly = [auth, requireRole('doctor')];

// GET /api/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/summary', doctorOnly, async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id }).select('_id');
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    // Validate from/to date format
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if ((req.query.from && !ISO_DATE.test(req.query.from)) ||
        (req.query.to   && !ISO_DATE.test(req.query.to))) {
      return res.status(400).json({ message: 'from and to must be in YYYY-MM-DD format' });
    }

    // Default: current calendar month
    const now   = new Date();
    const from  = req.query.from
      ? new Date(req.query.from + 'T00:00:00.000Z')
      : new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const to    = req.query.to
      ? new Date(req.query.to + 'T23:59:59.999Z')
      : new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

    const match = { doctorId: doctor._id, date: { $gte: from, $lte: to } };

    const [revenueAgg, byMonthAgg, apptAgg, byTypeAgg, byDayAgg] = await Promise.all([
      // Revenue totals
      Appointment.aggregate([
        { $match: match },
        { $group: {
          _id: null,
          total:       { $sum: '$invoiceAmount' },
          collected:   { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$invoiceAmount', 0] } },
          outstanding: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'unpaid'] }, '$invoiceAmount', 0] } },
        }},
      ]),
      // By month
      Appointment.aggregate([
        { $match: match },
        { $group: {
          _id:       { $dateToString: { format: '%Y-%m', date: '$date' } },
          invoiced:  { $sum: '$invoiceAmount' },
          collected: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$invoiceAmount', 0] } },
        }},
        { $sort: { _id: 1 } },
        { $project: { _id: 0, month: '$_id', invoiced: 1, collected: 1 } },
      ]),
      // Appointments by status
      Appointment.aggregate([
        { $match: match },
        { $group: {
          _id:   '$status',
          count: { $sum: 1 },
        }},
      ]),
      // By visit type
      Appointment.aggregate([
        { $match: match },
        { $group: {
          _id:     '$visitType',
          count:   { $sum: 1 },
          revenue: { $sum: '$invoiceAmount' },
        }},
        { $project: { _id: 0, type: '$_id', count: 1, revenue: 1 } },
      ]),
      // Busiest days (0=Sun … 6=Sat)
      Appointment.aggregate([
        { $match: match },
        { $group: {
          _id:   { $dayOfWeek: '$date' }, // Mongo: 1=Sun … 7=Sat
          count: { $sum: 1 },
        }},
        { $project: { _id: 0, day: { $subtract: ['$_id', 1] }, count: 1 } }, // convert to 0-based
        { $sort: { day: 1 } },
      ]),
    ]);

    // Build appointments count object
    const apptCounts = { total: 0, completed: 0, cancelled: 0, pending: 0 };
    for (const { _id, count } of apptAgg) {
      apptCounts.total += count;
      if (_id === 'completed' || _id === 'validated') apptCounts.completed += count;
      else if (_id === 'cancelled') apptCounts.cancelled += count;
      else if (_id === 'pending')   apptCounts.pending   += count;
    }

    res.json({
      revenue:      revenueAgg[0] ? { total: revenueAgg[0].total, collected: revenueAgg[0].collected, outstanding: revenueAgg[0].outstanding } : { total: 0, collected: 0, outstanding: 0 },
      byMonth:      byMonthAgg,
      appointments: apptCounts,
      byVisitType:  byTypeAgg,
      busiestDays:  byDayAgg,
    });
  } catch (err) { next(err); }
});

module.exports = router;
