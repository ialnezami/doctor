'use strict';

const Doctor = require('../models/Doctor');

// Default search radius: 50 km
const MAX_DISTANCE_METERS = 50000;

// Minimum result count before specialty fallback triggers
const FALLBACK_THRESHOLD = 3;

/**
 * Validates lat/lng are within GeoJSON-legal ranges.
 * Throws a descriptive error on invalid input.
 * @param {number} lat
 * @param {number} lng
 */
function validateCoordinates(lat, lng) {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || latNum < -90 || latNum > 90) {
    throw new RangeError(`Invalid lat: ${lat} — must be between -90 and 90`);
  }
  if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
    throw new RangeError(`Invalid lng: ${lng} — must be between -180 and 180`);
  }
  return { latNum, lngNum };
}

/**
 * Builds the $geoNear aggregation pipeline for ranked doctor recommendations.
 *
 * Scoring formula: score = (0.7 × normalizedDist) + (0.3 × (1 - ratingScore))
 * Lower score = better rank (closer + better rated).
 *
 * Specialty filter is applied as a post-$geoNear $match (not inside $geoNear.query)
 * to allow distance field computation before filtering — this also enables the
 * fallback re-query without specialty when < FALLBACK_THRESHOLD results are found.
 *
 * @param {number} lngNum
 * @param {number} latNum
 * @param {string|undefined} specialty
 * @param {number} limit
 * @returns {Array} MongoDB aggregation pipeline
 */
function buildPipeline(lngNum, latNum, specialty, limit) {
  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lngNum, latNum] }, // [lng, lat] — GeoJSON order
        distanceField: 'distMeters',
        maxDistance: MAX_DISTANCE_METERS,
        spherical: true,
        query: { 'locations.type': 'bookable' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    { $unwind: '$user' },
    // Specialty filter applied after $geoNear so distMeters is computed first
    ...(specialty ? [{ $match: { specialty: new RegExp(specialty, 'i') } }] : []),
    {
      $addFields: {
        // 0 = at doorstep, 1 = at max radius
        normalizedDist: { $divide: ['$distMeters', MAX_DISTANCE_METERS] },
        // Proxy for quality: averageRating/5 → 0..1 scale
        ratingScore: { $divide: ['$averageRating', 5] },
      },
    },
    {
      $addFields: {
        // Lower score = better rank: proximity 70%, inverse-rating 30%
        score: {
          $add: [
            { $multiply: [0.7, '$normalizedDist'] },
            { $multiply: [0.3, { $subtract: [1, '$ratingScore'] }] },
          ],
        },
      },
    },
    { $sort: { score: 1 } },
    { $limit: parseInt(limit, 10) },
    {
      $project: {
        _id: 1,
        userId: 1,
        specialty: 1,
        photoUrl: 1,
        averageRating: 1,
        reviewCount: 1,
        consultationFee: 1,
        distMeters: 1,
        score: 1,
        'user._id': 1,
        'user.name': 1,
        locations: {
          $filter: { input: '$locations', as: 'l', cond: { $eq: ['$$l.type', 'bookable'] } },
        },
      },
    },
  ];
  return pipeline;
}

/**
 * Returns geo-ranked doctors near a given coordinate.
 *
 * Fallback logic: if specialty is provided and fewer than FALLBACK_THRESHOLD
 * results are returned, re-runs the pipeline without specialty filter and
 * sets specialtyFallback = true in the response.
 *
 * @param {{ specialty?: string, lat: number, lng: number, limit?: number }} options
 * @returns {Promise<{ doctors: Array, specialtyFallback: boolean }>}
 */
async function getRankedDoctors({ specialty, lat, lng, limit = 5 }) {
  const { latNum, lngNum } = validateCoordinates(lat, lng);

  const pipeline = buildPipeline(lngNum, latNum, specialty, limit);
  let doctors = await Doctor.aggregate(pipeline);
  let specialtyFallback = false;

  // Fallback: if specialty filter produced too few results, retry without specialty
  if (specialty && doctors.length < FALLBACK_THRESHOLD) {
    const fallbackPipeline = buildPipeline(lngNum, latNum, undefined, limit);
    doctors = await Doctor.aggregate(fallbackPipeline);
    specialtyFallback = true;
  }

  return { doctors, specialtyFallback };
}

module.exports = { getRankedDoctors, MAX_DISTANCE_METERS, FALLBACK_THRESHOLD };
