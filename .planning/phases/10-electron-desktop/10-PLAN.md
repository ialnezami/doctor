# Phase 10 — Electron Desktop App

**Date:** 2026-07-12  
**Status:** Planned  
**Roles covered:** Pharmacy · Doctor · Lab  
**Platform:** Windows-first (cross-platform via electron-builder)

---

## Goal

Every action a user can perform in the web app must be possible offline in the Electron app. When internet connectivity returns, all local changes sync to the MongoDB backend automatically — no user action required.

---

## Architecture

```
apps/desktop/
  package.json
  electron-builder.yml
  vite.config.js          ← bundles renderer/
  src/
    main/
      index.js            ← BrowserWindow, app lifecycle, ipcMain handlers
      db.js               ← SQLite schema + typed query helpers
      sync.js             ← Pull (fetch from API) + offline push queue drain
      print.js            ← Receipt PDF via webContents.printToPDF()
      autoUpdate.js       ← electron-updater (GitHub Releases)
      crypto.js           ← AES-256-GCM per-device key via keytar
    preload.js            ← contextBridge: window.api.{ db, sync, print, auth, app }
    renderer/
      App.jsx
      store/
        authStore.js      ← Zustand: token, user, role
        syncStore.js      ← Zustand: status, lastSyncAt
      screens/
        LoginScreen.jsx
        pharmacy/
          POSScreen.jsx
          InventoryScreen.jsx
          SalesScreen.jsx
          SettingsScreen.jsx
        doctor/
          DashboardScreen.jsx
          AppointmentsScreen.jsx
          PatientScreen.jsx
          PrescriptionScreen.jsx
        lab/
          OrdersScreen.jsx
          ResultEntryScreen.jsx
```

### SQLite Schema (local, per-device)

```sql
CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE sync_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  method      TEXT NOT NULL,           -- POST | PATCH | DELETE
  url         TEXT NOT NULL,           -- /api/sales
  payload     TEXT,                    -- JSON string
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE products (
  _id TEXT PRIMARY KEY, pharmacyId TEXT, name TEXT, barcode TEXT,
  unit TEXT, stockQty INTEGER, lowStockThreshold INTEGER,
  price REAL, currency TEXT, description TEXT,
  updatedAt INTEGER, synced_at INTEGER
);

CREATE TABLE sales (
  _id TEXT PRIMARY KEY, receiptNumber TEXT, totalAmount REAL,
  currency TEXT, paymentMethod TEXT, status TEXT,
  items TEXT,  -- JSON array
  createdAt INTEGER, synced INTEGER DEFAULT 1
);

CREATE TABLE appointments (
  _id TEXT PRIMARY KEY, patientId TEXT, patientName TEXT_ENCRYPTED,
  date INTEGER, status TEXT, visitType TEXT, notes TEXT_ENCRYPTED,
  updatedAt INTEGER
);

CREATE TABLE patients (
  _id TEXT PRIMARY KEY, name TEXT_ENCRYPTED, phone TEXT,
  bloodType TEXT, allergies TEXT_ENCRYPTED, conditions TEXT_ENCRYPTED,
  updatedAt INTEGER
);

CREATE TABLE prescriptions (
  _id TEXT PRIMARY KEY, patientId TEXT, patientName TEXT_ENCRYPTED,
  medications TEXT_ENCRYPTED, instructions TEXT_ENCRYPTED,
  dispensedAt INTEGER, createdAt INTEGER, synced INTEGER DEFAULT 1
);

CREATE TABLE lab_orders (
  _id TEXT PRIMARY KEY, patientId TEXT, prescriptionId TEXT,
  labName TEXT, tests TEXT_ENCRYPTED, status TEXT,
  updatedAt INTEGER, synced INTEGER DEFAULT 1
);
```

`TEXT_ENCRYPTED` columns store AES-256-GCM ciphertext. Encryption/decryption is done in the main process before write / after read.

---

## Task Breakdown

### Task 1 — Project scaffold
**Files:** `apps/desktop/package.json`, `electron-builder.yml`, `vite.config.js`, `src/main/index.js`, `src/preload.js`, `src/renderer/App.jsx`

- Init `apps/desktop/` with `electron`, `better-sqlite3`, `electron-builder`, `electron-updater`, `keytar`, `vite`, `@vitejs/plugin-react`
- `main/index.js`: create BrowserWindow (1280×800, `webPreferences: { contextIsolation: true, preload }`), handle `app.on('second-instance')`, load `dist/renderer/index.html` or `http://localhost:5173` in dev
- `preload.js`: expose `window.api` via `contextBridge.exposeInMainWorld`
- Dev script: `concurrently "vite" "electron ."`
- `electron-builder.yml`: NSIS target, `publish: { provider: 'github' }`

