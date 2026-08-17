jest.mock('../../models/User');
jest.mock('../../models/Patient');
jest.mock('../../utils/blindIndex', () => ({ hmacHash: jest.fn(v => `hash:${v}`) }));
jest.mock('../../utils/phoneUtils', () => ({ normalizePhone: jest.fn(v => v) }));

const User    = require('../../models/User');
const Patient = require('../../models/Patient');
const { findOrCreatePatient } = require('../patientProvisioner');

beforeEach(() => jest.clearAllMocks());

test('returns existing patient when phone hash found', async () => {
  const fakeUser = { _id: 'u1' };
  User.findOne = jest.fn().mockResolvedValue(fakeUser);
  Patient.findOne = jest.fn().mockResolvedValue({ _id: 'p1' });

  const result = await findOrCreatePatient('+966501234567');

  expect(result).toEqual({ userId: 'u1', patientId: 'p1' });
  expect(User.findOne).toHaveBeenCalledWith({ phoneHash: 'hash:+966501234567' });
});

test('creates user and patient when phone not found', async () => {
  User.findOne = jest.fn().mockResolvedValue(null);
  const savedUser = { _id: 'u2' };
  User.mockImplementation(() => ({ save: jest.fn().mockResolvedValue(savedUser), _id: 'u2' }));
  Patient.mockImplementation(() => ({ save: jest.fn(), _id: 'p2' }));
  Patient.findOne = jest.fn().mockResolvedValue(null);

  const result = await findOrCreatePatient('+966501234567');

  expect(result.userId).toBeDefined();
  expect(result.patientId).toBeDefined();
});

test('throws if phone is invalid', async () => {
  const { normalizePhone } = require('../../utils/phoneUtils');
  normalizePhone.mockImplementation(() => { throw new Error('Invalid phone number'); });
  await expect(findOrCreatePatient('bad')).rejects.toThrow('Invalid phone number');
});
