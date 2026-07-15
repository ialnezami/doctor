# Design Patterns — MediConnect

## Summary

The codebase uses several patterns deliberately and well: Strategy (AI providers), Middleware Chain (Express), Observer (Socket.io + BullMQ workers, desktop IPC sync), Singleton (DB/Socket/crypto init), Facade (Electron IPC bridge), and Repository (desktop SQLite layer). The main gaps are a missing service layer on the API (fat routes with duplicated business logic), repeated async data-loading boilerplate across desktop layouts, and a duplicated notification dispatch pattern across two files. None of the gaps are architectural emergencies — they are maintainability debt that will compound as the codebase grows.

---

## Patterns Currently In Use

### Strategy Pattern
- **Where:** `apps/api/src/services/aiProviders/index.js` + `anthropicProvider.js`, `openaiProvider.js`, `geminiProvider.js`
- **What:** `getProvider()` selects an AI backend at runtime via `AI_PROVIDER` env var. All three providers expose the same interface: `{ name, isConfigured(), streamChat() }`.
- **Assessment:** Well-applied. Swapping providers requires no route changes. Adding a fourth provider (Mistral, etc.) is a single new file.
- **Recommendation:** Keep as-is. Consider adding a `validate()` method to each provider to surface misconfiguration at startup rather than at first request.

### Middleware Chain Pattern
- **Where:** `apps/api/src/index.js` (global chain), `apps/api/src/middleware/auth.js`, `apps/api/src/middleware/rbac.js`, `apps/api/src/middleware/rateLimiter.js`, `apps/api/src/middleware/errorHandler.js`
- **What:** Layered Express middleware handles cross-cutting concerns — security headers, CORS, body parsing, sanitization, rate limiting, auth, RBAC — before any business logic runs. `rbac.js` is a factory (`requireRole('doctor')`) that composes cleanly into route definitions.
- **Assessment:** Well-applied. The errorHandler correctly remaps 401/403 from upstream services to 503 to prevent false session-expiry logouts on mobile.
- **Recommendation:** Keep as-is.

### Decorator Pattern (Audit Logger)
- **Where:** `apps/api/src/middleware/auditLogger.js`
- **What:** `auditLog()` returns middleware that monkey-patches `res.json` and `res.send` to capture the final HTTP status code for fire-and-forget PHI audit writes. Used in `prescriptions.js` as `auditLog('Prescription', 'create', ...)`.
- **Assessment:** Well-applied. Audit is transparent to route handlers and never blocks the response. Only applied to PHI routes currently.
- **Recommendation:** Extend to `labResults.js`, `patients.js`, and `appointments.js` GET endpoints — all touch PHI but currently have no audit trail.

### Observer / Event Pattern
- **Where (API):** `apps/api/src/socket.js` (Socket.io room-based pub/sub), `apps/api/src/workers/` (BullMQ job queues for reminders, digest, symptoms, lab, notes, export)
- **Where (Desktop):** `apps/desktop/src/main/sync.js` — broadcasts `sync:status` to all renderer windows via `win.webContents.send('sync:status', data)`; `apps/desktop/src/renderer/components/SyncBadge.jsx` subscribes via `window.api.sync.onStatus(cb)`
- **Assessment:** Well-applied in all three locations. BullMQ workers cleanly separate job scheduling from job execution. The desktop IPC observer is minimal and correct.
- **Recommendation:** Keep as-is. The one gap: `notifyUser()` in `appointments.js` is an inline observer fan-out (push + email + DB notification) — see Pattern Opportunities below.

### Singleton Pattern
- **Where:** `apps/api/src/socket.js` (`let _io = null` + `getIO()` accessor), `apps/desktop/src/main/db.js` (`let _db = null` + `initialize()`), `apps/desktop/src/main/crypto.js` (`let _key = null` + `initKey()`)
- **What:** Lazy initialization with a module-level private variable and a getter that throws if accessed before init. Prevents accidental double-initialization.
- **Assessment:** Well-applied and consistent across API and desktop. The crypto singleton is especially important — `initKey()` triggers async keychain access and must only run once.
- **Recommendation:** Keep as-is.

### Facade Pattern (Electron IPC Bridge)
- **Where:** `apps/desktop/src/preload.js` + `apps/desktop/src/main/index.js`
- **What:** `contextBridge.exposeInMainWorld('api', {...})` provides a clean namespaced facade (`window.api.db`, `window.api.sync`, `window.api.print`, `window.api.auth`) that hides all IPC plumbing from renderer code. Renderer code never calls `ipcRenderer.invoke()` directly.
- **Assessment:** Well-applied. The facade enforces `contextIsolation: true` / `nodeIntegration: false` cleanly. Renderer components are decoupled from IPC channel name strings.
- **Recommendation:** Keep as-is. Minor note: `window.api.db.syncQueue.push` signature `(method, url, payload)` does not match `db.syncQueue.push(entity, entityId, operation, payload)` in `db.js` — fix the IPC handler to forward all four args.

