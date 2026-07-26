# MediConnect Architecture Resume
## Rules for Replicating This Architecture + Advice for Claude

This document captures every structural decision, pattern, and constraint established
during the MediConnect build. Use it verbatim as context when starting a similar
multi-platform healthcare (or any regulated-data) monorepo.

---

## 1. Monorepo Structure

```
apps/
  api/        Node.js + Express — shared REST backend
  web/        React.js — staff dashboards (doctor / pharmacy / lab / admin)
  mobile/     React Native (Expo) — patient-facing app
  desktop/    Electron — offline-first Windows app for clinic staff
package.json  root workspace (npm workspaces or equivalent)
```

**Rules:**
- One `apps/api` serves all clients — no per-client backends.
- Shared types/utils go in a `packages/` directory (or inline if small).
- Each app owns its own `node_modules` except root-level tooling.
- Never cross-import between `apps/` — only via API calls or a shared `packages/` lib.

---

## 2. API Layer (Node.js + Express + MongoDB)

### Structure
```
src/
  index.js          app bootstrap + listen
  app.js            Express setup, middleware chain, route mounting
  models/           Mongoose schemas (one file per entity)
  routes/           Express routers (one file per resource)
  middleware/        auth.js, roles.js, validate.js, errorHandler.js
  services/         (target state — extract business logic from routes)
  workers/          BullMQ job processors (notifications, heavy tasks)
  utils/
```

### Rules
1. **Every route is protected by default.** Middleware order: `authenticate` → `requireRole(roles)` → `requireApprovedProfile` → `validate(schema)` → handler.
2. **Backend validation is mandatory.** Use Joi or Zod schemas. Never trust the client. Validate body, query params, and path params.
3. **RBAC is enum-based.** `user.role` is one of `['doctor','patient','pharmacy','lab','admin']`. Check role server-side on every write.
4. **Delta sync support.** Every list endpoint accepts `?since=ISO_TIMESTAMP` and filters `updatedAt >= since`. This enables offline-first clients.
5. **Soft-delete only.** Add `deletedAt` field; filter `deletedAt: null` on reads. Never hard-delete PHI records.
6. **Structured error responses.** Always return `{ message, code, details? }`. Use an `errorHandler` middleware to catch and format.
7. **No business logic in routes.** Routes validate input and call a service function. Services own logic, DB queries, and side effects.
8. **MongoDB indexes.** Add `2dsphere` on location fields. Add compound indexes on `(patientId, createdAt)` for time-series queries. Define indexes in the model file.

### Auth
- JWT with `Authorization: Bearer <token>` header.
- Tokens carry `{ userId, role }` — nothing else.
- On role or approval-status change: invalidate existing tokens by bumping a `tokenVersion` field on the User model and checking it in `authenticate` middleware.
- Phone-linked accounts: allow login by phone OR email. Store phone separately from email; normalize with `+country` prefix.

---

## 3. Web Frontend (React.js)

### Structure
```
src/
  pages/
    admin/          AdminPage.jsx (tab-based: Users, Doctors, Pharmacies, Labs, Settings)
    doctor/         DoctorDashboardPage.jsx
    pharmacy/       PharmacyDashboardPage.jsx
    lab/            LabDashboardPage.jsx
  components/       shared UI (modals, tables, badges)
  store/            Zustand stores (authStore, etc.)
  i18n/
    index.js        i18n init — fetches platform default language if no localStorage pref
    en.json
    ar.json
    fr.json
  api/              axios instances or fetch wrappers per domain
```

### Rules
1. **i18n from day one.** Every user-visible string goes through `t('key')`. Never hardcode UI text. Add keys to ALL language files simultaneously.
2. **Platform language default.** Admin sets a default language in settings (stored in DB). First-time visitors fetch it from a public endpoint before i18n initializes.
3. **Role-gated routing.** Top-level router reads `user.role` and renders the correct layout. No role can access another role's routes.
4. **Tab-based dashboards.** Each role gets one page component with tab navigation. Tabs are components rendered conditionally — not separate routes.
5. **Zustand for auth state.** `useAuthStore` exposes `user`, `token`, `login()`, `logout()`. Persist token in localStorage. Never store passwords.
6. **No inline fetch.** All API calls go through wrapper functions in `src/api/`. Components call the wrapper, not `fetch` directly.
7. **Admin approval flow.** Doctors, pharmacies, and labs start as `pending`. Admin dashboard shows pending queue with verify/unverify. Until approved, users see a banner and cannot access features.

---

## 4. Mobile App (React Native / Expo)

### Rules
1. **Patient-only.** Mobile is for patients: browse doctors, book appointments, view prescriptions/records, get push notifications.
2. **Expo managed workflow** unless native modules require bare. Bare only if: push tokens via FCM directly, camera, or biometrics.
3. **Auth flow:** Login → OTP verify (if phone-linked) → Home. No email/password for patients — phone-first.
4. **Offline reading.** Cache appointment list and prescriptions locally (AsyncStorage or MMKV). Write operations require connectivity.
5. **Push notifications via FCM.** Store `fcmToken` on the Patient profile after login. Backend sends notifications through a worker, not inline in route handlers.

