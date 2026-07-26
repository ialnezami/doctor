---
phase: 10-electron-desktop
reviewed: 2026-07-14T10:05:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - apps/desktop/package.json
  - apps/desktop/electron-builder.yml
  - apps/desktop/vite.config.js
  - apps/desktop/src/main/index.js
  - apps/desktop/src/main/db.js
  - apps/desktop/src/main/crypto.js
  - apps/desktop/src/main/sync.js
  - apps/desktop/src/main/print.js
  - apps/desktop/src/main/autoUpdate.js
  - apps/desktop/src/preload.js
  - apps/desktop/src/renderer/App.jsx
  - apps/desktop/src/renderer/store/authStore.js
  - apps/desktop/src/renderer/store/syncStore.js
  - apps/desktop/src/renderer/components/SyncBadge.jsx
  - apps/desktop/src/renderer/screens/LoginScreen.jsx
  - apps/desktop/src/renderer/screens/pharmacy/PharmacyLayout.jsx
  - apps/desktop/src/renderer/screens/doctor/DoctorLayout.jsx
  - apps/desktop/src/renderer/screens/lab/LabLayout.jsx
  - apps/api/src/routes/products.js
  - apps/api/src/routes/appointments.js
  - apps/api/src/routes/patients.js
  - apps/api/src/routes/prescriptions.js
  - apps/api/src/routes/labResults.js
findings:
  critical: 9
  warning: 9
  info: 3
  total: 21
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-07-14T10:05:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

This phase ships an Electron desktop client (pharmacy, doctor, lab roles) backed by an offline SQLite store with AES-256-GCM PHI encryption and a delta-sync engine, plus the matching API routes. The overall security posture is mixed: Electron window hardening is correct (`contextIsolation: true`, `nodeIntegration: false`), the crypto design (keytar → machine-key fallback, per-value IV, GCM auth tag) is sound in principle. However, nine blocker-level defects exist — the most critical being a hardcoded `electron-store` encryption key in plain source, a JWT stored in electron-store (not the OS keychain), `initKey()` never called before DB operations, an un-validated sync-queue URL that a compromised renderer can weaponise for SSRF, a double-fetch double-write race in InventoryTab, and missing ownership/input validation in several API routes.

---

## Critical Issues

### CR-01: Hardcoded electron-store encryption key in source code

**File:** `apps/desktop/src/main/index.js:14`
**Issue:** `electron-store` is initialised with `encryptionKey: 'mc-desktop-secure-key'`. This string is compiled into every distributed binary and is identical across all installations. Any attacker who can read `%APPDATA%/mediconnect-desktop` (or the macOS equivalent) can decrypt every user's stored JWT token and cached user object without needing the user's credentials. The key is the *only* protection for data at rest in that store.
**Fix:**
```js
// Derive the store key from keytar (same approach used for the SQLite key).
// In app.whenReady(), before creating the store:
const { getPassword, setPassword } = require('keytar');
const SERVICE = 'MediConnect-Desktop';
const STORE_ACCOUNT = 'store-encryption-key';

async function getOrCreateStoreKey() {
  let hex = await getPassword(SERVICE, STORE_ACCOUNT);
  if (!hex) {
    hex = require('crypto').randomBytes(32).toString('hex');
    await setPassword(SERVICE, STORE_ACCOUNT, hex);
  }
  return hex;
}

// Then: new Store({ encryptionKey: await getOrCreateStoreKey() })
```

---

### CR-02: JWT token stored in electron-store, not the OS keychain

**File:** `apps/desktop/src/main/index.js:51-55`, `apps/desktop/src/renderer/store/authStore.js:35-36`
**Issue:** Auth tokens are persisted via `store.set('token', t)` / `store.get('token')`. Even with a fixed encryption key problem resolved (CR-01), electron-store uses safeStorage, which is weaker than the OS keychain. The existing `keytar` dependency is already in `package.json` and is used for the DB encryption key — it should also guard the JWT. A stolen app-data directory yields the token; keytar requires the OS credential store to be unlocked (Touch ID / Windows credential manager).
**Fix:**
```js
// In ipcMain handlers, replace store for token:
ipcMain.handle('auth:setToken',   (_, t) => keytar.setPassword('MediConnect-Desktop', 'jwt', t));
ipcMain.handle('auth:getToken',   ()    => keytar.getPassword('MediConnect-Desktop', 'jwt'));
ipcMain.handle('auth:clearToken', ()    => keytar.deletePassword('MediConnect-Desktop', 'jwt'));
```

