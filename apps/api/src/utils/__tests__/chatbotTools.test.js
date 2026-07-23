'use strict';

jest.mock('../doctorRanking', () => ({
  getRankedDoctors: jest.fn(),
}));

jest.mock('../sessionStore', () => ({
  getPendingBooking: jest.fn(),
  clearPendingBooking: jest.fn(),
}));

jest.mock('../../models/Doctor', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../../models/Appointment', () => ({
  exists: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  find: jest.fn(),
}));

describe('chatbotTools — validateToolInput', () => {
  let validateToolInput;

  beforeAll(() => {
    jest.resetModules();
    // Re-require after mocks are set
    const mod = require('../chatbotTools');
    validateToolInput = mod.validateToolInput;
  });

  it('throws on unknown tool name', () => {
    expect(() => validateToolInput('unknown_tool', {})).toThrow('Unknown tool');
  });

  it('throws when search_doctors missing lat', () => {
    expect(() => validateToolInput('search_doctors', { lng: 46.7 }))
      .toThrow('lat');
  });

  it('throws when search_doctors missing lng', () => {
    expect(() => validateToolInput('search_doctors', { lat: 24.7 }))
      .toThrow('lng');
  });

  it('throws when search_doctors radius exceeds 50000', () => {
    expect(() => validateToolInput('search_doctors', { lat: 24.7, lng: 46.7, radius: 99999 }))
      .toThrow('radius');
  });

  it('passes valid search_doctors input', () => {
    expect(() => validateToolInput('search_doctors', { lat: 24.7, lng: 46.7 })).not.toThrow();
  });

  it('throws when get_availability missing doctorId', () => {
    expect(() => validateToolInput('get_availability', { from_date: '2026-08-01', to_date: '2026-08-07' }))
      .toThrow('doctorId');
  });

  it('throws when get_availability doctorId is not a valid ObjectId', () => {
    expect(() => validateToolInput('get_availability', { doctorId: 'notanid', from_date: '2026-08-01', to_date: '2026-08-07' }))
      .toThrow('doctorId');
  });

  it('throws when get_availability from_date missing', () => {
    expect(() => validateToolInput('get_availability', { doctorId: '507f1f77bcf86cd799439011', to_date: '2026-08-07' }))
      .toThrow('from_date');
  });

  it('throws when get_availability to_date missing', () => {
    expect(() => validateToolInput('get_availability', { doctorId: '507f1f77bcf86cd799439011', from_date: '2026-08-01' }))
      .toThrow('to_date');
  });

  it('throws when book_appointment doctorId invalid', () => {
    expect(() => validateToolInput('book_appointment', {
      doctorId: 'bad', locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'initial',
    })).toThrow('doctorId');
  });

  it('throws when book_appointment date format invalid', () => {
    expect(() => validateToolInput('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011', locationId: '507f1f77bcf86cd799439011',
      date: '01-08-2026', timeSlot: '10:00', visitType: 'initial',
    })).toThrow('date');
  });

  it('throws when book_appointment timeSlot format invalid', () => {
    expect(() => validateToolInput('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011', locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00am', visitType: 'initial',
    })).toThrow('timeSlot');
  });

  it('throws when book_appointment visitType invalid', () => {
    expect(() => validateToolInput('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011', locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'telehealth',
    })).toThrow('visitType');
  });

  it('passes valid book_appointment input', () => {
    expect(() => validateToolInput('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011', locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'initial',
    })).not.toThrow();
  });
});

