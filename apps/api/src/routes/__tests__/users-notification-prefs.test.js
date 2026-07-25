jest.mock('../../models/User');
const User = require('../../models/User');

const express  = require('express');
const request  = require('supertest');
const router   = require('../users');
const auth     = require('../../middleware/auth');

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'user1' };
  next();
});

const app = express();
app.use(express.json());
app.use('/api/users', router);

beforeEach(() => jest.clearAllMocks());

test('PATCH /me/notification-prefs returns updated prefs', async () => {
  User.findByIdAndUpdate = jest.fn().mockResolvedValue({
    notificationPrefs: { pushEnabled: false, emailEnabled: true },
  });
  const res = await request(app)
    .patch('/api/users/me/notification-prefs')
    .send({ pushEnabled: false });
  expect(res.status).toBe(200);
  expect(res.body.notificationPrefs.pushEnabled).toBe(false);
});

test('returns 400 if pushEnabled is not a boolean', async () => {
  const res = await request(app)
    .patch('/api/users/me/notification-prefs')
    .send({ pushEnabled: 'yes' });
  expect(res.status).toBe(400);
});

test('returns 400 if emailEnabled is not a boolean', async () => {
  const res = await request(app)
    .patch('/api/users/me/notification-prefs')
    .send({ emailEnabled: 1 });
  expect(res.status).toBe(400);
});