---

### CR-03: crypto.initKey() is never called — all PHI operations throw at runtime

**File:** `apps/desktop/src/main/db.js:5-6`, `apps/desktop/src/main/crypto.js:42-45`, `apps/desktop/src/main/index.js:34-37`
**Issue:** `crypto.js` exports `initKey()` which must be called before `encrypt()` / `decrypt()` (`_key` is `null` at module load). `db.initialize()` in `index.js` calls `_db.exec(SCHEMA)` but never calls `crypto.initKey()`. Every write to an encrypted table (`patients`, `appointments`, `prescriptions`, `lab_orders`) and every read that decrypts a row will throw `Error: crypto.initKey() must be called before encrypt()`. The app appears to work only because the `try/catch` in `app.whenReady()` silently suppresses the error and `db` is set to a module with broken methods.
**Fix:**
```js
// In db.initialize():
async function initialize() {
  const crypto  = require('./crypto');
  await crypto.initKey();           // ← must come first

  const Database = require('better-sqlite3');
  const dbPath   = path.join(app.getPath('userData'), 'mediconnect.db');
  _db = new Database(dbPath);
  _db.exec(SCHEMA);
}
```

---

### CR-04: Renderer can inject arbitrary URLs into the sync queue (SSRF via IPC)

**File:** `apps/desktop/src/preload.js:42-44`, `apps/desktop/src/main/index.js:80-82`, `apps/desktop/src/main/sync.js:66-79`
**Issue:** `syncQueue.push(method, url, payload)` is exposed unfiltered through the contextBridge. `pushQueue()` in `sync.js` does `apiFetch(item.url, { method: item.method, body: item.payload })` — constructing the full URL as `API_BASE + item.url`. A malicious or XSS-compromised renderer page can call `window.api.db.syncQueue.push('GET', '/../../internal-service/...', {})` and the sync engine will issue that HTTP request with the user's bearer token. In a healthcare context this is a credential-forwarding SSRF.
**Fix:**
```js
// In pushQueue(), enforce an allowlist of path prefixes before fetching:
const ALLOWED_PATHS = ['/api/products', '/api/appointments', '/api/patients',
                       '/api/prescriptions', '/api/lab-results', '/api/lab-orders'];

async function pushQueue() {
  const queue = db.syncQueue.list();
  for (const item of queue) {
    const allowed = ALLOWED_PATHS.some(p => item.url.startsWith(p));
    if (!allowed) {
      console.error('[sync] blocked disallowed queue URL:', item.url);
      db.syncQueue.remove(item.id);
      continue;
    }
    // ... existing fetch logic
  }
}
```

---

### CR-05: Non-atomic checkout — stock adjustment loop can partially succeed, leaving negative stock

**File:** `apps/desktop/src/renderer/screens/pharmacy/PharmacyLayout.jsx:111-114`
**Issue:** The checkout flow creates the sale record then adjusts stock one product at a time in a sequential `for` loop. If `adjustStock` fails on the second item (IPC error, DB locked), the sale is already committed, the first item's stock is already decremented, but the remaining items are not. There is no rollback. Stock counts diverge silently. Because `adjustStock` operates with `stock + delta` and no floor check locally, a retry of the same checkout double-decrements.
**Fix:**
```js
// Move sale creation and all stock adjustments into a single SQLite transaction
// exposed via a new IPC handler 'db:sales:checkout':

// In db.js:
checkout(sale, cartItems) {
  const doCheckout = _db.transaction(() => {
    // verify stock first
    for (const item of cartItems) {
      const row = _db.prepare('SELECT stock FROM products WHERE _id = ?').get(item._id);
      if (!row || row.stock < item.qty) throw new Error(`Insufficient stock: ${item.name}`);
    }
    _db.prepare(`INSERT INTO sales ...`).run({ ...sale, items: JSON.stringify(sale.items) });
    for (const item of cartItems) {
      _db.prepare('UPDATE products SET stock = stock - ? WHERE _id = ?').run(item.qty, item._id);
    }
  });
  doCheckout();
},
```

---

### CR-06: Decrypted PHI columns compared in SQL WHERE clauses — `since` filter is broken and leaks data

