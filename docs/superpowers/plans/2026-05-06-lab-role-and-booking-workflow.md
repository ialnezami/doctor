# Lab Role & Appointment Booking Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a laboratory user role with upload-only access and admin approval gate, replace mock doctor search with real API calls, and build a multi-step appointment booking flow (search → doctor profile + slot picker → booking form → confirmation) with per-doctor auto-accept toggle.

**Architecture:** Backend-first (models → routes → mount), then web frontend, then mobile. Each platform follows the same step order: search → profile → book → confirm. All new routes follow existing `auth` + `requireRole` middleware pattern. No new libraries required on any platform.

**Tech Stack:** Node.js + Express + Mongoose (API), React + Vite + React Router v6 (web), React Native + Expo + React Navigation v6 (mobile)

---

## File Map

**Create:**
- `apps/api/src/models/Lab.js`
- `apps/api/src/middleware/adminAuth.js`
- `apps/api/src/routes/admin.js`
- `apps/web/src/api/doctors.js`
- `apps/web/src/pages/patient/DoctorProfilePage.jsx`
- `apps/web/src/pages/patient/BookAppointmentPage.jsx`
- `apps/web/src/pages/patient/BookConfirmedPage.jsx`
- `apps/web/src/pages/doctor/DoctorSettingsPage.jsx`
- `apps/web/src/pages/lab/LabDashboardPage.jsx`
- `apps/mobile/src/api/doctors.js`
- `apps/mobile/src/navigation/PatientStack.js`
- `apps/mobile/src/navigation/LabTabs.js`
- `apps/mobile/src/screens/patient/DoctorProfileScreen.js`
- `apps/mobile/src/screens/patient/BookAppointmentScreen.js`
- `apps/mobile/src/screens/patient/BookConfirmedScreen.js`
- `apps/mobile/src/screens/doctor/SettingsScreen.js`
- `apps/mobile/src/screens/lab/LabUploadsScreen.js`

**Modify:**
- `apps/api/src/models/User.js` — add `laboratory` to role enum
- `apps/api/src/models/Doctor.js` — add `autoAcceptAppointments` field
- `apps/api/src/models/Patient.js` — add `homeLocation`, `city` fields
- `apps/api/src/routes/auth.js` — handle lab registration
- `apps/api/src/routes/doctors.js` — name search, available-slots endpoint, settings endpoint
- `apps/api/src/routes/appointments.js` — auto-accept on POST
- `apps/api/src/routes/patients.js` — add GET /me and PATCH /me/location
- `apps/api/src/routes/labResults.js` — allow laboratory role, isApproved gate
- `apps/api/src/index.js` — mount admin route
- `apps/web/src/router/index.jsx` — new routes + lab redirect
- `apps/web/src/components/layout/Sidebar.jsx` — Settings + lab nav
- `apps/web/src/pages/patient/FindDoctorPage.jsx` — real API
- `apps/web/src/pages/auth/RegisterPage.jsx` — lab role option
- `apps/mobile/src/navigation/AppNavigator.js` — lab branch
- `apps/mobile/src/navigation/PatientTabs.js` — use PatientStack
- `apps/mobile/src/navigation/DoctorTabs.js` — add Settings tab
- `apps/mobile/src/screens/auth/RegisterScreen.js` — lab role option

---

## Task 1: Lab model

**Files:**
- Create: `apps/api/src/models/Lab.js`

- [ ] **Step 1: Create the model**

```js
// apps/api/src/models/Lab.js
const mongoose = require('mongoose');

const labSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  labName:       { type: String, required: true },
  licenseNumber: { type: String, default: '' },
  address:       { type: String, default: '' },
  isApproved:    { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Lab', labSchema);
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/models/Lab.js
git commit -m "feat(api): add Lab model with isApproved gate"
```

---

## Task 2: Update User, Doctor, Patient models

**Files:**
- Modify: `apps/api/src/models/User.js`
- Modify: `apps/api/src/models/Doctor.js`
- Modify: `apps/api/src/models/Patient.js`

- [ ] **Step 1: Add `laboratory` to User role enum**

In `apps/api/src/models/User.js`, change:
```js
role: { type: String, enum: ['doctor', 'patient'], required: true },
```
to:
```js
role: { type: String, enum: ['doctor', 'patient', 'laboratory'], required: true },
```

- [ ] **Step 2: Add `autoAcceptAppointments` to Doctor model**

In `apps/api/src/models/Doctor.js`, after the `isVerified` field add:
```js
autoAcceptAppointments: { type: Boolean, default: false },
```

- [ ] **Step 3: Add `homeLocation` and `city` to Patient model**

In `apps/api/src/models/Patient.js`, after the `userId` field add:
```js
homeLocation: {
  type: { type: String, default: 'Point' },
  coordinates: { type: [Number], default: null },
},
city: { type: String, default: '' },
```
After the schema definition, add the 2dsphere index:
```js
patientSchema.index({ homeLocation: '2dsphere' }, { sparse: true });
```

- [ ] **Step 4: Verify API still starts**

```bash
cd apps/api && npm run dev
```
Expected: `MongoDB connected` and `API running on :3001` with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/models/User.js apps/api/src/models/Doctor.js apps/api/src/models/Patient.js
git commit -m "feat(api): add laboratory role, autoAcceptAppointments, patient homeLocation"
```

---

## Task 3: Admin middleware + admin routes

**Files:**
- Create: `apps/api/src/middleware/adminAuth.js`
- Create: `apps/api/src/routes/admin.js`

- [ ] **Step 1: Add ADMIN_SECRET to .env**

Add to `apps/api/.env`:
```
ADMIN_SECRET=changeme-local-admin
```

- [ ] **Step 2: Create adminAuth middleware**

```js
// apps/api/src/middleware/adminAuth.js
module.exports = (req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ message: 'Admin access denied' });
  }
  next();
};
```

- [ ] **Step 3: Create admin routes**

```js
// apps/api/src/routes/admin.js
const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const Lab = require('../models/Lab');
const User = require('../models/User');

// GET /api/admin/labs — list pending labs
router.get('/labs', adminAuth, async (req, res, next) => {
  try {
    const labs = await Lab.find({ isApproved: false }).populate('userId', 'name email createdAt');
    res.json(labs);
  } catch (err) { next(err); }
});

// PATCH /api/admin/labs/:id/approve
router.patch('/labs/:id/approve', adminAuth, async (req, res, next) => {
  try {
    const lab = await Lab.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
    if (!lab) return res.status(404).json({ message: 'Lab not found' });
    res.json(lab);
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Mount admin route in index.js**

In `apps/api/src/index.js`, after the existing route mounts add:
```js
app.use('/api/admin', require('./routes/admin'));
```

- [ ] **Step 5: Test**

```bash
curl -X GET http://localhost:3001/api/admin/labs \
  -H "x-admin-secret: changeme-local-admin"
```
Expected: `[]` (empty array — no labs yet).

```bash
curl -X GET http://localhost:3001/api/admin/labs \
  -H "x-admin-secret: wrong-secret"
```
Expected: `{"message":"Admin access denied"}` with 403.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/adminAuth.js apps/api/src/routes/admin.js apps/api/src/index.js apps/api/.env
git commit -m "feat(api): add admin middleware and lab approval routes"
```

---

## Task 4: Auth — lab registration

**Files:**
- Modify: `apps/api/src/routes/auth.js`

- [ ] **Step 1: Update role validation and Lab creation**

In `apps/api/src/routes/auth.js`, change the role validator:
```js
body('role').isIn(['doctor', 'patient']),
```
to:
```js
body('role').isIn(['doctor', 'patient', 'laboratory']),
```

Inside the register handler, add `Lab` require at the top of the file:
```js
const Lab = require('../models/Lab');
```

After the `Doctor.create` / `Patient.create` block, add the lab branch:
```js
if (role === 'doctor') {
  await Doctor.create({ userId: user._id, specialty: specialty || 'General' });
} else if (role === 'laboratory') {
  const { labName } = req.body;
  await Lab.create({ userId: user._id, labName: labName || name });
} else {
  await Patient.create({ userId: user._id, dateOfBirth });
}
```

Update the register response's navigate hint — change:
```js
res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
```
No change needed — role is already returned and the frontend will handle routing.

- [ ] **Step 2: Test lab registration**

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"City Lab","email":"lab@test.com","password":"password123","role":"laboratory","labName":"City Diagnostics Lab"}'
```
Expected: `{"token":"...","user":{"id":"...","name":"City Lab","email":"lab@test.com","role":"laboratory"}}` with 201.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/auth.js
git commit -m "feat(api): support laboratory role registration"
```

---

## Task 5: Patient profile endpoints

**Files:**
- Modify: `apps/api/src/routes/patients.js`

- [ ] **Step 1: Add GET /me and PATCH /me/location**

In `apps/api/src/routes/patients.js`, add at the top (before existing routes):
```js
const User = require('../models/User');

// GET /api/patients/me
router.get('/me', auth, requireRole('patient'), async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ userId: req.user.id });
    if (!patient) return res.status(404).json({ message: 'Profile not found' });
    res.json(patient);
  } catch (err) { next(err); }
});