### Task 2 — SQLite data layer
**Files:** `src/main/db.js`, `src/main/crypto.js`

- `crypto.js`: on first launch generate 32-byte key via `crypto.randomBytes(32)`, store in OS keychain via `keytar.setPassword('mediconnect-desktop', username, hexKey)`. Expose `encrypt(text)` → `iv:tag:ciphertext` and `decrypt(str)` using `crypto.createCipheriv('aes-256-gcm', key, iv)`
- `db.js`: open SQLite at `app.getPath('userData')/mediconnect.db`, run schema migrations using `PRAGMA user_version`, export typed helpers:
  - `products.list()`, `products.upsert(rows)`, `products.adjustStock(id, delta)`
  - `sales.list()`, `sales.create(sale)` (generates local UUID if offline)
  - `appointments.listByDate(date)`, `appointments.upsert(rows)`
  - `patients.get(id)`, `patients.upsert(rows)`
  - `prescriptions.list()`, `prescriptions.create(rx)`
  - `labOrders.list()`, `labOrders.updateStatus(id, status, tests)`
  - `syncQueue.push(method, url, payload)`, `syncQueue.list()`, `syncQueue.remove(id)`
- IPC handlers in `main/index.js`: `ipcMain.handle('db:products:list', ...)` → calls `db.products.list()`

### Task 3 — Sync engine
**Files:** `src/main/sync.js`

Pull strategy: on launch + every 5 min (Node `setInterval`) + `net.online` event:
```
GET /api/products?since={lastSyncAt}       → upsert products
GET /api/appointments?since={lastSyncAt}   → upsert appointments  
GET /api/patients?since={lastSyncAt}       → upsert patients
GET /api/prescriptions?since={lastSyncAt}  → upsert prescriptions
GET /api/lab-results?since={lastSyncAt}    → upsert lab_orders
```
Update `sync_meta` key `lastSyncAt` after each successful pull.

Push queue drain (after pull, and on reconnect):
```
for each row in sync_queue ORDER BY created_at ASC:
  try: await fetch(row.url, { method: row.method, body: row.payload })
  on 2xx: DELETE FROM sync_queue WHERE id = row.id
  on 409: DELETE (conflict — server wins)
  on network error: stop drain, retry next tick
```

IPC events emitted to renderer: `sync:status` `{ status: 'syncing'|'synced'|'offline', lastSyncAt }`.

Backend changes needed: add `?since=` query param to list endpoints (filter `updatedAt >= since`).

### Task 4 — Auth + Login screen
**Files:** `src/renderer/screens/LoginScreen.jsx`, `src/renderer/store/authStore.js`

- Login form: identifier (phone or email) + password → `POST /api/auth/login`
- On success: store `{ token, user }` in `electron-store` (persists across restarts), set Zustand auth state
- Token refreshed on 401 (re-login prompt); logout clears `electron-store` + SQLite sensitive data
- Role detection from `user.role` → routes to pharmacy / doctor / lab layout

### Task 5 — Pharmacy module
**Files:** `src/renderer/screens/pharmacy/`

**POS (`POSScreen.jsx`):**
- Products loaded from SQLite via `window.api.db.products.list()`
- Sale created locally: `db.sales.create(sale)` + `db.syncQueue.push('POST', '/api/sales', sale)` + `db.products.adjustStock(id, -qty)` per item
- On save: show receipt view with "Print Receipt" + "Download PDF" buttons

**Inventory (`InventoryScreen.jsx`):**
- Products table from SQLite; low-stock badge from `stockQty ≤ lowStockThreshold`
- Add product: `db.products.upsert(newProduct)` + queue `POST /api/products`
- Delete: `db.products.remove(id)` + queue `DELETE /api/products/:id`
- Stock ±: `db.products.adjustStock(id, delta)` + queue `PATCH /api/products/:id/stock`

**Sales History (`SalesScreen.jsx`):**
- List from SQLite; unsynced rows shown with "⏳ pending sync" badge

**Settings (`SettingsScreen.jsx`):**
- Profile form from `sync_meta.pharmacyProfile`; changes queued for `PATCH /api/pharmacies/me`

### Task 6 — Doctor module
**Files:** `src/renderer/screens/doctor/`

