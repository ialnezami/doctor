# MediConnect — Product Roadmap

> Status legend: ✅ Done · 🔄 In Progress · 🔲 Planned · 💡 Idea

---

## Phase 1 — Core Platform (MVP) ✅

Foundation: auth, appointment lifecycle, consultation notes, prescriptions, lab results, sharing.

### 1.1 Authentication & User Management ✅
- [x] Register / login with JWT
- [x] Role-based access control (doctor / patient / laboratory)
- [x] Password hashing (bcrypt, 12 rounds)
- [x] Token expiry + refresh-safe design
- [x] `fcmToken` field on User for push notifications

### 1.2 Doctor Profiles & Availability ✅
- [x] Doctor profile (specialty, clinic address)
- [x] Availability slot management (add / list)
- [x] Geo-indexed location for proximity search (2dsphere)
- [x] Patient profile (blood type, allergies, conditions, date of birth)

### 1.3 Appointment Booking ✅
- [x] Patient books appointment with time slot
- [x] Double-booking conflict check (atomic)
- [x] Visit type: initial / follow-up / check-up / urgent
- [x] Doctor confirms pending appointment → patient notified
- [x] Doctor validates consultation → terminal status, patient notified
- [x] Either party can cancel (blocked once validated)
- [x] Full status lifecycle: `pending → confirmed → in_progress → validated / cancelled`

### 1.4 Consultation Notes ✅
- [x] Doctor adds per-appointment notes (private or shared)
- [x] Private notes never returned to patients (filtered at query level)
- [x] Shared notes compiled into summary on validation
- [x] Doctor can edit / delete notes (blocked after validation)
- [x] Read-receipt tracking (upserted per doctor per appointment)
- [x] Patient notified on first doctor read

### 1.5 Prescriptions ✅
- [x] Doctor creates prescription (medications + instructions)
- [x] Role-filtered list view (doctor sees all written, patient sees own)
- [x] PDF export endpoint

### 1.6 Lab Results ✅
- [x] Doctor uploads lab result linked to patient
- [x] Doctor annotates existing lab result with notes
- [x] Patient views own lab results
- [x] Search lab results
- [x] Laboratory role with `isApproved` gate on Lab model

### 1.7 Secure Record Sharing ✅
- [x] Generate tokenized share link for any record
- [x] Public viewer page (no login required)
- [x] Share link revocation

### 1.8 Push Notifications ✅
- [x] Firebase Cloud Messaging (FCM) integration
- [x] In-app notification store (DB-backed, survives offline)
- [x] FCM failure is silent — DB record always saved first
- [x] Notification types: `appointment_requested`, `appointment_confirmed`, `consultation_validated`, `notes_viewed`
- [x] Unread count + mark-read + mark-all-read

### 1.9 Mobile App (Expo / React Native) ✅
- [x] Doctor: Dashboard, Appointments list, Appointment detail, Note editor, Lab results, Notifications
- [x] Patient: Find doctor, My appointments, Consultation summary, Medical records, Lab results, Notifications
- [x] Stack navigator wrapping tab navigator (deep linking into detail screens)
- [x] Zustand auth state

### 1.10 Web Dashboard (React + Vite) ✅
- [x] Doctor: Dashboard, Appointments, Patient records, Prescriptions, Lab results
- [x] Patient: Find doctor, My appointments, Medical records
- [x] Public share viewer page

---

## Phase 2 — Engagement & Communication ✅

Target: real-time features, richer doctor-patient communication, reviews.

### 2.1 Real-Time Chat ✅
- [x] In-app messaging between doctor and patient per appointment
- [x] WebSocket server (Socket.io)
- [x] Message read receipts
- [x] File attachments (images, PDFs) via Cloudinary
- [x] Chat history linked to appointment record

### 2.2 Video Consultations ✅
- [x] WebRTC peer-to-peer video call (Daily.co)
- [x] Video session linked to appointment
- [x] In-call note-taking sidebar for doctor
- [-] Session recording — out of scope (enable_recording: false, consent flow deferred)
- [x] Waiting room UI with estimated wait time

### 2.3 Doctor Reviews & Ratings ✅
- [x] Patient submits rating (1–5) + text review after validated appointment
- [x] One review per appointment (enforced server-side)
- [x] Doctor aggregate rating stored on Doctor model
- [x] Doctor can flag abusive reviews for moderation
- [x] Reviews visible on doctor's public profile