**File:** `apps/desktop/src/main/db.js:155-158`, `207-210`, `243-246`, `276-279`, `311-314`
**Issue:** `patientName`, `allergies`, `conditions`, `medications`, `notes` are stored AES-256-GCM encrypted (ciphertext) in SQLite. The `since` filter queries `updatedAt > ?` — that part works. However the `ORDER BY name` on the `patients` table (line 244) sorts by *ciphertext*, not by plaintext name, producing an arbitrary and misleading order. More seriously, any future developer who adds a `WHERE name LIKE ?` search filter will silently compare against ciphertext and return no results or wrong results. The current broken sort is a data correctness defect with a confusing UX in a PHI context.
**Fix:**
```sql
-- Sort patients in application layer after decryption, not in SQL:
-- Remove ORDER BY name from the patients queries.
-- In patients.list(), after rows.map(rowToPatient), sort in JS:
rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
```

---

### CR-07: `ipcMain` handlers accept raw renderer arguments with no type/bounds validation

**File:** `apps/desktop/src/main/index.js:59-82`
**Issue:** Every IPC handler passes renderer-supplied arguments directly to DB methods without validation. Examples:
- `db:products:adjustStock (_, id, delta)` — `delta` is not validated as an integer; a renderer can pass `Infinity`, `NaN`, or a very large number, corrupting stock counts.
- `db:syncQueue:push (_, method, url, payload)` — `method` is not validated against HTTP verbs; `url` is not validated (see CR-04); `payload` has no size limit.
- `db:labOrders:updateStatus (_, id, status, tests)` — `status` is not validated against the enum (`pending`, `processing`, `ready`).

In Electron, the renderer process runs web content and can be compromised by XSS or a supply-chain attack on an npm package. The main process must treat IPC arguments as untrusted.
**Fix:**
```js
ipcMain.handle('db:products:adjustStock', (_, id, delta) => {
  if (typeof id !== 'string' || !id.trim()) throw new Error('invalid id');
  const n = Number(delta);
  if (!Number.isInteger(n) || n === 0) throw new Error('delta must be a non-zero integer');
  return db?.products.adjustStock(id, n);
});

ipcMain.handle('db:labOrders:updateStatus', (_, id, status, tests) => {
  const VALID = ['pending', 'processing', 'ready'];
  if (!VALID.includes(status)) throw new Error('invalid status');
  return db?.labOrders.updateStatus(id, status, tests);
});
// Apply similar guards to all handlers.
```

---

### CR-08: Receipt HTML built via string interpolation — stored XSS executed in a privileged BrowserWindow

**File:** `apps/desktop/src/renderer/screens/pharmacy/PharmacyLayout.jsx:32-56`, `apps/desktop/src/main/print.js:8-16`
**Issue:** `buildReceiptHtml()` interpolates `item.name`, `sale.patientName`, and `sale.paymentMethod` directly into an HTML string with no escaping. `print.js` renders this HTML in a `BrowserWindow` created with `contextIsolation: true, nodeIntegration: false` — but the print window's `webPreferences` grants no additional sandbox. The receipt window's origin is `data:`, which runs in the renderer context. If a product name or patient name contains `<script>alert(1)</script>` (entered by a pharmacist or synced from the server), it executes in the print window. While `nodeIntegration` is off, any `ipcRenderer` reference inside the injected script could communicate with main. More concretely, this is stored XSS in a healthcare app processing PHI.
**Fix:**
```js
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Use escapeHtml() on all interpolated values in buildReceiptHtml():
`<td>${escapeHtml(item.name)}</td>`
`<p>Patient: ${escapeHtml(sale.patientName)}</p>`
`<p style="...">Payment: ${escapeHtml(sale.paymentMethod || 'Cash')}</p>`
```

---

### CR-09: `GET /api/patients/:id/notes` has no authorization check — any authenticated user reads any patient's notes

**File:** `apps/api/src/routes/patients.js:124-132`
**Issue:** The `/notes` sub-route fetches `patient.notes` for any `:id` and returns them with zero ownership or role check. A patient who knows (or guesses) another patient's MongoDB ObjectId can call `GET /api/patients/<victim_id>/notes` and receive that patient's clinical notes written by doctors. This is a direct HIPAA breach — cross-patient PHI disclosure with no access control.
**Fix:**
```js
router.get('/:id/notes', auth, async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id).select('notes userId').populate('notes.doctorId', 'name');
    if (!patient) return res.status(404).json({ message: 'Not found' });

    const isOwnRecord = patient.userId.toString() === req.user.id;
    const isDoctor    = req.user.role === 'doctor';
    if (!isOwnRecord && !isDoctor) return res.status(403).json({ message: 'Forbidden' });

    // Doctors should only see notes for their own patients
    // (cross-reference Appointment to verify relationship)

    res.json(patient.notes);
  } catch (err) { next(err); }
});
```

