'use strict';

// doctorRanking.js uses MongoDB $geoNear aggregation.
// The describe.skip block documents integration behavior pending a test DB.
// The unit describe block uses a mocked Doctor.aggregate.

jest.mock('../../models/Doctor');
const Doctor = require('../../models/Doctor');
const { getRankedDoctors } = require('../doctorRanking');

beforeEach(() => {
  jest.clearAllMocks();
});

describe.skip('doctorRanking — integration (requires test DB)', () => {
  it.todo('$geoNear pipeline returns doctors sorted by score ascending');
  it.todo('fallback triggers when result count < 3 with specialty filter (retry without specialty)');
  it.todo('lat/lng passed to $geoNear as [lng, lat] order (GeoJSON coordinate order)');
  it.todo('raises on invalid lat (out of -90..90 range)');
  it.todo('raises on invalid lng (out of -180..180 range)');
  it.todo('specialtyFallback is false when enough results found with specialty');
  it.todo('specialtyFallback is true when fallback was triggered');
});

describe('doctorRanking — unit (mocked Doctor.aggregate)', () => {
  it('passes coordinates as [lng, lat] to $geoNear (GeoJSON order)', async () => {
    const mockDoctors = [{ _id: 'd1', specialty: 'cardiology', score: 0.1 }];
    Doctor.aggregate = jest.fn().mockResolvedValue(mockDoctors);

    await getRankedDoctors({ lat: 24.7136, lng: 46.6753, limit: 5 });

    const pipeline = Doctor.aggregate.mock.calls[0][0];
    const geoNear = pipeline[0].$geoNear;
    // GeoJSON order: [longitude, latitude]
    expect(geoNear.near.coordinates).toEqual([46.6753, 24.7136]);
  });

  it('throws on invalid lat (> 90)', async () => {
    await expect(getRankedDoctors({ lat: 91, lng: 46.67, limit: 5 })).rejects.toThrow();
  });

  it('throws on invalid lat (< -90)', async () => {
    await expect(getRankedDoctors({ lat: -91, lng: 46.67, limit: 5 })).rejects.toThrow();
  });

  it('throws on invalid lng (> 180)', async () => {
    await expect(getRankedDoctors({ lat: 24.7, lng: 181, limit: 5 })).rejects.toThrow();
  });

  it('triggers specialty fallback when first query returns fewer than 3 results', async () => {
    // First call (with specialty) returns 2 doctors → triggers fallback
    // Second call (without specialty) returns 5 doctors
    const few  = [{ _id: 'd1' }, { _id: 'd2' }];
    const many = [{ _id: 'd1' }, { _id: 'd2' }, { _id: 'd3' }, { _id: 'd4' }, { _id: 'd5' }];
    Doctor.aggregate = jest.fn()
      .mockResolvedValueOnce(few)
      .mockResolvedValueOnce(many);

    const result = await getRankedDoctors({ specialty: 'neurology', lat: 24.7136, lng: 46.6753, limit: 5 });
    expect(result.specialtyFallback).toBe(true);
    expect(result.doctors).toEqual(many);
    expect(Doctor.aggregate).toHaveBeenCalledTimes(2);
  });

  it('does not trigger fallback when enough results with specialty (>= 3)', async () => {
    const plenty = [{ _id: 'd1' }, { _id: 'd2' }, { _id: 'd3' }];
    Doctor.aggregate = jest.fn().mockResolvedValue(plenty);

    const result = await getRankedDoctors({ specialty: 'cardiology', lat: 24.7136, lng: 46.6753, limit: 5 });
    expect(result.specialtyFallback).toBe(false);
    expect(Doctor.aggregate).toHaveBeenCalledTimes(1);
  });
});