### 2.4 Appointment Reminders ✅
- [x] Scheduled FCM push 24h before appointment
- [x] Scheduled push 1h before appointment
- [x] Patient can opt out of reminders per appointment
- [x] Doctor receives daily digest of upcoming appointments

### 2.5 Enhanced Notifications ✅
- [x] Notification preferences (push / email global toggles per user)
- [x] Email notifications via Resend
- [x] Notification history older than 30 days auto-archived (MongoDB TTL)
- [x] Read-event cooldown: re-notify patient if same doctor re-opens after 24h

---

## Phase 3 — Payments & Monetization 🔲

### 3.1 Appointment Payments
- [ ] Stripe integration — pay at booking or after consultation
- [ ] Doctor sets consultation fee on profile
- [ ] Payment status on Appointment model (`unpaid / paid / refunded`)
- [ ] Automatic refund on cancellation (configurable window)
- [ ] Invoice PDF generation

### 3.2 Subscription Plans
- [ ] Free tier: limited monthly appointments
- [ ] Premium patient: unlimited bookings, priority queue
- [ ] Doctor Pro: analytics dashboard, custom availability, branded prescriptions
- [ ] Stripe Billing + webhook handler for subscription events

### 3.3 Payout System
- [ ] Doctor wallet: earnings per validated consultation
- [ ] Stripe Connect for doctor payouts
- [ ] Payout schedule (weekly / monthly)
- [ ] Earnings history + CSV export

---

## Phase 4 — AI & Clinical Intelligence ✅

### 4.1 AI Symptom Checker ✅
- [x] Pre-appointment symptom input form for patient
- [x] Claude API integration — triage suggestions (not diagnosis)
- [x] Suggested specialties based on symptoms (category + urgency returned by Claude)
- [x] Symptom summary attached to appointment for doctor review
- [x] Clear disclaimer: AI output is not medical advice

### 4.2 Clinical Note Assistance ✅
- [x] Doctor types notes → AI suggests ICD-10 codes
- [x] Auto-summarize long consultation notes into patient-friendly language
- [x] Flag missing information (e.g. missing follow-up instructions)
- [x] Prompt caching for cost efficiency (Anthropic SDK)

### 4.3 Smart Scheduling ✅
- [x] AI suggests optimal appointment slots based on doctor history + patient preference
- [-] Detect scheduling conflicts across recurring appointments — deferred (no recurring model)
- [x] Auto-reschedule suggestions when doctor cancels

### 4.4 Lab Result Interpretation ✅
- [x] Flag abnormal values automatically (flag field: normal/high/low/critical per test)
- [x] Plain-language explanation of results for patient (Claude Haiku via BullMQ async worker)
- [-] Trend analysis across multiple results — deferred to Phase 6

---

## Phase 5 — Admin & Compliance 🔄

### 5.1 Admin Panel ✅
- [x] User management: search, suspend, delete accounts
- [x] Doctor approval workflow (verify credentials before going live)
- [x] Lab approval workflow (`Lab.isApproved` gate)
- [-] Audit log: all sensitive actions (role change, record access, deletion) — deferred to Phase 6
- [-] System health dashboard (API uptime, DB metrics) — deferred to Phase 6

### 5.2 HIPAA / GDPR Compliance ✅
- [x] AES-256-GCM field-level encryption for PHI (Patient, ConsultationNote, Prescription, LabResult)
- [x] HMAC-SHA256 blind index on email for encrypted-field equality queries
- [x] HIPAA audit trail — AuditLog model, fire-and-forget middleware, 18 hooks across all PHI routes
- [x] Auth middleware hardened — erased-user and suspended-user DB check on every request
- [x] Consent tracking — GDPR Art.7 consent fields on User, consent gate on registration
- [x] Patient right-to-erasure — GDPR Art.17 transactional anonymization across 9 collections
- [x] Data portability export — GDPR Art.20 async export queue + worker + Cloudinary upload
- [x] Privacy routes: DELETE /erase, POST /consent/withdraw, GET /audit-log, POST/GET /export

### 5.3 Security Hardening ✅
- [x] Rate limiting per IP (express-rate-limit — 200 req/15min general, 10 login, 20 register)
- [x] Brute-force protection on login (skipSuccessfulRequests — counts only failures)
- [x] Input sanitization against XSS and injection (helmet.js + express-mongo-sanitize)
- [x] HTTPS enforced in production (X-Forwarded-Proto redirect)
- [-] JWT refresh token rotation — deferred (stateless JWT acceptable for current scale)
- [-] API key auth for laboratory integrations — deferred to Phase 6