**Dashboard (`DashboardScreen.jsx`):**
- Today's appointments from SQLite grouped by status
- Sync status indicator in header

**Appointment detail (`AppointmentsScreen.jsx`):**
- Full appointment with patient info (decrypted from SQLite)
- Note editor: save writes to `appointments.notes` locally + queues `POST /api/appointments/:id/notes`
- "Draft" badge on unsaved local notes; removed after sync

**Patient records (`PatientScreen.jsx`):**
- Patient list from SQLite with search (SQLite FTS5 on plaintext name column)
- Prescription creation: writes to `prescriptions` table + queues `POST /api/prescriptions`
- Lab results: read-only, synced from server

**Prescriptions (`PrescriptionScreen.jsx`):**
- List from SQLite; pending-sync rows marked
- PDF print: triggers print.js to generate prescription PDF (same format as web)

### Task 7 — Lab module
**Files:** `src/renderer/screens/lab/`

**Orders (`OrdersScreen.jsx`):**
- Three columns: Pending / Processing / Ready
- "Start" → `db.labOrders.updateStatus(id, 'processing')` + queue `PATCH /api/lab-results/:id/status`
- "Enter Results" → inline form per test

**Result entry (`ResultEntryScreen.jsx`):**
- Each test: name (pre-filled), value input, flag select
- "Publish" → `db.labOrders.updateStatus(id, 'ready', tests)` + queue `PATCH /api/lab-results/:id/status { status: 'ready', tests }`
- When queue item is drained (online): backend auto-creates SharedLink + FCM push to patient
- QR scan: opens webcam modal using `html5-qrcode` in renderer; requires online (calls `POST /api/lab-results/from-prescription` directly)

### Task 8 — Receipt PDF (Pharmacy)
**Files:** `src/main/print.js`

```js
// Called via IPC: ipcMain.handle('print:receipt', (e, { html }) => ...)
const win = BrowserWindow.fromWebContents(event.sender);

// PDF: save to Downloads
const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A5' });
fs.writeFileSync(path.join(app.getPath('downloads'), `receipt-${number}.pdf`), pdf);

// Print: native OS print dialog
win.webContents.print({ silent: false, printBackground: true });
```

Receipt HTML template includes: pharmacy name + license, date/time, items table (name, qty, unit price, subtotal), total, payment method, receipt number, footer disclaimer.

### Task 9 — Auto-update
**Files:** `src/main/autoUpdate.js`

- `autoUpdater.checkForUpdatesAndNotify()` on app ready
- On `update-downloaded`: show native dialog "Update ready — restart to install"
- `autoUpdater.quitAndInstall()` on user confirm
- GitHub Release asset: `mediconnect-setup-{version}.exe` + `latest.yml`

### Task 10 — Backend `?since=` support
**Files:** `apps/api/src/routes/products.js`, `appointments.js`, `patients.js`, `prescriptions.js`, `labResults.js`

Each list endpoint needs: `if (req.query.since) filter.updatedAt = { $gte: new Date(Number(req.query.since)) }`

All relevant models already have `timestamps: true` (Mongoose adds `updatedAt`). No model changes needed.

---

## Dependencies to Install

```bash
# apps/desktop
npm install electron better-sqlite3 electron-builder electron-updater keytar electron-store

# devDependencies
npm install -D vite @vitejs/plugin-react concurrently electron-rebuild
```

---

## Security Notes

- `nodeIntegration: false` + `contextIsolation: true` — renderer has zero Node access
- All Node APIs (db, sync, print) exposed only via typed `contextBridge` methods
- PHI encrypted at rest in SQLite (AES-256-GCM, per-device key in OS keychain)
- API token stored in `electron-store` with encryption (`encryptionKey` option)
- Sync queue payloads contain unencrypted data sent to server (server re-encrypts) — transmitted over HTTPS only
- No PHI written to renderer process memory beyond what's needed for display

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| SQLite write conflicts (multiple app instances) | WAL mode enabled; single-instance lock via `app.requestSingleInstanceLock()` |
| Sync queue corruption on crash | Queue is SQLite-transactional; partial drain leaves items intact for retry |
| PHI in keychain unavailable | Fallback: machine-ID-derived key stored in encrypted `electron-store` |
| `better-sqlite3` native module rebuild for Electron ABI | `electron-rebuild` in postinstall script |
| Large initial sync for doctors with many patients | Paginate pull: `GET /api/patients?since=0&limit=500&page=N` loop |
