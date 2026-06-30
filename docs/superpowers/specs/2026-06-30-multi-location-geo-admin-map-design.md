# Multi-Location Scheduling, Geo Detection & Admin Map

**Date:** 2026-06-30  
**Status:** Approved  
**Scope:** API, Web, Mobile

---

## Overview

Three linked features:

1. **Multi-location doctor scheduling** — doctors manage multiple clinics/hospitals, each with its own schedule. Hybrid model: some locations are bookable via MediConnect, others are informational-only (hospital has own system).
2. **"Use my location" button** — patient taps to auto-detect GPS coords, passed to existing doctor search API.
3. **Admin Leaflet map** — admin sees all users as pins on a map, filtered by role (doctor/patient).

The doctor public profile + sharing feature was already implemented (commits 915db92, c2f93a2).

---

## Feature A: Multi-Location Doctor Scheduling

### Approach

Replace the flat `Doctor.availabilitySlots` array with a `locations[]` embedded array. Each location has its own schedule. A one-shot migration script lifts existing `availabilitySlots` into `locations[0]` named "Main Clinic".

### Data Model Changes

**Doctor model — `locations[]` replaces `availabilitySlots`:**

```js
locationSchema = {
  _id: ObjectId,
  name: String,               // "Clinic Al Nahda", "Hospital Mustapha Pacha"
  address: String,            // human-readable address
  coordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number],    // [lng, lat] — GeoJSON, enables $near
  },
  type: { type: String, enum: ['bookable', 'hospital'], required: true },
  contactNote: String,        // hospital-only: doctor's note e.g. "Book via reception ext. 214"
  slots: [slotSchema],        // bookable-only: [{ dayOfWeek, startTime, endTime }]
}
```

`availabilitySlots` field removed from Doctor schema.

**Appointment model — gains denormalized location fields:**

```js
locationId:      ObjectId,   // ref to Doctor.locations._id (embedded subdoc)
locationName:    String,     // denormalized — survives location renames
locationAddress: String,     // denormalized
locationType:    String,     // 'bookable' | 'hospital'
```

Denormalization protects historical appointment records if the doctor later edits or removes a location.

### Migration Script

`scripts/migrate-locations.js` — run once before deploying:

- For each Doctor with `availabilitySlots.length > 0`: create `locations[0]` with `{ name: 'Main Clinic', address: clinicAddress, type: 'bookable', slots: availabilitySlots }`, then `$unset availabilitySlots`.
- For doctors with no slots: set `locations: []`.
- Idempotent: skip doctors that already have `locations.length > 0`.

### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/doctors/:id/locations` | public | List all locations for a doctor |
| `POST` | `/api/doctors/me/locations` | doctor | Add a new location |
| `PATCH` | `/api/doctors/me/locations/:locId` | doctor | Edit a location |
| `DELETE` | `/api/doctors/me/locations/:locId` | doctor | Remove a location |
| `GET` | `/api/doctors/:id/slots?locationId=&date=` | patient/auth | Available slots for a location+date — requires `locationId` |
| `POST` | `/api/appointments` | patient | Create appointment — requires `locationId` |

Existing `GET /api/doctors/:id/slots?date=` updated to return 400 if `locationId` is missing.

### Slot Conflict Check

Conflict is scoped per location: a doctor can have overlapping times across different locations on the same day (they are at different places).

```js
Appointment.findOne({
  doctorId,
  locationId,
  date,
  'timeSlot.start': startTime,
  status: { $ne: 'cancelled' }
})
```

Add compound index: `{ doctorId: 1, locationId: 1, date: 1, 'timeSlot.start': 1 }` to Appointment schema.

### Booking Flow (Patient)

1. Patient opens doctor profile → `GET /api/doctors/:id/locations`
2. Patient sees location list (name, address, distance, type badge)
   - `bookable` → "Select" button
   - `hospital` → contact note, no booking action
3. Patient picks a bookable location → `GET /api/doctors/:id/slots?locationId=X&date=Y`
4. Patient picks slot → `POST /api/appointments { doctorId, locationId, date, startTime }`
5. API resolves location via `doctor.locations.id(locationId)`, validates slot, checks conflict, creates appointment with denormalized location fields

### Frontend — Doctor Settings (Web)

