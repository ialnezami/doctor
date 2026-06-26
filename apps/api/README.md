# MediConnect API

Node.js + Express REST API for the MediConnect healthcare platform.

## Stack

- **Runtime** — Node.js 20
- **Framework** — Express 4
- **Database** — MongoDB via Mongoose 8
- **Auth** — JWT + Google OAuth (`google-auth-library`)
- **Push** — Firebase Admin SDK (FCM)
- **File storage** — Cloudinary (via `multer` middleware)
- **Validation** — `express-validator`

## Setup

```bash
npm install
cp .env.example .env   # fill in values below
npm run dev
```

Runs on `http://localhost:3000`.

## Environment Variables

```env
# Required
MONGODB_URI=mongodb://localhost:27017/mediconnect
JWT_SECRET=your_jwt_secret_at_least_32_chars
PORT=3000

# Optional — Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id

# Optional — Firebase push notifications
# Paste the full service account JSON as a single-line string
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}

# Optional — Cloudinary photo uploads
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Optional
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with nodemon (watches `src/`, 500ms delay) |
| `npm start` | Start without nodemon |
| `npm test` | Run Jest tests |

## Project Structure

```
src/
├── config/
│   └── db.js                   MongoDB connection
├── middleware/
│   ├── auth.js                 JWT Bearer token validation
│   ├── rbac.js                 Role-based access control
│   ├── adminAuth.js            Admin-only gate
│   └── upload.js               Multer + Cloudinary upload middleware
├── models/
│   ├── User.js                 Base user (doctor | patient | laboratory)
│   ├── Doctor.js               Doctor profile + availability slots
│   ├── Patient.js              Patient medical profile
│   ├── Lab.js                  Laboratory (isApproved gate)
│   ├── Appointment.js          Appointment lifecycle
│   ├── ConsultationNote.js     Per-appointment notes (private | shared)
│   ├── ReadEvent.js            Doctor read receipts
│   ├── Notification.js         In-app notification store
│   ├── Prescription.js         Prescriptions
│   ├── LabResult.js            Lab results
│   └── SharedLink.js           Tokenized record sharing
├── routes/
│   ├── auth.js                 POST /register, /login, /google, GET|PATCH /me
│   ├── doctors.js              Doctor search, slots, profile
│   ├── appointments.js         Appointment CRUD + lifecycle
│   ├── notes.js                Consultation notes + read tracking
│   ├── notifications.js        In-app notifications
│   ├── patients.js             Patient profile + notes
│   ├── prescriptions.js        Prescriptions + PDF export
│   ├── labResults.js           Lab results
│   ├── labs.js                 Lab profile management
│   ├── share.js                Tokenized sharing
│   └── admin.js                Admin: lab approval, user management
└── utils/
    ├── jwt.js                  sign / verify helpers
    ├── push.js                 FCM sendPush (silent on failure)
    ├── fcm.js                  FCM utility (legacy alias)
    ├── cloudinary.js           Cloudinary upload helper
    └── googleAuth.js           Google ID token verification
```

## API Reference

Base URL: `/api`

### Auth — `/api/auth`

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/register` | Public | Register (role: doctor / patient / laboratory) |
| `POST` | `/login` | Public | Login → JWT |
| `POST` | `/google` | Public | Google Sign-In → JWT |
| `GET` | `/me` | Auth | Get own profile |
| `PATCH` | `/me` | Auth | Update name / email |
| `PATCH` | `/change-password` | Auth | Change password |
| `POST` | `/me/photo` | Auth | Upload profile photo (Cloudinary) |

### Doctors — `/api/doctors`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/` | Auth | Search doctors (name, specialty, geo) |
| `GET` | `/:id` | Auth | Get doctor profile |
| `PUT` | `/:id` | Doctor | Update own profile |
| `GET` | `/:id/slots` | Auth | Get availability slots |
| `POST` | `/:id/slots` | Doctor | Add availability slot |

