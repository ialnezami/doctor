// Regression tests for doctor location CRUD endpoints.
// Covers the zero-locations bug (booking showed "Please select a location"
// with nothing to select) and full location lifecycle.

jest.mock('../../models/Doctor');
jest.mock('../../models/Appointment');
jest.mock('../../models/User');
jest.mock('../../models/Review');
jest.mock('../../models/PlatformSettings', () => ({
  PlatformSettings: { getOrCreate: jest.fn().mockResolvedValue({ currencies: [{ code: 'SAR', name: 'Saudi Riyal' }] }) },
  SUPPORTED_CURRENCIES: ['SAR'],
}));
jest.mock('../../middleware/upload', () => ({ single: () => (_req, _res, next) => next() }));
jest.mock('../../utils/cloudinary', () => ({ uploadBuffer: jest.fn() }));

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'user1', role: 'doctor' };
  next();
});
jest.mock('../../middleware/rbac', () => (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ message: 'Forbidden' });
  next();
});

const express     = require('express');
const request     = require('supertest');
const Doctor      = require('../../models/Doctor');
const Appointment = require('../../models/Appointment');
const router      = require('../doctors');

const app = express();
app.use(express.json());
app.use('/api/doctors', router);

beforeEach(() => jest.clearAllMocks());

function makeLoc(overrides = {}) {
  return { _id: 'loc1', name: 'Main Clinic', address: '1 Main St', type: 'bookable', slots: [], deleteOne: jest.fn(), ...overrides };
}

function makeMockDoctor(locs = []) {
  const locsArr = [...locs];
  locsArr.id = jest.fn(id => locsArr.find(l => l._id === id) ?? null);
  return {
    _id: 'doc1',
    userId: 'user1',
    locations: locsArr,
    save: jest.fn().mockResolvedValue(true),
  };
}

// ── GET /:id/locations (public) ───────────────────────────────────────────────

describe('GET /api/doctors/:id/locations', () => {
  test('returns empty array when doctor has no locations configured', async () => {
    // Regression: this is the zero-locations case that caused the "Please select
    // a location" error with nothing to select on the booking page.
    const doctor = makeMockDoctor([]);
    Doctor.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(doctor) });

    const res = await request(app).get('/api/doctors/doc1/locations');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  test('returns all locations when doctor has them', async () => {
    const locs = [
      makeLoc({ _id: 'loc1', name: 'Main Clinic', type: 'bookable' }),
      makeLoc({ _id: 'loc2', name: 'City Hospital', type: 'hospital' }),
    ];
    const doctor = makeMockDoctor(locs);
    Doctor.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(doctor) });

    const res = await request(app).get('/api/doctors/doc1/locations');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('returns 404 when doctor not found', async () => {
    Doctor.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const res = await request(app).get('/api/doctors/unknown/locations');

    expect(res.status).toBe(404);
  });
});

// ── POST /me/locations ────────────────────────────────────────────────────────

describe('POST /api/doctors/me/locations', () => {
  test('400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/doctors/me/locations')
      .send({ type: 'bookable' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name/i);
  });

  test('400 when type is missing', async () => {
    const res = await request(app)
      .post('/api/doctors/me/locations')
      .send({ name: 'Clinic A' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/type/i);
  });

  test('400 when type is not bookable or hospital', async () => {
    const res = await request(app)
      .post('/api/doctors/me/locations')
      .send({ name: 'Clinic A', type: 'virtual' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/type/i);
  });

  test('404 when doctor profile not found', async () => {
    Doctor.findOne = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .post('/api/doctors/me/locations')
      .send({ name: 'Clinic A', type: 'bookable' });

    expect(res.status).toBe(404);
  });

  test('201 and calls save on success with bookable type', async () => {
    const doctor = makeMockDoctor([]);
    Doctor.findOne = jest.fn().mockResolvedValue(doctor);

    const res = await request(app)
      .post('/api/doctors/me/locations')
      .send({ name: 'Main Clinic', address: '1 Main St', type: 'bookable' });

    expect(res.status).toBe(201);
    expect(doctor.save).toHaveBeenCalledTimes(1);
    expect(doctor.locations).toHaveLength(1);
    expect(doctor.locations[0].name).toBe('Main Clinic');
    expect(doctor.locations[0].type).toBe('bookable');
  });

  test('201 with hospital type — slots array is empty regardless of input', async () => {
    const doctor = makeMockDoctor([]);
    Doctor.findOne = jest.fn().mockResolvedValue(doctor);

    const res = await request(app)
      .post('/api/doctors/me/locations')
      .send({ name: 'General Hospital', type: 'hospital', slots: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }] });

    expect(res.status).toBe(201);
    expect(doctor.locations[0].slots).toEqual([]);
  });
});

// ── PATCH /me/locations/:locId ────────────────────────────────────────────────

describe('PATCH /api/doctors/me/locations/:locId', () => {
  test('404 when doctor not found', async () => {
    Doctor.findOne = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/doctors/me/locations/loc1')
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(404);
  });

  test('404 when location not found on doctor', async () => {
    const doctor = makeMockDoctor([]); // no locations
    Doctor.findOne = jest.fn().mockResolvedValue(doctor);

    const res = await request(app)
      .patch('/api/doctors/me/locations/loc-missing')
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
  });

  test('400 when updating type to invalid value', async () => {
    const loc = makeLoc();
    const doctor = makeMockDoctor([loc]);
    Doctor.findOne = jest.fn().mockResolvedValue(doctor);

    const res = await request(app)
      .patch('/api/doctors/me/locations/loc1')
      .send({ type: 'virtual' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/type/i);
  });

  test('200 and saves on valid update', async () => {
    const loc = makeLoc();
    const doctor = makeMockDoctor([loc]);
    Doctor.findOne = jest.fn().mockResolvedValue(doctor);

    const res = await request(app)
      .patch('/api/doctors/me/locations/loc1')
      .send({ name: 'Renamed Clinic', address: '42 New St' });

    expect(res.status).toBe(200);
    expect(loc.name).toBe('Renamed Clinic');
    expect(loc.address).toBe('42 New St');
    expect(doctor.save).toHaveBeenCalledTimes(1);
  });
});

// ── DELETE /me/locations/:locId ───────────────────────────────────────────────

describe('DELETE /api/doctors/me/locations/:locId', () => {
  test('404 when location not found', async () => {
    const doctor = makeMockDoctor([]);
    Doctor.findOne = jest.fn().mockResolvedValue(doctor);

    const res = await request(app).delete('/api/doctors/me/locations/loc-missing');

    expect(res.status).toBe(404);
  });

  test('400 when location has upcoming appointments', async () => {
    const loc = makeLoc();
    const doctor = makeMockDoctor([loc]);
    Doctor.findOne = jest.fn().mockResolvedValue(doctor);
    Appointment.findOne = jest.fn().mockResolvedValue({ _id: 'appt1' }); // future appt exists

    const res = await request(app).delete('/api/doctors/me/locations/loc1');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/upcoming appointments/i);
    expect(loc.deleteOne).not.toHaveBeenCalled();
  });

  test('200 and removes location when no upcoming appointments', async () => {
    const loc = makeLoc();
    const doctor = makeMockDoctor([loc]);
    Doctor.findOne = jest.fn().mockResolvedValue(doctor);
    Appointment.findOne = jest.fn().mockResolvedValue(null); // no future appts

    const res = await request(app).delete('/api/doctors/me/locations/loc1');

    expect(res.status).toBe(200);
    expect(loc.deleteOne).toHaveBeenCalledTimes(1);
    expect(doctor.save).toHaveBeenCalledTimes(1);
  });
});
