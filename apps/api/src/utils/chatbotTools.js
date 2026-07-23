'use strict';

const { getRankedDoctors } = require('./doctorRanking');
const { getPendingBooking, clearPendingBooking } = require('./sessionStore');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const User = require('../models/User');

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const VISIT_TYPES = ['initial', 'follow-up', 'check-up', 'urgent'];

// ---------------------------------------------------------------------------
// Tool definitions — passed verbatim to the Anthropic messages API
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: 'search_doctors',
    description: 'Search for nearby doctors. Use when the patient asks to find, recommend, or look up doctors. Returns a list of doctors ranked by proximity and rating.',
    input_schema: {
      type: 'object',
      properties: {
        specialty: { type: 'string', description: 'Medical specialty to filter by (e.g. "cardiology", "dermatology")' },
        name: { type: 'string', description: 'Doctor name to search for (partial match)' },
        lat:  { type: 'number', description: 'Patient latitude' },
        lng:  { type: 'number', description: 'Patient longitude' },
        radius: { type: 'number', description: 'Search radius in meters (max 50000, default 10000)' },
      },
      required: ['lat', 'lng'],
    },
  },
  {
    name: 'get_availability',
    description: 'Get available appointment slots for a specific doctor within a date range. Use after the patient has selected a doctor.',
    input_schema: {
      type: 'object',
      properties: {
        doctorId:  { type: 'string', description: 'MongoDB ObjectId of the doctor' },
        from_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        to_date:   { type: 'string', description: 'End date in YYYY-MM-DD format (max 30 days from from_date)' },
      },
      required: ['doctorId', 'from_date', 'to_date'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Book an appointment ONLY after the patient has explicitly confirmed the details. Never call this without patient confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        doctorId:   { type: 'string', description: 'MongoDB ObjectId of the doctor' },
        locationId: { type: 'string', description: 'MongoDB ObjectId of the clinic location' },
        date:       { type: 'string', description: 'Appointment date in YYYY-MM-DD format' },
        timeSlot:   { type: 'string', description: 'Start time in HH:MM format (24-hour)' },
        visitType:  { type: 'string', enum: VISIT_TYPES, description: 'Type of visit' },
        reason:     { type: 'string', description: 'Optional reason for the appointment' },
      },
      required: ['doctorId', 'locationId', 'date', 'timeSlot', 'visitType'],
    },
  },
];

// ---------------------------------------------------------------------------
// Input validation — throws Error on invalid input
// ---------------------------------------------------------------------------