---

## Phase 6 — Scale & Reliability 🔲

### 6.1 Performance
- [ ] Redis cache for doctor search results and availability slots
- [ ] Pagination on all list endpoints (cursor-based for large collections)
- [ ] MongoDB read replicas for reporting queries
- [ ] Image/file upload directly to S3 (presigned URLs — bypass API)
- [ ] CDN for static assets (web app)

### 6.2 Background Jobs
- [ ] Bull / BullMQ job queue (Node.js)
- [ ] Jobs: send reminder notifications, process PDF generation, send emails
- [ ] Dead-letter queue for failed jobs with retry backoff
- [ ] Job dashboard (Bull Board)

### 6.3 Observability
- [ ] Structured JSON logging (Winston / Pino) with request ID propagation
- [ ] Error tracking (Sentry)
- [ ] APM (Datadog or New Relic)
- [ ] Custom metrics: appointment conversion rate, validation rate, notification delivery rate
- [ ] Uptime monitoring with alerting

### 6.4 CI/CD
- [ ] GitHub Actions: lint + test on every PR
- [ ] Staging deploy on merge to `main` (Railway)
- [ ] Production deploy on version tag (Railway)
- [ ] Expo EAS builds for iOS + Android (TestFlight + Play Console)
- [ ] Automated DB migration scripts with rollback

---

## Phase 9 — AI Patient Chatbot 🔲

Conversational AI assistant that helps patients understand their symptoms, get basic health advice, and find the right doctor — before booking an appointment.

### 9.1 Symptom Intake Chatbot
- [ ] Multi-turn conversation flow: patient describes symptoms in natural language
- [ ] Claude API integration — triage-level guidance (urgency: routine / soon / urgent / emergency)
- [ ] Suggested specialty/specialties based on reported symptoms
- [ ] Safety disclaimer: AI output is informational only, not medical advice
- [ ] Conversation history persisted per user session (ephemeral, not stored as PHI)
- [ ] Fallback escalation: "Book a doctor now" CTA when urgency is urgent/emergency

### 9.2 Doctor Recommendation Engine
- [ ] Filter doctors by AI-suggested specialty
- [ ] Geo-proximity ranking: closest clinics first (MongoDB 2dsphere, existing geo index)
- [ ] Availability ranking: earliest available slot surfaced (existing availability model)
- [ ] Combined score: weighted blend of proximity + soonest availability
- [ ] Doctor card: name, specialty, clinic distance, next available slot, average rating
- [ ] One-tap booking from recommendation card

### 9.3 Chatbot UI (Mobile + Web)
- [ ] Mobile: floating chat button on home screen → full-screen chat modal
- [ ] Web: chat widget on patient dashboard sidebar
- [ ] Markdown rendering for AI responses (bold, lists, urgency badges)
- [ ] Typing indicator while Claude streams response
- [ ] "Find a doctor" results rendered inline in chat after triage
- [ ] Conversation reset button (clears session, starts fresh)

### 9.4 API Layer
- [ ] `POST /api/chatbot/message` — send message, get AI response + optional doctor list
- [ ] `GET /api/chatbot/doctors?specialty=&lat=&lng=&limit=` — ranked doctor recommendations
- [ ] Rate limiting: 30 chatbot requests per user per hour
- [ ] Session token (JWT sub) used as conversation context key — no additional auth

---

## Phase 7 — Ecosystem Expansion 💡

### 7.1 Telemedicine Marketplace
- [ ] Public doctor directory (SEO-optimized landing pages per doctor)
- [ ] Specialty-based browsing
- [ ] Insurance network filtering
- [ ] Waitlist for popular doctors

### 7.2 Pharmacy Integration
- [ ] Digital prescriptions sent directly to partnered pharmacies
- [ ] Medication availability check
- [ ] Delivery tracking

### 7.3 Wearable & Device Data
- [ ] Apple Health / Google Fit integration
- [ ] Continuous glucose monitor data ingestion
- [ ] Blood pressure readings linked to patient records
- [ ] Doctor alerts on out-of-range readings

### 7.4 Multi-Clinic / Organization Support
- [ ] Clinic entity: group multiple doctors under one organization
- [ ] Clinic admin role
- [ ] Shared patient records within a clinic (with consent)
- [ ] Bulk scheduling and resource management

