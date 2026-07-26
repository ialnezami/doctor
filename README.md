# MediConnect

A full-stack healthcare platform. Doctors manage appointments, consultation notes, prescriptions, and lab results. Patients book appointments, view medical records, and chat with an AI assistant. Pharmacies manage inventory and process sales. Supports Arabic, English, and French.

## Monorepo Structure

```
apps/
├── api/      Node.js + Express REST API        → apps/api/README.md
│   └── src/seed.js   — seed test accounts (npm run seed)
├── desktop/  Electron offline-first desktop app → apps/desktop/README.md
├── mobile/   React Native (Expo) iOS & Android → apps/mobile/README.md
└── web/      React.js portal (doctor + patient + pharmacy + lab + admin)
docs/
└── superpowers/
    ├── plans/    Implementation plans
    └── specs/    Design specifications
```

## Quick Start

### Prerequisites
- Node.js 20+
- MongoDB (local or Atlas)
- (Optional) Firebase project for push notifications
- (Optional) Google OAuth credentials
- (Optional) Cloudinary account for photo uploads

### Install & Run All Apps

```bash
# Install root dependencies
npm install

# API
cd apps/api && npm install && npm run dev

# Web (new terminal)
cd apps/web && npm install && npm run dev

# Mobile (new terminal)
cd apps/mobile && npm install && npx expo start

# Desktop (new terminal)
cd apps/desktop && npm install && npm run dev
```

See each app's README for detailed setup and environment variables.

### Seed Test Accounts

After the API is running, seed test accounts (idempotent — safe to re-run):

```bash
npm run seed
```

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| `patient` | `patient.test@mediconnect.com` | `Patient12345` | Blood type O+, allergies: Penicillin |
| `doctor` | `doctor.test@mediconnect.com` | `Doctor12345` | General Practice, Mon–Fri 09:00–17:00, auto-accept ON |
| `laboratory` | `lab.test@mediconnect.com` | `Lab12345!` | Pre-approved — can upload lab results immediately |

**Quick booking test:** log in as patient → Find Doctor → search "Sarah" → book any weekday slot.

## Tech Stack

| Layer | Technology |
|---|---|
| API | Node.js 20, Express 4, Mongoose 8, MongoDB |
| Auth | JWT + Google OAuth (google-auth-library) |
| Push | Firebase Cloud Messaging (FCM) |
| File storage | Cloudinary (profile photos, lab result files) |
| Desktop | Electron 31, electron-updater, better-sqlite3 (offline cache) |
| Mobile | React Native 0.81, Expo SDK 54, React Navigation 7 |
| Web | React 18, Vite 5, React Router 6 |
| State | Zustand |
| i18n | i18next — Arabic (default), English, French |
| HTTP | Axios |

## Roles

| Role | Description |
|---|---|
| `patient` | Books appointments, views own records, uses AI assistant, receives notifications |
| `doctor` | Manages schedule, writes notes, creates prescriptions, uploads lab results |
| `pharmacy` | Manages inventory, processes sales via POS, views sales history |
| `laboratory` | Uploads lab results (requires admin approval via `Lab.isApproved`) |
| `admin` | Lab approval, user management |

## Features

### Doctor Dashboard
- **Appointments** — Day-view calendar with mini calendar, date navigation, past/upcoming split, archive tab with search
- **Consultation Notes** — Private/shared per-appointment notes with AI symptom analysis
- **Prescriptions** — Create and export as PDF
- **Lab Results** — Upload, annotate, flag abnormal values
- **Patient Records** — Full patient history, record sharing via tokenized public links
- **Reviews** — Patient feedback and ratings

### Patient Portal
- **Doctor Search** — Location-based search with availability filtering
- **Appointment Booking** — Real-time slot selection with conflict prevention
- **AI Chat Assistant** — Floating AI assistant (bottom-right, hidden on chat pages)
- **Appointment Chat** — Real-time messaging with doctor per appointment
- **Medical Records** — View prescriptions, lab results, shared notes
- **Onboarding** — 3-step onboarding flow for new users

### Pharmacy Dashboard
- **POS** — Draggable multi-sale windows
- **Inventory** — Stock management with low-stock alerts
- **Sales History** — Receipt log with totals and payment method
- **Settings** — Pharmacy profile (name, license, address)
- Tab routing via `?tab=` query param — sidebar nav links land on the correct tab

### Desktop App (Electron)
- **Offline-first** — Delta sync engine with push queue; works without internet
- **Doctor module** — Appointments, patients, prescriptions
- **Pharmacy module** — POS, inventory, sales, receipt printing
- **Lab module** — Order management
- **Print** — Native printing and PDF export for receipts
- **Auto-update** — electron-updater integration

### Platform
- **Authentication** — Email/password + Google Sign-In (web & mobile)
- **Multi-language** — Arabic (RTL), English, French, switchable at runtime
- **Push Notifications** — FCM for all appointment lifecycle events
- **Profile Management** — Photo upload, password change, medical profile

## Links

- [API README](apps/api/README.md)
- [Mobile README](apps/mobile/README.md)
- [Desktop README](apps/desktop/README.md)
- [Web README](apps/web/README.md)
- [Roadmap](ROADMAP.md)
