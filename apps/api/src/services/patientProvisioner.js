'use strict';

const User    = require('../models/User');
const Patient = require('../models/Patient');
const { hmacHash }       = require('../utils/blindIndex');
const { normalizePhone } = require('../utils/phoneUtils');

/**
 * Find or silently create a patient account from a WhatsApp phone number.
 * Phone is normalized to E.164; the pre-save hook on User maintains phoneHash.
 * Returns { userId, patientId } — both are MongoDB ObjectIds (as strings).
 */
async function findOrCreatePatient(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const phoneHash = hmacHash(phone);

  const existingUser = await User.findOne({ phoneHash });
  if (existingUser) {
    const patient = await Patient.findOne({ userId: existingUser._id });
    return { userId: String(existingUser._id), patientId: String(patient._id) };
  }

  // Silent creation — no email, no password, no consent version required
  const user = new User({
    name:    'WhatsApp User',   // placeholder; agent will call save_patient_name
    role:    'patient',
    phone,
    whatsappLinked: false,
  });
  await user.save();

  const patient = new Patient({ userId: user._id });
  await patient.save();

  return { userId: String(user._id), patientId: String(patient._id) };
}

/**
 * Update the patient's display name once the agent collects it in conversation.
 */
async function updatePatientName(userId, name) {
  await User.findByIdAndUpdate(userId, { name: String(name).trim().slice(0, 100) });
}

module.exports = { findOrCreatePatient, updatePatientName };
