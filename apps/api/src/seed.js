const mongoose = require('mongoose');
const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const Lab = require('./models/Lab');

const seedData = [
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

async function seed() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URL;
    if (!mongoUri) {
      throw new Error('MONGODB_URI or MONGODB_URL environment variable not set');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Clear existing data
    console.log('Clearing existing data...');
    await User.deleteMany({});
    await Doctor.deleteMany({});
    await Patient.deleteMany({});
    await Lab.deleteMany({});

    // Seed data
    for (const item of seedData) {
      console.log(`Creating ${item.role}: ${item.name}`);

      // Create user
      const user = await User.create({
        name: item.name,
        email: item.email,
        password: item.password,
        role: item.role,
      });

      // Create role-specific profile
      if (item.role === 'doctor') {
        await Doctor.create({
          userId: user._id,
          ...item.profile,
        });
      } else if (item.role === 'patient') {
        await Patient.create({
          userId: user._id,
          ...item.profile,
        });
      } else if (item.role === 'laboratory') {
        await Lab.create({
          userId: user._id,
          ...item.profile,
        });
      }

      console.log(`✓ Created ${item.role}: ${item.email}`);
    }

    console.log('\n✓ Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
}

seed();