### Appointments — `/api/appointments`

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/` | Patient | Book appointment (auto-confirms if doctor has `autoAccept` on) |
| `GET` | `/` | Auth | List own appointments (role-filtered, `?status=`) |
| `GET` | `/:id` | Party | Get single appointment |
| `PATCH` | `/:id/confirm` | Doctor | Confirm pending → notifies patient |
| `PATCH` | `/:id/validate` | Doctor | Validate → compile shared notes → notify patient |
| `PATCH` | `/:id/cancel` | Party | Cancel (blocked once validated) |
| `PATCH` | `/:id/status` | Auth | Generic status update (legacy) |

**Status lifecycle:** `pending → confirmed → in_progress → validated` (terminal) · `cancelled`

### Consultation Notes — `/api/appointments/:id/notes`

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/:id/notes` | Doctor | Add note (`visibility: private \| shared`) |
| `GET` | `/:id/notes` | Party | Doctor sees all · patient sees `shared` only |
| `PATCH` | `/:id/notes/:noteId` | Doctor | Edit note (blocked once validated) |
| `DELETE` | `/:id/notes/:noteId` | Doctor | Delete note (blocked once validated) |
| `POST` | `/:id/read` | Doctor | Mark as read — upserts ReadEvent, notifies patient on first read |

### Notifications — `/api/notifications`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/` | Auth | List notifications + `unreadCount` |
| `PATCH` | `/read-all` | Auth | Mark all as read |
| `PATCH` | `/:id/read` | Auth | Mark one as read |

### Patients — `/api/patients`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/me` | Patient | Get own patient profile |
| `PATCH` | `/me/profile` | Patient | Update blood type, allergies, conditions |
| `PATCH` | `/me/location` | Patient | Update location coordinates |
| `GET` | `/:id` | Auth | Get patient profile |
| `GET` | `/:id/notes` | Auth | Get patient clinical notes |
| `POST` | `/:id/notes` | Doctor | Add clinical note to patient record |

### Prescriptions — `/api/prescriptions`

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/` | Doctor | Create prescription |
| `GET` | `/` | Auth | List (role-filtered) |
| `GET` | `/:id` | Party | Get detail |
| `GET` | `/:id/pdf` | Party | Export as PDF |

### Lab Results — `/api/lab-results`

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/` | Doctor | Upload result |
| `GET` | `/` | Auth | List (role-filtered) |
| `GET` | `/search` | Auth | Search results |
| `GET` | `/:id` | Party | Get single result |
| `PATCH` | `/:id/notes` | Doctor | Annotate result |

### Labs — `/api/labs`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/me` | Laboratory | Get lab profile |
| `PATCH` | `/me` | Laboratory | Update lab profile |

### Share — `/api/share`

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/` | Auth | Create tokenized share link |
| `GET` | `/:token` | Public | View shared record |
| `DELETE` | `/:token` | Auth | Revoke link |

### Admin — `/api/admin`

| Method | Path | Access | Description |
|---|---|---|---|
| `PATCH` | `/labs/:id/approve` | Admin | Approve a lab |
| `GET` | `/users` | Admin | List users |

## Data Models

### User
```
name, email, password (hashed), googleId (sparse), role,
location (2dsphere), fcmToken, photoUrl
```

### Doctor
```
userId, specialty, clinicAddress, availabilitySlots[], ratings,
autoAcceptAppointments
```

### Patient
```
userId, dateOfBirth, bloodType, allergies[], conditions[]
```

### Appointment
```
doctorId, patientId, date, timeSlot{start,end}, status,
initiatedBy, visitType, reason, notes
```
Status enum: `pending | confirmed | in_progress | validated | cancelled | completed`

### ConsultationNote
```
appointmentId, authorId, content (max 5000), visibility (private|shared)
```

### ReadEvent
```
appointmentId, doctorId, readAt
— unique index (appointmentId, doctorId) — one record per doctor per appointment
```

### Notification
```
recipientId, type, payload (Mixed), read
```
Type enum: `appointment_requested | appointment_confirmed | consultation_validated | notes_viewed`

## Security

- All ownership checks are server-side — IDs from request body are never trusted for authorization
- Patients never receive `private` notes — filtered at query level
- `validated` status is terminal — guarded by atomic `findOneAndUpdate`
- `ReadEvent` upserted — patient notified only on first doctor read
- FCM failure is silent — DB notification saved before push attempt
- Google OAuth token verified server-side via `google-auth-library`
- Passwords hashed with bcrypt (12 rounds); Google-only users have no password