---

## Warnings

### WR-01: Sync engine has no concurrency lock — concurrent `triggerSync()` calls can double-write

**File:** `apps/desktop/src/main/sync.js:81-95`
**Issue:** `triggerSync()` guards against reentry with `if (_status === 'syncing') return;` but the guard and the status mutation are not atomic. The `net.on('online')` handler fires `triggerSync()` and so does the 5-minute `setInterval`. If both fire within the same microtask tick (e.g., reconnect fires while an interval callback is executing), two sync cycles can run simultaneously, both pulling the same delta and both calling `db.appointments.upsert(rows)` in parallel. SQLite with `better-sqlite3` is synchronous, so the upserts themselves won't conflict, but `_lastSyncAt` is updated by both cycles, and `pushQueue` processes the same queue items twice — leading to duplicate API calls. 409 responses are silently swallowed and the item deleted, so the data won't corrupt, but idempotency relies on the server — not a safe assumption.
**Fix:** Use a `Promise`-based mutex or set `_status = 'syncing'` synchronously before any `await`:
```js
async function triggerSync() {
  if (_status === 'syncing') return;        // read
  _status = 'syncing';                      // set synchronously, before first await
  broadcast('syncing');
  try { /* ... */ } finally { /* reset */ }
}
```
The current code calls `broadcast('syncing')` which sets `_status` — that assignment happens synchronously, so the gap is between the check and the `broadcast` call (one synchronous line). Low probability but worth locking explicitly.

---

### WR-02: `_lastSyncAt` is a Unix epoch integer but API uses it as `new Date(ts)` — timezone-sensitive drift

**File:** `apps/desktop/src/main/sync.js:46`, `apps/api/src/routes/appointments.js:143-145`, `apps/api/src/routes/products.js:43-45`
**Issue:** The desktop sets `_lastSyncAt = Date.now()` (milliseconds since epoch) and sends it as `?since=<number>`. The API converts it: `new Date(ts)` where `ts = Number(req.query.since)`. This is correct in isolation. The problem is that `_lastSyncAt` is set to `Date.now()` *after* the pull completes (line 61 of sync.js), not before. If the pull takes 3 seconds, records updated during those 3 seconds (between pull-start and pull-end) will have `updatedAt` between the old and new `_lastSyncAt` and will be missed in the next delta. This is a silent data loss window.
**Fix:** Capture the timestamp *before* the first API call:
```js
async function pull() {
  const since = _lastSyncAt ?? 0;
  const nextSyncAt = Date.now();   // ← capture before fetch

  await Promise.allSettled([...]);

  _lastSyncAt = nextSyncAt;        // ← advance after all fetches succeed
  db.meta.set('lastSyncAt', String(_lastSyncAt));
}
```

---

### WR-03: `sync.js` references `net` from Electron but `fetch` is used without Electron's `net.fetch`

**File:** `apps/desktop/src/main/sync.js:2`, `27-43`
**Issue:** `apiFetch` uses the global `fetch` (Node 18+ built-in). Electron's `net.isOnline()` check and the `net` online/offline events reflect Electron's Chromium network stack. The two stacks may diverge — `net.isOnline()` can return `true` while Node's `fetch` fails due to proxy configuration or certificate differences, or vice-versa. This causes misleading status broadcasts and missed retries. In a medical setting where offline detection drives data safety decisions, a false `synced` status is a trust issue.
**Fix:** Replace `fetch` with `net.fetch` from Electron's `net` module, which shares the same network stack that `net.isOnline()` monitors:
```js
const { net } = require('electron');
// In apiFetch:
const res = await net.fetch(`${API_BASE}${path}`, { ... });
```

---

### WR-04: `db:products:upsert` and `db:appointments:upsert` accept arrays but call `.run(p)` on a single object

**File:** `apps/desktop/src/main/db.js:161-168`, `221-233`
**Issue:** The IPC handler `db:products:upsert` is called with both single objects (from InventoryTab `handleSave`) and arrays (from `sync.js` pull). The DB `upsert` method calls `_db.prepare(sql).run(p)` where `p` is the whole input — if `p` is an array, `better-sqlite3` will receive an array as the bound parameter object and throw or silently bind nothing. The sync path in `sync.js:50` calls `db.products.upsert(rows)` where `rows` is an array. This means every pull-time upsert of products silently fails.
**Fix:**
```js
upsert(input) {
  const rows = Array.isArray(input) ? input : [input];
  const stmt = _db.prepare(`INSERT INTO products (...) VALUES (...) ON CONFLICT ...`);
  const doUpsert = _db.transaction((items) => { for (const p of items) stmt.run(p); });
  doUpsert(rows);
},
```
Apply the same fix to `appointments.upsert`, `patients.upsert`, and `labOrders.upsert`.

