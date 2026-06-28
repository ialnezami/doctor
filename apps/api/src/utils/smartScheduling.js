'use strict';

const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');

const SLOT_SYSTEM_PROMPT = `You are a scheduling assistant. Analyze the doctor's availability and historical appointment patterns. Return ONLY valid JSON — no other text. Schema: { "suggestions": [{"dayOfWeek": 0-6, "time": "HH:MM", "reason": string}] }. Return 3-5 suggestions. dayOfWeek: 0=Sunday. reason: 1 short sentence. Base suggestions on which slots have historically been most used and which are available.`;

const RESCHEDULE_SYSTEM_PROMPT = `You are a scheduling assistant. A doctor cancelled an appointment. Suggest 2-3 alternative time slots for the patient to rebook. Return ONLY valid JSON. Schema: { "suggestions": [{"dayOfWeek": 0-6, "time": "HH:MM", "reason": string}] }. Base on the doctor's availability slots.`;

function getClient() {
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function buildSlotContext(doctor, history) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const availability = (doctor.availabilitySlots || [])
    .map(s => `${dayNames[s.dayOfWeek]} ${s.startTime}–${s.endTime}`)
    .join(', ') || 'No availability configured';

  // Tally historical appointments by dayOfWeek + time
  const tally = {};
  for (const appt of history) {
    const d = new Date(appt.date);
    const dow = d.getUTCDay();
    const time = appt.timeSlot?.start || '??:??';
    const key = `${dayNames[dow]} ${time}`;
    tally[key] = (tally[key] || 0) + 1;
  }

  const tallySummary = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => `${k} (${v}x)`)
    .join(', ') || 'No historical data';

  return `Doctor specialty: ${doctor.specialty || 'General'}
Timezone: ${doctor.timezone || 'UTC'}
Availability: ${availability}
Most-booked slots (last 20 appointments): ${tallySummary}`;
}

/**
 * Suggest 3-5 optimal booking slots for a patient based on doctor history.
 * Returns null if ANTHROPIC_API_KEY is not set, empty array on parse failure.
 *
 * @param {string} doctorId  - User._id of the doctor
 * @param {string} patientId - User._id of the requesting patient (reserved for future personalization)
 * @returns {Promise<Array|null>}
 */
async function suggestSlots(doctorId, patientId) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const [doctor, history] = await Promise.all([
    Doctor.findOne({ userId: doctorId }).select('availabilitySlots specialty timezone'),
    Appointment.find({
      doctorId,
      status: { $in: ['confirmed', 'validated'] },
    })
      .sort({ date: -1 })
      .limit(20)
      .select('date timeSlot'),
  ]);

  if (!doctor) return [];

  const contextString = buildSlotContext(doctor, history);

  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: SLOT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: contextString }],
  });

  const rawText = response.content[0]?.text || '';

  try {
    const parsed = JSON.parse(rawText);
    const suggestions = parsed?.suggestions;
    if (!Array.isArray(suggestions)) return [];

    // Validate each suggestion has required shape
    return suggestions
      .filter(s =>
        typeof s.dayOfWeek === 'number' &&
        s.dayOfWeek >= 0 &&
        s.dayOfWeek <= 6 &&
        typeof s.time === 'string' &&
        /^\d{2}:\d{2}$/.test(s.time) &&
        typeof s.reason === 'string'
      )
      .slice(0, 5)
      .map(s => ({
        dayOfWeek: s.dayOfWeek,
        time: s.time,
        reason: s.reason.slice(0, 200),
      }));
  } catch (err) {
    console.error('[smartScheduling] suggestSlots JSON parse error:', err.message);
    return [];
  }
}

/**
 * Generate 2-3 reschedule suggestions after a doctor cancels an appointment.
 * Fire-and-forget safe — catches all errors and returns [].
 *
 * @param {object} doctor        - Doctor document
 * @param {object} cancelledAppt - Appointment document
 * @returns {Promise<Array>}
 */
async function generateRescheduleSuggestions(doctor, cancelledAppt) {
  if (!process.env.ANTHROPIC_API_KEY) return [];

  try {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const availability = (doctor.availabilitySlots || [])
      .map(s => `${dayNames[s.dayOfWeek]} ${s.startTime}–${s.endTime}`)
      .join(', ') || 'No availability configured';

    const cancelledDay = dayNames[new Date(cancelledAppt.date).getUTCDay()];
    const cancelledTime = cancelledAppt.timeSlot?.start || 'unknown';

    const contextString = `Doctor specialty: ${doctor.specialty || 'General'}
Timezone: ${doctor.timezone || 'UTC'}
Availability: ${availability}
Cancelled appointment: ${cancelledDay} at ${cancelledTime}
Please suggest 2-3 alternative slots close to the original day/time when possible.`;

    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: RESCHEDULE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contextString }],
    });

    const rawText = response.content[0]?.text || '';
    const parsed = JSON.parse(rawText);
    const suggestions = parsed?.suggestions;
    if (!Array.isArray(suggestions)) return [];

    return suggestions
      .filter(s =>
        typeof s.dayOfWeek === 'number' &&
        s.dayOfWeek >= 0 &&
        s.dayOfWeek <= 6 &&
        typeof s.time === 'string' &&
        /^\d{2}:\d{2}$/.test(s.time) &&
        typeof s.reason === 'string'
      )
      .slice(0, 3)
      .map(s => ({
        dayOfWeek: s.dayOfWeek,
        time: s.time,
        reason: s.reason.slice(0, 200),
      }));
  } catch (err) {
    // Fire-and-forget: log but never propagate
    console.error('[smartScheduling] generateRescheduleSuggestions error:', err.message);
    return [];
  }
}

module.exports = { suggestSlots, generateRescheduleSuggestions };
