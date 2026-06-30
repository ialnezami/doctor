# Multi-Location Scheduling, Geo Detection & Admin Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat doctor availability with per-location scheduling (hybrid bookable/hospital), add a "Use my location" geo button for patients, and build an admin Leaflet map showing all users as pins.

**Architecture:** Doctor model drops `availabilitySlots` in favor of an embedded `locations[]` array; a one-shot migration script lifts existing slots into `locations[0]`. Appointment model gains denormalized location fields. Patient booking gains a Step 0 location picker. Admin map is a new React page backed by a new admin endpoint. Geo detection is frontend-only — backend already accepts `?lat=&lng=`.

**Tech Stack:** Node.js/Express/MongoDB (API), React + Vite (web), React Native/Expo (mobile), react-leaflet + leaflet (admin map), expo-location already installed (`~18.0.10`)

## Global Constraints

- MongoDB embedded subdocument lookup: `doctor.locations.id(locId)` — NOT `.find(l => l._id == locId)`
- All doctor-mutation endpoints verify ownership via `Doctor.findOne({ userId: req.user.id })` — never trust `doctorId` from request body
- Coordinates are always GeoJSON order: `[lng, lat]` — NOT `[lat, lng]`
- Appointment `date` is a `Date` object; `timeSlot.start` / `timeSlot.end` are `"HH:mm"` strings
- Denormalize `locationName` and `locationAddress` into Appointment — do not re-join on Doctor at read time
- Leaflet CSS must be explicitly imported: `import 'leaflet/dist/leaflet.css'` — Vite will not auto-include it
- Leaflet default marker icons break in Vite — fix with `delete L.Icon.Default.prototype._getIconUrl` + `L.Icon.Default.mergeOptions(...)` in every file that uses `<Marker>`
- Migration script is idempotent: skip any doctor that already has `locations.length > 0`
- `expo-location` requires `requestForegroundPermissionsAsync()` before `getCurrentPositionAsync()`
- API base URL in web: `import.meta.env.VITE_API_URL`; in mobile: from `API_URL` constant (check existing pattern in codebase)

---

### Task 1: Doctor model — add `locations[]`, run migration

**Files:**
- Modify: `apps/api/src/models/Doctor.js`
- Create: `scripts/migrate-doctor-locations.js`

**Interfaces:**
- Produces: `Doctor.locations[]` with shape `{ _id, name, address, coordinates: { type, coordinates:[lng,lat] }, type:'bookable'|'hospital', contactNote, slots:[{dayOfWeek,startTime,endTime}] }`
- Produces: `doctor.locations.id(locId)` — Mongoose embedded doc lookup method

- [ ] **Step 1: Rewrite `apps/api/src/models/Doctor.js`**

```js
const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, min: 0, max: 6 },
  startTime:  String,
  endTime:    String,
}, { _id: false });

const locationSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  address:  { type: String, default: '' },
  coordinates: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },
  type:        { type: String, enum: ['bookable', 'hospital'], required: true },
  contactNote: { type: String, default: '' },
  slots:       { type: [slotSchema], default: [] },
});

const educationSchema = new mongoose.Schema({
  degree:      { type: String, default: '' },
  institution: { type: String, default: '' },
  year:        { type: Number, default: null },
}, { _id: false });

const doctorSchema = new mongoose.Schema({
  userId:                 { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialty:              { type: String, required: true },
  clinicAddress:          String,
  bio:                    String,
  locations:              { type: [locationSchema], default: [] },
  averageRating:          { type: Number, default: 0 },
  reviewCount:            { type: Number, default: 0 },
  isVerified:             { type: Boolean, default: false },
  autoAcceptAppointments: { type: Boolean, default: false },
  consultationFee:        { type: Number, default: 0 },
  yearsOfExperience:      { type: Number, default: 0 },
  photoUrl:               { type: String, default: '' },
  timezone:               { type: String, default: 'UTC' },
  licenseNumber:          { type: String, default: '' },
  languages:              { type: [String], default: [] },
  education:              { type: [educationSchema], default: [] },
  achievements:           { type: [String], default: [] },
}, { timestamps: true });

doctorSchema.index({ 'locations.coordinates': '2dsphere' }, { sparse: true });

module.exports = mongoose.model('Doctor', doctorSchema);
```

- [ ] **Step 2: Create `scripts/migrate-doctor-locations.js`**

```js
require('dotenv').config({ path: require('path').join(__dirname, '../apps/api/.env') });
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.collection('doctors');

  // Only migrate doctors that have availabilitySlots AND no locations yet
  const docs = await col.find({
    availabilitySlots: { $exists: true, $not: { $size: 0 } },
    $or: [{ locations: { $exists: false } }, { locations: { $size: 0 } }],
  }).toArray();

  console.log(`Migrating ${docs.length} doctor(s)...`);

  for (const doc of docs) {
    const location = {
      _id:         new mongoose.Types.ObjectId(),
      name:        'Main Clinic',
      address:     doc.clinicAddress || '',
      coordinates: { type: 'Point', coordinates: [0, 0] },
      type:        'bookable',
      contactNote: '',
      slots:       doc.availabilitySlots || [],
    };
    await col.updateOne(
      { _id: doc._id },
      { $set: { locations: [location] }, $unset: { availabilitySlots: '' } }
    );
  }

  console.log('Migration complete.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Run migration**

```bash
cd /Users/ibrahimalnezami/Desktop/doc/doctor
node scripts/migrate-doctor-locations.js
```

Expected output:
```
Migrating N doctor(s)...
Migration complete.
```

- [ ] **Step 4: Verify schema compiles**

```bash
cd apps/api && node -e "require('./src/models/Doctor'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/models/Doctor.js scripts/migrate-doctor-locations.js
git commit -m "feat(doctor): replace availabilitySlots with locations[] + migration script"
```

---

### Task 2: Appointment model — add location fields + update index

**Files:**
- Modify: `apps/api/src/models/Appointment.js`

**Interfaces:**
- Produces: `appointment.locationId` (ObjectId), `appointment.locationName` (String), `appointment.locationAddress` (String), `appointment.locationType` ('bookable'|'hospital')
- Produces: compound index `{ doctorId:1, locationId:1, date:1, 'timeSlot.start':1 }` for conflict checks

- [ ] **Step 1: Add location fields to Appointment schema**

In `apps/api/src/models/Appointment.js`, add these four fields after `remindersDisabled`:

```js
locationId:      { type: mongoose.Schema.Types.ObjectId, default: null },
locationName:    { type: String, default: '' },
locationAddress: { type: String, default: '' },
locationType:    { type: String, enum: ['bookable', 'hospital', null], default: null },
```

- [ ] **Step 2: Replace the existing index**

Find this line:
```js
appointmentSchema.index({ doctorId: 1, date: 1, 'timeSlot.start': 1 });
```

Replace with:
```js
appointmentSchema.index({ doctorId: 1, locationId: 1, date: 1, 'timeSlot.start': 1 });
```

- [ ] **Step 3: Verify schema compiles**

```bash
cd apps/api && node -e "require('./src/models/Appointment'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/models/Appointment.js
git commit -m "feat(appointments): add locationId/Name/Address/Type fields + update compound index"
```

---

### Task 3: Location CRUD API

**Files:**
- Modify: `apps/api/src/routes/doctors.js`

**Interfaces:**
- Produces: `GET /api/doctors/:id/locations` — public, returns `location[]`
- Produces: `POST /api/doctors/me/locations` — body: `{ name, address?, coordinates?, type, contactNote?, slots? }`
- Produces: `PATCH /api/doctors/me/locations/:locId` — body: partial location fields
- Produces: `DELETE /api/doctors/me/locations/:locId` — 400 if upcoming appointments exist

**Consumes:**
- `doctor.locations.id(locId)` from Task 1

- [ ] **Step 1: Add `GET /api/doctors/:id/locations`**

In `apps/api/src/routes/doctors.js`, add this block **before** the `router.get('/:id', ...)` route (order matters — more specific paths must come first):

```js
// GET /api/doctors/:id/locations — public
router.get('/:id/locations', async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id).select('locations');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json(doctor.locations);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Add `POST /api/doctors/me/locations`**

