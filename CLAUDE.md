# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MediConnect** — a web + mobile healthcare platform. Doctors manage appointments, notes, and prescriptions. Patients book appointments, access medical records, and find nearby doctors.

## Planned Architecture

### Monorepo Structure (to be built)
- `apps/mobile` — React Native (iOS + Android): patient-facing app + doctor mobile flow
- `apps/web` — React.js: doctor dashboard + admin panel
- `apps/api` — Node.js + Express.js: shared REST API backend

### Tech Stack
| Layer | Technology |
|---|---|
| Mobile | React Native (Expo or bare) |
| Web | React.js |
| State | Redux or Zustand |
| UI | Tailwind CSS or Material UI |
| Backend | Node.js + Express.js |
| Database | MongoDB (NoSQL) |
| Auth | JWT |
| File storage | AWS S3 or Cloudinary |
| Push notifications | Firebase Cloud Messaging (FCM) |
| Maps | Google Maps API |

## Core Data Models

```
User: _id, name, email, password, role (doctor|patient), location
Doctor: userId, specialty, clinicAddress, availabilitySlots, ratings
Patient: userId, medicalHistory
Appointment: doctorId, patientId, date, status, notes
Prescription: doctorId, patientId, medications[], instructions, createdAt
```

## Role-Based Access

Three roles drive the entire permission model:
- **doctor** — manages schedule, patient records, prescriptions
- **patient** — books appointments, views own records/prescriptions
- **admin** (Phase 2) — manages users, moderates doctors

All API routes must enforce RBAC. Patients must never access another patient's records.

## MVP Scope (Phase 1)

Focus only on: authentication, location-based doctor search, appointment booking, basic patient records, and prescription creation (with PDF export).

Video consultation, payments, AI symptom checker, and reviews are Phase 2+.

## Key Constraints

- Prescriptions must be exportable as PDF
- Doctor search must support geo queries (MongoDB 2dsphere index on location)
- Comply with HIPAA (US) / GDPR (EU) — encrypt sensitive fields at rest, HTTPS only
- Real-time availability conflicts must be prevented at the booking layer
