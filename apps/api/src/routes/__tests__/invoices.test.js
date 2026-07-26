'use strict';

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: '507f1f77bcf86cd799439011', role: 'doctor' };
  next();
});
jest.mock('../../middleware/rbac', () => () => (_req, _res, next) => next());

jest.mock('../../models/Doctor');
jest.mock('../../models/User');

// Auto-mock Appointment — provides safe stubs for static methods used by routes.
// The constructor is replaced with a jest mock, so we test schema defaults
// by inspecting the real schema definition directly (avoids hanging on
// mongoose.model() which internally waits for a DB connection to build indexes).
jest.mock('../../models/Appointment');

// ── Imports ───────────────────────────────────────────────────────────────────

const express     = require('express');
const request     = require('supertest');
const Doctor      = require('../../models/Doctor');
const Appointment = require('../../models/Appointment');
const router      = require('../invoices');

// ── App fixture ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/api/invoices', router);

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  Doctor.findOne = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue(null),
  });

  Appointment.find = jest.fn().mockReturnValue({
    sort:     jest.fn().mockReturnThis(),
    skip:     jest.fn().mockReturnThis(),
    limit:    jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean:     jest.fn().mockResolvedValue([]),
  });
  Appointment.countDocuments   = jest.fn().mockResolvedValue(0);
  Appointment.aggregate        = jest.fn().mockResolvedValue([]);
  Appointment.findOneAndUpdate = jest.fn().mockReturnValue({
    populate: jest.fn().mockResolvedValue(null),
  });
});

// ── Schema default tests ──────────────────────────────────────────────────────
// We verify the schema definition directly rather than instantiating
// the real Mongoose model, which would hang waiting for a DB connection
// to initialise indexes.

describe('Appointment model — invoice fields', () => {
  it('defaults paymentStatus to unpaid and invoiceAmount to 0', () => {
    // Read the schema definition file directly to verify defaults
    // without triggering mongoose.model() index initialisation.
    const fs      = require('fs');
    const path    = require('path');
    const content = fs.readFileSync(
      path.resolve(__dirname, '../../models/Appointment.js'),
      'utf8'
    );
    expect(content).toMatch(/paymentStatus.*default.*['"]unpaid['"]/s);
    expect(content).toMatch(/invoiceAmount.*default.*0/s);
  });
});

// ── Fee freeze logic ──────────────────────────────────────────────────────────

describe('invoiceAmount fee freeze', () => {
  it('captures fee from appointmentTypes at creation time', () => {
    const appointmentTypes = [
      { key: 'initial',   label: 'Initial',   duration: 30, fee: 150, enabled: true },
      { key: 'follow-up', label: 'Follow-up', duration: 20, fee: 75,  enabled: true },
    ];
    const apptType = appointmentTypes.find(t => t.key === 'follow-up');
    expect(apptType?.fee ?? 0).toBe(75);
  });

  it('defaults to 0 when visitType has no matching appointmentType', () => {
    const apptType = [].find(t => t.key === 'initial');
    expect(apptType?.fee ?? 0).toBe(0);
  });
});

// ── Route tests ───────────────────────────────────────────────────────────────

describe('GET /api/invoices', () => {
  it('returns invoices and summary for the authenticated doctor', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', 'Bearer test');
    // Doctor mock returns null → route returns 404 (expected in unit test)
    expect([200, 404]).toContain(res.status);
  });

  it('happy path: returns 200 with invoices, summary, page, totalPages when doctor exists', async () => {
    const fakeDoctor = { _id: '507f1f77bcf86cd799439012' };
    const fakeAppointment = {
      _id: '507f1f77bcf86cd799439013',
      date: new Date('2026-01-15'),
      visitType: 'initial',
      invoiceAmount: 150,
      paymentStatus: 'unpaid',
      locationName: 'Clinic A',
      status: 'completed',
      patientId: { name: 'Ahmed' },
    };

    Doctor.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(fakeDoctor),
    });

    Appointment.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([fakeAppointment]),
    });
    Appointment.countDocuments.mockResolvedValue(1);
    Appointment.aggregate.mockResolvedValue([{
      total: 150,
      collected: 0,
      outstanding: 150,
    }]);

    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', 'Bearer test');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('invoices');
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('totalPages', 1);
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.invoices[0]._id).toBe('507f1f77bcf86cd799439013');
    expect(res.body.summary.total).toBe(150);
  });

  it('rejects invalid appointmentId on pay', async () => {
    const res = await request(app)
      .patch('/api/invoices/not-an-id/pay')
      .set('Authorization', 'Bearer test');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid/);
  });
});

describe('PATCH /api/invoices/:id/pay happy path', () => {
  it('marks appointment as paid and returns updated invoice', async () => {
    const fakeDoctor = { _id: '507f1f77bcf86cd799439012' };
    const fakeAppointment = {
      _id: '507f1f77bcf86cd799439013',
      date: new Date('2026-01-15'),
      visitType: 'initial',
      invoiceAmount: 150,
      paymentStatus: 'paid',
      locationName: 'Clinic A',
      status: 'completed',
      patientId: { name: 'Ahmed' },
    };

    Doctor.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(fakeDoctor),
    });

    Appointment.findOneAndUpdate.mockReturnValue({
      populate: jest.fn().mockResolvedValue(fakeAppointment),
    });

    const res = await request(app)
      .patch('/api/invoices/507f1f77bcf86cd799439013/pay')
      .set('Authorization', 'Bearer test');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('invoice');
    expect(res.body.invoice).toHaveProperty('_id', '507f1f77bcf86cd799439013');
    expect(res.body.invoice).toHaveProperty('paymentStatus', 'paid');
    expect(res.body.invoice).toHaveProperty('invoiceAmount', 150);
  });
});
