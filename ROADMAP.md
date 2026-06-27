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

## Phase 2 — Engagement & Communication 🔲

Target: real-time features, richer doctor-patient communication, reviews.

### 2.1 Real-Time Chat
- [ ] In-app messaging between doctor and patient per appointment
- [ ] WebSocket server (Socket.io) or Supabase Realtime
- [ ] Message read receipts
- [ ] File attachments (images, PDFs) via S3/Cloudinary
- [ ] Chat history linked to appointment record

### 2.2 Video Consultations
- [ ] WebRTC peer-to-peer video call (Daily.co or Twilio Video SDK)
- [ ] Video session linked to appointment
- [ ] In-call note-taking sidebar for doctor
- [ ] Session recording (optional, consent required)
- [ ] Waiting room UI with estimated wait time

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

## Phase 4 — AI & Clinical Intelligence 🔲

### 4.1 AI Symptom Checker
- [ ] Pre-appointment symptom input form for patient
- [ ] Claude API integration — triage suggestions (not diagnosis)
- [ ] Suggested specialties based on symptoms
- [ ] Symptom summary attached to appointment for doctor review
- [ ] Clear disclaimer: AI output is not medical advice

### 4.2 Clinical Note Assistance
- [ ] Doctor types notes → AI suggests ICD-10 codes
- [ ] Auto-summarize long consultation notes into patient-friendly language
- [ ] Flag missing information (e.g. missing follow-up instructions)
- [ ] Prompt caching for cost efficiency (Anthropic SDK)

### 4.3 Smart Scheduling
- [ ] AI suggests optimal appointment slots based on doctor history + patient preference
- [ ] Detect scheduling conflicts across recurring appointments
- [ ] Auto-reschedule suggestions when doctor cancels

### 4.4 Lab Result Interpretation
- [ ] Flag abnormal values automatically
- [ ] Plain-language explanation of results for patient
- [ ] Trend analysis across multiple results of the same type

---

## Phase 5 — Admin & Compliance 🔲

### 5.1 Admin Panel
- [ ] User management: search, suspend, delete accounts
- [ ] Doctor approval workflow (verify credentials before going live)
- [ ] Lab approval workflow (`Lab.isApproved` gate)
- [ ] Audit log: all sensitive actions (role change, record access, deletion)
- [ ] System health dashboard (API uptime, DB metrics)

### 5.2 HIPAA / GDPR Compliance
- [ ] Encrypt sensitive fields at rest (SSN, medical history) using field-level encryption
- [ ] Data retention policy: auto-delete inactive records after N years
- [ ] Patient right-to-erasure endpoint (GDPR Article 17)
- [ ] Data export endpoint (GDPR Article 20 — portable format)
- [ ] Consent tracking: patient explicitly consents to data use at registration
- [ ] Audit trail for all record accesses (who accessed what and when)

### 5.3 Security Hardening
- [ ] Rate limiting per IP + per user (express-rate-limit)
- [ ] Brute-force protection on login (lockout after N failures)
- [ ] Input sanitization against XSS and injection (helmet.js, mongo-sanitize)
- [ ] HTTPS enforced (redirect HTTP → HTTPS)
- [ ] JWT refresh token rotation with revocation list
- [ ] API key auth for laboratory integrations

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

## Current Milestone Summary

| Phase | Status | Completion |
|---|---|---|
| Phase 1 — Core Platform | ✅ Done | 100% |
| Phase 2 — Engagement & Communication | 🔲 Planned | 0% |
| Phase 3 — Payments & Monetization | 🔲 Planned | 0% |
| Phase 4 — AI & Clinical Intelligence | 🔲 Planned | 0% |
| Phase 5 — Admin & Compliance | 🔲 Planned | 0% |
| Phase 6 — Scale & Reliability | 🔲 Planned | 0% |
| Phase 7 — Ecosystem Expansion | 💡 Idea | 0% |