---

### WR-05: `SyncBadge` calls `window.api.sync.getStatus` which does not exist in the preload bridge

**File:** `apps/desktop/src/renderer/components/SyncBadge.jsx:23-24`, `apps/desktop/src/preload.js:47-55`
**Issue:** `SyncBadge` calls `window.api.sync.getStatus()` to hydrate initial state. The preload only exposes `sync.trigger`, `sync.status`, and `sync.onStatus` — there is no `getStatus` on the bridge. The guard `if (window.api?.sync?.getStatus)` will always be falsy, so initial status is never hydrated from main-process state; the badge always shows `offline` until the first push event arrives. This is a silent UI bug — the sync state shows wrong information at startup. (`sync.status` is exposed and maps to `ipcMain.handle('sync:status', ...)` but is not called here.)
**Fix:** In `SyncBadge.jsx`, replace the missing call with the one that exists:
```js
useEffect(() => {
  window.api.sync.status().then(setStatus);  // ← uses the exposed 'sync:status' IPC

  const unsub = window.api.sync.onStatus((s) => setStatus(s));
  return () => unsub?.();
}, []);
```

---

### WR-06: InventoryTab calls `products.list()` twice in the same callback — double IPC round-trip and potential stale render

**File:** `apps/desktop/src/renderer/screens/pharmacy/PharmacyLayout.jsx:249`
**Issue:** The `load` callback in `InventoryTab` has:
```js
setProducts(Array.isArray(await window.api.db.products.list()) ?
  await window.api.db.products.list() : []);
```
This calls the IPC handler twice sequentially. The first call's result is only used for the type-check; the second call fetches fresh data that may differ. Between the two calls, a sync could arrive and change the DB, so the ternary test and the actual data can come from different snapshots. Additionally, `SalesTab` has the same pattern (line 371). This is both a race and an unnecessary double-IPC cost.
**Fix:**
```js
const rows = await window.api.db.products.list();
setProducts(Array.isArray(rows) ? rows : []);
```

---

### WR-07: `POST /api/prescriptions` has no input validation — medications array is persisted as-is

**File:** `apps/api/src/routes/prescriptions.js:9-31`
**Issue:** The prescription creation endpoint accepts `medications`, `patientId`, `appointmentId`, and `instructions` with zero `express-validator` validation. Any value (including `null`, a deeply-nested object, a 10 MB string) is passed directly to `Prescription.create()`. Mongoose will coerce some types, but does not enforce business rules: a prescription with `medications: []` or `medications: "delete all"` is accepted. `patientId` is not validated as a MongoDB ObjectId, so `findById` will throw a CastError that falls through to the generic `next(err)` handler.
**Fix:**
```js
const { body, validationResult } = require('express-validator');

router.post('/', auth, requireRole('doctor'), [
  body('patientId').isMongoId().withMessage('valid patientId required'),
  body('appointmentId').optional().isMongoId(),
  body('medications').isArray({ min: 1 }).withMessage('at least one medication required'),
  body('medications.*.name').notEmpty().trim().withMessage('medication name required'),
  body('medications.*.dosage').optional().isString().trim(),
  body('instructions').optional().isString().trim().isLength({ max: 2000 }),
  body('validUntil').optional().isISO8601(),
], validate, auditLog(...), async (req, res, next) => { ... });
```

---

### WR-08: `GET /api/patients/by-user/:userId` has no relationship check — any doctor can read any patient

**File:** `apps/api/src/routes/patients.js:94-103`
**Issue:** The route requires `doctor` role but does not verify the requesting doctor has ever seen (has an appointment with) the requested patient. Any credentialed doctor can enumerate all patient profiles by iterating user IDs. The `GET /api/patients/` list endpoint correctly scopes to `doctorId: req.user.id` appointments; this endpoint bypasses that scope entirely.
**Fix:**
```js
router.get('/by-user/:userId', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    // Verify a treatment relationship exists
    const hasRelationship = await Appointment.exists({
      doctorId: req.user.id,
      patientId: req.params.userId,
    });
    if (!hasRelationship) return res.status(403).json({ message: 'No treatment relationship' });

    const patient = await Patient.findOne({ userId: req.params.userId }).populate('userId', 'name email');
    if (!patient) return res.status(404).json({ message: 'Patient profile not found' });
    res.json(patient);
  } catch (err) { next(err); }
});
```

