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
  };

  it('returns 201 with dispensedMedications when matched and in stock', async () => {
    // Fix 2: route now uses findOneAndUpdate instead of findById
    Prescription.findOneAndUpdate.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({ ...fakeRx, dispensedAt: new Date(), dispensedBy: 'ph1' }),
      }),
    });
    Pharmacy.findOne.mockResolvedValue({ _id: 'ph1' });
    Product.find.mockResolvedValue([
      { _id: 'p1', name: 'Paracetamol', stockQty: 10 },
    ]);
    // Fix 3: route uses return value of findOneAndUpdate for stockAfter
    Product.findOneAndUpdate.mockResolvedValue({ stockQty: 9 });

    const res = await request(app)
      .post('/api/prescriptions/rx1/dispense')
      .send();

    expect(res.status).toBe(201);
    expect(res.body.dispensedMedications).toHaveLength(1);
    expect(res.body.dispensedMedications[0].matched).toBe(true);
    expect(res.body.dispensedMedications[0].stockBefore).toBe(10);
    expect(res.body.dispensedMedications[0].stockAfter).toBe(9);
    // Fix 1: PHI-safe — no full patient object, no dosage
    expect(res.body.patientFirstName).toBe('أحمد');
    expect(res.body.prescription).toBeUndefined();
  });

  it('returns 409 if prescription already dispensed', async () => {
    // findOneAndUpdate returns null when dispensedAt is NOT null (filter fails)
    Prescription.findOneAndUpdate.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      }),
    });
    // findById used to distinguish not-found vs already-dispensed
    Prescription.findById.mockResolvedValue({
      ...fakeRx,
      dispensedAt: new Date('2026-07-01'),
    });
    Pharmacy.findOne.mockResolvedValue({ _id: 'ph1' });

    const res = await request(app).post('/api/prescriptions/rx1/dispense').send();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already dispensed/i);
  });

  it('returns 404 if prescription not found', async () => {
    Prescription.findOneAndUpdate.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      }),
    });
    Prescription.findById.mockResolvedValue(null);
    Pharmacy.findOne.mockResolvedValue({ _id: 'ph1' });

    const res = await request(app).post('/api/prescriptions/bad/dispense').send();
    expect(res.status).toBe(404);
  });

  it('returns 403 if pharmacy profile not found', async () => {
    Pharmacy.findOne.mockResolvedValue(null);

    const res = await request(app).post('/api/prescriptions/rx1/dispense').send();
    expect(res.status).toBe(403);
  });

  // Fix 4: out-of-stock test
  it('returns 201 with matched:true stockBefore:0 when product exists but out of stock', async () => {
    Prescription.findOneAndUpdate.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({ ...fakeRx, dispensedAt: new Date(), dispensedBy: 'ph1' }),
      }),
    });
    Pharmacy.findOne.mockResolvedValue({ _id: 'ph1' });
    Product.find.mockResolvedValue([
      { _id: 'p1', name: 'Paracetamol', stockQty: 0 },
    ]);
    Product.findOneAndUpdate.mockResolvedValue(null); // atomic update fails (out of stock)

    const res = await request(app).post('/api/prescriptions/rx1/dispense').send();
    expect(res.status).toBe(201);
    expect(res.body.dispensedMedications[0]).toMatchObject({ matched: true, stockBefore: 0 });
  });
});
