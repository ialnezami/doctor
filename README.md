# MediConnect

A full-stack healthcare platform. Doctors manage appointments, consultation notes, and prescriptions. Patients book appointments, view medical records, and receive real-time push notifications.

---

## Monorepo Structure

```
apps/
├── api/        Node.js + Express REST API
├── mobile/     React Native (Expo) — iOS & Android
└── web/        React.js — doctor dashboard + patient portal
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| API | Node.js, Express 4, Mongoose 8 |
| Database | MongoDB (2dsphere index for geo queries) |
| Auth | JWT (Bearer tokens) |
| Push | Firebase Cloud Messaging (FCM) |
| Mobile | React Native 0.74, Expo 51, React Navigation 6 |
| State | Zustand |
| Web | React 18, Vite, React Router 6 |
| HTTP client | Axios |
| Location | expo-location |

---

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB running locally or a MongoDB Atlas URI
- (Optional) Firebase project for push notifications

### API

```bash
cd apps/api
npm install
cp .env.example .env   # set MONGODB_URI, JWT_SECRET, FIREBASE_SERVICE_ACCOUNT
npm run dev
```

API runs on `http://localhost:3000`.

### Mobile

```bash
cd apps/mobile
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` in `.env` or update `src/constants/colors.js` → `API_URL`.

### Web

```bash
cd apps/web
npm install
npm run dev
```

---

## Environment Variables

### `apps/api/.env`

```env
MONGODB_URI=mongodb://localhost:27017/mediconnect
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
PORT=3000
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}  # JSON string
```

---

## Data Models

| Model | Description |
|---|---|
| `User` | Base user — role: `doctor \| patient \| laboratory`, location (2dsphere), `fcmToken` |
| `Doctor` | Doctor profile — specialty, availability slots |
| `Patient` | Patient profile — date of birth, blood type, allergies, conditions |
| `Lab` | Laboratory — `isApproved` gate |
| `Appointment` | Booking — status lifecycle, `initiatedBy`, timeSlot, visitType |
| `ConsultationNote` | Per-appointment notes — `visibility: private \| shared` |
| `ReadEvent` | Read-receipt — one record per doctor per appointment (upserted) |
| `Notification` | In-app + push — type, payload, read flag |
| `Prescription` | Medications + instructions, PDF-exportable |
| `LabResult` | Lab result linked to patient + doctor, doctor-annotatable |
| `SharedLink` | Tokenized share link for records/results |

---

## API Reference

Base URL: `/api`

### Authentication

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register new user (doctor / patient / laboratory) |
| `POST` | `/auth/login` | Public | Login — returns JWT |

### Doctors

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/doctors` | Auth | List doctors (supports geo search) |
| `GET` | `/doctors/:id` | Auth | Get doctor profile |
| `GET` | `/doctors/:id/slots` | Auth | Get availability slots |
| `POST` | `/doctors/:id/slots` | Doctor | Add availability slot |
| `PUT` | `/doctors/:id` | Doctor | Update profile |

### Appointments

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/appointments` | Patient | Book an appointment |
| `GET` | `/appointments` | Auth | List own appointments (role-filtered) |
| `GET` | `/appointments/:id` | Party | Get single appointment |
| `PATCH` | `/appointments/:id/confirm` | Doctor | Confirm a pending appointment → notifies patient |
| `PATCH` | `/appointments/:id/validate` | Doctor | Validate consultation → compiles shared notes → notifies patient |
| `PATCH` | `/appointments/:id/cancel` | Party | Cancel appointment (blocked once validated) |
| `PATCH` | `/appointments/:id/status` | Auth | Generic status update (legacy) |

**Appointment status lifecycle:** `pending → confirmed → in_progress → validated` (terminal) or `cancelled`

### Consultation Notes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/appointments/:id/notes` | Doctor | Add a note (`visibility: private \| shared`) |
| `GET` | `/appointments/:id/notes` | Party | Get notes — doctors see all, patients see `shared` only |
| `PATCH` | `/appointments/:id/notes/:noteId` | Doctor | Edit note (blocked once validated) |
| `DELETE` | `/appointments/:id/notes/:noteId` | Doctor | Delete note (blocked once validated) |