---

### WR-09: `autoUpdater.autoDownload = true` — silent auto-download without integrity verification config

**File:** `apps/desktop/src/main/autoUpdate.js:10`
**Issue:** `autoDownload: true` causes electron-updater to fetch and store the installer file automatically without prompting the user. If the GitHub release is compromised (token leak, supply-chain attack on GitHub Actions), the malicious installer is downloaded silently to disk before the user is asked anything. electron-updater does verify code signatures before installing, but only if `electron-builder`'s `publish.provider` is configured with signature checking — the current `electron-builder.yml` uses `provider: github` with `releaseType: release` and no explicit `publisherName` (Windows) or `identity` (macOS) field. On Windows, an unsigned or mis-signed NSIS installer will be accepted by autoDownload if the signature check path is not wired.
**Fix:**
```yaml
# In electron-builder.yml, add publisher identity enforcement:
win:
  publisherName: "MediConnect Health LLC"   # must match code-signing cert CN
  verifyUpdateCodeSignature: true
```
And set `autoDownload: false` until signature enforcement is confirmed end-to-end:
```js
autoUpdater.autoDownload = false;
autoUpdater.on('update-available', () => {
  // Prompt user before downloading
  dialog.showMessageBox({ ... }).then(({ response }) => {
    if (response === 0) autoUpdater.downloadUpdate();
  });
});
```

---

## Info

### IN-01: `uid()` uses `Math.random()` — not cryptographically secure, collision risk at scale

**File:** `apps/desktop/src/renderer/screens/pharmacy/PharmacyLayout.jsx:26-28`, `apps/desktop/src/renderer/screens/doctor/DoctorLayout.jsx:29-31`
**Issue:** `uid()` combines `Date.now().toString(36)` and `Math.random()` to generate primary keys for sales, prescriptions, and products. `Math.random()` is not CSPRNG-backed. While collisions are unlikely in a single-user desktop app, the same user on two offline devices (or during rapid testing) can generate the same ID. Since these IDs are used as SQLite primary keys and synced to MongoDB, a collision silently overwrites the older record.
**Fix:** Use `crypto.randomUUID()` (available in both Node 15+ and modern browsers):
```js
import { v4 as uuidv4 } from 'uuid'; // or:
const uid = () => crypto.randomUUID();
```

---

### IN-02: `SyncBadge` duplicates sync subscription logic already in `syncStore`

**File:** `apps/desktop/src/renderer/components/SyncBadge.jsx:18-33`, `apps/desktop/src/renderer/store/syncStore.js`
**Issue:** `syncStore.js` exists specifically to hold sync status in Zustand and expose a subscription via `init()`. `SyncBadge` ignores the store entirely and sets up its own `ipcRenderer.on('sync:status')` listener through `window.api.sync.onStatus`. This means two separate IPC listeners exist for every mounted `SyncBadge`, and the store's state is never driven by badge mounts. The store is essentially dead code. Either use the store everywhere or remove it.
**Fix:** Replace the local state in `SyncBadge` with `useSyncStore` and call `init()` once at app startup (e.g., in `App.jsx`).

---

### IN-03: `electron-builder.yml` includes all `node_modules` in the build artifact

**File:** `apps/desktop/electron-builder.yml:7-11`
**Issue:** The `files` glob `node_modules/**/*` with only `!node_modules/.cache` excluded packages the entire `node_modules` tree into the installer. This includes `electron` itself (a devDependency), all dev tooling, and source maps — easily adding 200–500 MB to the installer. electron-builder's default `node_modules` pruning (which removes devDependencies) is bypassed when `files` is specified explicitly with a wildcard. This is a quality/distribution issue that also increases the attack surface (devDependency code in production).
**Fix:**
```yaml
files:
  - src/main/**/*
  - src/preload.js
  - dist/renderer/**/*
  - "!node_modules/.cache"
# Let electron-builder's default pruning handle node_modules,
# or explicitly list only production dependency paths.
```
Remove the `node_modules/**/*` line and let electron-builder handle pruning, or use `npmRebuild: true` with `buildDependenciesFromSource: true`.

---

_Reviewed: 2026-07-14T10:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