function validateToolInput(name, input) {
  if (name === 'search_doctors') {
    if (input.lat == null || typeof input.lat !== 'number') throw new Error('lat is required and must be a number');
    if (input.lng == null || typeof input.lng !== 'number') throw new Error('lng is required and must be a number');
    if (input.radius != null && input.radius > 50000) throw new Error('radius must not exceed 50000 metres');
    return;
  }

  if (name === 'get_availability') {
    if (!input.doctorId) throw new Error('doctorId is required');
    if (!OBJECT_ID_RE.test(input.doctorId)) throw new Error('doctorId must be a valid MongoDB ObjectId (24 hex chars)');
    if (!input.from_date) throw new Error('from_date is required (YYYY-MM-DD)');
    if (!DATE_RE.test(input.from_date)) throw new Error('from_date must be in YYYY-MM-DD format');
    if (!input.to_date) throw new Error('to_date is required (YYYY-MM-DD)');
    if (!DATE_RE.test(input.to_date)) throw new Error('to_date must be in YYYY-MM-DD format');
    return;
  }

  if (name === 'book_appointment') {
    if (!input.doctorId || !OBJECT_ID_RE.test(input.doctorId))   throw new Error('doctorId must be a valid MongoDB ObjectId');
    if (!input.locationId || !OBJECT_ID_RE.test(input.locationId)) throw new Error('locationId must be a valid MongoDB ObjectId');
    if (!input.date || !DATE_RE.test(input.date))   throw new Error('date must be in YYYY-MM-DD format');
    if (!input.timeSlot || !TIME_RE.test(input.timeSlot)) throw new Error('timeSlot must be in HH:MM format');
    if (!VISIT_TYPES.includes(input.visitType)) throw new Error(`visitType must be one of: ${VISIT_TYPES.join(', ')}`);
    return;
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function searchDoctors(input, context) {
  const { specialty, name, lat, lng, radius = 10000 } = input;

  if (name) {
    const users = await User.find({
      name: new RegExp(name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      role: 'doctor',
    }).select('_id name').limit(5);

    if (users.length === 0) return { doctors: [], message: 'No doctor found with that name' };

    const userIds = users.map(u => u._id);
    const doctors = await Doctor.find({ userId: { $in: userIds } })
      .populate('userId', 'name')
      .select('specialty consultationFee averageRating photoUrl locations')
      .limit(5);

    return {
      doctors: doctors.map(d => ({
        _id: d._id,
        name: d.userId?.name,
        specialty: d.specialty,
        consultationFee: d.consultationFee,
        averageRating: d.averageRating,
        locations: d.locations,
      })),
    };
  }

  // Geo-ranked search (radius capped at 50,000 by getRankedDoctors internally)
  const { doctors, specialtyFallback } = await getRankedDoctors({ specialty, lat, lng, limit: 5 });
  return { doctors, specialtyFallback };
}

async function getAvailability(input, context) {
  const { doctorId, from_date, to_date } = input;

  const doctor = await Doctor.findById(doctorId).select('availabilitySlots');
  if (!doctor) return { error: 'Doctor not found' };

  const fromDate = new Date(from_date + 'T00:00:00.000Z');
  const toDate   = new Date(to_date   + 'T00:00:00.000Z');

  // Cap range at 30 days to prevent runaway DB queries
  const maxDate = new Date(fromDate);
  maxDate.setUTCDate(maxDate.getUTCDate() + 30);
  const endDate = toDate <= maxDate ? toDate : maxDate;

  const availableSlots = [];

  for (const d = new Date(fromDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const dayOfWeek = d.getUTCDay(); // 0=Sun … 6=Sat
    const dateStr   = d.toISOString().slice(0, 10);

    const daySlots = doctor.availabilitySlots.filter(s => s.dayOfWeek === dayOfWeek);

    for (const slot of daySlots) {
      const slotDateStart = new Date(dateStr + 'T00:00:00.000Z');
      const slotDateEnd   = new Date(dateStr + 'T23:59:59.999Z');

      const isBooked = await Appointment.exists({
        doctorId,
        date: { $gte: slotDateStart, $lte: slotDateEnd },
        'timeSlot.start': slot.startTime,
        status: { $nin: ['cancelled', 'archived'] },
      });

      if (!isBooked) {
        availableSlots.push({ date: dateStr, time: slot.startTime, endTime: slot.endTime });
      }
    }
  }

  return { doctorId, availableSlots };
}

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const endH  = Math.floor(total / 60) % 24;
  const endM  = total % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

async function bookAppointment(input, context) {
  const { doctorId, locationId, date, timeSlot, visitType, reason } = input;
  const { userId } = context;

  // Require explicit confirmation via pendingBooking
  const pending = getPendingBooking(userId);
  if (!pending) {
    return { error: 'No pending booking to confirm. Please confirm the details first.' };
  }

  // Slot conflict check
  const slotDateStart = new Date(date + 'T00:00:00.000Z');
  const slotDateEnd   = new Date(date + 'T23:59:59.999Z');
  const conflict = await Appointment.exists({
    doctorId,
    date: { $gte: slotDateStart, $lte: slotDateEnd },
    'timeSlot.start': timeSlot,
    status: { $nin: ['cancelled', 'archived'] },
  });
  if (conflict) {
    return { error: 'That slot is no longer available. Please choose a different time.' };
  }

  // Look up location and appointment type for duration
  const doctor = await Doctor.findById(doctorId).select('locations appointmentTypes');
  const location   = doctor?.locations.find(l => l._id.equals(locationId));
  const apptType   = doctor?.appointmentTypes.find(t => t.key === visitType);
  const duration   = apptType?.duration ?? 30;
  const timeSlotEnd = addMinutes(timeSlot, duration);

  const appointment = await Appointment.create({
    doctorId,
    patientId: userId,
    date: slotDateStart,
    timeSlot: { start: timeSlot, end: timeSlotEnd },
    status: 'pending',
    visitType,
    reason: reason || '',
    initiatedBy: 'patient',
    locationId: locationId || null,
    locationName:    location?.name    || '',
    locationAddress: location?.address || '',
    locationType:    location?.type    || null,
  });

  clearPendingBooking(userId);

  return {
    appointmentId: appointment._id,
    date,
    timeSlot,
    visitType,
    location: location?.name || '',
    status: 'pending',
  };
}

// ---------------------------------------------------------------------------
// Dispatcher — catches all errors, returns { error } so Claude can respond naturally
// ---------------------------------------------------------------------------

async function executeTool(name, input, context) {
  const startedAt = Date.now();
  try {
    validateToolInput(name, input);

    let result;
    if (name === 'search_doctors')        result = await searchDoctors(input, context);
    else if (name === 'get_availability') result = await getAvailability(input, context);
    else if (name === 'book_appointment') result = await bookAppointment(input, context);
    else result = { error: `Unknown tool: ${name}` };

    console.log(`[chatbot:tool] requestId=${context.requestId} userId=${context.userId} tool=${name} durationMs=${Date.now() - startedAt} status=success`);
    return result;
  } catch (err) {
    console.error(`[chatbot:tool] requestId=${context.requestId} userId=${context.userId} tool=${name} durationMs=${Date.now() - startedAt} status=error err=${err.name}: ${String(err.message).slice(0, 200)}`);
    return { error: err.message };
  }
}

module.exports = { TOOL_DEFINITIONS, validateToolInput, executeTool };