### Read Tracking

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/appointments/:id/read` | Doctor | Mark notes as read — upserts `ReadEvent`, notifies patient on first read |

### Notifications

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/notifications` | Auth | List own notifications + unread count |
| `PATCH` | `/notifications/read-all` | Auth | Mark all as read |
| `PATCH` | `/notifications/:id/read` | Auth | Mark one as read |

**Notification types:** `appointment_requested`, `appointment_confirmed`, `consultation_validated`, `notes_viewed`

### Patients

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/patients/:id` | Auth | Get patient profile |
| `GET` | `/patients/:id/notes` | Auth | Get patient notes/history |
| `POST` | `/patients/:id/notes` | Doctor | Add clinical note to patient record |

### Prescriptions

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/prescriptions` | Doctor | Create prescription |
| `GET` | `/prescriptions` | Auth | List own prescriptions (role-filtered) |
| `GET` | `/prescriptions/:id` | Party | Get prescription detail |
| `GET` | `/prescriptions/:id/pdf` | Party | Export prescription as PDF |

### Lab Results

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/lab-results` | Doctor | Upload lab result |
| `GET` | `/lab-results` | Auth | List lab results (role-filtered) |
| `GET` | `/lab-results/search` | Auth | Search lab results |
| `GET` | `/lab-results/:id` | Party | Get single lab result |
| `PATCH` | `/lab-results/:id/notes` | Doctor | Annotate a lab result |

### Shared Links

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/share` | Auth | Create a tokenized share link |
| `GET` | `/share/:token` | Public | View shared record via token |
| `DELETE` | `/share/:token` | Auth | Revoke share link |

---

## Mobile Screens

### Auth
- `LoginScreen` — JWT login
- `RegisterScreen` — role-based registration

### Doctor
- `DashboardScreen` — overview
- `AppointmentsScreen` — list with pending approval queue, tap to open detail
- `AppointmentDetailScreen` — appointment info, full notes list (private/shared), confirm + validate actions
- `NoteEditorScreen` — write/edit note with private/shared toggle and character counter
- `LabResultsScreen` — view and annotate lab results
- `NotificationsScreen` — in-app notifications with unread badge

### Patient
- `FindDoctorScreen` — geo-search for nearby doctors
- `MyAppointmentsScreen` — appointment list, validated appointments link to summary
- `ConsultationSummaryScreen` — shared notes compiled after doctor validates
- `MedicalRecordsScreen` — medical history
- `LabResultsScreen` — view own lab results
- `NotificationsScreen` — in-app notifications with unread badge

---

## Web Pages

### Doctor
- `DashboardPage`
- `AppointmentsPage`
- `PatientRecordsPage`
- `PrescriptionsPage`
- `LabResultsPage`

### Patient
- `FindDoctorPage`
- `MyAppointmentsPage`
- `MedicalRecordsPage`

### Public
- `ShareViewerPage` — view a record via share token (no login required)

---

## Authorization Model

All ownership is enforced server-side — client-supplied IDs are never trusted for authorization.

| Role | Can do |
|---|---|
| `patient` | Book appointments, view own records/prescriptions/lab results, read shared notes only |
| `doctor` | Manage own schedule, confirm/validate appointments, write consultation notes, create prescriptions, upload lab results |
| `laboratory` | Manage lab results (approval-gated via `Lab.isApproved`) |

---

## Key Security Properties

- Private consultation notes are filtered at query level — never returned to patients regardless of request
- `validated` status is terminal — notes cannot be edited or deleted after validation
- Concurrent validation protected by atomic `findOneAndUpdate` with status guard
- `ReadEvent` is upserted — notification sent only on first read per appointment
- FCM push failures are silent — notification record is always saved to DB first
- Prescriptions and lab results are accessible only to the parties involved

---

## Phase 2 (Planned)

- Video consultations
- In-app payments
- AI symptom checker
- Doctor reviews & ratings
- Admin panel
- HIPAA/GDPR audit logging
