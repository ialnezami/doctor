# MediConnect

A full-stack healthcare platform. Doctors manage appointments, consultation notes, prescriptions, and lab results. Patients book appointments, view medical records, and receive real-time push notifications. Supports Arabic, English, and French.

## Monorepo Structure

```
apps/
├── api/      Node.js + Express REST API        → apps/api/README.md
│   └── src/seed.js   — seed test accounts (npm run seed)
├── mobile/   React Native (Expo) iOS & Android → apps/mobile/README.md
└── web/      React.js doctor + patient portal  → apps/web/README.md
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

# Mobile (new terminal)
cd apps/mobile && npm install && npx expo start

# Web (new terminal)
cd apps/web && npm install && npm run dev
```

See each app's README for detailed setup and environment variables.

### Seed Test Accounts

After the API is running, seed the three test accounts (idempotent — safe to re-run):

```bash
npm run seed
```

This creates one account of each role, ready to use immediately:

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
| Mobile | React Native 0.81, Expo SDK 54, React Navigation 7 |
| Web | React 18, Vite 5, React Router 6 |
| State | Zustand |
| i18n | i18next — Arabic (default), English, French |
| HTTP | Axios |

## Features at a Glance

- **Authentication** — Email/password + Google Sign-In (web & mobile)
- **Multi-language** — Arabic (RTL), English, French, switchable at runtime
- **Appointments** — Book, confirm, auto-accept, validate, cancel with push notifications
- **Consultation Notes** — Private/shared per-appointment notes with read receipts
- **Prescriptions** — Create and export as PDF
- **Lab Results** — Upload, annotate, flag abnormal values
- **Record Sharing** — Tokenized public share links
- **Notifications** — In-app + FCM push for all lifecycle events
- **Profile Management** — Photo upload, password change, medical profile
- **Onboarding** — 3-step onboarding flow for new users
- **Lab Role** — Separate lab portal with approval gate
- **Admin** — Lab approval, user management

## Roles

| Role | Description |
|---|---|
| `patient` | Books appointments, views own records, receives notifications |
| `doctor` | Manages schedule, writes notes, creates prescriptions, uploads lab results |
| `laboratory` | Uploads lab results (requires admin approval via `Lab.isApproved`) |

## Links

- [API README](apps/api/README.md)
- [Mobile README](apps/mobile/README.md)
- [Web README](apps/web/README.md)
- [Roadmap](ROADMAP.md)