describe('chatbotTools — executeTool', () => {
  let executeTool, getRankedDoctors, getPendingBooking, clearPendingBooking;
  let Doctor, Appointment, User;

  beforeEach(() => {
    jest.resetModules();

    getRankedDoctors = jest.fn();
    getPendingBooking = jest.fn();
    clearPendingBooking = jest.fn();
    Doctor = { find: jest.fn(), findById: jest.fn() };
    Appointment = { exists: jest.fn(), create: jest.fn() };
    User = { find: jest.fn() };

    jest.mock('../doctorRanking', () => ({ getRankedDoctors }));
    jest.mock('../sessionStore', () => ({ getPendingBooking, clearPendingBooking }));
    jest.mock('../../models/Doctor', () => Doctor);
    jest.mock('../../models/Appointment', () => Appointment);
    jest.mock('../../models/User', () => User);

    const mod = require('../chatbotTools');
    executeTool = mod.executeTool;
  });

  const ctx = { userId: '507f1f77bcf86cd799439011', lat: 24.7, lng: 46.7, requestId: 'req-1' };

  it('search_doctors delegates to getRankedDoctors when no name', async () => {
    getRankedDoctors.mockResolvedValue({ doctors: [{ _id: 'doc1' }], specialtyFallback: false });
    const result = await executeTool('search_doctors', { lat: 24.7, lng: 46.7, specialty: 'cardiology' }, ctx);
    expect(getRankedDoctors).toHaveBeenCalledWith({ specialty: 'cardiology', lat: 24.7, lng: 46.7, limit: 5 });
    expect(result.doctors).toHaveLength(1);
  });

  it('search_doctors does name-based search when name provided', async () => {
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([{ _id: 'u1', name: 'Dr. Ahmed' }]) }),
    });
    Doctor.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([{
            _id: 'doc1', specialty: 'cardiology', consultationFee: 200,
            averageRating: 4.5, photoUrl: '', locations: [],
            userId: { name: 'Dr. Ahmed' },
          }]),
        }),
      }),
    });
    const result = await executeTool('search_doctors', { lat: 24.7, lng: 46.7, name: 'Ahmed' }, ctx);
    expect(User.find).toHaveBeenCalledWith({ name: expect.any(RegExp), role: 'doctor' });
    expect(result.doctors).toHaveLength(1);
    expect(result.doctors[0].name).toBe('Dr. Ahmed');
  });

  it('search_doctors returns error object on exception', async () => {
    getRankedDoctors.mockRejectedValue(new Error('DB down'));
    const result = await executeTool('search_doctors', { lat: 24.7, lng: 46.7 }, ctx);
    expect(result).toEqual({ error: expect.stringContaining('DB down') });
  });

  it('book_appointment returns error when no pendingBooking', async () => {
    getPendingBooking.mockReturnValue(null);
    const result = await executeTool('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011',
      locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'initial',
    }, ctx);
    expect(result).toEqual({ error: 'No pending booking to confirm. Please confirm the details first.' });
    expect(Appointment.create).not.toHaveBeenCalled();
  });

  it('book_appointment returns conflict error when slot taken', async () => {
    getPendingBooking.mockReturnValue({ doctorId: '507f1f77bcf86cd799439011' });
    Appointment.exists.mockResolvedValue(true);
    Doctor.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ locations: [], appointmentTypes: [] }),
    });
    const result = await executeTool('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011',
      locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'initial',
    }, ctx);
    expect(result).toEqual({ error: expect.stringContaining('no longer available') });
    expect(Appointment.create).not.toHaveBeenCalled();
  });

  it('book_appointment creates appointment and clears pendingBooking on success', async () => {
    getPendingBooking.mockReturnValue({ doctorId: '507f1f77bcf86cd799439011' });
    Appointment.exists.mockResolvedValue(false);
    Doctor.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        locations: [{ _id: { equals: () => true }, name: 'Clinic A', address: '123 St', type: 'bookable' }],
        appointmentTypes: [{ key: 'initial', duration: 30 }],
      }),
    });
    Appointment.create.mockResolvedValue({ _id: 'appt1', status: 'pending' });

    const result = await executeTool('book_appointment', {
      doctorId: '507f1f77bcf86cd799439011',
      locationId: '507f1f77bcf86cd799439011',
      date: '2026-08-01', timeSlot: '10:00', visitType: 'initial',
    }, ctx);

    expect(Appointment.create).toHaveBeenCalledWith(expect.objectContaining({
      timeSlot: { start: '10:00', end: '10:30' },
      status: 'pending',
      initiatedBy: 'patient',
    }));
    expect(clearPendingBooking).toHaveBeenCalledWith(ctx.userId);
    expect(result.appointmentId).toBe('appt1');
  });

  it('returns error object for unknown tool name', async () => {
    const result = await executeTool('unknown_tool', {}, ctx);
    expect(result).toEqual({ error: expect.stringContaining('Unknown tool') });
  });
});

describe('chatbotTools — TOOL_DEFINITIONS', () => {
  it('exports an array of 3 tool definitions with correct names', () => {
    const { TOOL_DEFINITIONS } = require('../chatbotTools');
    expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
    expect(TOOL_DEFINITIONS).toHaveLength(3);
    const names = TOOL_DEFINITIONS.map(t => t.name);
    expect(names).toContain('search_doctors');
    expect(names).toContain('get_availability');
    expect(names).toContain('book_appointment');
  });
});