---

## 5. Electron Desktop App (Offline-First)

This is the most complex piece. Follow every rule here precisely.

### Architecture
```
src/
  main/
    index.js      app entry — BrowserWindow, ipcMain handlers, module loading
    db.js         SQLite via better-sqlite3 — all local data access
    crypto.js     AES-256-GCM PHI encryption (keytar → machineId → hostname fallback)
    sync.js       pull (GET /api/resource?since=lastSyncAt) + push queue drain
    print.js      printReceipt() + savePDF() via hidden BrowserWindow
    autoUpdate.js electron-updater — 30s delayed check, restart dialog
  preload.js      contextBridge — exposes window.api.{auth, db, sync, print, app}
  renderer/
    App.jsx       role-gated router (LoginScreen → PharmacyLayout | DoctorLayout | LabLayout)
    store/
      authStore.js  Zustand — hydrate(), login(), logout() — calls sync.trigger after login
      syncStore.js  Zustand — status, lastSyncAt, subscribes to sync:status IPC events
    screens/
      LoginScreen.jsx
      doctor/DoctorLayout.jsx
      pharmacy/PharmacyLayout.jsx
      lab/LabLayout.jsx
    components/
      SyncBadge.jsx   live sync status indicator
```

### Security Rules
1. **`contextIsolation: true`, `nodeIntegration: false` always.** No exceptions.
2. **All Node.js access via contextBridge.** Renderer never imports Node modules directly.
3. **PHI encrypted at rest.** Encrypt on write, decrypt on read. Every SQLite column containing patient name, notes, medications, allergies, or conditions is encrypted with AES-256-GCM.
4. **Encryption key hierarchy:** `keytar` (OS keychain) → `node-machine-id` (hardware hash) → `os.hostname()` SHA-256. Always try the most secure option first.
5. **GCM auth-tag mismatch must throw.** Never silently return garbage on decryption failure. Tampered data must surface as an error.
6. **Single-instance lock.** `app.requestSingleInstanceLock()` at startup. Quit immediately if lock fails.
7. **Token stored in electron-store** (encrypted). Never in renderer localStorage.

### SQLite Schema Rules
1. Use `TEXT PRIMARY KEY` for `_id` (nanoid/UUID from server).
2. Store arrays/objects as JSON strings. Parse on read.
3. Use `sync_queue` table for offline write operations: `{ entity, entityId, operation, payload }`.
4. Use `sync_meta` table for key-value config: `lastSyncAt`, schema version.
5. All PHI tables have `updatedAt TEXT` for delta sync.
6. Wrap multi-step writes (e.g. POS checkout: create sale + adjust stock × N) in a SQLite transaction to guarantee atomicity.

### Sync Engine Rules
1. **Pull first, then push.** Pull latest server state before draining the push queue.
2. **Delta pull:** `GET /api/resource?since={lastSyncAt}` for all 5 entities (products, appointments, patients, prescriptions, labOrders).
3. **Push queue drain:** Process queue items sequentially. On 409 (conflict), server wins — remove from queue without retry. On other errors, stop and retry next cycle.
4. **5-minute polling interval** when online. Also trigger on `net.online` event.
5. **Broadcast `sync:status` to all BrowserWindows** after every state change (syncing / synced / offline / error).
6. **Token wiring:** `sync.setToken(token)` called both at app launch (from electron-store) and on `auth:setToken` IPC event.

### IPC Handler Pattern
```js
// main/index.js pattern — all handlers follow this shape
ipcMain.handle('db:entity:action', (_, ...args) => db?.entity.action(...args) ?? fallback);
```
- All handlers are registered in `index.js`.
- Handlers are thin — they delegate to `db`, `syncEngine`, `printMod`.
- Modules loaded lazily inside `app.whenReady()` to avoid circular deps.

### Receipt Printing
- Generate HTML string in renderer from sale data.
- Pass to `window.api.print.receipt(html)` (native print dialog) or `window.api.print.pdf(html, filename)` (save dialog + `shell.openPath`).
- `print.js` loads HTML in a hidden BrowserWindow via `data:text/html` URL, calls `webContents.print()` or `webContents.printToPDF()`, then destroys the window.

---

## 6. Design Patterns — When to Apply What

| Pattern | Apply when | Where in this project |
|---------|-----------|----------------------|
| **Repository** | Isolating DB access from business logic | `desktop/src/main/db.js` |
| **Facade** | Hiding complex subsystem behind simple interface | `preload.js` → `window.api` |
| **Strategy** | Multiple interchangeable implementations of same interface | AI provider abstraction |
| **Observer/Event** | Broadcasting state changes to unknown consumers | `sync:status` IPC events, Socket.io notifications |
| **Singleton** | One shared instance must exist per process | DB connection, crypto key, Socket.io server |
| **Middleware Chain** | Sequential processing with early-exit on failure | Express auth → role → validation → handler |
| **Decorator** | Transparently adding behavior on read/write | PHI encrypt-on-write, decrypt-on-read in db.js |
| **Command + Queue** | Deferring operations for later execution | `sync_queue` table for offline writes |
| **Template Method** | Repeated skeleton (fetch → loading → error → render) | Extract as `useAsyncData` hook |