### Repository Pattern (Desktop SQLite layer)
- **Where:** `apps/desktop/src/main/db.js` — `products`, `sales`, `appointments`, `patients`, `prescriptions`, `labOrders`, `syncQueue`, `meta` objects each encapsulate all SQL for their entity.
- **What:** Renderer code only calls `window.api.db.products.list()` — it never constructs SQL or knows the schema. PHI encryption/decryption is applied consistently at the repository boundary (encrypt on write, decrypt on read via row mappers).
- **Assessment:** Well-applied. The encrypt-at-boundary approach is exactly right for PHI.
- **Recommendation:** Keep as-is. The API layer is missing this — see Pattern Opportunities.

### Store / State Pattern (Zustand)
- **Where:** `apps/desktop/src/renderer/store/authStore.js`, `apps/desktop/src/renderer/store/syncStore.js`
- **What:** Zustand stores encapsulate auth state (user, token, login, logout, hydrate) and sync status as single sources of truth for the renderer.
- **Assessment:** Well-applied for what exists. `authStore.login()` correctly triggers a sync after setting the token.
- **Recommendation:** Keep as-is.

### Command Pattern (Sync Queue)
- **Where:** `apps/desktop/src/main/db.js` (`syncQueue` table), `apps/desktop/src/main/sync.js` (`pushQueue()`)
- **What:** Offline write operations enqueue a command record (`entity`, `entityId`, `operation`, `payload`). When connectivity is restored, `pushQueue()` drains the queue by executing each command against the server, applying 409-server-wins conflict resolution.
- **Assessment:** Well-applied. Commands are durable (stored in SQLite), ordered, and idempotent-safe via the 409 drop strategy.
- **Recommendation:** Keep as-is. One gap: the current `push()` signature in `db.js` is `(entity, entityId, operation, payload)` but the IPC bridge passes `(method, url, payload)` — the push queue drain in `sync.js` constructs `item.url` and `item.method` which don't exist on queue rows. Unify the schema.

---

## Pattern Opportunities

### 1. Service Layer (Repository Pattern on the API)
- **Problem:** Route handlers in `appointments.js`, `prescriptions.js`, `labResults.js` etc. contain business logic directly — `notifyUser()`, `scheduleReminders()`, `cancelReminders()` are all defined inside the route file. This couples HTTP concerns to domain logic, makes unit testing impossible without an HTTP layer, and causes duplication when the same logic is needed from workers.
- **Where it applies:** `apps/api/src/routes/appointments.js` (lines 15–77: `notifyUser`, `scheduleReminders`, `cancelReminders` are business logic, not routing), `apps/api/src/routes/products.js` (lines 17–22: `getApprovedPharmacy` guard), `apps/api/src/routes/sales.js` (same guard pattern)
- **Proposed solution:** Extract `AppointmentService`, `NotificationService`, and `PharmacyAuthService` under `apps/api/src/services/`. Route files call service methods; service files own the business rules. Workers import the same service instead of duplicating logic.
- **Effort:** Medium
- **Priority:** High — the appointment route file is already 384 lines and the pattern will compound with each new endpoint.

### 2. `useAsyncData` Custom Hook (Template Method)
- **Problem:** Every tab component across all three desktop layouts repeats the same ~12-line async data loading pattern: `useState([])`, `useState(true)` for loading, `useState(null)` for error, `useCallback` wrapping the fetch, `useEffect` to fire it, try/catch/finally. 45 occurrences of `setLoading`/`setErr` across the three layout files.
- **Where it applies:** Every tab component in `DoctorLayout.jsx`, `PharmacyLayout.jsx`, `LabLayout.jsx` — `AppointmentsTab`, `PatientsTab`, `PrescriptionsTab`, `POSTab`, `InventoryTab`, `SalesTab`
- **Proposed solution:**
  ```js
  // apps/desktop/src/renderer/hooks/useAsyncData.js
  export function useAsyncData(fetcher, deps = []) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);
    const reload = useCallback(async () => {
      setLoading(true); setError(null);
      try   { setData(await fetcher()); }
      catch (e) { setError(e.message); }
      finally   { setLoading(false); }
    }, deps);
    useEffect(() => { reload(); }, [reload]);
    return { data, loading, error, reload };
  }
  ```
  Each tab collapses to: `const { data: orders, loading, error, reload } = useAsyncData(() => window.api.db.labOrders.list());`
