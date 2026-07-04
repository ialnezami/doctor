jest.mock('../../models/Lab');
const Lab = require('../../models/Lab');

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'lab1', role: 'laboratory' };
  next();
});
jest.mock('../../middleware/rbac', () => (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ message: 'Forbidden' });
  next();
});

const express = require('express');
const request = require('supertest');
const router  = require('../labs');

const app = express();
app.use(express.json());
app.use('/api/labs', router);

beforeEach(() => jest.clearAllMocks());

test('PUT /me/location returns 403 for non-laboratory role', async () => {
  const app2 = express();
  app2.use(express.json());
  app2.use((req, _res, next) => { req.user = { id: 'p1', role: 'patient' }; next(); });
  app2.use('/api/labs', require('../labs'));
  const res = await request(app2).put('/api/labs/me/location').send({ lat: 24.7, lng: 46.6 });
  expect(res.status).toBe(403);
});

test('PUT /me/location returns 422 when lat is out of range', async () => {
  const res = await request(app).put('/api/labs/me/location').send({ lat: 100, lng: 46.6 });
  expect(res.status).toBe(422);
});

test('PUT /me/location returns 422 when lng is out of range', async () => {
  const res = await request(app).put('/api/labs/me/location').send({ lat: 24.7, lng: 200 });
  expect(res.status).toBe(422);
});

test('PUT /me/location returns 404 when lab not found', async () => {
  Lab.findOneAndUpdate = jest.fn().mockResolvedValue(null);
  const res = await request(app).put('/api/labs/me/location').send({ lat: 24.7136, lng: 46.6753 });
  expect(res.status).toBe(404);
});

test('PUT /me/location updates coordinates and returns 200', async () => {
  Lab.findOneAndUpdate = jest.fn().mockResolvedValue({
    location: { type: 'Point', coordinates: [46.6753, 24.7136] },
  });
  const res = await request(app).put('/api/labs/me/location').send({ lat: 24.7136, lng: 46.6753 });
  expect(res.status).toBe(200);
  expect(res.body.location.coordinates).toEqual([46.6753, 24.7136]);
});
