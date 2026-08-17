jest.mock('../../models/Doctor');
jest.mock('../../models/Appointment');
jest.mock('../../models/User');
jest.mock('../patientProvisioner');

const Doctor      = require('../../models/Doctor');
const Appointment = require('../../models/Appointment');
const { executeTool } = require('../whatsappBookingTools');

const CTX = { userId: 'u1', patientId: 'p1' };

beforeEach(() => jest.clearAllMocks());

test('find_doctors returns matching doctors', async () => {
  Doctor.find = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue([
        { _id: 'd1', specialty: 'cardiology', locations: [{ _id: 'l1', name: 'Clinic A', type: 'bookable' }] },
      ]),
    }),
  });
  const result = await executeTool('find_doctors', { specialty: 'cardiology' }, CTX);
  expect(result.doctors).toHaveLength(1);
  expect(result.doctors[0].doctorId).toBe('d1');
});

test('list_my_appointments returns upcoming appointments', async () => {
  Appointment.find = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([
          { _id: 'a1', date: new Date(), timeSlot: { start: '10:00', end: '10:30' }, status: 'confirmed', doctorId: { name: 'Dr. Ali' } },
        ]),
      }),
    }),
  });
  const result = await executeTool('list_my_appointments', {}, CTX);
  expect(result.appointments).toHaveLength(1);
});

test('cancel_appointment cancels and returns confirmation', async () => {
  const appt = { _id: 'a1', patientId: 'p1', status: 'confirmed', save: jest.fn() };
  Appointment.findById = jest.fn().mockResolvedValue(appt);
  const result = await executeTool('cancel_appointment', { appointmentId: 'a1' }, CTX);
  expect(appt.status).toBe('cancelled');
  expect(result.cancelled).toBe(true);
});

test('cancel_appointment rejects if not owned by patient', async () => {
  Appointment.findById = jest.fn().mockResolvedValue({
    _id: 'a1', patientId: 'other', status: 'confirmed',
  });
  const result = await executeTool('cancel_appointment', { appointmentId: 'a1' }, CTX);
  expect(result.error).toMatch(/not found/i);
});

test('book_appointment rejects double-booking', async () => {
  Appointment.findOne = jest.fn().mockResolvedValue({ _id: 'existing' });
  const result = await executeTool('book_appointment', {
    doctorId: 'd1', locationId: 'l1', date: '2026-09-01',
    timeSlot: { start: '10:00', end: '10:30' }, reason: 'test',
  }, CTX);
  expect(result.error).toMatch(/already booked/i);
});