New **"My Locations"** section in `DoctorSettingsPage`:
- List of location cards: name, address, type badge, slot count
- "Add Location" button → inline form:
  - Name, address fields
  - Type toggle: Bookable | Hospital
  - **Bookable**: slot picker (same pattern as current availability UI, repeated per location)
  - **Hospital**: single textarea for `contactNote`
- "Pick on map" button → Leaflet modal to drop a pin → auto-fills coordinates + reverse-geocoded address (via browser Nominatim/OpenStreetMap, no API key required)
- Edit / Delete per card
- On save: `POST /api/doctors/me/locations` or `PATCH /api/doctors/me/locations/:locId`

### Frontend — Booking Flow (Web)

`BookAppointmentPage` gains **Step 0 — Pick Location** before date/slot:
- Location cards: name, address, estimated distance (if patient coords available), type badge
- `bookable` → "Select" button → advances to date step
- `hospital` → shows contact note only, greyed out
- `locationId` carried through to `POST /api/appointments`

### Frontend — Public Profile (Web)

`DoctorPublicProfilePage` gains a **Locations** section:
- `bookable` locations: name, address + "Book here" button (goes to `/book/:doctorId?locationId=X`)
- `hospital` locations: name, address + contact note (no booking action)

---

## Feature B: "Use My Location" Button

### Scope

Small addition to existing Find Doctor screens. Backend already handles `?lat=&lng=` — no backend changes.

### Web (`FindDoctorPage`)

- "Use my location" button (icon + label) above the search bar
- Click → `navigator.geolocation.getCurrentPosition()`
- On success → pass `lat`, `lng` to existing `GET /api/doctors?lat=&lng=` call
- On denial → show toast "Enable location in your browser settings", search continues without geo
- If patient has saved `homeLocation` in profile → pre-fill automatically without prompting

### Mobile (`FindDoctorScreen`)

- Same "Use my location" button pattern
- Uses `expo-location`: `Location.requestForegroundPermissionsAsync()` then `Location.getCurrentPositionAsync()`
- On denial → toast, search continues
- If `homeLocation` saved → pre-fill automatically

---

## Feature C: Admin Leaflet Map

### New Page: `/admin/map` (Web)

Full-screen Leaflet map using `react-leaflet`.

**Data source:** New endpoint `GET /api/admin/map/users?role=` (admin-only)

Returns array of:
```js
{ _id, name, role, coordinates: [lng, lat], address }
```
- Doctors: coordinates from first `bookable` location; fallback to `User.location.coordinates`
- Patients: from `Patient.homeLocation.coordinates`
- Users with no coordinates are omitted

**Map features:**
- Default center: Algeria (36.7°N, 3.0°E), zoom 6
- Role filter toggle: All | Doctors | Patients
- Pin colors: blue = doctor, green = patient
- Click pin → popup: name, role, address
- Marker clustering via `react-leaflet-markercluster` when zoomed out
- Navigation link added to admin sidebar

### Backend Endpoint

`GET /api/admin/map/users?role=doctor|patient`

- Auth: admin only
- Aggregates User + Doctor (for doctor coords) + Patient (for patient coords)
- Returns only users with valid coordinates
- No pagination — map loads all at once (acceptable at current scale; add clustering if >10k users)

---

## Error Handling

| Scenario | Response |
|---|---|
| `POST /api/appointments` missing `locationId` | 400 — "locationId is required" |
| `locationId` not found in doctor's locations | 404 — "Location not found" |
| Location type is `hospital` (not bookable) | 400 — "This location does not accept online bookings" |
| Slot conflict at that location | 409 — "This slot is already booked" |
| Geolocation denied (frontend) | Toast — graceful degradation, search continues |
| Doctor deletes location with future appointments | 400 — "Cannot delete location with upcoming appointments. Cancel them first." |

---

## Security Considerations

- `POST/PATCH/DELETE /api/doctors/me/locations` — server verifies `req.user.id` matches doctor's `userId`, never trusts `doctorId` from body
- `GET /api/admin/map/users` — admin role enforced server-side, never exposes password or PHI fields
- Coordinates stored as GeoJSON (standard format, safe for storage)
- Nominatim reverse geocode called from browser only (no server-side API key needed)

---

## Out of Scope

- Real-time slot availability updates via WebSocket
- Multi-doctor appointment (shared slots)
- Directions / routing within the map
- Mobile admin map (web admin only)
- Patient location history tracking