---

## 7. Cross-Cutting Rules

### PHI / HIPAA Compliance
- Encrypt all PHI fields at rest (see Electron crypto rules above; same applies to MongoDB with field-level encryption for production).
- Never log PHI. Log IDs, timestamps, and operation names only.
- Soft-delete only — never destroy medical records.
- HTTPS only in production.

### Validation
- Joi/Zod schema per route, validated before handler runs.
- Return structured validation errors: `{ message: 'Validation failed', errors: [{ field, message }] }`.
- Enum values validated server-side even if frontend restricts choices.

### Error Handling
- Every async route handler is wrapped in try/catch or uses an async wrapper.
- `errorHandler` middleware is the last middleware — catches everything.
- Distinguish: 400 (validation), 401 (unauthenticated), 403 (unauthorized), 404 (not found), 409 (conflict), 422 (business rule), 500 (unexpected).

### Observability
- Correlation ID on every request (middleware adds `req.id`).
- Structured logs: `{ requestId, method, path, statusCode, durationMs }`.
- Never log passwords, tokens, or PHI values.

---

## 8. Advice for Claude — How to Approach This Type of Project

### Before writing any code
1. **Ask about roles first.** Who uses the system? Each role drives a separate app surface and permission model. Get the full role list before designing any schema.
2. **Map the offline requirement early.** If any role needs offline access, plan the sync strategy (SQLite + delta pull + push queue) before writing the first route.
3. **Establish the auth contract.** Decide: JWT or session? Phone or email? Token expiry? Approval workflow? Write the User model and auth middleware first — everything else depends on it.

### While planning
4. **One source of truth per entity.** Never let mobile, web, and desktop have separate schemas for the same concept. The API schema is canonical; local stores mirror it.
5. **Design for delta sync from day one.** Add `updatedAt` to every entity. Add `?since=` support to every list endpoint. Not doing this requires a painful migration later.
6. **Plan encryption before the first table.** Retrofitting PHI encryption into existing data is error-prone. Decide which columns are PHI before any writes happen.

### While implementing
7. **Implement in layers, not features.** Build auth → models → API → web → mobile → desktop. Never build a feature across all layers simultaneously.
8. **Keep IPC handlers thin.** In Electron, `index.js` handlers should be one-liners. Logic lives in `db.js`, `sync.js`, `print.js` — not in the ipcMain callback.
9. **Never skip the preload.** `contextIsolation: true` is non-negotiable. Every renderer API goes through `contextBridge`. This is a security boundary, not a convenience.
10. **Encrypt before write, decrypt after read.** Never store plaintext PHI in SQLite. The `db.js` row mappers are the right place — encrypt in upsert, decrypt in rowToX() mapper.

### Common mistakes to avoid
- **Fat routes.** Business logic in route handlers makes testing and reuse impossible. Extract to services.
- **Repeated fetch/loading/error boilerplate.** ~45 copies in this codebase. Extract a `useAsyncData(fn, deps)` hook immediately.
- **Non-atomic multi-write operations.** POS checkout (create sale + adjust stock × N items) must be a single SQLite transaction. Separate writes leave inconsistent state on crash.
- **Hardcoded strings in UI.** Every string must go through `t()` from day one. Retrofitting i18n is painful.
- **Forgetting to broadcast sync status.** After every sync state change, call `broadcast()` to all BrowserWindows. Without this, the SyncBadge never updates.
- **Trusting the renderer.** The renderer is untrusted. Validate everything in `ipcMain` handlers just as you would validate HTTP requests from a client.

---

## 9. Quick-Start Checklist for a New Similar Project

- [ ] Define all roles and their permissions
- [ ] Create User model with `role`, `tokenVersion`, `approvalStatus`
- [ ] Implement auth middleware chain: authenticate → requireRole → requireApprovedProfile → validate
- [ ] Add `updatedAt` + soft-delete `deletedAt` to every entity model
- [ ] Add `?since=` delta sync to every list endpoint
- [ ] Set up i18n with all languages from day one
- [ ] Set up platform language default (DB field + public API endpoint + i18n init fetch)
- [ ] Electron: `contextIsolation: true`, preload with contextBridge, no nodeIntegration
- [ ] Electron: crypto.js with keytar → machineId → hostname key chain
- [ ] Electron: db.js with PHI encrypt-on-write / decrypt-on-read
- [ ] Electron: sync.js with pull-then-push, 409 server-wins, 5-min polling
- [ ] Electron: single-instance lock
- [ ] Extract `useAsyncData` hook before writing second layout component
- [ ] Wrap all multi-write operations in SQLite transactions
- [ ] Set up FCM token storage and notification worker before going to production
