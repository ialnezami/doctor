'use strict';

jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 'user_pharmacy_1', role: 'pharmacy' };
  next();
});
jest.mock('../../middleware/requireRole', () => () => (_r, _s, next) => next());
jest.mock('../../models/Prescription');
jest.mock('../../models/Pharmacy');
jest.mock('../../models/Product');

const express  = require('express');
const request  = require('supertest');
const Prescription = require('../../models/Prescription');
const Pharmacy     = require('../../models/Pharmacy');
const Product      = require('../../models/Product');
const router       = require('../prescriptions');

const app = express();
app.use(express.json());
app.use('/api/prescriptions', router);

beforeEach(() => jest.clearAllMocks());

describe('POST /api/prescriptions/:id/dispense', () => {
  const fakeRx = {
    _id: 'rx1',
    dispensedAt: null,
    dispensedBy: null,
    medications: [{ name: 'Paracetamol', dosage: '500mg' }],
    patientId: { _id: 'pat1', name: 'أحمد محمد' },
    doctorId:  { _id: 'doc1', name: 'د. سارة' },
    save: jest.fn().mockResolvedValue(true),
  };

  it('returns 201 with dispensedMedications when matched and in stock', async () => {
    Prescription.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({ ...fakeRx }),
      }),
    });
    Pharmacy.findOne.mockResolvedValue({ _id: 'ph1' });
    Product.find.mockResolvedValue([
      { _id: 'p1', name: 'Paracetamol', stockQty: 10 },
    ]);
    Product.findOneAndUpdate.mockResolvedValue({ stockQty: 9 });

    const res = await request(app)
      .post('/api/prescriptions/rx1/dispense')
      .send();

    expect(res.status).toBe(201);
    expect(res.body.dispensedMedications).toHaveLength(1);
    expect(res.body.dispensedMedications[0].matched).toBe(true);
    expect(res.body.dispensedMedications[0].stockBefore).toBe(10);
  });

  it('returns 409 if prescription already dispensed', async () => {
    Prescription.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          ...fakeRx,
          dispensedAt: new Date('2026-07-01'),
        }),
      }),
    });

    const res = await request(app).post('/api/prescriptions/rx1/dispense').send();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already dispensed/i);
  });

  it('returns 404 if prescription not found', async () => {
    Prescription.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      }),
    });

    const res = await request(app).post('/api/prescriptions/bad/dispense').send();
    expect(res.status).toBe(404);
  });

  it('returns 403 if pharmacy profile not found', async () => {
    Prescription.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({ ...fakeRx }),
      }),
    });
    Pharmacy.findOne.mockResolvedValue(null);

    const res = await request(app).post('/api/prescriptions/rx1/dispense').send();
    expect(res.status).toBe(403);
  });
});