// PATCH /api/patients/me/location
router.patch('/me/location', auth, requireRole('patient'), async (req, res, next) => {
  try {
    const { city, lat, lng } = req.body;
    if (!city) return res.status(422).json({ message: 'city is required' });
    const update = { city };
    if (lat != null && lng != null) {
      update.homeLocation = { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] };
    }
    const patient = await Patient.findOneAndUpdate(
      { userId: req.user.id },
      { $set: update },
      { new: true }
    );
    res.json(patient);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Test** (requires a patient JWT — register one first if needed)

```bash
# Register a patient and save the token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Patient","email":"patient@test.com","password":"password123","role":"patient"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -X PATCH http://localhost:3001/api/patients/me/location \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"city":"Riyadh","lat":24.7136,"lng":46.6753}'
```
Expected: patient document with `homeLocation.coordinates: [46.6753, 24.7136]` and `city: "Riyadh"`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/patients.js
git commit -m "feat(api): add GET /patients/me and PATCH /patients/me/location"
```

---

## Task 6: Doctor search — name param + location fallback

**Files:**
- Modify: `apps/api/src/routes/doctors.js`

- [ ] **Step 1: Add name search and patient location fallback**

Replace the existing `GET /api/doctors` handler with:
```js
router.get('/', auth, async (req, res, next) => {
  try {
    const { lat, lng, radius = 10000, specialty, name, page = 1, limit = 20 } = req.query;

    let resolvedLat = lat ? parseFloat(lat) : null;
    let resolvedLng = lng ? parseFloat(lng) : null;

    // Fall back to patient's saved homeLocation
    if (!resolvedLat && req.user.role === 'patient') {
      const Patient = require('../models/Patient');
      const p = await Patient.findOne({ userId: req.user.id }).select('homeLocation');
      if (p?.homeLocation?.coordinates?.length === 2) {
        [resolvedLng, resolvedLat] = p.homeLocation.coordinates;
      }
    }

    let userQuery = { role: 'doctor' };
    if (name) userQuery.name = new RegExp(name, 'i');

    if (resolvedLat && resolvedLng) {
      userQuery.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [resolvedLng, resolvedLat] },
          $maxDistance: parseInt(radius),
        },
      };
    }

    const users = await User.find(userQuery).select('-password').limit(parseInt(limit)).skip((page - 1) * parseInt(limit));
    const userIds = users.map(u => u._id);

    let doctorQuery = { userId: { $in: userIds } };
    if (specialty) doctorQuery.specialty = new RegExp(specialty, 'i');

    const doctors = await Doctor.find(doctorQuery).populate('userId', 'name email location');
    res.json(doctors);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Test name search**

```bash
curl "http://localhost:3001/api/doctors?name=sarah" \
  -H "Authorization: Bearer $TOKEN"
```
Expected: array of doctors whose user name contains "sarah" (case-insensitive).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/doctors.js
git commit -m "feat(api): add name search and patient location fallback to doctor search"
```

---

## Task 7: Available slots endpoint

**Files:**
- Modify: `apps/api/src/routes/doctors.js`

- [ ] **Step 1: Add the slot generator helper and endpoint**

In `apps/api/src/routes/doctors.js`, add the `Appointment` require at the top:
```js
const Appointment = require('../models/Appointment');
```

Add this helper function before the router definition:
```js
function generateSlots(startTime, endTime) {
  const slots = [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let cur = sh * 60 + sm;
  const endMin = eh * 60 + em;
  while (cur + 30 <= endMin) {
    slots.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`);
    cur += 30;
  }
  return slots;
}
```

Add the new endpoint after the existing `GET /:id` route and before `PUT /:id`:
```js
// GET /api/doctors/:id/available-slots?date=YYYY-MM-DD
router.get('/:id/available-slots', auth, async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(422).json({ message: 'date query param required (YYYY-MM-DD)' });

    const doctor = await Doctor.findById(req.params.id).select('availabilitySlots userId');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const d = new Date(date);
    const dayOfWeek = d.getUTCDay(); // 0=Sun

    const avail = doctor.availabilitySlots.find(s => s.dayOfWeek === dayOfWeek);
    if (!avail) return res.json([]); // doctor not available that day

    const allSlots = generateSlots(avail.startTime, avail.endTime);

    // Find already-booked start times for this doctor on this date
    const startOfDay = new Date(date + 'T00:00:00.000Z');
    const endOfDay   = new Date(date + 'T23:59:59.999Z');
    const booked = await Appointment.find({
      doctorId: doctor.userId,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['pending', 'confirmed'] },
    }).select('timeSlot');

    const bookedTimes = new Set(booked.map(a => a.timeSlot.start));

    const result = allSlots.map(time => ({ time, available: !bookedTimes.has(time) }));
    res.json(result);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Test slot generation logic manually**

Create a quick test file `apps/api/test-slots.js`:
```js
function generateSlots(startTime, endTime) {
  const slots = [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let cur = sh * 60 + sm;
  const endMin = eh * 60 + em;
  while (cur + 30 <= endMin) {
    slots.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`);
    cur += 30;
  }
  return slots;
}
console.assert(JSON.stringify(generateSlots('09:00','10:00')) === '["09:00","09:30"]', 'basic slots');
console.assert(generateSlots('09:00','09:00').length === 0, 'empty range');
console.assert(generateSlots('09:00','09:29').length === 0, 'less than 30 min');
console.log('All slot tests passed');
```

```bash
node apps/api/test-slots.js
```
Expected: `All slot tests passed`

Delete the test file after:
```bash
rm apps/api/test-slots.js
```

- [ ] **Step 3: Test the endpoint** (requires a doctor with availabilitySlots set)

```bash
# Set slots for a doctor first — find a doctor _id from GET /api/doctors
DOCTOR_JWT=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@test.com","password":"password123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Get doctor profile id
DOCTOR_ID=$(curl -s "http://localhost:3001/api/doctors" \
  -H "Authorization: Bearer $DOCTOR_JWT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['_id'] if d else '')")

curl "http://localhost:3001/api/doctors/$DOCTOR_ID/available-slots?date=2026-05-11" \
  -H "Authorization: Bearer $TOKEN"
```
Expected: `[]` if doctor has no slots for that day, or an array of `{time, available}` objects.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/doctors.js
git commit -m "feat(api): add available-slots endpoint with 30-min slot generation"
```

---

## Task 8: Booking auto-accept + doctor settings endpoint

**Files:**
- Modify: `apps/api/src/routes/appointments.js`
- Modify: `apps/api/src/routes/doctors.js`

- [ ] **Step 1: Auto-accept in booking**

In `apps/api/src/routes/appointments.js`, add Doctor require at the top:
```js
const Doctor = require('../models/Doctor');
```

Replace the `Appointment.create` call in `POST /api/appointments`:
```js
// was:
const appt = await Appointment.create({
  doctorId,
  patientId: req.user.id,
  date: new Date(date),
  timeSlot,
  visitType,
  reason,
});

// replace with:
const doctorProfile = await Doctor.findOne({ userId: doctorId }).select('autoAcceptAppointments');
const status = doctorProfile?.autoAcceptAppointments ? 'confirmed' : 'pending';

const appt = await Appointment.create({
  doctorId,
  patientId: req.user.id,
  date: new Date(date),
  timeSlot,
  visitType,
  reason,
  status,
});
```

- [ ] **Step 2: Doctor settings endpoint**

In `apps/api/src/routes/doctors.js`, add after the `PUT /:id` route:
```js
// PATCH /api/doctors/:id/settings
router.patch('/:id/settings', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Not found' });
    if (doctor.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    const { autoAcceptAppointments, availabilitySlots } = req.body;
    if (autoAcceptAppointments !== undefined) doctor.autoAcceptAppointments = autoAcceptAppointments;
    if (availabilitySlots !== undefined) doctor.availabilitySlots = availabilitySlots;
    await doctor.save();
    res.json({ autoAcceptAppointments: doctor.autoAcceptAppointments, availabilitySlots: doctor.availabilitySlots });
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Test auto-accept** (toggle autoAccept on, then book)

```bash
# Turn on autoAccept for a doctor
curl -X PATCH "http://localhost:3001/api/doctors/$DOCTOR_ID/settings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DOCTOR_JWT" \
  -d '{"autoAcceptAppointments":true}'

# Book as patient — should come back confirmed
curl -X POST http://localhost:3001/api/appointments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"doctorId\":\"...\",\"date\":\"2026-05-11\",\"timeSlot\":{\"start\":\"09:00\",\"end\":\"09:30\"},\"visitType\":\"initial\",\"reason\":\"Checkup\"}"
```
Expected: appointment with `"status":"confirmed"` when autoAccept is true, `"status":"pending"` when false.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/appointments.js apps/api/src/routes/doctors.js
git commit -m "feat(api): auto-accept appointments and doctor settings endpoint"
```

---

## Task 9: Lab results RBAC — allow laboratory role

**Files:**
- Modify: `apps/api/src/routes/labResults.js`

- [ ] **Step 1: Update POST / to allow laboratory + isApproved check**

In `apps/api/src/routes/labResults.js`, add Lab require at top:
```js
const Lab = require('../models/Lab');
```

Replace the first route:
```js
// was:
router.post('/', auth, requireRole('doctor'), async (req, res, next) => {

// replace with:
router.post('/', auth, requireRole('doctor', 'laboratory'), async (req, res, next) => {
```

After the opening `try {`, add an isApproved check for lab users:
```js
if (req.user.role === 'laboratory') {
  const lab = await Lab.findOne({ userId: req.user.id });
  if (!lab?.isApproved) return res.status(403).json({ message: 'Lab account pending approval' });
}
```

- [ ] **Step 2: Add GET /my-uploads for lab users**

After the existing `GET /search` route, add:
```js
// GET /api/lab-results/my-uploads — lab sees only their uploads
router.get('/my-uploads', auth, requireRole('laboratory'), async (req, res, next) => {
  try {
    const results = await LabResult.find({ doctorId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('patientId', 'name');
    res.json(results);
  } catch (err) { next(err); }
});
```
Note: `doctorId` field stores the uploader's userId — lab uploads will use this same field.

- [ ] **Step 3: Test lab upload blocked when not approved**

```bash
LAB_TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lab@test.com","password":"password123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -X POST http://localhost:3001/api/lab-results \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LAB_TOKEN" \
  -d '{"patientId":"...","labName":"City Lab","tests":[]}'
```
Expected: `{"message":"Lab account pending approval"}` with 403.

- [ ] **Step 4: Approve lab then retry**

```bash
# Get lab document id
LAB_DOC_ID=$(curl -s http://localhost:3001/api/admin/labs \
  -H "x-admin-secret: changeme-local-admin" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['_id'] if d else '')")

curl -X PATCH "http://localhost:3001/api/admin/labs/$LAB_DOC_ID/approve" \
  -H "x-admin-secret: changeme-local-admin"
```
Expected: lab document with `"isApproved":true`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/labResults.js
git commit -m "feat(api): allow laboratory role to upload lab results with isApproved gate"
```

---

## Task 10: Web — doctors API module

**Files:**
- Create: `apps/web/src/api/doctors.js`

- [ ] **Step 1: Create the module**

```js
// apps/web/src/api/doctors.js
import client from './client';

export const getDoctors = (params) => client.get('/doctors', { params });
export const getDoctor = (id) => client.get(`/doctors/${id}`);
export const getAvailableSlots = (id, date) => client.get(`/doctors/${id}/available-slots`, { params: { date } });
export const updateDoctorSettings = (id, data) => client.patch(`/doctors/${id}/settings`, data);
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/api/doctors.js
git commit -m "feat(web): add doctors API module"
```

---

## Task 11: Web — RegisterPage lab role

**Files:**
- Modify: `apps/web/src/pages/auth/RegisterPage.jsx`

- [ ] **Step 1: Add laboratory to the role selector**

Replace the role selector array `['patient','doctor']` with `['patient','doctor','laboratory']`:
```jsx
{['patient','doctor','laboratory'].map(r => (
  <button key={r} onClick={() => setForm(p => ({ ...p, role: r }))}
    style={{ padding:10, border: form.role===r ? '1px solid var(--border2)' : 'none', borderRadius:7,
      background: form.role===r ? 'var(--bg2)' : 'transparent',
      color: form.role===r ? 'var(--mint)' : 'var(--text2)',
      fontWeight: form.role===r ? 600 : 500, fontSize:13, textTransform:'capitalize', transition:'all .18s' }}>
    {r === 'doctor' ? '👨‍⚕️ Doctor' : r === 'patient' ? '🧑 Patient' : '🧪 Laboratory'}
  </button>
))}
```

- [ ] **Step 2: Add labName field shown when role === 'laboratory'**

Update initial form state:
```js
const [form, setForm] = useState({ name:'', email:'', password:'', role:'patient', specialty:'', labName:'' });
```

After the doctor specialty block, add:
```jsx
{form.role === 'laboratory' && (
  <div style={{ marginBottom:14 }}>
    <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:6 }}>Lab Name</label>
    <input value={form.labName} onChange={e => setForm(p => ({ ...p, labName: e.target.value }))}
      placeholder="e.g. City Diagnostics Lab"
      style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13, outline:'none' }} />
  </div>
)}
```

- [ ] **Step 3: Update the post-register navigation**

In the `submit` function, change the navigate call:
```js
navigate(user.role === 'doctor' ? '/dashboard' : user.role === 'laboratory' ? '/lab' : '/find-doctor');
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/auth/RegisterPage.jsx
git commit -m "feat(web): add laboratory role to registration form"
```

---

## Task 12: Web — FindDoctorPage real API

**Files:**
- Modify: `apps/web/src/pages/patient/FindDoctorPage.jsx`

- [ ] **Step 1: Replace mock data with real API**

Replace the entire file content:
```jsx
// apps/web/src/pages/patient/FindDoctorPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDoctors } from '../../api/doctors';
import Button from '../../components/ui/Button';

const SPECIALTIES = ['All','Cardiology','Dermatology','Pediatrics','Orthopedics','Neurology','General'];
const GRADIENTS = ['linear-gradient(135deg,#0fe3b0,#0891b2)','linear-gradient(135deg,#f59e0b,#ef4444)','linear-gradient(135deg,#8b5cf6,#3b82f6)','linear-gradient(135deg,#10b981,#0591d1)'];

export default function FindDoctorPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [spec, setSpec] = useState('All');
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.name = search;
      if (spec !== 'All') params.specialty = spec;
      const data = await getDoctors(params);
      setDoctors(data);
    } catch {
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, [search, spec]);

  useEffect(() => {
    const t = setTimeout(fetchDoctors, 350);
    return () => clearTimeout(t);
  }, [fetchDoctors]);

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>Find a Doctor</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{loading ? 'Searching…' : `${doctors.length} results`}</div>
        </div>
      </div>

      <div style={{ padding:26 }}>
        <div style={{ display:'flex', alignItems:'center', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden', marginBottom:16 }}>
          <span style={{ padding:'0 13px', color:'var(--text3)', fontSize:15 }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, specialty…"
            style={{ flex:1, background:'transparent', border:'none', outline:'none', padding:'11px 0', color:'var(--text)', fontSize:13.5 }} />
        </div>

        <div style={{ display:'flex', gap:7, marginBottom:20, flexWrap:'wrap' }}>
          {SPECIALTIES.map(s => (
            <button key={s} onClick={() => setSpec(s)}
              style={{ padding:'5px 13px', borderRadius:20, border:`1px solid ${spec===s ? 'var(--mint)' : 'var(--border2)'}`, background: spec===s ? 'var(--mint-dim)' : 'transparent', color: spec===s ? 'var(--mint)' : 'var(--text2)', fontSize:12, fontWeight:500, cursor:'pointer' }}>
              {s}
            </button>
          ))}
        </div>

        {loading && <p style={{ color:'var(--text3)', fontSize:13 }}>Loading…</p>}
        {!loading && doctors.length === 0 && <p style={{ color:'var(--text3)', fontSize:13 }}>No doctors found.</p>}

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {doctors.map((doc, i) => {
            const user = doc.userId || {};
            const name = user.name || 'Unknown';
            const initials = name.split(' ').slice(1).map(w => w[0]).join('').slice(0,2) || name.slice(0,2).toUpperCase();
            return (
              <div key={doc._id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:18, display:'flex', gap:14, cursor:'pointer', transition:'all .18s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--mint)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='none'; }}>
                <div style={{ width:52, height:52, borderRadius:11, background:GRADIENTS[i%GRADIENTS.length], display:'grid', placeItems:'center', fontSize:18, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {initials}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14.5, fontWeight:600 }}>{name}</div>
                  <div style={{ fontSize:12.5, color:'var(--mint)', margin:'3px 0' }}>{doc.specialty}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>
                    {doc.consultationFee ? `${doc.consultationFee} SAR` : ''}{doc.yearsOfExperience ? ` · ${doc.yearsOfExperience}y exp` : ''}
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
                  <Button onClick={() => navigate(`/doctor/${doc._id}`)} style={{ padding:'6px 13px', fontSize:12 }}>View</Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/patient/FindDoctorPage.jsx
git commit -m "feat(web): wire FindDoctorPage to real API with debounced search"
```

---

## Task 13: Web — DoctorProfilePage

**Files:**
- Create: `apps/web/src/pages/patient/DoctorProfilePage.jsx`

- [ ] **Step 1: Create the page**

```jsx
// apps/web/src/pages/patient/DoctorProfilePage.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDoctor, getAvailableSlots } from '../../api/doctors';
import Button from '../../components/ui/Button';

function dateLabel(d) {
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}
function toISO(d) {
  return d.toISOString().slice(0,10);
}

export default function DoctorProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()));
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d;
  });

  useEffect(() => { getDoctor(id).then(setDoctor).catch(() => {}); }, [id]);

  useEffect(() => {
    setSlotsLoading(true);
    getAvailableSlots(id, selectedDate)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [id, selectedDate]);

  if (!doctor) return <div style={{ padding:40, color:'var(--text2)' }}>Loading…</div>;

  const user = doctor.userId || {};
  const name = user.name || 'Doctor';

  return (
    <div style={{ padding:26, maxWidth:680 }}>
      {/* Doctor card */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:24, marginBottom:24 }}>
        <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
          <div style={{ width:64, height:64, borderRadius:14, background:'linear-gradient(135deg,#0fe3b0,#0891b2)', display:'grid', placeItems:'center', fontSize:22, fontWeight:700, color:'#fff', flexShrink:0 }}>
            {name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('')}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18, fontWeight:600 }}>{name}</div>
            <div style={{ fontSize:13, color:'var(--mint)', marginTop:3 }}>{doctor.specialty}</div>
            {doctor.bio && <div style={{ fontSize:12.5, color:'var(--text2)', marginTop:8 }}>{doctor.bio}</div>}
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:8, display:'flex', gap:16 }}>
              {doctor.consultationFee > 0 && <span>{doctor.consultationFee} SAR / visit</span>}
              {doctor.yearsOfExperience > 0 && <span>{doctor.yearsOfExperience} years experience</span>}
              {doctor.clinicAddress && <span>📍 {doctor.clinicAddress}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Date strip */}
      <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>Pick a date</div>
      <div style={{ display:'flex', gap:8, marginBottom:20, overflowX:'auto', paddingBottom:4 }}>
        {days.map(d => {
          const iso = toISO(d);
          const active = iso === selectedDate;
          return (
            <button key={iso} onClick={() => setSelectedDate(iso)}
              style={{ flexShrink:0, padding:'8px 14px', borderRadius:'var(--r-sm)', border:`1px solid ${active ? 'var(--mint)' : 'var(--border2)'}`, background: active ? 'var(--mint-dim)' : 'var(--bg2)', color: active ? 'var(--mint)' : 'var(--text2)', fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
              {dateLabel(d)}
            </button>
          );
        })}
      </div>

      {/* Slots */}
      <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>Available times</div>
      {slotsLoading && <p style={{ fontSize:12, color:'var(--text3)' }}>Loading slots…</p>}
      {!slotsLoading && slots.length === 0 && <p style={{ fontSize:12, color:'var(--text3)' }}>No availability on this day.</p>}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        {slots.map(s => (
          <button key={s.time} disabled={!s.available}
            onClick={() => navigate(`/book/${id}?date=${selectedDate}&slot=${s.time}`)}
            style={{ padding:'8px 16px', borderRadius:20, border:`1px solid ${s.available ? 'var(--mint)' : 'var(--border)'}`, background: s.available ? 'var(--mint-dim)' : 'var(--bg3)', color: s.available ? 'var(--mint)' : 'var(--text3)', fontSize:12.5, cursor: s.available ? 'pointer' : 'default', opacity: s.available ? 1 : 0.5 }}>
            {s.time}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/patient/DoctorProfilePage.jsx
git commit -m "feat(web): add DoctorProfilePage with date strip and slot picker"
```

---

## Task 14: Web — BookAppointmentPage + BookConfirmedPage

**Files:**
- Create: `apps/web/src/pages/patient/BookAppointmentPage.jsx`
- Create: `apps/web/src/pages/patient/BookConfirmedPage.jsx`

- [ ] **Step 1: Create BookAppointmentPage**

```jsx
// apps/web/src/pages/patient/BookAppointmentPage.jsx
import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { getDoctor } from '../../api/doctors';
import { createAppointment } from '../../api/appointments';
import Button from '../../components/ui/Button';

const VISIT_TYPES = ['initial','follow-up','check-up','urgent'];

export default function BookAppointmentPage() {
  const { doctorId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const date = params.get('date') || '';
  const slot = params.get('slot') || '';
  const [doctor, setDoctor] = useState(null);
  const [visitType, setVisitType] = useState('initial');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { getDoctor(doctorId).then(setDoctor).catch(() => {}); }, [doctorId]);

  const submit = async () => {
    setLoading(true); setError('');
    try {
      const appt = await createAppointment({
        doctorId: doctor.userId._id || doctor.userId,
        date,
        timeSlot: { start: slot, end: addThirtyMin(slot) },
        visitType,
        reason,
      });
      navigate(`/book/confirmed?status=${appt.status}`);
    } catch (e) {
      setError(e.message || 'Booking failed — slot may be taken');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding:26, maxWidth:520 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500, marginBottom:20 }}>Confirm Booking</div>

      {/* Summary card */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:18, marginBottom:24 }}>
        <div style={{ fontSize:13, color:'var(--text2)', marginBottom:4 }}>Doctor</div>
        <div style={{ fontSize:15, fontWeight:600 }}>{doctor?.userId?.name || '…'}</div>
        <div style={{ fontSize:12, color:'var(--mint)', marginTop:2 }}>{doctor?.specialty}</div>
        <div style={{ marginTop:12, display:'flex', gap:20 }}>
          <div><div style={{ fontSize:11, color:'var(--text3)' }}>Date</div><div style={{ fontSize:13, fontWeight:500 }}>{date}</div></div>
          <div><div style={{ fontSize:11, color:'var(--text3)' }}>Time</div><div style={{ fontSize:13, fontWeight:500 }}>{slot}</div></div>
        </div>
      </div>

      {/* Visit type */}
      <div style={{ marginBottom:16 }}>
        <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:8 }}>Visit Type</label>
        <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
          {VISIT_TYPES.map(t => (
            <button key={t} onClick={() => setVisitType(t)}
              style={{ padding:'6px 14px', borderRadius:20, border:`1px solid ${visitType===t ? 'var(--mint)' : 'var(--border2)'}`, background: visitType===t ? 'var(--mint-dim)' : 'transparent', color: visitType===t ? 'var(--mint)' : 'var(--text2)', fontSize:12, cursor:'pointer', textTransform:'capitalize' }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Reason */}
      <div style={{ marginBottom:20 }}>
        <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:8 }}>Reason (optional)</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
          placeholder="Briefly describe your symptoms or reason for visit…"
          style={{ width:'100%', background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box' }} />
      </div>

      {error && <p style={{ color:'var(--rose)', fontSize:13, marginBottom:12 }}>{error}</p>}
      <Button full disabled={loading} onClick={submit} style={{ padding:13, fontSize:14 }}>
        {loading ? 'Booking…' : 'Request Appointment'}
      </Button>
    </div>
  );
}

function addThirtyMin(time) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + 30;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
```

- [ ] **Step 2: Create BookConfirmedPage**

```jsx
// apps/web/src/pages/patient/BookConfirmedPage.jsx
import { useSearchParams, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';

export default function BookConfirmedPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const status = params.get('status');
  const confirmed = status === 'confirmed';

  return (
    <div style={{ padding:40, maxWidth:480, margin:'0 auto', textAlign:'center' }}>
      <div style={{ fontSize:56, marginBottom:16 }}>{confirmed ? '✅' : '⏳'}</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:500, marginBottom:8 }}>
        {confirmed ? 'Appointment Confirmed!' : 'Request Sent'}
      </div>
      <div style={{ fontSize:14, color:'var(--text2)', marginBottom:32 }}>
        {confirmed
          ? 'Your appointment has been confirmed. You will receive a reminder before the visit.'
          : 'Your request is pending doctor approval. You will be notified once it is confirmed.'}
      </div>
      <Button onClick={() => navigate('/my-appointments')} style={{ padding:'12px 28px' }}>
        View My Appointments
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/patient/BookAppointmentPage.jsx apps/web/src/pages/patient/BookConfirmedPage.jsx
git commit -m "feat(web): add BookAppointmentPage and BookConfirmedPage"
```

---

## Task 15: Web — DoctorSettingsPage

**Files:**
- Create: `apps/web/src/pages/doctor/DoctorSettingsPage.jsx`

- [ ] **Step 1: Create the page**

```jsx
// apps/web/src/pages/doctor/DoctorSettingsPage.jsx
import { useState, useEffect } from 'react';
import { getDoctors, updateDoctorSettings } from '../../api/doctors';
import useAuthStore from '../../store/authStore';
import Button from '../../components/ui/Button';
import client from '../../api/client';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function DoctorSettingsPage() {
  const { user } = useAuthStore();
  const [doctorId, setDoctorId] = useState(null);
  const [autoAccept, setAutoAccept] = useState(false);
  const [slots, setSlots] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Find the doctor profile for the logged-in user
    client.get(`/doctors?limit=1`).then(async () => {
      // Get own doctor profile via user id
      const profile = await client.get(`/doctors`).then(docs =>
        docs.find(d => (d.userId?._id || d.userId) === user.id)
      );
      if (profile) {
        setDoctorId(profile._id);
        setAutoAccept(profile.autoAcceptAppointments || false);
        setSlots(profile.availabilitySlots || []);
      }
    }).catch(() => {});
  }, [user.id]);

  const addSlot = () => setSlots(s => [...s, { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }]);
  const removeSlot = (i) => setSlots(s => s.filter((_, idx) => idx !== i));
  const updateSlot = (i, key, val) => setSlots(s => s.map((sl, idx) => idx === i ? { ...sl, [key]: val } : sl));

  const save = async () => {
    if (!doctorId) return;
    setSaving(true);
    try {
      await updateDoctorSettings(doctorId, { autoAcceptAppointments: autoAccept, availabilitySlots: slots });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding:26, maxWidth:600 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500, marginBottom:24 }}>Settings</div>

      {/* Auto-accept toggle */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:500 }}>Auto-accept appointments</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginTop:3 }}>When on, new bookings are confirmed immediately without manual approval.</div>
          </div>
          <button onClick={() => setAutoAccept(v => !v)}
            style={{ width:44, height:24, borderRadius:12, background: autoAccept ? 'var(--mint)' : 'var(--border2)', border:'none', cursor:'pointer', position:'relative', transition:'background .2s' }}>
            <span style={{ position:'absolute', top:3, left: autoAccept ? 23 : 3, width:18, height:18, borderRadius:9, background:'#fff', transition:'left .2s', display:'block' }} />
          </button>
        </div>
      </div>

      {/* Availability slots */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div style={{ fontSize:14, fontWeight:500 }}>Availability</div>
          <Button variant="ghost" style={{ padding:'4px 10px', fontSize:12 }} onClick={addSlot}>+ Add day</Button>
        </div>
        {slots.length === 0 && <p style={{ fontSize:12, color:'var(--text3)' }}>No availability set — patients won't see any slots.</p>}
        {slots.map((sl, i) => (
          <div key={i} style={{ display:'flex', gap:10, alignItems:'center', marginBottom:8 }}>
            <select value={sl.dayOfWeek} onChange={e => updateSlot(i, 'dayOfWeek', parseInt(e.target.value))}
              style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'6px 10px', color:'var(--text)', fontSize:12 }}>
              {DAYS.map((d, idx) => <option key={d} value={idx}>{d}</option>)}
            </select>
            <input type="time" value={sl.startTime} onChange={e => updateSlot(i, 'startTime', e.target.value)}
              style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'6px 10px', color:'var(--text)', fontSize:12 }} />
            <span style={{ color:'var(--text3)', fontSize:12 }}>to</span>
            <input type="time" value={sl.endTime} onChange={e => updateSlot(i, 'endTime', e.target.value)}
              style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'6px 10px', color:'var(--text)', fontSize:12 }} />
            <button onClick={() => removeSlot(i)} style={{ background:'none', border:'none', color:'var(--rose)', cursor:'pointer', fontSize:16 }}>×</button>
          </div>
        ))}
      </div>

      <Button onClick={save} disabled={saving} style={{ padding:'11px 28px' }}>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/doctor/DoctorSettingsPage.jsx
git commit -m "feat(web): add DoctorSettingsPage with auto-accept toggle and availability editor"
```

---

## Task 16: Web — LabDashboardPage

**Files:**
- Create: `apps/web/src/pages/lab/LabDashboardPage.jsx`

- [ ] **Step 1: Create the directory and page**

```bash
mkdir -p apps/web/src/pages/lab
```

```jsx
// apps/web/src/pages/lab/LabDashboardPage.jsx
import { useState, useEffect } from 'react';
import useAuthStore from '../../store/authStore';
import client from '../../api/client';
import Button from '../../components/ui/Button';

export default function LabDashboardPage() {
  const { user } = useAuthStore();
  const [labProfile, setLabProfile] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [form, setForm] = useState({ patientSearch:'', patientId:'', labName:'', testName:'', result:'' });
  const [patients, setPatients] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if lab is approved
    client.get('/lab-results/my-uploads').then(setUploads).catch(() => {});
  }, []);

  const searchPatients = async (q) => {
    if (!q) return setPatients([]);
    try {
      const res = await client.get(`/doctors?name=${encodeURIComponent(q)}`); // reuse user search via query
      // Actually search users: use a generic user search if available, else skip
      setPatients([]);
    } catch { setPatients([]); }
  };

  const submit = async () => {
    if (!form.patientId || !form.labName || !form.testName) {
      setError('Patient ID, lab name and test name are required');
      return;
    }
    setSubmitting(true); setError('');
    try {
      const result = await client.post('/lab-results', {
        patientId: form.patientId,
        labName: form.labName,
        tests: [{ name: form.testName, value: form.result, flag: 'normal' }],
        status: 'ready',
      });
      setUploads(u => [result, ...u]);
      setForm(f => ({ ...f, patientId:'', labName:'', testName:'', result:'' }));
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally { setSubmitting(false); }
  };

  const isApproved = uploads !== null; // if endpoint didn't 403, we're approved
  // More reliable: check error from the initial fetch
  const [approved, setApproved] = useState(true);
  useEffect(() => {
    client.get('/lab-results/my-uploads')
      .then(data => { setUploads(data); setApproved(true); })
      .catch(e => { if (e?.message?.includes('pending approval')) setApproved(false); });
  }, []);

  if (!approved) {
    return (
      <div style={{ padding:40, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>⏳</div>
        <div style={{ fontSize:18, fontWeight:500, marginBottom:8 }}>Account Pending Approval</div>
        <div style={{ fontSize:13, color:'var(--text2)' }}>An administrator needs to approve your lab account before you can upload results.</div>
      </div>
    );
  }

  return (
    <div style={{ padding:26, maxWidth:700 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500, marginBottom:24 }}>Upload Lab Result</div>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:22, marginBottom:28 }}>
        {[['patientId','Patient ID (MongoDB ObjectId)'],['labName','Lab Name'],['testName','Test Name'],['result','Result Value']].map(([k,l]) => (
          <div key={k} style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:6 }}>{l}</label>
            <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' }} />
          </div>
        ))}
        {error && <p style={{ color:'var(--rose)', fontSize:13, marginBottom:12 }}>{error}</p>}
        <Button onClick={submit} disabled={submitting} style={{ padding:'10px 24px' }}>
          {submitting ? 'Uploading…' : 'Upload Result'}
        </Button>
      </div>

      <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>My Uploads</div>
      {uploads.length === 0 && <p style={{ fontSize:13, color:'var(--text3)' }}>No uploads yet.</p>}
      {uploads.map(u => (
        <div key={u._id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'12px 16px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:500 }}>{u.labName}</div>
            <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{u.tests?.map(t => t.name).join(', ')}</div>
          </div>
          <div style={{ fontSize:11, color:'var(--text3)' }}>{new Date(u.createdAt).toLocaleDateString()}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/lab/LabDashboardPage.jsx
git commit -m "feat(web): add LabDashboardPage with approval gate and upload form"
```

---

## Task 17: Web — Router + Sidebar

**Files:**
- Modify: `apps/web/src/router/index.jsx`
- Modify: `apps/web/src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Update router**

Replace the entire content of `apps/web/src/router/index.jsx`:
```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import AppLayout from '../components/layout/AppLayout';

import LoginPage          from '../pages/auth/LoginPage';
import RegisterPage       from '../pages/auth/RegisterPage';
import DashboardPage      from '../pages/doctor/DashboardPage';
import AppointmentsPage   from '../pages/doctor/AppointmentsPage';
import PatientRecordsPage from '../pages/doctor/PatientRecordsPage';
import PrescriptionsPage  from '../pages/doctor/PrescriptionsPage';
import LabResultsPage     from '../pages/doctor/LabResultsPage';
import DoctorSettingsPage from '../pages/doctor/DoctorSettingsPage';
import FindDoctorPage     from '../pages/patient/FindDoctorPage';
import DoctorProfilePage  from '../pages/patient/DoctorProfilePage';
import BookAppointmentPage from '../pages/patient/BookAppointmentPage';
import BookConfirmedPage  from '../pages/patient/BookConfirmedPage';
import MyAppointmentsPage from '../pages/patient/MyAppointmentsPage';
import MedicalRecordsPage from '../pages/patient/MedicalRecordsPage';
import LabDashboardPage   from '../pages/lab/LabDashboardPage';
import ShareViewerPage    from '../pages/public/ShareViewerPage';

function Protected({ children, role }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export default function AppRouter() {
  const { user } = useAuthStore();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/" /> : <RegisterPage />} />

        {/* Doctor routes */}
        <Route path="/dashboard"     element={<Protected role="doctor"><DashboardPage /></Protected>} />
        <Route path="/appointments"  element={<Protected role="doctor"><AppointmentsPage /></Protected>} />
        <Route path="/patients"      element={<Protected role="doctor"><PatientRecordsPage /></Protected>} />
        <Route path="/prescriptions" element={<Protected role="doctor"><PrescriptionsPage /></Protected>} />
        <Route path="/lab-results"   element={<Protected role="doctor"><LabResultsPage /></Protected>} />
        <Route path="/settings"      element={<Protected role="doctor"><DoctorSettingsPage /></Protected>} />

        {/* Patient routes */}
        <Route path="/find-doctor"     element={<Protected role="patient"><FindDoctorPage /></Protected>} />
        <Route path="/doctor/:id"      element={<Protected role="patient"><DoctorProfilePage /></Protected>} />
        <Route path="/book/:doctorId"  element={<Protected role="patient"><BookAppointmentPage /></Protected>} />
        <Route path="/book/confirmed"  element={<Protected role="patient"><BookConfirmedPage /></Protected>} />
        <Route path="/my-appointments" element={<Protected role="patient"><MyAppointmentsPage /></Protected>} />
        <Route path="/records"         element={<Protected role="patient"><MedicalRecordsPage /></Protected>} />

        {/* Lab routes */}
        <Route path="/lab" element={<Protected role="laboratory"><LabDashboardPage /></Protected>} />

        {/* Public */}
        <Route path="/s/:token" element={<ShareViewerPage />} />

        {/* Root redirect */}
        <Route path="/" element={
          !user ? <Navigate to="/login" /> :
          user.role === 'doctor' ? <Navigate to="/dashboard" /> :
          user.role === 'laboratory' ? <Navigate to="/lab" /> :
          <Navigate to="/find-doctor" />
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Update Sidebar**

In `apps/web/src/components/layout/Sidebar.jsx`, replace the nav arrays:
```js
const doctorNav = [
  { label: 'Dashboard',       path: '/dashboard' },
  { label: 'Appointments',    path: '/appointments', badge: true },
  { label: 'Patient Records', path: '/patients' },
  { label: 'Prescriptions',   path: '/prescriptions' },
  { label: 'Lab Results',     path: '/lab-results' },
  { label: 'Settings',        path: '/settings' },
];

const patientNav = [
  { label: 'Find a Doctor',   path: '/find-doctor' },
  { label: 'My Appointments', path: '/my-appointments', badge: true },
  { label: 'Medical Records', path: '/records' },
];

const labNav = [
  { label: 'My Uploads', path: '/lab' },
];
```

Change the nav selection line:
```js
const nav = user?.role === 'doctor' ? doctorNav : user?.role === 'laboratory' ? labNav : patientNav;
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/router/index.jsx apps/web/src/components/layout/Sidebar.jsx
git commit -m "feat(web): add all new routes and lab/settings nav items"
```

---

## Task 18: Mobile — doctors API module

**Files:**
- Create: `apps/mobile/src/api/doctors.js`

- [ ] **Step 1: Create the module**

```js
// apps/mobile/src/api/doctors.js
import client from './client';

export const getDoctors = (params = {}) => client.get('/doctors', { params });
export const getDoctor = (id) => client.get(`/doctors/${id}`);
export const getAvailableSlots = (id, date) => client.get(`/doctors/${id}/available-slots`, { params: { date } });
export const updateDoctorSettings = (id, data) => client.patch(`/doctors/${id}/settings`, data);
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/api/doctors.js
git commit -m "feat(mobile): add doctors API module"
```

---

## Task 19: Mobile — PatientStack navigation

**Files:**
- Create: `apps/mobile/src/navigation/PatientStack.js`
- Modify: `apps/mobile/src/navigation/PatientTabs.js`

- [ ] **Step 1: Create PatientStack**

```js
// apps/mobile/src/navigation/PatientStack.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import FindDoctorScreen from '../screens/patient/FindDoctorScreen';
import DoctorProfileScreen from '../screens/patient/DoctorProfileScreen';
import BookAppointmentScreen from '../screens/patient/BookAppointmentScreen';
import BookConfirmedScreen from '../screens/patient/BookConfirmedScreen';

const Stack = createStackNavigator();

export default function PatientStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FindDoctor" component={FindDoctorScreen} />
      <Stack.Screen name="DoctorProfile" component={DoctorProfileScreen} />
      <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} />
      <Stack.Screen name="BookConfirmed" component={BookConfirmedScreen} />
    </Stack.Navigator>
  );
}
```

- [ ] **Step 2: Update PatientTabs to use PatientStack**

Replace the `FindDoctorScreen` import and usage in `apps/mobile/src/navigation/PatientTabs.js`:

Remove:
```js
import FindDoctorScreen from '../screens/patient/FindDoctorScreen';
```
Add:
```js
import PatientStack from './PatientStack';
```

Change the first Tab.Screen:
```jsx
<Tab.Screen name="Find Doctor" component={PatientStack} options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔍</Text> }} />
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/navigation/PatientStack.js apps/mobile/src/navigation/PatientTabs.js
git commit -m "feat(mobile): add PatientStack for booking flow navigation"
```

---

## Task 20: Mobile — DoctorProfileScreen

**Files:**
- Create: `apps/mobile/src/screens/patient/DoctorProfileScreen.js`

- [ ] **Step 1: Create the screen**

```js
// apps/mobile/src/screens/patient/DoctorProfileScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDoctor, getAvailableSlots } from '../../api/doctors';
import C from '../../constants/colors';

function toISO(d) { return d.toISOString().slice(0,10); }
function dateLabel(d) { return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }); }

export default function DoctorProfileScreen({ route, navigation }) {
  const { doctorId } = route.params;
  const [doctor, setDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()));
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d;
  });

  useEffect(() => { getDoctor(doctorId).then(setDoctor).catch(() => {}); }, [doctorId]);

  useEffect(() => {
    setSlotsLoading(true);
    getAvailableSlots(doctorId, selectedDate)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [doctorId, selectedDate]);

  if (!doctor) return <View style={s.center}><ActivityIndicator color={C.mint} /></View>;

  const name = doctor.userId?.name || 'Doctor';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView>
        {/* Header */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding:16 }}>
          <Text style={{ color:C.mint, fontSize:14 }}>← Back</Text>
        </TouchableOpacity>

        {/* Doctor card */}
        <View style={s.card}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('')}</Text></View>
          <Text style={s.name}>{name}</Text>
          <Text style={s.specialty}>{doctor.specialty}</Text>
          {doctor.bio ? <Text style={s.bio}>{doctor.bio}</Text> : null}
          <View style={{ flexDirection:'row', gap:16, marginTop:10 }}>
            {doctor.consultationFee > 0 && <Text style={s.meta}>{doctor.consultationFee} SAR</Text>}
            {doctor.yearsOfExperience > 0 && <Text style={s.meta}>{doctor.yearsOfExperience}y exp</Text>}
          </View>
        </View>

        {/* Date strip */}
        <Text style={s.sectionTitle}>Pick a date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal:16, marginBottom:16 }}>
          {days.map(d => {
            const iso = toISO(d);
            const active = iso === selectedDate;
            return (
              <TouchableOpacity key={iso} onPress={() => setSelectedDate(iso)}
                style={[s.dateChip, active && s.dateChipActive]}>
                <Text style={[s.dateChipTxt, active && s.dateChipTxtActive]}>{dateLabel(d)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Slots */}
        <Text style={s.sectionTitle}>Available times</Text>
        {slotsLoading && <ActivityIndicator color={C.mint} style={{ margin:16 }} />}
        {!slotsLoading && slots.length === 0 && (
          <Text style={s.empty}>No availability on this day.</Text>
        )}
        <View style={s.slotsGrid}>
          {slots.map(sl => (
            <TouchableOpacity key={sl.time} disabled={!sl.available}
              onPress={() => navigation.navigate('BookAppointment', {
                doctorId,
                doctorName: name,
                specialty: doctor.specialty,
                date: selectedDate,
                slot: sl.time,
              })}
              style={[s.slotBtn, !sl.available && s.slotBtnTaken]}>
              <Text style={[s.slotTxt, !sl.available && s.slotTxtTaken]}>{sl.time}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  center: { flex:1, justifyContent:'center', alignItems:'center', backgroundColor:C.bg },
  card: { margin:16, padding:20, backgroundColor:C.card, borderRadius:14, borderWidth:1, borderColor:C.border, alignItems:'center' },
  avatar: { width:64, height:64, borderRadius:32, backgroundColor:C.mint, justifyContent:'center', alignItems:'center', marginBottom:12 },
  avatarTxt: { fontSize:22, fontWeight:'700', color:'#000' },
  name: { fontSize:18, fontWeight:'700', color:C.text },
  specialty: { fontSize:13, color:C.mint, marginTop:4 },
  bio: { fontSize:12.5, color:C.text2, marginTop:8, textAlign:'center' },
  meta: { fontSize:12, color:C.text3, backgroundColor:C.bg3, paddingHorizontal:10, paddingVertical:4, borderRadius:10 },
  sectionTitle: { fontSize:13, fontWeight:'600', color:C.text2, marginHorizontal:16, marginBottom:8 },
  dateChip: { paddingHorizontal:14, paddingVertical:8, borderRadius:10, borderWidth:1, borderColor:C.border2, backgroundColor:C.bg2, marginRight:8 },
  dateChipActive: { borderColor:C.mint, backgroundColor:C.bg3 },
  dateChipTxt: { fontSize:12, color:C.text2 },
  dateChipTxtActive: { color:C.mint, fontWeight:'600' },
  slotsGrid: { flexDirection:'row', flexWrap:'wrap', paddingHorizontal:16, gap:8 },
  slotBtn: { paddingHorizontal:16, paddingVertical:9, borderRadius:20, borderWidth:1, borderColor:C.mint, backgroundColor:C.bg3 },
  slotBtnTaken: { borderColor:C.border, opacity:0.4 },
  slotTxt: { fontSize:13, color:C.mint, fontWeight:'500' },
  slotTxtTaken: { color:C.text3 },
  empty: { fontSize:12, color:C.text3, marginHorizontal:16, marginBottom:16 },
});
```

- [ ] **Step 2: Update FindDoctorScreen to navigate to DoctorProfile**

In `apps/mobile/src/screens/patient/FindDoctorScreen.js`, replace the mock data with a real API call and wire the Book button.

Replace the entire file:
```js
// apps/mobile/src/screens/patient/FindDoctorScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDoctors } from '../../api/doctors';
import C from '../../constants/colors';

const SPECS = ['All','Cardiology','Pediatrics','Neurology','Orthopedics','General'];

export default function FindDoctorScreen({ navigation }) {
  const [search, setSearch] = useState('');
  const [spec, setSpec] = useState('All');
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.name = search;
      if (spec !== 'All') params.specialty = spec;
      const data = await getDoctors(params);
      setDoctors(data);
    } catch { setDoctors([]); }
    finally { setLoading(false); }
  }, [search, spec]);

  useEffect(() => { const t = setTimeout(fetch, 350); return () => clearTimeout(t); }, [fetch]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Find a Doctor</Text><Text style={s.sub}>{loading ? 'Searching…' : `${doctors.length} results`}</Text></View>
      <View style={s.searchBox}>
        <Text style={{ fontSize:16, color:C.text3 }}>⌕</Text>
        <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search name or specialty…" placeholderTextColor={C.text3} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal:16, marginBottom:12 }}>
        {SPECS.map(sp => (
          <TouchableOpacity key={sp} style={[s.chip, spec===sp && s.chipActive]} onPress={() => setSpec(sp)}>
            <Text style={[s.chipTxt, spec===sp && s.chipTxtActive]}>{sp}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading && <ActivityIndicator color={C.mint} style={{ margin:16 }} />}
      <FlatList
        data={doctors} keyExtractor={d => d._id} contentContainerStyle={{ padding:16, paddingTop:0 }}
        renderItem={({ item:d, index:i }) => {
          const name = d.userId?.name || 'Doctor';
          const initials = name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('');
          return (
            <View style={s.card}>
              <View style={[s.avatar, { backgroundColor: ['#0fe3b0','#f59e0b','#8b5cf6','#10b981'][i%4] }]}>
                <Text style={s.avatarTxt}>{initials}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={s.docName}>{name}</Text>
                <Text style={s.specialty}>{d.specialty}</Text>
                {d.consultationFee > 0 && <Text style={s.meta}>{d.consultationFee} SAR</Text>}
              </View>
              <TouchableOpacity style={s.bookBtn} onPress={() => navigation.navigate('DoctorProfile', { doctorId: d._id })}>
                <Text style={s.bookTxt}>View</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  header: { padding:16, paddingBottom:8 },
  title: { fontSize:22, fontWeight:'700', color:C.text },
  sub: { fontSize:12, color:C.text2, marginTop:2 },
  searchBox: { flexDirection:'row', alignItems:'center', margin:16, marginTop:8, backgroundColor:C.bg2, borderRadius:10, borderWidth:1, borderColor:C.border, paddingHorizontal:12 },
  searchInput: { flex:1, padding:10, color:C.text, fontSize:13 },
  chip: { paddingHorizontal:14, paddingVertical:6, borderRadius:20, borderWidth:1, borderColor:C.border2, marginRight:8, backgroundColor:'transparent' },
  chipActive: { borderColor:C.mint, backgroundColor:C.bg3 },
  chipTxt: { fontSize:12, color:C.text2 },
  chipTxtActive: { color:C.mint, fontWeight:'600' },
  card: { flexDirection:'row', alignItems:'center', gap:12, padding:14, backgroundColor:C.card, borderRadius:12, borderWidth:1, borderColor:C.border, marginBottom:10 },
  avatar: { width:44, height:44, borderRadius:10, justifyContent:'center', alignItems:'center' },
  avatarTxt: { fontSize:14, fontWeight:'700', color:'#fff' },
  docName: { fontSize:14, fontWeight:'600', color:C.text },
  specialty: { fontSize:12, color:C.mint, marginTop:2 },
  meta: { fontSize:11, color:C.text3, marginTop:2 },
  bookBtn: { backgroundColor:C.mint, paddingHorizontal:14, paddingVertical:7, borderRadius:8 },
  bookTxt: { fontSize:12, fontWeight:'700', color:'#000' },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/patient/DoctorProfileScreen.js apps/mobile/src/screens/patient/FindDoctorScreen.js
git commit -m "feat(mobile): add DoctorProfileScreen with slot picker, wire FindDoctor to real API"
```

---

## Task 21: Mobile — BookAppointmentScreen + BookConfirmedScreen

**Files:**
- Create: `apps/mobile/src/screens/patient/BookAppointmentScreen.js`
- Create: `apps/mobile/src/screens/patient/BookConfirmedScreen.js`

- [ ] **Step 1: Create BookAppointmentScreen**

```js
// apps/mobile/src/screens/patient/BookAppointmentScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createAppointment } from '../../api/appointments';
import C from '../../constants/colors';

const VISIT_TYPES = ['initial','follow-up','check-up','urgent'];

function addThirtyMin(time) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + 30;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

export default function BookAppointmentScreen({ route, navigation }) {
  const { doctorId, doctorName, specialty, date, slot } = route.params;
  const [visitType, setVisitType] = useState('initial');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true); setError('');
    try {
      const appt = await createAppointment({
        doctorId,
        date,
        timeSlot: { start: slot, end: addThirtyMin(slot) },
        visitType,
        reason,
      });
      navigation.replace('BookConfirmed', { status: appt.status });
    } catch (e) {
      setError(e.message || 'Booking failed — slot may be taken');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom:16 }}>
          <Text style={{ color:C.mint, fontSize:14 }}>← Back</Text>
        </TouchableOpacity>

        <Text style={s.heading}>Confirm Booking</Text>

        {/* Summary */}
        <View style={s.summary}>
          <Text style={s.label}>Doctor</Text>
          <Text style={s.value}>{doctorName}</Text>
          <Text style={s.subValue}>{specialty}</Text>
          <View style={{ flexDirection:'row', gap:24, marginTop:12 }}>
            <View><Text style={s.label}>Date</Text><Text style={s.value}>{date}</Text></View>
            <View><Text style={s.label}>Time</Text><Text style={s.value}>{slot}</Text></View>
          </View>
        </View>

        {/* Visit type */}
        <Text style={s.sectionLabel}>Visit Type</Text>
        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:20 }}>
          {VISIT_TYPES.map(t => (
            <TouchableOpacity key={t} onPress={() => setVisitType(t)}
              style={[s.typeChip, visitType===t && s.typeChipActive]}>
              <Text style={[s.typeChipTxt, visitType===t && s.typeChipTxtActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Reason */}
        <Text style={s.sectionLabel}>Reason (optional)</Text>
        <TextInput
          style={s.textarea} value={reason} onChangeText={setReason}
          placeholder="Briefly describe your symptoms…" placeholderTextColor={C.text3}
          multiline numberOfLines={3} />

        {!!error && <Text style={{ color:C.rose, fontSize:13, marginBottom:12 }}>{error}</Text>}

        <TouchableOpacity style={[s.btn, loading && { opacity:0.6 }]} onPress={submit} disabled={loading}>
          <Text style={s.btnTxt}>{loading ? 'Booking…' : 'Request Appointment'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  content: { padding:20, paddingTop:12 },
  heading: { fontSize:22, fontWeight:'700', color:C.text, marginBottom:20 },
  summary: { backgroundColor:C.card, borderRadius:12, borderWidth:1, borderColor:C.border, padding:18, marginBottom:24 },
  label: { fontSize:11, color:C.text3, textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 },
  value: { fontSize:15, fontWeight:'600', color:C.text },
  subValue: { fontSize:12, color:C.mint, marginTop:2 },
  sectionLabel: { fontSize:11, fontWeight:'600', color:C.text2, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 },
  typeChip: { paddingHorizontal:14, paddingVertical:7, borderRadius:20, borderWidth:1, borderColor:C.border2 },
  typeChipActive: { borderColor:C.mint, backgroundColor:C.bg3 },
  typeChipTxt: { fontSize:12.5, color:C.text2, textTransform:'capitalize' },
  typeChipTxtActive: { color:C.mint, fontWeight:'600' },
  textarea: { backgroundColor:C.bg2, borderWidth:1, borderColor:C.border2, borderRadius:10, padding:12, color:C.text, fontSize:13, marginBottom:20, minHeight:80, textAlignVertical:'top' },
  btn: { backgroundColor:C.mint, borderRadius:12, padding:14, alignItems:'center' },
  btnTxt: { fontSize:15, fontWeight:'700', color:'#000' },
});
```

- [ ] **Step 2: Create BookConfirmedScreen**

```js
// apps/mobile/src/screens/patient/BookConfirmedScreen.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import C from '../../constants/colors';

export default function BookConfirmedScreen({ route, navigation }) {
  const { status } = route.params;
  const confirmed = status === 'confirmed';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.content}>
        <Text style={s.icon}>{confirmed ? '✅' : '⏳'}</Text>
        <Text style={s.title}>{confirmed ? 'Appointment Confirmed!' : 'Request Sent'}</Text>
        <Text style={s.body}>
          {confirmed
            ? 'Your appointment has been confirmed. You will receive a reminder before the visit.'
            : 'Your request is pending doctor approval. You will be notified once it is confirmed.'}
        </Text>
        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Appointments')}>
          <Text style={s.btnTxt}>View My Appointments</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  content: { flex:1, justifyContent:'center', alignItems:'center', padding:32 },
  icon: { fontSize:64, marginBottom:20 },
  title: { fontSize:22, fontWeight:'700', color:C.text, marginBottom:12, textAlign:'center' },
  body: { fontSize:14, color:C.text2, textAlign:'center', lineHeight:22, marginBottom:32 },
  btn: { backgroundColor:C.mint, borderRadius:12, paddingHorizontal:28, paddingVertical:14 },
  btnTxt: { fontSize:15, fontWeight:'700', color:'#000' },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/patient/BookAppointmentScreen.js apps/mobile/src/screens/patient/BookConfirmedScreen.js
git commit -m "feat(mobile): add BookAppointmentScreen and BookConfirmedScreen"
```

---

## Task 22: Mobile — SettingsScreen (doctor)

**Files:**
- Create: `apps/mobile/src/screens/doctor/SettingsScreen.js`
- Modify: `apps/mobile/src/navigation/DoctorTabs.js`

- [ ] **Step 1: Create SettingsScreen**

```js
// apps/mobile/src/screens/doctor/SettingsScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, Switch, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDoctors, updateDoctorSettings } from '../../api/doctors';
import useAuthStore from '../../store/authStore';
import C from '../../constants/colors';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function SettingsScreen() {
  const { user } = useAuthStore();
  const [doctorId, setDoctorId] = useState(null);
  const [autoAccept, setAutoAccept] = useState(false);
  const [slots, setSlots] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getDoctors().then(docs => {
      const own = docs.find(d => (d.userId?._id || d.userId) === user.id);
      if (own) {
        setDoctorId(own._id);
        setAutoAccept(own.autoAcceptAppointments || false);
        setSlots(own.availabilitySlots || []);
      }
    }).catch(() => {});
  }, [user.id]);

  const save = async () => {
    if (!doctorId) return;
    setSaving(true);
    try {
      await updateDoctorSettings(doctorId, { autoAcceptAppointments: autoAccept, availabilitySlots: slots });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.heading}>Settings</Text>

        <View style={s.card}>
          <View style={s.row}>
            <View style={{ flex:1 }}>
              <Text style={s.rowTitle}>Auto-accept appointments</Text>
              <Text style={s.rowSub}>Confirm bookings immediately without review</Text>
            </View>
            <Switch value={autoAccept} onValueChange={setAutoAccept} trackColor={{ true: C.mint }} />
          </View>
        </View>

        <Text style={s.sectionLabel}>Availability</Text>
        <View style={s.card}>
          {slots.length === 0 && <Text style={{ fontSize:12, color:C.text3, marginBottom:8 }}>No availability set.</Text>}
          {slots.map((sl, i) => (
            <View key={i} style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 }}>
              <Text style={{ fontSize:12, color:C.text2, width:34 }}>{DAYS[sl.dayOfWeek]}</Text>
              <Text style={s.slotTime}>{sl.startTime}</Text>
              <Text style={{ fontSize:11, color:C.text3 }}>–</Text>
              <Text style={s.slotTime}>{sl.endTime}</Text>
              <TouchableOpacity onPress={() => setSlots(ss => ss.filter((_,idx) => idx!==i))} style={{ marginLeft:'auto' }}>
                <Text style={{ color:C.rose, fontSize:18, lineHeight:20 }}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={() => setSlots(ss => [...ss, { dayOfWeek:1, startTime:'09:00', endTime:'17:00' }])}
            style={s.addBtn}>
            <Text style={s.addBtnTxt}>+ Add day</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[s.saveBtn, saving && { opacity:0.6 }]} onPress={save} disabled={saving}>
          <Text style={s.saveBtnTxt}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  content: { padding:20 },
  heading: { fontSize:22, fontWeight:'700', color:C.text, marginBottom:20 },
  card: { backgroundColor:C.card, borderRadius:12, borderWidth:1, borderColor:C.border, padding:16, marginBottom:16 },
  row: { flexDirection:'row', alignItems:'center', gap:12 },
  rowTitle: { fontSize:14, fontWeight:'500', color:C.text },
  rowSub: { fontSize:12, color:C.text2, marginTop:2 },
  sectionLabel: { fontSize:11, fontWeight:'600', color:C.text2, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 },
  slotTime: { fontSize:12, color:C.text, backgroundColor:C.bg3, paddingHorizontal:8, paddingVertical:4, borderRadius:6 },
  addBtn: { marginTop:4 },
  addBtnTxt: { fontSize:13, color:C.mint },
  saveBtn: { backgroundColor:C.mint, borderRadius:12, padding:14, alignItems:'center', marginTop:8 },
  saveBtnTxt: { fontSize:15, fontWeight:'700', color:'#000' },
});
```

- [ ] **Step 2: Add Settings tab to DoctorTabs**

In `apps/mobile/src/navigation/DoctorTabs.js`, add the import and tab:
```js
import SettingsScreen from '../screens/doctor/SettingsScreen';
```

Add inside `Tab.Navigator`:
```jsx
<Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: ({ focused }) => icon('⚙️', focused) }} />
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/doctor/SettingsScreen.js apps/mobile/src/navigation/DoctorTabs.js
git commit -m "feat(mobile): add doctor SettingsScreen with auto-accept toggle"
```

---

## Task 23: Mobile — LabTabs + LabUploadsScreen

**Files:**
- Create: `apps/mobile/src/navigation/LabTabs.js`
- Create: `apps/mobile/src/screens/lab/LabUploadsScreen.js`

- [ ] **Step 1: Create LabUploadsScreen**

```bash
mkdir -p apps/mobile/src/screens/lab
```

```js
// apps/mobile/src/screens/lab/LabUploadsScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import client from '../../api/client';
import C from '../../constants/colors';

export default function LabUploadsScreen() {
  const [approved, setApproved] = useState(null); // null = loading
  const [uploads, setUploads] = useState([]);
  const [form, setForm] = useState({ patientId:'', labName:'', testName:'', result:'' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/lab-results/my-uploads')
      .then(data => { setUploads(data); setApproved(true); })
      .catch(e => {
        if (JSON.stringify(e).includes('pending approval')) setApproved(false);
        else setApproved(false);
      });
  }, []);

  const submit = async () => {
    if (!form.patientId || !form.labName || !form.testName) {
      setError('Patient ID, lab name and test name are required'); return;
    }
    setSubmitting(true); setError('');
    try {
      const result = await client.post('/lab-results', {
        patientId: form.patientId,
        labName: form.labName,
        tests: [{ name: form.testName, value: form.result, flag: 'normal' }],
        status: 'ready',
      });
      setUploads(u => [result, ...u]);
      setForm({ patientId:'', labName:'', testName:'', result:'' });
    } catch (e) { setError(e.message || 'Upload failed'); }
    finally { setSubmitting(false); }
  };

  if (approved === null) return <View style={s.center}><ActivityIndicator color={C.mint} /></View>;

  if (!approved) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={{ fontSize:48, marginBottom:16 }}>⏳</Text>
        <Text style={s.heading}>Pending Approval</Text>
        <Text style={s.body}>An administrator needs to approve your lab account before you can upload results.</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={uploads}
        keyExtractor={u => u._id}
        ListHeaderComponent={
          <View style={{ padding:20 }}>
            <Text style={s.heading}>Upload Result</Text>
            <View style={s.card}>
              {[['patientId','Patient ID'],['labName','Lab Name'],['testName','Test Name'],['result','Result Value']].map(([k,l]) => (
                <View key={k} style={{ marginBottom:12 }}>
                  <Text style={s.label}>{l}</Text>
                  <TextInput style={s.input} value={form[k]} onChangeText={v => setForm(f => ({...f,[k]:v}))}
                    placeholder={l} placeholderTextColor={C.text3} autoCapitalize="none" />
                </View>
              ))}
              {!!error && <Text style={{ color:C.rose, fontSize:12, marginBottom:8 }}>{error}</Text>}
              <TouchableOpacity style={[s.btn, submitting && {opacity:0.6}]} onPress={submit} disabled={submitting}>
                <Text style={s.btnTxt}>{submitting ? 'Uploading…' : 'Upload'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.sectionLabel}>My Uploads</Text>
            {uploads.length === 0 && <Text style={{ fontSize:12, color:C.text3 }}>No uploads yet.</Text>}
          </View>
        }
        renderItem={({ item:u }) => (
          <View style={s.uploadRow}>
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:13, fontWeight:'500', color:C.text }}>{u.labName}</Text>
              <Text style={{ fontSize:11.5, color:C.text2, marginTop:2 }}>{u.tests?.map(t=>t.name).join(', ')}</Text>
            </View>
            <Text style={{ fontSize:11, color:C.text3 }}>{new Date(u.createdAt).toLocaleDateString()}</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom:32 }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  center: { flex:1, justifyContent:'center', alignItems:'center', padding:32 },
  heading: { fontSize:22, fontWeight:'700', color:C.text, marginBottom:8 },
  body: { fontSize:14, color:C.text2, textAlign:'center', lineHeight:22 },
  card: { backgroundColor:C.card, borderRadius:12, borderWidth:1, borderColor:C.border, padding:16, marginBottom:20 },
  label: { fontSize:11, color:C.text3, marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 },
  input: { backgroundColor:C.bg3, borderRadius:8, borderWidth:1, borderColor:C.border2, padding:10, color:C.text, fontSize:13 },
  sectionLabel: { fontSize:11, fontWeight:'600', color:C.text2, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 },
  uploadRow: { flexDirection:'row', alignItems:'center', padding:14, marginHorizontal:20, backgroundColor:C.bg2, borderRadius:10, borderWidth:1, borderColor:C.border, marginBottom:8 },
  btn: { backgroundColor:C.mint, borderRadius:10, padding:12, alignItems:'center', marginTop:4 },
  btnTxt: { fontSize:14, fontWeight:'700', color:'#000' },
});
```

- [ ] **Step 2: Create LabTabs**

```js
// apps/mobile/src/navigation/LabTabs.js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import C from '../constants/colors';
import LabUploadsScreen from '../screens/lab/LabUploadsScreen';

const Tab = createBottomTabNavigator();

export default function LabTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.border }, tabBarActiveTintColor: C.mint, tabBarInactiveTintColor: C.text3 }}>
      <Tab.Screen name="My Uploads" component={LabUploadsScreen} options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧪</Text> }} />
    </Tab.Navigator>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/lab/LabUploadsScreen.js apps/mobile/src/navigation/LabTabs.js
git commit -m "feat(mobile): add LabUploadsScreen and LabTabs"
```

---

## Task 24: Mobile — AppNavigator + auth screens lab role

**Files:**
- Modify: `apps/mobile/src/navigation/AppNavigator.js`
- Modify: `apps/mobile/src/screens/auth/RegisterScreen.js`

- [ ] **Step 1: Add lab branch to AppNavigator**

Replace content of `apps/mobile/src/navigation/AppNavigator.js`:
```js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import useAuthStore from '../store/authStore';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import DoctorTabs from './DoctorTabs';
import PatientTabs from './PatientTabs';
import LabTabs from './LabTabs';

const Root = createStackNavigator();

export default function AppNavigator() {
  const { user } = useAuthStore();
  return (
    <NavigationContainer>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Root.Screen name="Login" component={LoginScreen} />
            <Root.Screen name="Register" component={RegisterScreen} />
          </>
        ) : user.role === 'doctor' ? (
          <Root.Screen name="DoctorTabs" component={DoctorTabs} />
        ) : user.role === 'laboratory' ? (
          <Root.Screen name="LabTabs" component={LabTabs} />
        ) : (
          <Root.Screen name="PatientTabs" component={PatientTabs} />
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 2: Add laboratory role to RegisterScreen**

In `apps/mobile/src/screens/auth/RegisterScreen.js`, replace the role toggle section:

Change `['patient','doctor']` to `['patient','doctor','laboratory']`:
```jsx
{['patient','doctor','laboratory'].map(r => (
  <TouchableOpacity key={r} style={[s.tBtn, form.role===r && s.tActive]} onPress={() => set('role', r)}>
    <Text style={[s.tLabel, form.role===r && s.tLabelActive]}>
      {r === 'patient' ? '🧑 Patient' : r === 'doctor' ? '👨‍⚕️ Doctor' : '🧪 Lab'}
    </Text>
  </TouchableOpacity>
))}
```

After the doctor specialty field block, add labName field:
```jsx
{form.role === 'laboratory' && (
  <View style={{ width:'100%', marginBottom:14 }}>
    <Text style={s.label}>Lab Name</Text>
    <TextInput style={s.input} value={form.labName} onChangeText={v => set('labName',v)}
      placeholder="e.g. City Diagnostics Lab" placeholderTextColor={C.text3} />
  </View>
)}
```

Update the initial form state to include `labName: ''`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/navigation/AppNavigator.js apps/mobile/src/screens/auth/RegisterScreen.js
git commit -m "feat(mobile): add lab role to AppNavigator and RegisterScreen"
```

---

## Self-Review Checklist

- [x] Lab model + isApproved gate: Tasks 1, 9
- [x] User role enum `laboratory`: Task 2
- [x] Doctor `autoAcceptAppointments`: Tasks 2, 8
- [x] Patient `homeLocation`: Tasks 2, 5
- [x] Admin approval routes: Tasks 3, 4
- [x] Lab registration: Task 4
- [x] Patient location endpoint: Task 5
- [x] Doctor name search + location fallback: Task 6
- [x] Available slots endpoint: Task 7
- [x] Booking auto-accept: Task 8
- [x] Doctor settings endpoint: Task 8
- [x] Lab results RBAC: Task 9
- [x] Web doctors API module: Task 10
- [x] Web RegisterPage lab role: Task 11
- [x] Web FindDoctorPage real API: Task 12
- [x] Web DoctorProfilePage: Task 13
- [x] Web BookAppointmentPage: Task 14
- [x] Web BookConfirmedPage: Task 14
- [x] Web DoctorSettingsPage: Task 15
- [x] Web LabDashboardPage: Task 16
- [x] Web Router + Sidebar: Task 17
- [x] Mobile doctors API: Task 18
- [x] Mobile PatientStack: Task 19
- [x] Mobile DoctorProfileScreen: Task 20
- [x] Mobile FindDoctorScreen real API: Task 20
- [x] Mobile BookAppointmentScreen: Task 21
- [x] Mobile BookConfirmedScreen: Task 21
- [x] Mobile SettingsScreen: Task 22
- [x] Mobile DoctorTabs Settings tab: Task 22
- [x] Mobile LabUploadsScreen: Task 23
- [x] Mobile LabTabs: Task 23
- [x] Mobile AppNavigator lab branch: Task 24
- [x] Mobile RegisterScreen lab role: Task 24
