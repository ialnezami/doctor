// Seed script: creates a test doctor with Mon-Fri availability + a test patient
// Run: node scripts/seed-test-doctor.mjs

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
  console.log('Seeding test doctor...');

  // 1. Register doctor
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
      console.log('ℹ️  Doctor already exists — logging in instead');
      const login = await post('/auth/login', { email: 'doctor.test@mediconnect.com', password: 'Doctor12345' });
      doctorToken = login.token;
      doctorUser = login.user;
    } else {
      throw err;
    }
  }

  // 2. Get doctor profile _id via search, matched by logged-in user's ID
  const doctors = await get('/doctors?name=Sarah', doctorToken);
  const myDoc = doctors.find(d => {
    const uid = d.userId?._id ?? d.userId;
    return uid?.toString() === doctorUser.id;
  });
  if (!myDoc) throw new Error('Could not find Doctor record for this user — check DB');
  const doctorId = myDoc._id;
  console.log('  Doctor._id:', doctorId);

  // 3. Set Mon-Fri availability (dayOfWeek 1-5) + autoAccept
  await patch(`/doctors/${doctorId}/settings`, {
    autoAcceptAppointments: true,
    availabilitySlots: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }, // Mon
      { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' }, // Tue
      { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' }, // Wed
      { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' }, // Thu
      { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' }, // Fri
    ],
  }, doctorToken);
  console.log('✅ Availability set (Mon-Fri 09:00-17:00, auto-accept ON)');

  // 4. Register test patient
  let patientUser = null;
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
      console.log('ℹ️  Patient already exists — logging in instead');
      const login = await post('/auth/login', { email: 'patient.test@mediconnect.com', password: 'Patient12345' });
      patientUser = login.user;
    } else {
      console.warn('⚠️  Patient registration failed (DB index issue — use existing patient account):', err.message.slice(0, 80));
    }
  }

  console.log('\n─────────────────────────────────');
  console.log('TEST CREDENTIALS');
  console.log('─────────────────────────────────');
  console.log('DOCTOR');
  console.log('  Email:    doctor.test@mediconnect.com');
  console.log('  Password: Doctor12345');
  console.log('  Name:     Dr. Sarah Al-Rashid');
  console.log('  Specialty: General Practice');
  console.log('  Availability: Mon-Fri 09:00-17:00');
  console.log('  Auto-accept: YES');
  console.log('');
  console.log('PATIENT');
  console.log('  Email:    patient.test@mediconnect.com');
  console.log('  Password: Patient12345');
  console.log('─────────────────────────────────');
  console.log('\nBooking workflow: log in as patient → Find Doctor → search "Sarah" → book any weekday slot');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
