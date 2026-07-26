# Design: City / Geo Criteria for Doctor Search

**Date:** 2026-07-14  
**Status:** Approved  
**Scope:** `FindDoctorPage` (web) + `FindDoctorScreen` (mobile) + `GET /api/doctors` (API)

---

## Problem

The doctor search form only filters by name and specialty. Patients cannot narrow results by location — no city text field, no "near me" option — even though the API already supports `lat`/`lng`/`radius` geo queries that are never exposed to the UI.

---

## Solution Overview

Add two complementary location filters to the search form:

1. **City text input** — free-text, matched against doctor address fields on the backend
2. **"Use my location" button** — browser geolocation, passes coordinates to existing geo query

The two modes are mutually exclusive in state: typing in the city field clears active geo; clicking "near me" clears the city input.

---

## Backend Changes

### `GET /api/doctors` — add `city` query param

**File:** `apps/api/src/routes/doctors.js`

Destructure `city` from `req.query`. When present:
- Validate: strip, max 100 chars, reject if contains regex metacharacters beyond normal city names
- Build an `$or` filter on the Doctor query:
  ```js
  { $or: [
    { clinicAddress: new RegExp(escapedCity, 'i') },
    { 'locations.address': new RegExp(escapedCity, 'i') }
  ]}
  ```
- Merge with existing `doctorQuery` (specialty, userId set)

City and geo filters are **independent** — both can apply in the same request.

The existing `lat`/`lng`/`radius` geo path is unchanged; it already works correctly.

**Validation rules for `city`:**
- Trim whitespace
- Max 100 characters
- Escape regex special chars before building `RegExp` (use a helper like `city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`)
- Return 400 if value is empty string after trim

---

## Frontend Changes

### `FindDoctorPage.jsx`

**File:** `apps/web/src/pages/patient/FindDoctorPage.jsx`

#### New state

```js
const [city, setCity] = useState('');
const [geoCoords, setGeoCoords] = useState(null); // { lat, lng } | null
const [geoLoading, setGeoLoading] = useState(false);
const [geoError, setGeoError] = useState('');
```

#### Params passed to `getDoctors`

```js
const params = {};
if (search)               params.name = search;
if (spec !== 'All')       params.specialty = spec;
if (city.trim())          params.city = city.trim();
if (geoCoords) {
  params.lat    = geoCoords.lat;
  params.lng    = geoCoords.lng;
  params.radius = 10000; // 10 km default
}
```

#### City input

Placed below the name search bar, above specialty pills. Shares the same card/input style. Placeholder: "Filter by city…"

On change: update `city` state, clear `geoCoords` and `geoError`.

#### "Use my location" button

Placed inline at the right end of the city input row (or as a separate small button).

On click:
1. Set `geoLoading = true`, clear `city`, clear `geoError`
2. Call `navigator.geolocation.getCurrentPosition(success, error, { timeout: 8000 })`
3. On success: set `geoCoords = { lat, lng }`, set `geoLoading = false`
4. On error: set `geoError = 'Location unavailable'`, set `geoLoading = false`

While loading: button shows a spinner and is disabled.

#### "Near you" active indicator

When `geoCoords` is set, show a small mint-colored pill: `"Near you  ×"`. Clicking × clears `geoCoords`.

#### geolocation not supported

If `!navigator.geolocation`, hide the "Use my location" button entirely.

---

## Data Flow

```
User types city "Riyadh"
  → city state = "Riyadh", geoCoords = null
  → debounced fetch: GET /api/doctors?name=...&city=Riyadh
  → API: Doctor.find({ ...doctorQuery, $or: [{clinicAddress:/riyadh/i}, {'locations.address':/riyadh/i}] })

User clicks "Use my location"
  → city cleared, geoLoading = true
  → browser geolocation resolves { lat: 24.7, lng: 46.7 }
  → geoCoords = { lat, lng }, geoLoading = false
  → debounced fetch: GET /api/doctors?lat=24.7&lng=46.7&radius=10000
  → API: existing $near geo query on User.location
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Geolocation denied/unavailable | Show inline `geoError` message below button; `geoCoords` stays null |
| Geolocation timeout (8s) | Same as above |
| `city` contains only spaces | Trimmed to empty, not sent |
| `city` > 100 chars | API returns 400; frontend shows no results (no special UI needed) |
| Both city + geo sent | API applies both filters (AND logic) |

---

## What Is Not Changing

- Specialty pill filter — untouched
- Name search bar — untouched
- `getDoctors` API client function — already passes `params` object through; no change needed
- Doctor model schema — no new fields
- User model schema — no changes

---

## Mobile Changes

### `FindDoctorScreen.js`

**File:** `apps/mobile/src/screens/patient/FindDoctorScreen.js`

`expo-location` is already installed (`~19.0.8`). No new package needed.

#### New state

```js
const [city, setCity]           = useState('');
const [geoCoords, setGeoCoords] = useState(null); // { lat, lng } | null
const [geoLoading, setGeoLoading] = useState(false);
const [geoError, setGeoError]   = useState('');
```

#### Params passed to `getDoctors`

Same as web — city and/or lat/lng/radius added to params object.

#### City input

`TextInput` placed below the name search bar, above specialty pills. Uses existing `StyleSheet` card/input style. Placeholder: "Filter by city…"

On change: update `city`, clear `geoCoords` and `geoError`.

#### "Near me" button

Small button next to the city input. On press:

1. Set `geoLoading = true`, clear city and geoError
2. Call `Location.requestForegroundPermissionsAsync()` — if denied, set geoError and return
3. Call `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })` with timeout via `Promise.race` (8s)
4. On success: `setGeoCoords({ lat: coords.latitude, lng: coords.longitude })`
5. On failure: `setGeoError('Location unavailable')`

Show `ActivityIndicator` while loading. When `geoCoords` is set, show a mint-colored "Near you ×" chip — pressing × clears `geoCoords`.

#### Map view behavior

The embedded Leaflet map already calls `navigator.geolocation` for centering. When `geoCoords` is active, also pass `lat`/`lng` to `fetchDrs` so the list view and map view stay in sync.

#### Permission handling

- iOS: `expo-location` triggers the system permission dialog automatically on first `requestForegroundPermissionsAsync` call. The `info.plist` key `NSLocationWhenInUseUsageDescription` must exist (check `app.json` — add if missing).
- Android: `ACCESS_FINE_LOCATION` permission declared in `AndroidManifest.xml` (Expo handles this via `app.json` plugins).

---

## Files Modified

| File | Change |
|---|---|
| `apps/api/src/routes/doctors.js` | Add `city` query param + `$or` Doctor filter |
| `apps/web/src/pages/patient/FindDoctorPage.jsx` | Add city input, near-me button, geo state |
| `apps/mobile/src/screens/patient/FindDoctorScreen.js` | Add city TextInput, near-me button via expo-location, geo state |
| `app.json` (mobile) | Add location permission descriptions if missing |
