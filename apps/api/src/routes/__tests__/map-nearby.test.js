jest.mock('../../models/Doctor');
jest.mock('../../models/Lab');
const Doctor = require('../../models/Doctor');
const Lab    = require('../../models/Lab');

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'u1', role: 'patient' };
  next();
});
jest.mock('../../middleware/rbac', () => (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ message: 'Forbidden' });
  next();
});

const express = require('express');
const request = require('supertest');
const router  = require('../map');

const app = express();
app.use(express.json());
app.use('/api/map', router);

beforeEach(() => jest.clearAllMocks());

const VALID_BBOX = { swLat: 24.6, swLng: 46.5, neLat: 24.8, neLng: 46.8 };

function mockChain(result) {
  const chain = { select: jest.fn(), populate: jest.fn(), limit: jest.fn(), lean: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.populate.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockResolvedValue(result);
  return chain;
}

test('GET /nearby returns 400 when swLat is missing', async () => {
  const res = await request(app).get('/api/map/nearby').query({ swLng: 46.5, neLat: 24.8, neLng: 46.8 });
  expect(res.status).toBe(400);
});

test('GET /nearby returns 400 when neLat <= swLat', async () => {
  const res = await request(app).get('/api/map/nearby').query({ swLat: 24.8, swLng: 46.5, neLat: 24.6, neLng: 46.8 });
  expect(res.status).toBe(400);
});


test('GET /nearby returns doctors and labs arrays', async () => {
  Doctor.find = jest.fn().mockReturnValue(mockChain([
    {
      _id: 'd1', userId: { name: 'Dr. Ali' }, specialty: 'Cardiology',
      averageRating: 4.5, reviewCount: 10, photoUrl: '',
      locations: [{ type: 'bookable', coordinates: { type: 'Point', coordinates: [46.7, 24.7] } }],
    },
  ]));
  Lab.find = jest.fn().mockReturnValue(mockChain([
    { _id: 'l1', labName: 'Lab Corp', address: '123 Main', location: { type: 'Point', coordinates: [46.65, 24.72] } },
  ]));
  const res = await request(app).get('/api/map/nearby').query(VALID_BBOX);
  expect(res.status).toBe(200);
  expect(res.body.doctors).toHaveLength(1);
  expect(res.body.doctors[0].type).toBe('doctor');
  expect(res.body.labs).toHaveLength(1);
  expect(res.body.labs[0].type).toBe('lab');
});

test('GET /nearby filters doctors by specialty when provided', async () => {
  Doctor.find = jest.fn().mockReturnValue(mockChain([]));
  Lab.find    = jest.fn().mockReturnValue(mockChain([]));
  await request(app).get('/api/map/nearby').query({ ...VALID_BBOX, specialty: 'Cardiology' });
  expect(Doctor.find.mock.calls[0][0].specialty).toBe('Cardiology');
});