Add after the existing `router.get('/me', ...)` handler:

```js
// POST /api/doctors/me/locations — add a location
router.post('/me/locations', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const { name, address, coordinates, type, contactNote, slots } = req.body;
    if (!name || !type) return res.status(400).json({ message: 'name and type are required' });
    if (!['bookable', 'hospital'].includes(type))
      return res.status(400).json({ message: 'type must be bookable or hospital' });

    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    doctor.locations.push({
      name,
      address:     address || '',
      coordinates: coordinates || { type: 'Point', coordinates: [0, 0] },
      type,
      contactNote: contactNote || '',
      slots:       type === 'bookable' ? (slots || []) : [],
    });
    await doctor.save();
    res.status(201).json(doctor.locations[doctor.locations.length - 1]);
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Add `PATCH /api/doctors/me/locations/:locId`**

```js
// PATCH /api/doctors/me/locations/:locId — edit a location
router.patch('/me/locations/:locId', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const loc = doctor.locations.id(req.params.locId);
    if (!loc) return res.status(404).json({ message: 'Location not found' });

    const { name, address, coordinates, type, contactNote, slots } = req.body;
    if (name        !== undefined) loc.name = name;
    if (address     !== undefined) loc.address = address;
    if (coordinates !== undefined) loc.coordinates = coordinates;
    if (type !== undefined) {
      if (!['bookable', 'hospital'].includes(type))
        return res.status(400).json({ message: 'type must be bookable or hospital' });
      loc.type = type;
    }
    if (contactNote !== undefined) loc.contactNote = contactNote;
    if (slots       !== undefined) loc.slots = loc.type === 'bookable' ? slots : [];

    await doctor.save();
    res.json(loc);
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Add `DELETE /api/doctors/me/locations/:locId`**

```js
// DELETE /api/doctors/me/locations/:locId — remove a location
router.delete('/me/locations/:locId', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const loc = doctor.locations.id(req.params.locId);
    if (!loc) return res.status(404).json({ message: 'Location not found' });

    const Appointment = require('../models/Appointment');
    const future = await Appointment.findOne({
      locationId: loc._id,
      date:       { $gte: new Date() },
      status:     { $nin: ['cancelled', 'completed'] },
    });
    if (future) return res.status(400).json({ message: 'Cannot delete location with upcoming appointments. Cancel them first.' });

    loc.deleteOne();
    await doctor.save();
    res.json({ message: 'Location removed' });
  } catch (err) { next(err); }
});
```

- [ ] **Step 5: Test all four endpoints manually**

Start the API (`cd apps/api && npm run dev`), then:

```bash
TOKEN="<doctor-jwt-from-login>"
DOCTOR_ID="<doctor-_id>"

# List locations (should show migrated "Main Clinic")
curl http://localhost:5000/api/doctors/$DOCTOR_ID/locations

# Add a bookable location
curl -X POST http://localhost:5000/api/doctors/me/locations \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Clinic Al Nahda","address":"Rue Al Nahda, Alger","type":"bookable","slots":[{"dayOfWeek":1,"startTime":"09:00","endTime":"17:00"}]}'
# Expected: 201 with new location object including _id

# Add a hospital location
curl -X POST http://localhost:5000/api/doctors/me/locations \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Hospital Mustapha Pacha","address":"Rue Belouizdad","type":"hospital","contactNote":"Book via reception ext. 214"}'
# Expected: 201, slots:[]

# Edit it
LOC_ID="<_id from above>"
curl -X PATCH http://localhost:5000/api/doctors/me/locations/$LOC_ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"contactNote":"Call +213 21 XX XX XX"}'
# Expected: 200 with updated contactNote

# Delete (no appointments yet — should succeed)
curl -X DELETE http://localhost:5000/api/doctors/me/locations/$LOC_ID \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"message":"Location removed"}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/doctors.js
git commit -m "feat(api): add location CRUD endpoints to doctors route"
```

---

### Task 4: Update slots endpoint + booking POST + admin map endpoint

**Files:**
- Modify: `apps/api/src/routes/doctors.js` (slots route)
- Modify: `apps/api/src/routes/appointments.js` (POST handler)
- Modify: `apps/api/src/routes/admin.js` (new map endpoint)

**Interfaces:**
- Produces: `GET /api/doctors/:id/slots?locationId=&date=` — returns `["09:00","09:30",...]`, requires `locationId`
- Produces: `POST /api/appointments` — now requires `locationId` in body
- Produces: `GET /api/admin/map/users?role=doctor|patient` → `[{ _id, name, role, coordinates:[lng,lat], address }]`

**Consumes:**
- `doctor.locations.id(locId)` from Task 1
- `Appointment` location fields from Task 2

- [ ] **Step 1: Update the slots route in `apps/api/src/routes/doctors.js`**

Find the existing `router.get('/:id/slots', ...)` route and **replace it entirely** with:

```js
// GET /api/doctors/:id/slots?locationId=&date=
router.get('/:id/slots', auth, async (req, res, next) => {
  try {
    const { locationId, date } = req.query;
    if (!locationId) return res.status(400).json({ message: 'locationId is required' });
    if (!date)       return res.status(400).json({ message: 'date is required' });

    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const loc = doctor.locations.id(locationId);
    if (!loc) return res.status(404).json({ message: 'Location not found' });
    if (loc.type !== 'bookable')
      return res.status(400).json({ message: 'This location does not accept online bookings' });

    const d = new Date(date);
    const dayOfWeek = d.getUTCDay();
    const avail = loc.slots.find(s => s.dayOfWeek === dayOfWeek);
    if (!avail) return res.json([]);

    const allSlots = generateSlots(avail.startTime, avail.endTime);

    const startOfDay = new Date(date + 'T00:00:00.000Z');
    const endOfDay   = new Date(date + 'T23:59:59.999Z');

    const booked = await Appointment.find({
      doctorId:   doctor.userId,
      locationId: loc._id,
      date:       { $gte: startOfDay, $lte: endOfDay },
      status:     { $nin: ['cancelled'] },
    }).select('timeSlot');

    const bookedTimes = new Set(booked.map(a => a.timeSlot.start));
    res.json(allSlots.filter(s => !bookedTimes.has(s)));
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Update `POST /api/appointments` in `apps/api/src/routes/appointments.js`**

Find the `router.post('/', ...)` handler. After the existing validation of `doctorId`, `date`, and `timeSlot`, add the location block. Find where `new Appointment({...})` is called and update it to:

```js
// Add at the top of the POST handler, after destructuring req.body:
const { doctorId, date, timeSlot, visitType, reason, locationId } = req.body;

if (!locationId) return res.status(400).json({ message: 'locationId is required' });

// Resolve location
const doctorProfile = await Doctor.findOne({ userId: doctorId });
if (!doctorProfile) return res.status(404).json({ message: 'Doctor profile not found' });

const loc = doctorProfile.locations.id(locationId);
if (!loc) return res.status(404).json({ message: 'Location not found' });
if (loc.type !== 'bookable')
  return res.status(400).json({ message: 'This location does not accept online bookings' });

// Conflict check (per-location — doctor can have different slots at different places)
const conflict = await Appointment.findOne({
  doctorId,
  locationId: loc._id,
  date:       new Date(date),
  'timeSlot.start': timeSlot.start,
  status:     { $nin: ['cancelled'] },
});
if (conflict) return res.status(409).json({ message: 'This slot is already booked' });

// Then in new Appointment({...}), add:
// locationId:      loc._id,
// locationName:    loc.name,
// locationAddress: loc.address,
// locationType:    loc.type,
```

The full `new Appointment` call should become:

```js
const appt = new Appointment({
  doctorId,
  patientId:       req.user.id,
  date:            new Date(date),
  timeSlot,
  visitType:       visitType || 'initial',
  reason:          reason || '',
  locationId:      loc._id,
  locationName:    loc.name,
  locationAddress: loc.address,
  locationType:    loc.type,
});
await appt.save();
```

Keep all existing reminder scheduling, notification, and symptom analysis logic that follows — do not remove it.

- [ ] **Step 3: Add `GET /api/admin/map/users` in `apps/api/src/routes/admin.js`**

Add these imports at the top of `admin.js` if not already present:

```js
const Doctor  = require('../models/Doctor');
const Patient = require('../models/Patient');
```

Then add the route:

```js
// GET /api/admin/map/users?role= — pins for admin Leaflet map
router.get('/map/users', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { role } = req.query;
    const roleFilter = role ? { role } : { role: { $in: ['doctor', 'patient'] } };

    const users = await User.find(roleFilter).select('name role location').lean();
    const uids  = users.map(u => u._id);

    const [doctors, patients] = await Promise.all([
      Doctor.find({ userId: { $in: uids } }).select('userId locations clinicAddress').lean(),
      Patient.find({ userId: { $in: uids } }).select('userId homeLocation city').lean(),
    ]);

    const doctorMap  = Object.fromEntries(doctors.map(d => [d.userId.toString(), d]));
    const patientMap = Object.fromEntries(patients.map(p => [p.userId.toString(), p]));

    const pins = [];
    for (const user of users) {
      const uid = user._id.toString();
      let coordinates = null;
      let address     = '';

      if (user.role === 'doctor') {
        const doc      = doctorMap[uid];
        const bookable = doc?.locations?.find(
          l => l.type === 'bookable' && l.coordinates?.coordinates?.some(c => c !== 0)
        );
        if (bookable) {
          coordinates = bookable.coordinates.coordinates;
          address     = bookable.address || bookable.name;
        } else if (user.location?.coordinates?.some(c => c !== 0)) {
          coordinates = user.location.coordinates;
          address     = doc?.clinicAddress || '';
        }
      } else if (user.role === 'patient') {
        const pat = patientMap[uid];
        if (pat?.homeLocation?.coordinates?.some(c => c !== 0)) {
          coordinates = pat.homeLocation.coordinates;
          address     = pat.city || '';
        }
      }

      if (coordinates) {
        pins.push({ _id: user._id, name: user.name, role: user.role, coordinates, address });
      }
    }

    res.json(pins);
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Test slots and booking**

```bash
PATIENT_TOKEN="<patient-jwt>"
DOCTOR_USER_ID="<doctor userId field — the User _id, not Doctor _id>"
LOC_ID="<bookable location _id from Task 3 test>"

# Get available slots for Monday 2026-07-06
curl "http://localhost:5000/api/doctors/$DOCTOR_USER_ID/slots?locationId=$LOC_ID&date=2026-07-06" \
  -H "Authorization: Bearer $PATIENT_TOKEN"
# Expected: ["09:00","09:30",...]

# Missing locationId returns 400
curl "http://localhost:5000/api/doctors/$DOCTOR_USER_ID/slots?date=2026-07-06" \
  -H "Authorization: Bearer $PATIENT_TOKEN"
# Expected: 400 {"message":"locationId is required"}

# Book an appointment
curl -X POST http://localhost:5000/api/appointments \
  -H "Authorization: Bearer $PATIENT_TOKEN" -H "Content-Type: application/json" \
  -d "{\"doctorId\":\"$DOCTOR_USER_ID\",\"locationId\":\"$LOC_ID\",\"date\":\"2026-07-06\",\"timeSlot\":{\"start\":\"09:00\",\"end\":\"09:30\"},\"visitType\":\"initial\"}"
# Expected: 201, response includes locationName and locationAddress

# Book same slot again — should conflict
curl -X POST http://localhost:5000/api/appointments \
  -H "Authorization: Bearer $PATIENT_TOKEN" -H "Content-Type: application/json" \
  -d "{\"doctorId\":\"$DOCTOR_USER_ID\",\"locationId\":\"$LOC_ID\",\"date\":\"2026-07-06\",\"timeSlot\":{\"start\":\"09:00\",\"end\":\"09:30\"},\"visitType\":\"initial\"}"
# Expected: 409 {"message":"This slot is already booked"}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/doctors.js apps/api/src/routes/appointments.js apps/api/src/routes/admin.js
git commit -m "feat(api): update slots endpoint, booking POST, add admin map endpoint"
```

---

### Task 5: Doctor Settings UI — location manager (web)

**Files:**
- Modify: `apps/web/src/pages/doctor/DoctorSettingsPage.jsx`
- Modify: `apps/web/package.json` (add react-leaflet + leaflet)

**Interfaces:**
- Consumes: `GET /api/doctors/me` → `doctor.locations[]`
- Consumes: `POST/PATCH/DELETE /api/doctors/me/locations`

- [ ] **Step 1: Install react-leaflet and leaflet**

```bash
cd apps/web && npm install leaflet react-leaflet
```

- [ ] **Step 2: Add imports and fix Leaflet icon bug at top of `DoctorSettingsPage.jsx`**

Add these imports after the existing React/other imports:

```js
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';

// Leaflet's default icons reference files that Vite's bundler moves — fix manually
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});
```

- [ ] **Step 3: Add state variables inside the component**

Inside `DoctorSettingsPage`, add:

```js
const [locations, setLocations] = useState([]);
const [locForm,   setLocForm]   = useState(null); // null=closed, {}=new, {_id,...}=edit
const [mapPick,   setMapPick]   = useState(false);
```

In the existing `useEffect` that fetches doctor data, add `setLocations(data.locations || [])` after setting the existing fields.

- [ ] **Step 4: Add `MapPicker` component (define outside the main component)**

```jsx
function MapPicker({ coordinates, onChange }) {
  function ClickHandler() {
    useMapEvents({
      click(e) { onChange([e.latlng.lng, e.latlng.lat]); }, // GeoJSON [lng, lat]
    });
    return null;
  }
  const hasPin = coordinates?.some(c => c !== 0);
  const center = hasPin ? [coordinates[1], coordinates[0]] : [36.7525, 3.0420];

  return (
    <MapContainer center={center} zoom={12} style={{ height: 260, width: '100%', borderRadius: 8 }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler />
      {hasPin && <Marker position={[coordinates[1], coordinates[0]]} />}
    </MapContainer>
  );
}
```

- [ ] **Step 5: Add location CRUD handler functions inside `DoctorSettingsPage`**

```js
const API = import.meta.env.VITE_API_URL;

async function saveLocation(e) {
  e.preventDefault();
  const isEdit = !!locForm._id;
  const url    = isEdit
    ? `${API}/api/doctors/me/locations/${locForm._id}`
    : `${API}/api/doctors/me/locations`;
  const res = await fetch(url, {
    method:  isEdit ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(locForm),
  });
  if (!res.ok) { alert((await res.json()).message); return; }
  const saved = await res.json();
  setLocations(prev =>
    isEdit ? prev.map(l => l._id === saved._id ? saved : l) : [...prev, saved]
  );
  setLocForm(null);
  setMapPick(false);
}

async function deleteLocation(locId) {
  if (!confirm('Remove this location? This cannot be undone.')) return;
  const res = await fetch(`${API}/api/doctors/me/locations/${locId}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { alert((await res.json()).message); return; }
  setLocations(prev => prev.filter(l => l._id !== locId));
}
```

- [ ] **Step 6: Add the "My Locations" UI section in the JSX**

Add this block after the existing profile form sections, before the closing `</div>` of the page:

```jsx
{/* ── My Locations ───────────────────────────────────────── */}
<div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:24, marginTop:24 }}>
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
    <h3 style={{ margin:0 }}>My Locations</h3>
    <button
      onClick={() => setLocForm({ name:'', address:'', type:'bookable', contactNote:'', slots:[], coordinates:{ type:'Point', coordinates:[0,0] } })}
      style={{ padding:'8px 16px', background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer', fontWeight:600 }}>
      + Add Location
    </button>
  </div>

  {locations.length === 0 && (
    <p style={{ color:'var(--text2)', fontSize:14 }}>No locations added yet. Add your clinic or hospital.</p>
  )}

  {locations.map(loc => (
    <div key={loc._id} style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
      <div>
        <div style={{ fontWeight:600 }}>{loc.name}</div>
        <div style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>{loc.address}</div>
        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:12, marginTop:6, display:'inline-block',
          background: loc.type === 'bookable' ? 'rgba(15,227,176,0.15)' : 'rgba(255,165,0,0.12)',
          color:      loc.type === 'bookable' ? 'var(--accent)' : 'orange' }}>
          {loc.type === 'bookable' ? `Bookable · ${loc.slots?.length || 0} day(s)` : 'Hospital — contact to book'}
        </span>
        {loc.type === 'hospital' && loc.contactNote && (
          <div style={{ fontSize:12, color:'var(--text2)', marginTop:4 }}>{loc.contactNote}</div>
        )}
      </div>
      <div style={{ display:'flex', gap:8, flexShrink:0 }}>
        <button onClick={() => { setLocForm({ ...loc }); setMapPick(false); }}
          style={{ padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:'pointer' }}>Edit</button>
        <button onClick={() => deleteLocation(loc._id)}
          style={{ padding:'6px 12px', borderRadius:6, border:'1px solid #ef4444', background:'transparent', color:'#ef4444', cursor:'pointer' }}>Delete</button>
      </div>
    </div>
  ))}

  {/* ── Location form modal ── */}
  {locForm && (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:12, padding:28, width:'90%', maxWidth:520, maxHeight:'88vh', overflowY:'auto' }}>
        <h3 style={{ margin:'0 0 20px' }}>{locForm._id ? 'Edit Location' : 'Add Location'}</h3>
        <form onSubmit={saveLocation}>

          <label style={{ display:'block', marginBottom:4, fontSize:13 }}>Name *</label>
          <input value={locForm.name} required
            onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))}
            style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text)', marginBottom:14, boxSizing:'border-box' }} />

          <label style={{ display:'block', marginBottom:4, fontSize:13 }}>Address</label>
          <input value={locForm.address}
            onChange={e => setLocForm(f => ({ ...f, address: e.target.value }))}
            style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text)', marginBottom:6, boxSizing:'border-box' }} />
          <button type="button" onClick={() => setMapPick(p => !p)}
            style={{ fontSize:12, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', marginBottom:14, padding:0 }}>
            {mapPick ? 'Hide map' : '📍 Pick on map'}
          </button>
          {mapPick && (
            <div style={{ marginBottom:14 }}>
              <MapPicker
                coordinates={locForm.coordinates?.coordinates}
                onChange={coords => setLocForm(f => ({ ...f, coordinates:{ type:'Point', coordinates: coords } }))}
              />
              <p style={{ fontSize:11, color:'var(--text2)', margin:'6px 0 0' }}>Click anywhere on the map to pin the location</p>
            </div>
          )}

          <label style={{ display:'block', marginBottom:4, fontSize:13 }}>Type *</label>
          <select value={locForm.type}
            onChange={e => setLocForm(f => ({ ...f, type: e.target.value }))}
            style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text)', marginBottom:14, boxSizing:'border-box' }}>
            <option value="bookable">Bookable — patients can book online</option>
            <option value="hospital">Hospital — contact to book</option>
          </select>

          {locForm.type === 'hospital' && (
            <>
              <label style={{ display:'block', marginBottom:4, fontSize:13 }}>Contact Note</label>
              <textarea rows={3} value={locForm.contactNote}
                onChange={e => setLocForm(f => ({ ...f, contactNote: e.target.value }))}
                placeholder="e.g. Book via hospital reception, extension 214"
                style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text)', marginBottom:14, boxSizing:'border-box', resize:'vertical' }} />
            </>
          )}

          {locForm.type === 'bookable' && (
            <>
              <label style={{ display:'block', marginBottom:8, fontSize:13 }}>Weekly Schedule</label>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => {
                const slot = locForm.slots?.find(s => s.dayOfWeek === i);
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span style={{ width:34, fontSize:13, color:'var(--text2)' }}>{day}</span>
                    <input type="checkbox" checked={!!slot}
                      onChange={e => setLocForm(f => {
                        const slots = (f.slots || []).filter(s => s.dayOfWeek !== i);
                        if (e.target.checked) slots.push({ dayOfWeek:i, startTime:'09:00', endTime:'17:00' });
                        return { ...f, slots };
                      })} />
                    {slot && (
                      <>
                        <input type="time" value={slot.startTime}
                          onChange={e => setLocForm(f => ({ ...f, slots: f.slots.map(s => s.dayOfWeek === i ? { ...s, startTime: e.target.value } : s) }))}
                          style={{ padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text)' }} />
                        <span style={{ fontSize:12, color:'var(--text2)' }}>to</span>
                        <input type="time" value={slot.endTime}
                          onChange={e => setLocForm(f => ({ ...f, slots: f.slots.map(s => s.dayOfWeek === i ? { ...s, endTime: e.target.value } : s) }))}
                          style={{ padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text)' }} />
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}

          <div style={{ display:'flex', gap:10, marginTop:20 }}>
            <button type="submit"
              style={{ flex:1, padding:'10px', background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer', fontWeight:600 }}>
              {locForm._id ? 'Save Changes' : 'Add Location'}
            </button>
            <button type="button" onClick={() => { setLocForm(null); setMapPick(false); }}
              style={{ flex:1, padding:'10px', background:'transparent', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--text)' }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 7: Test in browser**

1. Log in as doctor → Settings page → scroll to "My Locations"
2. Migrated "Main Clinic" should appear (if migration ran)
3. Click "Add Location" → modal opens
4. Enter name, click "📍 Pick on map" → Leaflet map appears, click somewhere → pin appears
5. Select type "Bookable" → weekly schedule rows appear → check Mon, set 09:00–17:00 → Save
6. Card appears with "Bookable · 1 day(s)"
7. Add another with type "Hospital" → contact note textarea appears → Save
8. Hospital card shows "Hospital — contact to book" badge
9. Click Edit → change name → Save → card updates
10. Click Delete on hospital card → confirm → card removed

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/doctor/DoctorSettingsPage.jsx apps/web/package.json apps/web/package-lock.json
git commit -m "feat(web): doctor location manager in settings page with map picker"
```

---

### Task 6: Patient booking flow — Step 0 location picker (web + mobile)

**Files:**
- Modify: `apps/web/src/pages/patient/BookAppointmentPage.jsx`
- Modify: `apps/mobile/src/screens/patient/BookAppointmentScreen.js`

**Interfaces:**
- Consumes: `GET /api/doctors/:id/locations`
- Consumes: `GET /api/doctors/:id/slots?locationId=&date=` (from Task 4)
- Consumes: `POST /api/appointments` with `locationId` (from Task 4)

- [ ] **Step 1: Add location state to `BookAppointmentPage.jsx` (web)**

Add to existing state declarations:

```js
const [locations,         setLocations]         = useState([]);
const [selectedLocation,  setSelectedLocation]  = useState(null);
```

Add a `step` state if the page doesn't already have one, or prepend a step before the current first step:

```js
const [step, setStep] = useState(0); // 0=location, 1=date, 2=slot, 3=confirm
```

Read pre-selected `locationId` from URL query param (used when coming from public profile "Book here" button):

```js
const preLocId = new URLSearchParams(window.location.search).get('locationId');
```

- [ ] **Step 2: Fetch locations on mount (web)**

In the existing `useEffect` for the doctor ID param, also fetch locations:

```js
const locRes = await fetch(`${import.meta.env.VITE_API_URL}/api/doctors/${doctorId}/locations`,
  { headers: { Authorization: `Bearer ${token}` } });
if (locRes.ok) {
  const locs = await locRes.json();
  setLocations(locs);
  // Pre-select if locationId in URL and it's a bookable location
  if (preLocId) {
    const match = locs.find(l => l._id === preLocId && l.type === 'bookable');
    if (match) { setSelectedLocation(match); setStep(1); }
  }
}
```

- [ ] **Step 3: Add Step 0 location picker UI (web)**

Before the existing step 1 date-picker section, add:

```jsx
{step === 0 && (
  <div>
    <h3 style={{ marginBottom:16, fontSize:16, fontWeight:700 }}>Select a Location</h3>
    {locations.length === 0 && (
      <p style={{ color:'var(--text2)' }}>This doctor hasn't configured any locations yet.</p>
    )}
    {locations.map(loc => (
      <div key={loc._id}
        onClick={() => loc.type === 'bookable' && setSelectedLocation(loc)}
        style={{
          border:`1px solid ${selectedLocation?._id === loc._id ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius:10, padding:16, marginBottom:10,
          background: selectedLocation?._id === loc._id ? 'rgba(15,227,176,0.07)' : 'var(--bg2)',
          cursor: loc.type === 'bookable' ? 'pointer' : 'default',
          opacity: loc.type === 'hospital' ? 0.75 : 1,
        }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontWeight:600 }}>{loc.name}</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>{loc.address}</div>
            {loc.type === 'hospital' && loc.contactNote && (
              <div style={{ fontSize:12, color:'var(--text2)', marginTop:6, fontStyle:'italic' }}>{loc.contactNote}</div>
            )}
          </div>
          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:12, flexShrink:0,
            background: loc.type === 'bookable' ? 'rgba(15,227,176,0.15)' : 'rgba(255,165,0,0.12)',
            color:      loc.type === 'bookable' ? 'var(--accent)' : 'orange' }}>
            {loc.type === 'bookable' ? 'Book online' : 'Contact hospital'}
          </span>
        </div>
      </div>
    ))}
    <button disabled={!selectedLocation} onClick={() => setStep(1)}
      style={{ marginTop:8, padding:'10px 24px', background:'var(--accent)', color:'#000', border:'none', borderRadius:8,
        cursor: selectedLocation ? 'pointer' : 'not-allowed', opacity: selectedLocation ? 1 : 0.5, fontWeight:600 }}>
      Continue →
    </button>
  </div>
)}
```

- [ ] **Step 4: Pass `locationId` to slots fetch and appointment POST (web)**

In the existing slots fetch call, append `&locationId=${selectedLocation._id}`.

In the existing `POST /api/appointments` body, add `locationId: selectedLocation._id`.

- [ ] **Step 5: Add location Step 0 to `BookAppointmentScreen.js` (mobile)**

In `apps/mobile/src/screens/patient/BookAppointmentScreen.js`, add state:

```js
const [locations,        setLocations]        = useState([]);
const [selectedLocation, setSelectedLocation] = useState(null);
const [step, setStep] = useState(0); // prepend before existing first step
```

Add to the mount effect (use the `API_URL` constant already used in this file):

```js
fetch(`${API_URL}/api/doctors/${doctorId}/locations`,
  { headers: { Authorization: `Bearer ${token}` } })
  .then(r => r.json())
  .then(locs => setLocations(Array.isArray(locs) ? locs : []))
  .catch(() => {});
```

Add location picker before the existing first step in the JSX:

```jsx
{step === 0 && (
  <ScrollView>
    <Text style={{ fontSize:16, fontWeight:'700', color:colors.text, marginBottom:14 }}>Select a Location</Text>
    {locations.map(loc => (
      <TouchableOpacity key={loc._id}
        onPress={() => loc.type === 'bookable' && setSelectedLocation(loc)}
        disabled={loc.type === 'hospital'}
        style={{
          borderWidth:1,
          borderColor: selectedLocation?._id === loc._id ? colors.accent : colors.border,
          borderRadius:10, padding:14, marginBottom:10,
          backgroundColor: selectedLocation?._id === loc._id ? 'rgba(15,227,176,0.07)' : colors.card,
          opacity: loc.type === 'hospital' ? 0.7 : 1,
        }}>
        <Text style={{ fontWeight:'600', color:colors.text }}>{loc.name}</Text>
        <Text style={{ fontSize:12, color:colors.textSecondary, marginTop:2 }}>{loc.address}</Text>
        {loc.type === 'hospital' && loc.contactNote ? (
          <Text style={{ fontSize:11, color:colors.textSecondary, marginTop:4, fontStyle:'italic' }}>{loc.contactNote}</Text>
        ) : null}
        <View style={{ marginTop:6 }}>
          <Text style={{ fontSize:11, color: loc.type === 'bookable' ? colors.accent : 'orange' }}>
            {loc.type === 'bookable' ? 'Book online' : 'Contact hospital'}
          </Text>
        </View>
      </TouchableOpacity>
    ))}
    <TouchableOpacity disabled={!selectedLocation} onPress={() => setStep(1)}
      style={{ marginTop:8, padding:12, backgroundColor:colors.accent, borderRadius:8, alignItems:'center', opacity: selectedLocation ? 1 : 0.4 }}>
      <Text style={{ fontWeight:'600', color:'#000' }}>Continue →</Text>
    </TouchableOpacity>
  </ScrollView>
)}
```

Pass `locationId: selectedLocation._id` in the existing slots fetch and POST body.

- [ ] **Step 6: Test web flow**

1. Navigate to `/book/:doctorId` as a patient
2. Step 0 shows location cards — hospital card greyed, bookable selectable
3. Select bookable → "Continue" activates → click → step 1 date picker
4. Pick date → slots load (only slots for that location)
5. Pick slot → confirm → appointment created with location name in confirmation

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/patient/BookAppointmentPage.jsx \
        apps/mobile/src/screens/patient/BookAppointmentScreen.js
git commit -m "feat: add location picker step 0 to patient booking flow (web + mobile)"
```

---

### Task 7: Public doctor profile — locations section (web)

**Files:**
- Modify: `apps/web/src/pages/public/DoctorPublicProfilePage.jsx`
- Modify: `apps/api/src/routes/doctors.js` (public endpoint select fix)

**Interfaces:**
- Consumes: `GET /api/doctors/public/:id` → must include `locations[]`

- [ ] **Step 1: Ensure public endpoint returns locations**

In `apps/api/src/routes/doctors.js`, find the `GET /api/doctors/public/:id` route:

```js
// Current .select() still excludes the now-removed availabilitySlots field
// Find this line:
.select('-availabilitySlots -autoAcceptAppointments -timezone')
// Replace with:
.select('-autoAcceptAppointments -timezone')
```

This ensures `locations` is returned in the public response.

- [ ] **Step 2: Add Locations section to `DoctorPublicProfilePage.jsx`**

After the existing achievements/languages sections, add:

```jsx
{/* Locations */}
{doctor.locations?.length > 0 && (
  <div style={{ marginTop:28 }}>
    <h3 style={{ margin:'0 0 14px', fontSize:16, fontWeight:700 }}>Locations</h3>
    {doctor.locations.map(loc => (
      <div key={loc._id} style={{ border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:10, background:'var(--bg2)', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:600 }}>{loc.name}</div>
          <div style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>{loc.address}</div>
          {loc.type === 'hospital' && loc.contactNote && (
            <div style={{ fontSize:12, color:'var(--text2)', marginTop:6, fontStyle:'italic' }}>{loc.contactNote}</div>
          )}
        </div>
        {loc.type === 'bookable' ? (
          <a href={`/book/${doctor._id}?locationId=${loc._id}`}
            style={{ padding:'7px 14px', background:'var(--accent)', color:'#000', borderRadius:8, textDecoration:'none', fontSize:13, fontWeight:600, whiteSpace:'nowrap', marginLeft:12 }}>
            Book here
          </a>
        ) : (
          <span style={{ fontSize:11, padding:'3px 10px', borderRadius:12, background:'rgba(255,165,0,0.12)', color:'orange', marginLeft:12, whiteSpace:'nowrap' }}>Hospital</span>
        )}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Test public profile**

1. Visit `/dr/:doctorId` (no login required)
2. Scroll to bottom — "Locations" section appears
3. Bookable location shows "Book here" button → click → goes to `/book/:id?locationId=X` → Step 0 skips to Step 1 (pre-selected in Task 6)
4. Hospital location shows contact note and "Hospital" badge — no booking action

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/public/DoctorPublicProfilePage.jsx apps/api/src/routes/doctors.js
git commit -m "feat(web): add locations section to public doctor profile page"
```

---

### Task 8: "Use my location" button (web + mobile)

**Files:**
- Modify: `apps/web/src/pages/patient/FindDoctorPage.jsx`
- Modify: `apps/mobile/src/screens/patient/BookAppointmentScreen.js` (or wherever doctor search exists in mobile — check existing search logic)

**Interfaces:**
- Consumes: `GET /api/doctors?lat=&lng=&radius=` — already supports geo params, no backend change

- [ ] **Step 1: Add geo handler to `FindDoctorPage.jsx` (web)**

Inside the component, add:

```js
function handleUseMyLocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      // Set the lat/lng into whatever state variables drive the search
      // Look for existing state: setLat / setLng, or setFilters, or similar
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
      // Then trigger search (call whatever function runs the doctor search)
      fetchDoctors({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    },
    () => {
      alert('Location access denied. Enable location in your browser settings to use this feature.');
    }
  );
}
```

If the page reads `homeLocation` from the patient profile, also pre-fill on mount:

```js
useEffect(() => {
  if (patientProfile?.homeLocation?.coordinates?.some(c => c !== 0)) {
    const [lng, lat] = patientProfile.homeLocation.coordinates;
    setLat(lat);
    setLng(lng);
  }
}, [patientProfile]);
```

- [ ] **Step 2: Add "Use my location" button in `FindDoctorPage.jsx` JSX**

Place it next to the search input / filter bar:

```jsx
<button type="button" onClick={handleUseMyLocation}
  style={{ padding:'8px 14px', border:'1px solid var(--border)', borderRadius:8, background:'var(--bg2)', color:'var(--text)', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:14, whiteSpace:'nowrap' }}>
  📍 Use my location
</button>
```

- [ ] **Step 3: Add "Use my location" to mobile**

`expo-location` is already installed. In `apps/mobile/src/screens/patient/BookAppointmentScreen.js` (or wherever doctor search exists in mobile — grep for `api/doctors` fetch in mobile screens to find the right file):

```bash
grep -r 'api/doctors' apps/mobile/src --include='*.js' -l
```

In that file, add:

```js
import * as Location from 'expo-location';

async function handleUseMyLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Location denied', 'Enable location in Settings to use this feature.');
    return;
  }
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  setLat(pos.coords.latitude);
  setLng(pos.coords.longitude);
  fetchDoctors({ lat: pos.coords.latitude, lng: pos.coords.longitude });
}
```

Add button in JSX:

```jsx
<TouchableOpacity onPress={handleUseMyLocation}
  style={{ flexDirection:'row', alignItems:'center', gap:6, padding:10, borderRadius:8, borderWidth:1, borderColor:colors.border, marginBottom:12, alignSelf:'flex-start' }}>
  <Text style={{ fontSize:14 }}>📍</Text>
  <Text style={{ fontSize:14, color:colors.text }}>Use my location</Text>
</TouchableOpacity>
```

- [ ] **Step 4: Test web geo detection**

1. Open Find Doctor page
2. Click "Use my location" → browser permission dialog appears
3. Allow → doctors near your location load (or empty if none nearby)
4. Deny → alert shown, page unchanged

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/patient/FindDoctorPage.jsx \
        apps/mobile/src/screens/patient/BookAppointmentScreen.js
git commit -m "feat: add Use My Location button to Find Doctor (web + mobile)"
```

---

### Task 9: Admin Leaflet map page (web)

**Files:**
- Create: `apps/web/src/pages/admin/AdminMapPage.jsx`
- Modify: `apps/web/src/router/index.jsx`
- Modify: `apps/web/src/pages/admin/AdminPage.jsx` (add nav link)

**Interfaces:**
- Consumes: `GET /api/admin/map/users?role=` from Task 4
- Uses: `react-leaflet` (installed in Task 5)

- [ ] **Step 1: Create `apps/web/src/pages/admin/AdminMapPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

// Fix Leaflet icon paths for Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const blueIcon = new L.Icon({
  iconUrl:       'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:      [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
});

const greenIcon = new L.Icon({
  iconUrl:       'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:      [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
});

const API = import.meta.env.VITE_API_URL;

export default function AdminMapPage() {
  const [pins,       setPins]       = useState([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading,    setLoading]    = useState(true);
  const token = localStorage.getItem('token');

  useEffect(() => {
    const url = roleFilter === 'all'
      ? `${API}/api/admin/map/users`
      : `${API}/api/admin/map/users?role=${roleFilter}`;
    setLoading(true);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setPins(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [roleFilter]);

  const doctorCount  = pins.filter(p => p.role === 'doctor').length;
  const patientCount = pins.filter(p => p.role === 'patient').length;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding:'12px 20px', background:'var(--bg2)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16, flexShrink:0, flexWrap:'wrap' }}>
        <h2 style={{ margin:0, fontSize:16, fontWeight:700 }}>User Map</h2>
        <div style={{ display:'flex', gap:8 }}>
          {[
            { key:'all',     label:`All (${pins.length})` },
            { key:'doctor',  label:`Doctors (${doctorCount})` },
            { key:'patient', label:`Patients (${patientCount})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setRoleFilter(key)}
              style={{ padding:'6px 14px', borderRadius:20, border:`1px solid ${roleFilter===key ? 'var(--accent)' : 'var(--border)'}`,
                background: roleFilter===key ? 'rgba(15,227,176,0.15)' : 'var(--bg)',
                color:      roleFilter===key ? 'var(--accent)' : 'var(--text)',
                cursor:'pointer', fontSize:13, fontWeight: roleFilter===key ? 600 : 400 }}>
              {label}
            </button>
          ))}
        </div>
        {loading && <span style={{ fontSize:13, color:'var(--text2)' }}>Loading…</span>}
        <div style={{ marginLeft:'auto', display:'flex', gap:14, fontSize:12, color:'var(--text2)' }}>
          <span>🔵 Doctor</span>
          <span>🟢 Patient</span>
        </div>
      </div>

      {/* Map */}
      <div style={{ flex:1 }}>
        <MapContainer center={[36.7525, 3.0420]} zoom={6} style={{ height:'100%', width:'100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {pins.map(pin => (
            <Marker
              key={String(pin._id)}
              position={[pin.coordinates[1], pin.coordinates[0]]}
              icon={pin.role === 'doctor' ? blueIcon : greenIcon}
            >
              <Popup>
                <strong>{pin.name}</strong><br />
                <span style={{ fontSize:12, color:'#666', textTransform:'capitalize' }}>{pin.role}</span>
                {pin.address && <><br /><span style={{ fontSize:12 }}>{pin.address}</span></>}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register route in `apps/web/src/router/index.jsx`**

Add import at the top:

```js
import AdminMapPage from '../pages/admin/AdminMapPage';
```

Find the admin routes section and add:

```js
{ path: '/admin/map', element: <AdminMapPage /> },
```

- [ ] **Step 3: Add "Map" link to admin nav in `AdminPage.jsx`**

Open `apps/web/src/pages/admin/AdminPage.jsx`, find where admin tabs/nav links are rendered (look for the pattern used by existing admin nav items like "Users", "Doctors", etc.), and add a Map link in the same style:

```jsx
// Find the existing nav link pattern, e.g.:
<button onClick={() => setTab('users')}>Users</button>
// Add:
<a href="/admin/map" style={{ /* match existing nav item style */ }}>Map</a>
// OR if using React Router NavLink:
<NavLink to="/admin/map">Map</NavLink>
```

Match the exact style of the existing admin navigation items.

- [ ] **Step 4: Test in browser**

1. Log in as admin → click "Map" in admin nav → `/admin/map` loads
2. Map appears centered on Algeria at zoom 6
3. Doctor pins (blue) appear at their bookable location coordinates
4. Patient pins (green) appear at their homeLocation coordinates
5. Click a pin → popup: name, role, address
6. Click "Doctors" filter → only blue pins remain, count shows correctly
7. Click "Patients" → only green pins remain
8. Click "All" → both sets return

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/admin/AdminMapPage.jsx \
        apps/web/src/router/index.jsx \
        apps/web/src/pages/admin/AdminPage.jsx
git commit -m "feat(admin): Leaflet user map with doctor/patient pins and role filter"
```

---

## Self-Review

**Spec coverage:**
- ✅ `locations[]` replaces `availabilitySlots` in Doctor model (Task 1)
- ✅ Migration script: idempotent, raw MongoDB collection, moves slots to `locations[0]` (Task 1)
- ✅ Appointment gains `locationId`, `locationName`, `locationAddress`, `locationType` + updated index (Task 2)
- ✅ Location CRUD: GET (public), POST/PATCH/DELETE (doctor-only, ownership verified) (Task 3)
- ✅ DELETE guard: 400 if upcoming appointments exist at that location (Task 3)
- ✅ Slots endpoint requires `locationId`, validates `bookable` type (Task 4)
- ✅ Booking POST requires `locationId`, validates bookable, conflict check per-location, denormalizes fields (Task 4)
- ✅ Admin map endpoint: role filter, doctor uses first bookable location coords (Task 4)
- ✅ Doctor Settings: location manager with add/edit/delete, map picker, per-location schedule, hospital contact note (Task 5)
- ✅ Booking Step 0: location picker, hospital greyed out with contact note (Task 6)
- ✅ Pre-select `locationId` from URL (public profile "Book here" → skip Step 0) (Task 6)
- ✅ Mobile booking: location picker Step 0 (Task 6)
- ✅ Public profile: locations section, bookable="Book here", hospital=contact note (Task 7)
- ✅ Public endpoint `.select()` updated to remove stale `availabilitySlots` exclusion (Task 7)
- ✅ "Use my location" web: `navigator.geolocation` + homeLocation pre-fill (Task 8)
- ✅ "Use my location" mobile: `expo-location` (already installed) (Task 8)
- ✅ Admin Leaflet map: blue/green pins, role filter, OpenStreetMap tiles, pin popup (Task 9)
- ✅ Leaflet icon Vite fix applied in both Task 5 (MapPicker) and Task 9 (AdminMapPage)

**Type consistency:**
- `doctor.locations.id(locId)` — used identically in Tasks 3, 4, 7 ✅
- `[lng, lat]` GeoJSON order — consistent in model (Task 1), MapPicker (Task 5), AdminMapPage (Task 9) ✅
- `timeSlot.start` — used in Task 4 conflict check (matches Appointment model) ✅
- `loc._id` stored as `appointment.locationId` (ObjectId) — consistent Tasks 3→4→6 ✅
- `VITE_API_URL` env var — used in Tasks 5, 6, 9 ✅
