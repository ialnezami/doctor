'use strict';

/**
 * Seed test accounts for all three roles.
 * Run: npm run seed --workspace=apps/api
 * Or:  node apps/api/src/seed.js
 *
 * Idempotent — safe to run multiple times. Skips accounts that already exist.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const User     = require('./models/User');
const Doctor   = require('./models/Doctor');
const Patient  = require('./models/Patient');
const Lab      = require('./models/Lab');

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/mediconnect';

const ACCOUNTS = [
  {
    role: 'doctor',
    name: 'Dr. Sarah Al-Rashid',
    email: 'doctor.test@mediconnect.com',
    password: 'Doctor12345',
    profile: {
      specialty: 'General Practice',
      bio: 'Test doctor account for development.',
      consultationFee: 50,
      autoAcceptAppointments: true,
      availabilitySlots: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' },
      ],
    },
  },
  {
    role: 'patient',
    name: 'Test Patient',
    email: 'patient.test@mediconnect.com',
    password: 'Patient12345',
    profile: {
      dateOfBirth: new Date('1990-06-15'),
      bloodType: 'O+',
      allergies: ['Penicillin'],
      conditions: ['Hypertension'],
    },
  },
  {
    role: 'laboratory',
    name: 'City Lab',
    email: 'lab.test@mediconnect.com',
    password: 'Lab12345!',
    profile: {
      labName: 'City Lab',
      licenseNumber: 'LAB-TEST-001',
      address: '123 Test Street, Testville',
      isApproved: true,
    },
  },
];

async function seedAccount(account) {
  const { role, name, email, password, profile } = account;

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`  ℹ️  ${role} already exists: ${email}`);
    return;
  }

  const user = await User.create({ name, email, password, role });

  if (role === 'doctor') {
    await Doctor.create({ userId: user._id, ...profile });
  } else if (role === 'patient') {
    await Patient.create({ userId: user._id, ...profile });
  } else if (role === 'laboratory') {
    await Lab.create({ userId: user._id, ...profile });
  }

  console.log(`  ✅ Created ${role}: ${email}`);
}

async function main() {
  console.log('Connecting to MongoDB:', MONGO_URI.replace(/\/\/.*@/, '//***@'));
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  console.log('Seeding test accounts...');
  for (const account of ACCOUNTS) {
    await seedAccount(account);
  }

  console.log(`
─────────────────────────────────────────
  TEST CREDENTIALS
─────────────────────────────────────────
  PATIENT
    Email:    patient.test@mediconnect.com
    Password: Patient12345

  DOCTOR
    Email:    doctor.test@mediconnect.com
    Password: Doctor12345
    Specialty: General Practice
    Availability: Mon–Fri 09:00–17:00
    Auto-accept: YES

  LABORATORY  (pre-approved)
    Email:    lab.test@mediconnect.com
    Password: Lab12345!
─────────────────────────────────────────
  Booking test: log in as patient → Find Doctor → search "Sarah" → book any weekday slot
`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
