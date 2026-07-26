'use strict';

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: '507f1f77bcf86cd799439011', role: 'doctor' };
  next();
});
jest.mock('../../middleware/rbac', () => () => (_req, _res, next) => next());

jest.mock('../../models/Doctor');
jest.mock('../../models/Appointment');

// ── Imports ───────────────────────────────────────────────────────────────────

const express     = require('express');
const request     = require('supertest');
const Doctor      = require('../../models/Doctor');
const Appointment = require('../../models/Appointment');
const router      = require('../analytics');

// ── App fixture ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/api/analytics', router);

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  Doctor.findOne = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue(null),
  });

  Appointment.aggregate = jest.fn().mockResolvedValue([]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/analytics/summary', () => {
  it('returns 404 when doctor profile does not exist', async () => {
    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', 'Bearer test');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Doctor profile not found');
  });

  it('returns summary shape with zero values when no appointments exist', async () => {
    const fakeDoctor = { _id: '507f1f77bcf86cd799439012' };

    Doctor.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(fakeDoctor),
    });

    // All 5 aggregations return empty arrays
    Appointment.aggregate.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', 'Bearer test');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('revenue');
    expect(res.body).toHaveProperty('byMonth');
    expect(res.body).toHaveProperty('appointments');
    expect(res.body).toHaveProperty('byVisitType');
    expect(res.body).toHaveProperty('busiestDays');

    expect(res.body.revenue).toEqual({ total: 0, collected: 0, outstanding: 0 });
    expect(res.body.byMonth).toEqual([]);
    expect(res.body.appointments).toEqual({ total: 0, completed: 0, cancelled: 0, pending: 0 });
    expect(res.body.byVisitType).toEqual([]);
    expect(res.body.busiestDays).toEqual([]);
  });

  it('aggregates revenue correctly from revenueAgg', async () => {
    const fakeDoctor = { _id: '507f1f77bcf86cd799439012' };

    Doctor.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(fakeDoctor),
    });

    // Mock the 5 parallel aggregate calls in order:
    // revenueAgg, byMonthAgg, apptAgg, byTypeAgg, byDayAgg
    Appointment.aggregate
      .mockResolvedValueOnce([{ _id: null, total: 500, collected: 300, outstanding: 200 }])
      .mockResolvedValueOnce([{ month: '2026-07', invoiced: 500, collected: 300 }])
      .mockResolvedValueOnce([
        { _id: 'completed', count: 4 },
        { _id: 'cancelled', count: 1 },
        { _id: 'pending',   count: 2 },
      ])
      .mockResolvedValueOnce([{ type: 'initial', count: 5, revenue: 400 }])
      .mockResolvedValueOnce([{ day: 1, count: 3 }]);

    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', 'Bearer test');

    expect(res.status).toBe(200);
    expect(res.body.revenue).toEqual({ total: 500, collected: 300, outstanding: 200 });
    expect(res.body.byMonth).toEqual([{ month: '2026-07', invoiced: 500, collected: 300 }]);
    expect(res.body.appointments).toEqual({ total: 7, completed: 4, cancelled: 1, pending: 2 });
    expect(res.body.byVisitType).toEqual([{ type: 'initial', count: 5, revenue: 400 }]);
    expect(res.body.busiestDays).toEqual([{ day: 1, count: 3 }]);
  });

  it('counts "validated" status as completed', async () => {
    const fakeDoctor = { _id: '507f1f77bcf86cd799439012' };

    Doctor.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(fakeDoctor),
    });

    Appointment.aggregate
      .mockResolvedValueOnce([]) // revenueAgg
      .mockResolvedValueOnce([]) // byMonthAgg
      .mockResolvedValueOnce([
        { _id: 'validated', count: 3 },
        { _id: 'completed', count: 2 },
      ])
      .mockResolvedValueOnce([]) // byTypeAgg
      .mockResolvedValueOnce([]); // byDayAgg

    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', 'Bearer test');

    expect(res.status).toBe(200);
    expect(res.body.appointments.completed).toBe(5); // validated + completed
    expect(res.body.appointments.total).toBe(5);
  });

  it('accepts from/to query params without error', async () => {
    const fakeDoctor = { _id: '507f1f77bcf86cd799439012' };

    Doctor.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(fakeDoctor),
    });

    Appointment.aggregate.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/analytics/summary?from=2026-01-01&to=2026-01-31')
      .set('Authorization', 'Bearer test');

    expect(res.status).toBe(200);
  });

  it('returns 400 when from/to params have invalid date format', async () => {
    const fakeDoctor = { _id: '507f1f77bcf86cd799439012' };

    Doctor.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(fakeDoctor),
    });

    const res = await request(app)
      .get('/api/analytics/summary?from=not-a-date&to=2026-01-31')
      .set('Authorization', 'Bearer test');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/YYYY-MM-DD/);
  });

  it('returns 400 when to param has invalid date format', async () => {
    const fakeDoctor = { _id: '507f1f77bcf86cd799439012' };

    Doctor.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(fakeDoctor),
    });

    const res = await request(app)
      .get('/api/analytics/summary?from=2026-01-01&to=invalid')
      .set('Authorization', 'Bearer test');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/YYYY-MM-DD/);
  });
});
