# Doctor Search: City + Geo Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a city text filter and "near me" geolocation button to the doctor search form on web and mobile, backed by a new `city` query param on the API.

**Architecture:** The API gains a `city` param that builds a case-insensitive `$or` regex across `Doctor.clinicAddress` and `Doctor.locations[].address`. The web `FindDoctorPage` and mobile `FindDoctorScreen` each grow two new controls — a city `TextInput`/`<input>` and a "Near me" button — sharing the same mutual-exclusion logic (typing city clears geo, activating geo clears city).

**Tech Stack:** Node.js/Express (API), React (web), React Native + expo-location (mobile), Jest/supertest (backend tests)

## Global Constraints

- City value must be trimmed and regex-escaped before use in `RegExp`; never pass raw user input directly to `new RegExp()`
- Geo and city filters are **independent** on the API (both can be active simultaneously)
- On the client, city and geo are **mutually exclusive** (one clears the other)
- Geolocation timeout: 8 seconds on both web and mobile
- `expo-location` already installed at `~19.0.8` — do not install a different version
- All new StyleSheet keys in `FindDoctorScreen` follow the existing `s.*` pattern (short keys, no camelCase beyond two words)

---

### Task 1: Backend — add `city` filter to `GET /api/doctors`

**Files:**
- Modify: `apps/api/src/routes/doctors.js`
- Test: `apps/api/src/routes/__tests__/doctors.test.js`

**Interfaces:**
- Produces: `GET /api/doctors?city=Riyadh` — filters returned doctors to those whose `clinicAddress` or any `locations[].address` matches the value case-insensitively

---

- [ ] **Step 1: Add `User` import to the test file**

Open `apps/api/src/routes/__tests__/doctors.test.js`. The top of the file already imports `Doctor` and `Appointment`. Add `User` alongside them:

```js
const Doctor      = require('../../models/Doctor');
const Appointment = require('../../models/Appointment');
const User        = require('../../models/User');   // ← add this line
```

- [ ] **Step 2: Write the failing tests**

Append this describe block at the end of `apps/api/src/routes/__tests__/doctors.test.js` (before the final closing of the file, after all existing describe blocks):

```js
// ── GET / - city filter ───────────────────────────────────────────────────────

describe('GET /api/doctors - city filter', () => {
  function mockUserFind(users = []) {
    const skip   = jest.fn().mockResolvedValue(users);
    const limit  = jest.fn().mockReturnValue({ skip });
    const select = jest.fn().mockReturnValue({ limit });
    User.find = jest.fn().mockReturnValue({ select });
  }

  test('adds $or filter on clinicAddress and locations.address when city is provided', async () => {
    mockUserFind([{ _id: 'u1' }]);
    let capturedQuery;
    Doctor.find = jest.fn().mockImplementation(q => {
      capturedQuery = q;
      return { populate: jest.fn().mockResolvedValue([]) };
    });

    await request(app).get('/api/doctors?city=Riyadh');

    expect(capturedQuery.$or).toHaveLength(2);
    expect(capturedQuery.$or[0].clinicAddress).toBeInstanceOf(RegExp);
    expect(capturedQuery.$or[0].clinicAddress.test('Riyadh Medical Center')).toBe(true);
    expect(capturedQuery.$or[0].clinicAddress.test('Jeddah Clinic')).toBe(false);
    expect(capturedQuery.$or[1]['locations.address']).toBeInstanceOf(RegExp);
    expect(capturedQuery.$or[1]['locations.address'].test('12 Riyadh St')).toBe(true);
  });

  test('escapes regex metacharacters in city param', async () => {
    mockUserFind([{ _id: 'u1' }]);
    Doctor.find = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });

    const res = await request(app).get('/api/doctors?city=New+York+(Downtown)');

    expect(res.status).toBe(200);
    const query = Doctor.find.mock.calls[0][0];
    expect(query.$or[0].clinicAddress.source).toBe('New York \\(Downtown\\)');
  });

  test('omits $or filter when city param is absent', async () => {
    mockUserFind([{ _id: 'u1' }]);
    Doctor.find = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });

    await request(app).get('/api/doctors');

    const query = Doctor.find.mock.calls[0][0];
    expect(query.$or).toBeUndefined();
  });

  test('omits $or filter when city is whitespace only', async () => {
    mockUserFind([{ _id: 'u1' }]);
    Doctor.find = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });

    await request(app).get('/api/doctors?city=   ');

    const query = Doctor.find.mock.calls[0][0];
    expect(query.$or).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd apps/api && npx jest --testPathPattern="routes/__tests__/doctors" --verbose 2>&1 | tail -30
```

