// Tests for GET /api/doctors search — city filter and geo passthrough.

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

const express = require('express');
const request = require('supertest');
const Doctor  = require('../../models/Doctor');
const User    = require('../../models/User');
const router  = require('../doctors');

const app = express();
app.use(express.json());
app.use('/api/doctors', router);

beforeEach(() => jest.clearAllMocks());

function mockUserFind(users = []) {
  const skip   = jest.fn().mockResolvedValue(users);
  const limit  = jest.fn().mockReturnValue({ skip });
  const select = jest.fn().mockReturnValue({ limit });
  User.find = jest.fn().mockReturnValue({ select });
}

// ── GET / - city filter ───────────────────────────────────────────────────────

describe('GET /api/doctors - city filter', () => {
  test('adds $or filter on clinicAddress and locations.address when city is provided', async () => {
    mockUserFind([{ _id: 'u1' }]);
    let capturedQuery;
    Doctor.find = jest.fn().mockImplementation(q => {
      capturedQuery = q;
      return { populate: jest.fn().mockResolvedValue([]) };
    });

    await request(app).get('/api/doctors?city=Riyadh');

    expect(capturedQuery.$or).toHaveLength(2);
    expect(capturedQuery.$or[0].clinicAddress).toBeInstanceOf(RegExp);
    expect(capturedQuery.$or[0].clinicAddress.test('Riyadh Medical Center')).toBe(true);
    expect(capturedQuery.$or[0].clinicAddress.test('Jeddah Clinic')).toBe(false);
    expect(capturedQuery.$or[1]['locations.address']).toBeInstanceOf(RegExp);
    expect(capturedQuery.$or[1]['locations.address'].test('12 Riyadh St')).toBe(true);
  });

  test('escapes regex metacharacters in city param', async () => {
    mockUserFind([{ _id: 'u1' }]);
    Doctor.find = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });

    const res = await request(app).get('/api/doctors?city=New+York+(Downtown)');

    expect(res.status).toBe(200);
    const query = Doctor.find.mock.calls[0][0];
    expect(query.$or[0].clinicAddress.source).toBe('New York \\(Downtown\\)');
  });

  test('omits $or filter when city param is absent', async () => {
    mockUserFind([{ _id: 'u1' }]);
    Doctor.find = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });

    await request(app).get('/api/doctors');

    const query = Doctor.find.mock.calls[0][0];
    expect(query.$or).toBeUndefined();
  });

  test('omits $or filter when city is whitespace only', async () => {
    mockUserFind([{ _id: 'u1' }]);
    Doctor.find = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });

    await request(app).get('/api/doctors?city=   ');

    const query = Doctor.find.mock.calls[0][0];
    expect(query.$or).toBeUndefined();
  });
});
