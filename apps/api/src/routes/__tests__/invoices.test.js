'use strict';

jest.mock('../../middleware/auth', () => (req, res, next) => {
  req.user = { id: '507f1f77bcf86cd799439011', role: 'doctor' };
  next();
});
jest.mock('../../middleware/rbac', () => () => (req, res, next) => next());

const mongoose = require('mongoose');

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/salamtak_test');
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('Appointment model — invoice fields', () => {
  it('defaults paymentStatus to unpaid and invoiceAmount to 0', async () => {
    const Appointment = require('../../models/Appointment');
    const doc = new Appointment({
      doctorId:  new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId(),
      date: new Date(),
      timeSlot: { start: '10:00', end: '10:30' },
    });
    expect(doc.paymentStatus).toBe('unpaid');
    expect(doc.invoiceAmount).toBe(0);
  });
});