Expected: 4 new tests FAIL with errors like `TypeError: Cannot read properties of undefined (reading '$or')` or similar.

- [ ] **Step 4: Add `city` param to the route**

In `apps/api/src/routes/doctors.js`, find the `GET /` route handler. Make two edits:

**Edit 1** — destructure `city` from `req.query` (the comment line is the landmark):

```js
// GET /api/doctors?lat=&lng=&radius=&specialty=&name=
router.get('/', auth, async (req, res, next) => {
  try {
    const { lat, lng, radius = 10000, specialty, name, city, page = 1, limit = 20 } = req.query;
```

**Edit 2** — add the `$or` city filter after the specialty line in `doctorQuery`:

```js
    let doctorQuery = { userId: { $in: userIds } };
    if (specialty) doctorQuery.specialty = new RegExp(specialty, 'i');
    if (city && city.trim()) {
      const escapedCity = city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      doctorQuery.$or = [
        { clinicAddress: new RegExp(escapedCity, 'i') },
        { 'locations.address': new RegExp(escapedCity, 'i') },
      ];
    }

    const doctors = await Doctor.find(doctorQuery).populate('userId', 'name email location');
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/api && npx jest --testPathPattern="routes/__tests__/doctors" --verbose 2>&1 | tail -30
```

Expected: all 4 new tests PASS. All previously passing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/doctors.js apps/api/src/routes/__tests__/doctors.test.js
git commit -m "feat(api): add city text filter to GET /api/doctors"
```

---

### Task 2: Web — city input + near-me button in `FindDoctorPage`

**Files:**
- Modify: `apps/web/src/pages/patient/FindDoctorPage.jsx`

**Interfaces:**
- Consumes: `getDoctors(params)` — already passes any `params` object through; no change to the API client
- Consumes: `GET /api/doctors?city=` from Task 1

---

- [ ] **Step 1: Add city and geo state**

In `FindDoctorPage.jsx`, find the existing state declarations and add 4 new lines after `const [loading, setLoading] = useState(false);`:

```js
const [search, setSearch]       = useState('');
const [spec, setSpec]           = useState('All');
const [doctors, setDoctors]     = useState([]);
const [loading, setLoading]     = useState(false);
// ── location filters ──────────────────────────────
const [city, setCity]           = useState('');
const [geoCoords, setGeoCoords] = useState(null);   // { lat, lng } | null
const [geoLoading, setGeoLoading] = useState(false);
const [geoError, setGeoError]   = useState('');
```

- [ ] **Step 2: Update `fetchDoctors` to pass city / geo params and add deps**

Replace the existing `fetchDoctors` useCallback:

```js
const fetchDoctors = useCallback(async () => {
  setLoading(true);
  try {
    const params = {};
    if (search)         params.name      = search;
    if (spec !== 'All') params.specialty = spec;
    if (city.trim())    params.city      = city.trim();
    if (geoCoords) {
      params.lat    = geoCoords.lat;
      params.lng    = geoCoords.lng;
      params.radius = 10000;
    }
    const data = await getDoctors(params);
    setDoctors(data);
  } catch {
    setDoctors([]);
  } finally {
    setLoading(false);
  }
}, [search, spec, city, geoCoords]);
```

- [ ] **Step 3: Add the `handleNearMe` handler**

Add this function directly after the `useEffect` block (after `return () => clearTimeout(timer);`):

```js
const handleNearMe = () => {
  if (!navigator.geolocation) return;
  setGeoLoading(true);
  setCity('');
  setGeoError('');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setGeoLoading(false);
    },
    () => {
      setGeoError('Location unavailable');
      setGeoLoading(false);
    },
    { timeout: 8000 }
  );
};
```

- [ ] **Step 4: Add city input row to the JSX**

In the JSX, find the closing `</div>` of the name search bar (the one with `marginBottom:16`). Insert the following block **after** it (before the specialty pills `<div>`):

```jsx
{/* City + Near Me */}
<div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
  <div style={{ flex:1, display:'flex', alignItems:'center', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden' }}>
    <span style={{ padding:'0 11px', color:'var(--text3)', fontSize:14 }}>⊕</span>
    <input
      value={city}
      onChange={e => { setCity(e.target.value); setGeoCoords(null); setGeoError(''); }}
      placeholder="Filter by city…"
      style={{ flex:1, background:'transparent', border:'none', outline:'none', padding:'10px 0', color:'var(--text)', fontSize:13.5 }}
    />
    {geoCoords && (
      <button
        onClick={() => setGeoCoords(null)}
        style={{ display:'flex', alignItems:'center', gap:4, margin:'0 8px', padding:'3px 10px', borderRadius:12, border:'none', background:'var(--mint-dim)', color:'var(--mint)', fontSize:11.5, cursor:'pointer', fontWeight:500 }}
      >
        Near you ×
      </button>
    )}
  </div>
  {navigator.geolocation && (
    <button
      onClick={handleNearMe}
      disabled={geoLoading}
      style={{ padding:'8px 14px', borderRadius:'var(--r)', border:'1px solid var(--border2)', background:'transparent', color: geoLoading ? 'var(--text3)' : 'var(--text2)', fontSize:12.5, cursor: geoLoading ? 'not-allowed' : 'pointer', whiteSpace:'nowrap' }}
    >
      {geoLoading ? '…' : '📍 Near me'}
    </button>
  )}
</div>
{geoError && (
  <div style={{ fontSize:12, color:'#f87171', marginBottom:8 }}>{geoError}</div>
)}
```

- [ ] **Step 5: Manual test — city filter**

Start the dev server (`cd apps/web && npm run dev`). Open `/find-doctor`.

Verify:
- City input appears between the name search bar and specialty pills
- Typing "Riyadh" triggers a fetch with `?city=Riyadh` (check Network tab)
- Results update to show only doctors with "Riyadh" in their address
- Clearing the city input fetches all doctors again

- [ ] **Step 6: Manual test — near me**

In the browser:
- Click "📍 Near me" — browser asks for location permission
- Grant permission — button shows "…" briefly, then a mint "Near you ×" pill appears inside the city input
- Doctor list updates (fetches with `?lat=...&lng=...&radius=10000`)
- Click "Near you ×" — pill disappears, results reset to all doctors
- Typing in city input while "Near you" is active — pill disappears, city text takes over

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/patient/FindDoctorPage.jsx
git commit -m "feat(web): add city filter and near-me geo to FindDoctorPage"
```

---

### Task 3: Mobile — city input + near-me button in `FindDoctorScreen`

**Files:**
- Modify: `apps/mobile/src/screens/patient/FindDoctorScreen.js`
- Check/Modify: `apps/mobile/app.json`

**Interfaces:**
- Consumes: `expo-location` (already installed at `~19.0.8`)
- Consumes: `getDoctors(params)` — same API client, no change needed
- Consumes: `GET /api/doctors?city=` from Task 1

---

- [ ] **Step 1: Add expo-location import**

In `FindDoctorScreen.js`, add the import after the existing imports (after line 12, `import C from '../../constants/colors';`):

```js
import * as Location from 'expo-location';
```

- [ ] **Step 2: Add city and geo state**

After line 81 (`const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;`), add:

```js
const [city, setCity]             = useState('');
const [geoCoords, setGeoCoords]   = useState(null);   // { lat, lng } | null
const [geoLoading, setGeoLoading] = useState(false);
const [geoError, setGeoError]     = useState('');
```

- [ ] **Step 3: Update `fetchDrs` to pass city / geo params**

Replace the existing `fetchDrs` useCallback (lines 83–93):

```js
const fetchDrs = useCallback(async () => {
  setLoading(true);
  try {
    const params = {};
    if (search)         params.name      = search;
    if (spec !== 'All') params.specialty = spec;
    if (city.trim())    params.city      = city.trim();
    if (geoCoords) {
      params.lat    = geoCoords.lat;
      params.lng    = geoCoords.lng;
      params.radius = 10000;
    }
    const data = await getDoctors(params);
    setDoctors(data);
  } catch { setDoctors([]); }
  finally { setLoading(false); }
}, [search, spec, city, geoCoords]);
```

- [ ] **Step 4: Add `handleNearMe` handler**

Add this async function directly after the `fetchDrs` useCallback, before `fetchMapPins`:

```js
const handleNearMe = async () => {
  setGeoLoading(true);
  setCity('');
  setGeoError('');
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setGeoError('Location permission denied');
      return;
    }
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  } catch {
    setGeoError('Location unavailable');
  } finally {
    setGeoLoading(false);
  }
};
```

- [ ] **Step 5: Add city input row to JSX**

In the JSX, find the existing `searchBox` View block (lines 160–164):

```jsx
{viewMode === 'list' && (
  <View style={s.searchBox}>
    <Text style={s.searchIcon}>⌕</Text>
    <TextInput style={s.searchInput} value={search} onChangeText={setSearch} ... />
  </View>
)}
```

Add the city + near-me row **immediately after** that closing `)}`:

```jsx
{viewMode === 'list' && (
  <>
    <View style={s.cityRow}>
      <View style={s.cityBox}>
        <Text style={s.cityIcon}>⊕</Text>
        <TextInput
          style={s.cityInput}
          value={city}
          onChangeText={v => { setCity(v); setGeoCoords(null); setGeoError(''); }}
          placeholder="Filter by city…"
          placeholderTextColor={C.text3}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {geoCoords && (
          <TouchableOpacity style={s.nearChip} onPress={() => setGeoCoords(null)} activeOpacity={0.7}>
            <Text style={s.nearChipTxt}>Near you ×</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={s.nearBtn} onPress={handleNearMe} disabled={geoLoading} activeOpacity={0.7}>
        {geoLoading
          ? <ActivityIndicator size="small" color={C.mint} />
          : <Text style={s.nearBtnTxt}>📍</Text>
        }
      </TouchableOpacity>
    </View>
    {!!geoError && <Text style={s.geoErr}>{geoError}</Text>}
  </>
)}
```

- [ ] **Step 6: Add StyleSheet entries**

In `StyleSheet.create({...})` at the bottom of the file, add these entries after `searchInput`:

```js
cityRow:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 4, gap: 8 },
cityBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg3, borderRadius: 12, borderWidth: 1, borderColor: C.border2, paddingHorizontal: 10 },
cityIcon:  { fontSize: 16, color: C.text3, marginRight: 6 },
cityInput: { flex: 1, paddingVertical: 9, color: C.text, fontSize: 14 },
nearChip:  { backgroundColor: C.mint + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 4 },
nearChipTxt: { fontSize: 11, color: C.mint, fontWeight: '600' },
nearBtn:   { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: C.border2, backgroundColor: C.bg3, justifyContent: 'center', alignItems: 'center' },
nearBtnTxt: { fontSize: 18 },
geoErr:    { fontSize: 11, color: '#f87171', marginHorizontal: 16, marginBottom: 6 },
```

- [ ] **Step 7: Check app.json for location permission**

Open `apps/mobile/app.json`. Find the `"plugins"` array. If `expo-location` is not listed, add it:

```json
"plugins": [
  [
    "expo-location",
    {
      "locationWhenInUsePermission": "MediConnect uses your location to find nearby doctors."
    }
  ]
]
```

If `expo-location` is already in `plugins`, verify `locationWhenInUsePermission` is present. No change needed if it is.

- [ ] **Step 8: Manual test on simulator/device**

Run the mobile app (`cd apps/mobile && npx expo start`). Navigate to Find Doctor.

Verify list view:
- City input row appears below the name search bar
- Typing "Jeddah" sends `?city=Jeddah` in the API call
- 📍 button triggers the OS location permission dialog
- On grant: "Near you ×" chip appears in the city row, list refreshes with geo results
- Tapping "Near you ×" clears geo, list resets
- Typing in city while geo is active clears the geo chip

Verify map view:
- City row is **not** shown in map mode (it's inside `{viewMode === 'list' && ...}`)
- Map continues to work unaffected

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/screens/patient/FindDoctorScreen.js apps/mobile/app.json
git commit -m "feat(mobile): add city filter and near-me geo to FindDoctorScreen"
```
