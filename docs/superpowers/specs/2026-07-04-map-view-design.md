# Map View — Design Spec
**Date:** 2026-07-04  
**Feature:** Patient-facing map discovery (doctors + labs)  
**Scope:** FindDoctorScreen toggle, WebView + Leaflet, Lab location setting

---

## Summary

Patients can toggle FindDoctorScreen between list view (existing) and a map view showing nearby doctors and labs as colored pins. Tapping a pin opens a native bottom sheet with a summary and action buttons. Labs set their location by dropping a pin in their profile screen.

---

## 1. Data Layer

### Lab model change
Add GeoJSON `location` field and `2dsphere` index to `Lab` (mirrors existing Doctor pattern):

```js
location: {
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
}
labSchema.index({ location: '2dsphere' }, { sparse: true });
```

Labs without a set location (coordinates `[0, 0]`) are excluded from map results via the sparse index.

---

## 2. API Endpoint

### GET /api/map/nearby

**Auth:** JWT required, patient role only (403 for other roles).

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `swLat` | Number | Yes | Southwest latitude of viewport |
| `swLng` | Number | Yes | Southwest longitude of viewport |
| `neLat` | Number | Yes | Northeast latitude of viewport |
| `neLng` | Number | Yes | Northeast longitude of viewport |
| `specialty` | String | No | Filter doctors by specialty |

**Response:**
```json
{
  "doctors": [
    {
      "_id": "...",
      "name": "Dr. Jane Smith",
      "specialty": "Cardiology",
      "rating": 4.5,
      "reviewCount": 23,
      "photoUrl": "",
      "coordinates": [lng, lat],
      "type": "doctor"
    }
  ],
  "labs": [
    {
      "_id": "...",
      "name": "Al-Shifa Lab",
      "address": "123 Main St",
      "coordinates": [lng, lat],
      "type": "lab"
    }
  ]
}
```

**DB queries:**
- Doctors: `$geoWithin $box` on `Doctor.locations.coordinates` joined with User for name
- Labs: `$geoWithin $box` on `Lab.location`, filtered `isApproved: true`

**Limits:** Max 50 doctors + 20 labs per request.

**Validation:** All 4 bounding box params required; numeric; `swLat < neLat`, `swLng < neLng`.

---

### PUT /api/labs/me/location

**Auth:** JWT required, laboratory role only.

**Body:**
```json
{ "lat": 24.7136, "lng": 46.6753 }
```

Updates `Lab.location.coordinates` for the authenticated lab. Returns 200 on success.

---

## 3. Mobile — FindDoctorScreen Toggle

**Toggle button:** Icon button in the FindDoctorScreen header (list icon ↔ map icon). State managed locally with `useState('list' | 'map')`.

**When map mode is active:**
- Specialty chips remain visible above the map (carry filter through to API)
- List (`FlatList`) is replaced by a `WebView` rendering inline Leaflet HTML

**Leaflet HTML (inline string):**
- OpenStreetMap tiles (no API key)
- `navigator.geolocation` for initial user position; falls back to city center on denial
- Two marker layers: doctors (teal `#0fe3b0`) and labs (amber `#f59e0b`)
- Fires `window.ReactNativeWebView.postMessage(JSON.stringify({ event, data }))` on:
  - `regionChanged` — map `moveend` event, sends `{ swLat, swLng, neLat, neLng }`
  - `markerTap` — sends the full doctor/lab object

**RN side:**
- `onMessage` handler parses event type
- `regionChanged` → debounced (600ms) fetch to `GET /api/map/nearby`
- Fetch results → `webViewRef.current.injectJavaScript(...)` to update markers
- `markerTap` → sets `selectedPin` state → bottom sheet animates in

---

## 4. Bottom Sheet (Patient Map)

Native `Animated.View` positioned absolutely at bottom of screen (not inside WebView).

**Animation:** `Animated.timing` on `translateY` (screenHeight → 0 on open, reverse on close).

**Dismiss:** Tap backdrop overlay or swipe down gesture.

**Doctor pin content:**
- Avatar (photo or initials with color)
- Name, specialty
- Star rating + review count
- **"View Profile"** → navigate to `DoctorProfileScreen`
- **"Book Appointment"** → navigate to `BookAppointmentScreen`

**Lab pin content:**
- Lab name, address
- **"View Details"** → stub (no patient lab detail screen yet; button disabled with coming-soon note)

---

## 5. Lab Location Setting (LabUploadsScreen)

New "Clinic Location" section added to `LabUploadsScreen`:

- Leaflet WebView (same inline approach, consistent with patient map)
- Single draggable marker
- Default position: existing `Lab.location.coordinates` if set, else city center
- **"Confirm Location"** button → `PUT /api/labs/me/location { lat, lng }` → success toast
- Shows current address (reverse geocoded via Nominatim free API — no key needed)

---

## 6. Out of Scope

- Doctor pin tap → "Book" is navigation only; actual booking flow is existing `BookAppointmentScreen`
- Patient lab detail screen (labs show name + address only for now)
- Clustering pins at high zoom-out (deferred — use Leaflet.markercluster later if needed)
- Offline support

---

## 7. Files Modified / Created

| File | Change |
|---|---|
| `apps/api/src/models/Lab.js` | Add `location` GeoJSON field + 2dsphere index |
| `apps/api/src/routes/map.js` | New route file — `GET /nearby`, auth patient |
| `apps/api/src/routes/labs.js` | Add `PUT /me/location` endpoint |
| `apps/api/src/index.js` | Mount `/api/map` router |
| `apps/mobile/src/screens/patient/FindDoctorScreen.js` | Add toggle + WebView map + bottom sheet |
| `apps/mobile/src/screens/lab/LabUploadsScreen.js` | Add location-setting Leaflet section |
| `apps/mobile/src/api/client.js` | Add `getNearbyMapPins`, `updateLabLocation` |

---

## 8. Security & Edge Cases

- `/api/map/nearby` validates all 4 bbox params as finite numbers; rejects malformed input with 400
- `PUT /api/labs/me/location` validates lat ∈ [-90, 90], lng ∈ [-180, 180]
- Labs with `isApproved: false` excluded from map results
- WebView `originWhitelist={['*']}` with `javaScriptEnabled` — only inline HTML, no external navigation
- No PHI in map payload (names, specialty, rating only)
