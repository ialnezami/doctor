'use strict';

describe('sessionStore — pending booking', () => {
  let setPendingBooking, getPendingBooking, clearPendingBooking;

  beforeAll(() => {
    jest.resetModules();
    const mod = require('../sessionStore');
    setPendingBooking  = mod.setPendingBooking;
    getPendingBooking  = mod.getPendingBooking;
    clearPendingBooking = mod.clearPendingBooking;
  });

  afterEach(() => {
    clearPendingBooking('u1');
  });

  it('returns null when no pending booking exists', () => {
    expect(getPendingBooking('u1')).toBeNull();
  });

  it('stores and retrieves a pending booking', () => {
    const data = { doctorId: 'abc', date: '2026-08-01', timeSlot: '10:00' };
    setPendingBooking('u1', data);
    expect(getPendingBooking('u1')).toEqual(data);
  });

  it('clearPendingBooking removes the booking', () => {
    setPendingBooking('u1', { doctorId: 'abc' });
    clearPendingBooking('u1');
    expect(getPendingBooking('u1')).toBeNull();
  });

  it('overwrites an existing pending booking', () => {
    setPendingBooking('u1', { doctorId: 'old' });
    setPendingBooking('u1', { doctorId: 'new' });
    expect(getPendingBooking('u1')).toEqual({ doctorId: 'new' });
  });

  it('isolates bookings per user', () => {
    setPendingBooking('u1', { doctorId: 'for-u1' });
    expect(getPendingBooking('u2')).toBeNull();
  });
});
