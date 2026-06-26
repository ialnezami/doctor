// Fix corrupt patient documents + seed test doctor + register test patient
// Run: MONGODB_URI=mongodb://localhost:27017/mediconnect node scripts/fix-db-and-seed.mjs

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/mediconnect';
const BASE = 'http://localhost:3001/api';

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function patch(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  // Step 1: Fix corrupt DB documents via direct mongoose connection
  console.log('Connecting to MongoDB to fix corrupt documents...');
  await mongoose.connect(MONGO_URI);
  const Patient = mongoose.model('Patient', new mongoose.Schema({}, { strict: false }), 'patients');
  const { modifiedCount } = await Patient.updateMany(
    { 'homeLocation.coordinates': null },
    { $unset: { homeLocation: '' } }
  );
  console.log(`✅ Fixed ${modifiedCount} corrupt patient document(s) (null homeLocation removed)`);
  await mongoose.disconnect();

  // Step 2: Seed doctor
  console.log('\nSeeding test doctor...');
  let doctorToken, doctorUser;
  try {
    const reg = await post('/auth/register', {
      name: 'Dr. Sarah Al-Rashid',
      email: 'doctor.test@mediconnect.com',
      password: 'Doctor12345',
      role: 'doctor',
      specialty: 'General Practice',
    });
    doctorToken = reg.token;
    doctorUser = reg.user;
    console.log('✅ Doctor registered:', doctorUser.email);
  } catch (err) {
    if (err.message.includes('409') || err.message.includes('already')) {
      console.log('ℹ️  Doctor already exists — logging in');
      const login = await post('/auth/login', { email: 'doctor.test@mediconnect.com', password: 'Doctor12345' });
      doctorToken = login.token;
      doctorUser = login.user;
    } else { throw err; }
  }

  // Step 3: Find Doctor record by matching userId
  const allDoctors = await get('/doctors?name=Sarah', doctorToken);
  const myDoc = allDoctors.find(d => (d.userId?._id ?? d.userId)?.toString() === doctorUser.id);
  if (!myDoc) throw new Error('Could not find Doctor record for this user');
  const doctorId = myDoc._id;
  console.log('  Doctor._id:', doctorId);

  // Step 4: Set Mon-Fri availability + autoAccept
  await patch(`/doctors/${doctorId}/settings`, {
    autoAcceptAppointments: true,
    availabilitySlots: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' },
    ],
  }, doctorToken);
  console.log('✅ Availability set (Mon-Fri 09:00-17:00, auto-accept ON)');

  // Step 5: Register test patient
  let patientUser = null;
  console.log('\nSeeding test patient...');
  try {
    const reg = await post('/auth/register', {
      name: 'Test Patient',
      email: 'patient.test@mediconnect.com',
      password: 'Patient12345',
      role: 'patient',
    });
    patientUser = reg.user;
    console.log('✅ Patient registered:', patientUser.email);
  } catch (err) {
    if (err.message.includes('409') || err.message.includes('already')) {
      console.log('ℹ️  Patient already exists');
      patientUser = { email: 'patient.test@mediconnect.com' };
    } else {
      console.warn('⚠️  Patient registration failed:', err.message.slice(0, 120));
    }
  }

  console.log('\n─────────────────────────────────');
  console.log('TEST CREDENTIALS');
  console.log('─────────────────────────────────');
  console.log('DOCTOR');
  console.log('  Email:     doctor.test@mediconnect.com');
  console.log('  Password:  Doctor12345');
  console.log('  Name:      Dr. Sarah Al-Rashid');
  console.log('  Specialty: General Practice');
  console.log('  Available: Mon-Fri 09:00-17:00 (30-min slots)');
  console.log('  Auto-accept: YES (booking confirms immediately)');
  console.log('');
  console.log('PATIENT');
  console.log('  Email:    patient.test@mediconnect.com');
  console.log('  Password: Patient12345');
  console.log('─────────────────────────────────');
  console.log('\nBooking workflow:');
  console.log('  1. Open mobile app → log in as patient');
  console.log('  2. Find Doctor tab → search "Sarah"');
  console.log('  3. Tap Dr. Sarah Al-Rashid → pick any weekday');
  console.log('  4. Select a 30-min slot → confirm booking');
  console.log('  5. Appointment auto-confirms (no doctor action needed)');
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
