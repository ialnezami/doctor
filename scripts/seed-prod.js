'use strict';

/**
 * Standalone production seed — no .env required.
 * Usage: MONGODB_URI="mongodb+srv://..." node scripts/seed-prod.js
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌  Set MONGODB_URI env var before running.');
  process.exit(1);
}

const userSchema = new mongoose.Schema({
  name:      String,
  email:     { type: String, unique: true },
  password:  String,
  role:      String,
}, { timestamps: true });

const doctorSchema = new mongoose.Schema({
  userId:                 mongoose.Schema.Types.ObjectId,
  specialty:              String,
  bio:                    String,
  consultationFee:        Number,
  autoAcceptAppointments: Boolean,
  availabilitySlots:      Array,
}, { timestamps: true });

const patientSchema = new mongoose.Schema({
  userId:      mongoose.Schema.Types.ObjectId,
  dateOfBirth: Date,
  bloodType:   String,
  allergies:   [String],
  conditions:  [String],
}, { timestamps: true });

const User    = mongoose.model('User',    userSchema);
const Doctor  = mongoose.model('Doctor',  doctorSchema);
const Patient = mongoose.model('Patient', patientSchema);

const ACCOUNTS = [
  {
    role: 'doctor',
    name: 'Dr. Sarah Al-Rashid',
    email: 'doctor.test@mediconnect.com',
    password: 'Doctor12345',
    profile: {
      specialty: 'General Practice',
      bio: 'Test doctor account.',
      consultationFee: 50,
      autoAcceptAppointments: true,
      availabilitySlots: [1,2,3,4,5].map(d => ({
        dayOfWeek: d, startTime: '09:00', endTime: '17:00',
      })),
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
];

async function main() {
  console.log('Connecting...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  for (const acct of ACCOUNTS) {
    const exists = await User.findOne({ email: acct.email });
    if (exists) {
      console.log(`  ℹ️  ${acct.role} already exists: ${acct.email}`);
      continue;
    }

    const hash = await bcrypt.hash(acct.password, 10);
    const user = await User.create({ name: acct.name, email: acct.email, password: hash, role: acct.role });

    if (acct.role === 'doctor')  await Doctor.create({ userId: user._id, ...acct.profile });
    if (acct.role === 'patient') await Patient.create({ userId: user._id, ...acct.profile });

    console.log(`  ✅ Created ${acct.role}: ${acct.email} / ${acct.password}`);
  }

  console.log('\nDone.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