### 7.5 Internationalization
- [ ] Arabic + English UI (RTL layout support in mobile + web)
- [ ] Multi-currency pricing
- [ ] Locale-aware date/time formatting
- [ ] Region-specific compliance (HIPAA for US, GDPR for EU, PDPL for Saudi Arabia)

---

## Phase 8 — Doctor Equipment Marketplace 💡

Doctor-only marketplace for browsing and ordering medical equipment and supplies.

### 8.1 Product Catalog
- [ ] Equipment listings (name, description, images, price, category)
- [ ] Category browsing and search (by specialty, equipment type)
- [ ] Product detail page with specs and availability
- [ ] Supplier / vendor information per product

### 8.2 Order Management
- [ ] Doctor places order (select product, quantity, delivery address)
- [ ] Order status lifecycle: `pending → confirmed → shipped → delivered`
- [ ] Doctor order history and tracking
- [ ] Order cancellation (while pending)

### 8.3 Admin / Supplier Side
- [ ] Admin can add, edit, deactivate product listings
- [ ] Admin manages incoming orders and updates status
- [ ] Basic inventory tracking (stock count per product)

### 8.4 Notifications
- [ ] Doctor notified when order status changes (push + email)
- [ ] Low-stock alerts for admin

---

---

## Phase 10 — Electron Desktop App (Windows-first) 🔲

Offline-capable desktop client for Pharmacy, Doctor, and Lab roles. Uses local SQLite as the source of truth with a bidirectional sync engine to the existing Node.js/MongoDB backend.

### 10.0 Architecture

**Stack:**
| Layer | Technology |
|---|---|
| Shell | Electron v31+ (main + renderer process) |
| Local DB | SQLite via `better-sqlite3` (main process only) |
| Sync | REST pull-on-launch + offline write queue |
| UI | React (reuse web components) + Zustand |
| IPC | `contextBridge` + `ipcMain`/`ipcRenderer` (no `nodeIntegration`) |
| Packaging | `electron-builder` (NSIS installer for Windows, DMG for Mac) |
| Auto-update | `electron-updater` via GitHub Releases |
| PHI at rest | AES-256-GCM on all encrypted fields in SQLite (per-device derived key) |

**Project layout:**
```
apps/desktop/
  src/
    main/
      index.js        ← BrowserWindow, app lifecycle, IPC handlers
      db.js           ← SQLite schema + typed query helpers
      sync.js         ← Pull (fetch from API) + push queue drain
      print.js        ← webContents.printToPDF() + native print dialog
      autoUpdate.js   ← electron-updater setup
    preload.js        ← contextBridge: exposes db, sync, print, auth to renderer
    renderer/         ← React app (role-gated views per desktop role)
      App.jsx
      screens/
        pharmacy/
        doctor/
        lab/
      store/          ← Zustand slices (local-first, reads from SQLite via IPC)
```

**Offline write queue (`sync_queue` table):**
Each offline mutation is stored as `{ id, table, operation, payload, created_at }`. On reconnect the sync engine drains oldest-first; server timestamp wins on conflicts (last-write-wins per record).

### 10.1 Setup & Scaffold 🔲
- [ ] `apps/desktop/` initialized with `electron`, `electron-builder`, `better-sqlite3`
- [ ] `main/index.js` — BrowserWindow (1280×800, frame, no `nodeIntegration`)
- [ ] `preload.js` — contextBridge exposes `window.api.{ db, sync, print, auth }`
- [ ] Vite renderer bundler wired to build React into `dist/renderer/`
- [ ] `electron-builder.yml` — NSIS Windows target + GitHub release provider
- [ ] Dev script: `npm run dev:desktop` (concurrently: Vite watch + Electron)

### 10.2 SQLite Data Layer 🔲
- [ ] `main/db.js` — schema migration runner (`user_version` pragma)
- [ ] Tables: `users`, `products`, `sales`, `sale_items`, `appointments`, `patients`, `prescriptions`, `lab_orders`, `sync_queue`
- [ ] PHI columns (patient name, prescription content, lab values) encrypted with AES-256-GCM using a per-device key stored in OS keychain (`keytar`)
- [ ] Typed query helpers: `db.products.list()`, `db.sales.create()`, `db.appointments.listByDate()`, etc.
- [ ] IPC handlers in `index.js` expose each helper to renderer via preload