- **Effort:** Low
- **Priority:** High — immediate 60–80 line reduction across three files, and every future tab gets it for free.

### 3. Notification Channel Strategy
- **Problem:** Notification fan-out logic (check user prefs → push FCM → send email) is duplicated between `notifyUser()` in `appointments.js` (lines 15–41) and `processReminderJob()` in `reminderWorker.js` (lines 44–82). Both copy the same preference-check pattern and same try/catch per channel.
- **Where it applies:** `apps/api/src/routes/appointments.js:15`, `apps/api/src/workers/reminderWorker.js:44`
- **Proposed solution:** Extract `apps/api/src/services/notificationService.js` with a `notify(recipientId, type, payload, emailData?)` function that owns channel dispatch. Both the route and the worker import and call it. Adding SMS as a channel later requires one change in one file.
- **Effort:** Low
- **Priority:** Medium

### 4. Shared Entity ID Utility
- **Problem:** `uid()` is defined identically in both `DoctorLayout.jsx` (line 9) and `PharmacyLayout.jsx` (line 26). Any change to the ID format (e.g. switching to `crypto.randomUUID()`) must be made in two places.
- **Where it applies:** `apps/desktop/src/renderer/screens/doctor/DoctorLayout.jsx:9`, `apps/desktop/src/renderer/screens/pharmacy/PharmacyLayout.jsx:26`
- **Proposed solution:** Create `apps/desktop/src/renderer/utils/uid.js` exporting a single `uid()` function. Both layouts import it.
- **Effort:** Low
- **Priority:** Low (cosmetic, but sets up the right habit before more layouts are added).

### 5. Approved-Entity Guard (Policy Object)
- **Problem:** The pattern of fetching an entity by `userId`, checking `isApproved`, and returning early is duplicated across `products.js` (`getApprovedPharmacy`, lines 17–22), `sales.js` (inline, lines 18–20), and `labResults.js` (inline, lines 16–17). Each copy uses slightly different error messages.
- **Where it applies:** `apps/api/src/routes/products.js:17`, `apps/api/src/routes/sales.js:18`, `apps/api/src/routes/labResults.js:16`
- **Proposed solution:** Extract `apps/api/src/middleware/requireApprovedProfile.js` — a middleware factory `requireApprovedProfile(Model, profileField)` that attaches `req.profile` and short-circuits with consistent error messages. Compose into routes: `router.get('/', auth, requireRole('pharmacy'), requireApprovedProfile(Pharmacy), ...)`.
- **Effort:** Low
- **Priority:** Medium — currently 3 copies; will grow with every new pharmacy/lab endpoint.

### 6. Atomic Compound Operations (Unit of Work)
- **Problem:** The pharmacy POS checkout in `PharmacyLayout.jsx` calls `sales.create()` then iterates `products.adjustStock()` for each cart item without any rollback. If a stock adjustment fails mid-loop, the sale is recorded but inventory is partially updated. The same risk exists server-side in `sales.js`.
- **Where it applies:** `apps/desktop/src/renderer/screens/pharmacy/PharmacyLayout.jsx` (`checkout()` function), `apps/api/src/routes/sales.js`
- **Proposed solution:** On desktop (SQLite): wrap in a `better-sqlite3` transaction — `db.transaction(fn)` provides synchronous atomicity. On API (MongoDB): use `mongoose.startSession()` + `session.withTransaction()` to wrap `Sale.create()` + `Product.findOneAndUpdate($inc)` in one ACID transaction.
- **Effort:** Medium
- **Priority:** High — this is a data integrity issue, not a style concern.

---

## Quick Wins

1. **`useAsyncData` hook** — ~1 hour of work eliminates 45 repeated loading/error state lines across three desktop layout files. Every new tab gets resilience for free.

2. **`uid.js` shared utility** — 10 minutes; removes the only duplicated utility function between desktop layouts before the pattern spreads to future role screens.

3. **Extract `NotificationService`** — `notifyUser()` in `appointments.js` and the dispatch block in `reminderWorker.js` are near-identical; one 60-line service file kills the duplication and makes adding SMS trivial.

4. **`requireApprovedProfile` middleware** — currently 3 copies across pharmacy/lab routes with inconsistent error messages; a single middleware factory cleans them all up in under an hour.

5. **SQLite transaction in desktop POS checkout** — `db.transaction(fn)` in `better-sqlite3` is synchronous and zero-config; wrapping the checkout sequence takes 10 lines and eliminates the partial-failure data integrity risk.
