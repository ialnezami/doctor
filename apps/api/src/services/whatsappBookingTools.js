'use strict';

const Doctor      = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const { updatePatientName } = require('./patientProvisioner');

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function findDoctors({ specialty, name, city }) {
  const query = {};
  if (specialty) query.specialty = { $regex: specialty, $options: 'i' };

  const doctors = await Doctor.find(query)
    .populate('userId', 'name')
    .limit(5);

  if (!doctors.length) return { doctors: [], message: 'No doctors found matching your criteria.' };

  return {
    doctors: doctors.map(d => ({
      doctorId:  String(d._id),
      name:      d.userId?.name || 'Unknown',
      specialty: d.specialty,
      locations: d.locations
        .filter(l => l.type === 'bookable')
        .map(l => ({ locationId: String(l._id), name: l.name, address: l.address })),
    })),
  };
}

async function getAvailableSlots({ doctorId, locationId, daysAhead = 7 }) {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) return { error: 'Doctor not found.' };

  const loc = doctor.locations.id(locationId);
  if (!loc || loc.type !== 'bookable') return { error: 'Location not bookable.' };

  const duration = doctor.appointmentTypes?.[0]?.duration || 30;
  const results  = [];
  const now      = new Date();

  for (let i = 0; i < daysAhead; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    const dayOfWeek = day.getDay();
    const dateStr   = day.toISOString().split('T')[0];

    const daySlots = loc.slots.filter(s => s.dayOfWeek === dayOfWeek);
    const freeSlots = [];

    for (const slot of daySlots) {
      let cursor = slot.startTime;
      while (cursor < slot.endTime) {
        const end = addMinutes(cursor, duration);
        if (end > slot.endTime) break;

        const conflict = await Appointment.findOne({
          doctorId,
          locationId,
          date: { $gte: new Date(`${dateStr}T00:00:00Z`), $lte: new Date(`${dateStr}T23:59:59Z`) },
          'timeSlot.start': cursor,
          status: { $nin: ['cancelled', 'archived'] },
        });

        if (!conflict) freeSlots.push({ start: cursor, end });
        cursor = end;
      }
    }

    if (freeSlots.length) results.push({ date: dateStr, slots: freeSlots });
  }

  return { doctorId, locationId, availability: results };
}

async function bookAppointment({ doctorId, locationId, date, timeSlot, visitType, reason }, { userId }) {
  const conflict = await Appointment.findOne({
    doctorId,
    locationId,
    date:             { $gte: new Date(`${date}T00:00:00Z`), $lte: new Date(`${date}T23:59:59Z`) },
    'timeSlot.start': timeSlot.start,
    status:           { $nin: ['cancelled', 'archived'] },
  });
  if (conflict) return { error: 'This slot is already booked. Please choose another time.' };

  const doctor = await Doctor.findById(doctorId).populate('userId', 'name');
  if (!doctor) return { error: 'Doctor not found.' };

  const loc = doctor.locations.id(locationId);
  if (!loc) return { error: 'Location not found.' };

  const apptType      = doctor.appointmentTypes?.find(t => t.key === (visitType || 'initial'));
  const invoiceAmount = apptType?.fee ?? 0;
  const status        = doctor.autoAcceptAppointments ? 'confirmed' : 'pending';

  const appt = new Appointment({
    doctorId,
    patientId:       userId,
    locationId,
    locationName:    loc.name,
    locationAddress: loc.address,
    locationType:    loc.type,
    date:            new Date(date),
    timeSlot,
    visitType:       visitType || 'initial',
    reason:          reason || '',
    invoiceAmount,
    status,
  });
  await appt.save();

  return {
    booked:        true,
    appointmentId: String(appt._id),
    doctor:        doctor.userId?.name,
    date,
    timeSlot,
    status,
  };
}

async function listMyAppointments(_input, { userId }) {
  const appts = await Appointment.find({
    patientId: userId,
    date:      { $gte: new Date() },
    status:    { $nin: ['cancelled', 'archived', 'completed'] },
  })
    .populate('doctorId', 'name')
    .sort({ date: 1 })
    .limit(5);

  return {
    appointments: appts.map(a => ({
      appointmentId: String(a._id),
      doctor:        a.doctorId?.name || 'Unknown',
      date:          a.date.toISOString().split('T')[0],
      timeSlot:      a.timeSlot,
      status:        a.status,
    })),
  };
}

async function cancelAppointment({ appointmentId }, { userId, patientId }) {
  const appt = await Appointment.findById(appointmentId);
  // appt.patientId may store either User._id (userId) or legacy Patient._id — check both
  const isOwner = String(appt?.patientId) === String(userId) ||
                  String(appt?.patientId) === String(patientId);
  if (!appt || !isOwner) {
    return { error: 'Appointment not found or not yours.' };
  }
  if (['cancelled', 'completed', 'validated'].includes(appt.status)) {
    return { error: `Cannot cancel appointment with status: ${appt.status}.` };
  }
  appt.status = 'cancelled';
  await appt.save();
  return { cancelled: true, appointmentId };
}

async function savePatientName({ name }, { userId }) {
  await updatePatientName(userId, name);
  return { saved: true, name };
}

const TOOLS = {
  find_doctors:         findDoctors,
  get_available_slots:  getAvailableSlots,
  book_appointment:     bookAppointment,
  list_my_appointments: listMyAppointments,
  cancel_appointment:   cancelAppointment,
  save_patient_name:    savePatientName,
};

async function executeTool(name, input, ctx) {
  const fn = TOOLS[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  try {
    return await fn(input, ctx);
  } catch (err) {
    console.error(`[whatsappAgent] tool=${name} error=${err.message}`);
    return { error: 'An error occurred. Please try again.' };
  }
}

module.exports = { executeTool };