### 10.3 Sync Engine 🔲
- [ ] `main/sync.js` — pull: fetch `GET /api/{resource}?since={lastSyncAt}` for each table, upsert into SQLite
- [ ] Push queue drain: iterate `sync_queue` ordered by `created_at`, POST/PATCH to API, delete on 2xx
- [ ] On 409 conflict: log + skip (server wins), remove from queue
- [ ] Sync triggered: on app launch (if online) + every 5 min background tick + on reconnect event
- [ ] Sync status exposed via IPC: `{ status: 'synced'|'syncing'|'offline', lastSyncAt }`
- [ ] Renderer shows sync indicator in header (green dot / spinner / offline badge)

### 10.4 Pharmacy Module 🔲
- [ ] POS screen: reads products from SQLite, creates sale locally + queues `POST /api/sales` sync
- [ ] Inventory screen: product list from SQLite, stock adjustments queued for sync
- [ ] Stock decrement is local-first (instant UX), server-authoritative on sync
- [ ] Settings: pharmacy profile read from SQLite, changes queued for `PATCH /api/pharmacies/me`
- [ ] Receipt printing: `print.js` → `webContents.printToPDF()` → OS print dialog or save PDF
- [ ] Receipt template: pharmacy name, items, total, payment method, timestamp, receipt number

### 10.5 Doctor Module 🔲
- [ ] Dashboard: today's appointments from SQLite (synced at launch)
- [ ] Patient list: pulled from `GET /api/patients` and stored locally
- [ ] Appointment detail: consultation notes written offline → queued `POST /api/appointments/:id/notes`
- [ ] Prescriptions: create offline → queued `POST /api/prescriptions`
- [ ] Lab results: view-only from SQLite (no offline write needed)
- [ ] Offline indicator on note editor: "Will sync when back online" banner

### 10.6 Lab Module 🔲
- [ ] Orders tab: pulls all `lab_results` with `prescriptionId != null` at launch
- [ ] Status update (pending → processing → ready) written offline → queued `PATCH /api/lab-results/:id/status`
- [ ] Result entry form: fills test values offline, syncs on reconnect; auto-notifies patient on push
- [ ] QR scan: uses `html5-qrcode` in renderer (webcam), calls `POST /api/lab-results/from-prescription` immediately (requires online)

### 10.7 PHI Encryption (Desktop) 🔲
- [ ] Per-device AES-256-GCM key generated on first launch, stored in OS keychain via `keytar`
- [ ] All PHI columns encrypted before write to SQLite, decrypted on read — same `encrypt/decrypt` utility pattern as API
- [ ] If keychain unavailable (CI/headless): fall back to encrypted `electron-store` with machine ID seed
- [ ] PHI never written to SQLite in plaintext; sync queue payloads use server-side encryption (sent as plaintext to server which re-encrypts with server key)

### 10.8 Auto-Update 🔲
- [ ] `electron-updater` checks GitHub Releases on launch
- [ ] Silent download in background, prompt to restart on completion
- [ ] Version shown in Settings screen; update channel: `latest` (stable)
- [ ] `electron-builder` publishes `.exe` installer + `latest.yml` to GitHub Release assets

### 10.9 Receipt PDF (Pharmacy POS) 🔲
- [ ] After sale completion modal shows "Print Receipt" + "Download PDF" buttons
- [ ] `print.js` renders receipt HTML template → `webContents.printToPDF({ printBackground: true })`
- [ ] Print dialog (OS native) opens; PDF saved to `~/Downloads/receipt-{number}.pdf` on download
- [ ] Receipt includes: pharmacy name, date/time, items table, subtotal, payment method, receipt #

---

## Current Milestone Summary

| Phase | Status | Completion |
|---|---|---|
| Phase 1 — Core Platform | ✅ Done | 100% |
| Phase 2 — Engagement & Communication | ✅ Done | 100% |
| Phase 3 — Payments & Monetization | 🔲 Planned | 0% |
| Phase 4 — AI & Clinical Intelligence | ✅ Done | 100% |
| Phase 5 — Admin & Compliance | ✅ Done | 100% |
| Phase 6 — Scale & Reliability | 🔲 Planned | 0% |
| Phase 7 — Ecosystem Expansion | 💡 Idea | 0% |
| Phase 8 — Doctor Equipment Marketplace | 💡 Idea | 0% |
| Phase 9 — AI Patient Chatbot | 🔲 Planned | 0% |
| Phase 10 — Electron Desktop App | 🔲 Planned | 0% |
