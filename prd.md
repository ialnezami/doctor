

# 📄 Product Requirements Document (PRD)

## 🩺 Product Name (Working Title)

**MediConnect**

---

## 1. 🎯 Purpose

Build a **web + mobile healthcare platform** that allows:

* Doctors to manage patient appointments, notes, and prescriptions
* Patients to book appointments, access medical records, and find nearby doctors

---

## 2. 👥 Target Users

### 👨‍⚕️ Doctors

* General practitioners / specialists
* Clinic owners

### 🧑‍🤝‍🧑 Patients

* Individuals seeking medical consultations
* People managing ongoing treatments

---

## 3. 🚀 Core Features

## 3.1 Doctor Features

* **Authentication**

  * Secure login/signup (JWT, OAuth optional)

* **Dashboard**

  * Daily schedule overview
  * Upcoming appointments

* **Appointment Management**

  * Accept / reject bookings
  * Set availability slots

* **Patient Records**

  * Create and update patient profiles
  * Add medical notes (history, diagnosis)

* **Prescription Management (Ordonnance)**

  * Create digital prescriptions
  * Attach medications, dosage, duration
  * Export as PDF

---

## 3.2 Patient Features

* **Authentication**

  * Signup/login

* **Doctor Search**

  * Search by:

    * Location (GPS-based)
    * Specialty
    * Rating

* **Appointment Booking**

  * View available time slots
  * Book/reschedule/cancel

* **Medical Records Access**

  * View doctor notes
  * View/download prescriptions

* **Profile Management**

  * Personal info
  * Medical history

---

## 3.3 Laboratory Results

* **Lab uploads results** (PDF, image, structured values) and tags them to a patient + requesting doctor
* **Patient can view** all their lab results in Medical Records
* **Doctor can view** lab results for any of their patients
* **Searchable** by test name, date, lab name, or value range
* Lab results are linked to appointments (optional) and prescriptions (optional)
* Notification sent to patient and doctor when results are ready

### Lab Result Data Model

```
LabResult:
  - patientId (ref User)
  - doctorId  (ref User — requesting doctor)
  - appointmentId (optional ref Appointment)
  - labName   (string — e.g. "Al-Hayat Lab")
  - tests     [{ name, value, unit, referenceRange, flag (normal|high|low|critical) }]
  - reportFile (URL — PDF/image stored in Cloudinary/S3)
  - status    (pending | ready)
  - notes     (string — doctor interpretation)
  - issuedAt  (date)
```

### Access Rules

* Patient: read own results only
* Doctor: read results of their patients; add interpretation notes
* Lab (future role): upload results

### Secure Document Sharing via Link

Any lab result or prescription can be shared as a **secure, time-limited, password-protected link**:

* Owner (patient or doctor) generates a share link
* Link contains a **cryptographic hash token** (e.g. 32-byte random hex, not the document ID)
* Optional **password** set by the owner — recipient must enter it to view
* Link has a configurable **expiry** (1h / 24h / 7d / never)
* Recipient opens the link in browser — no login required, just the password if set
* After expiry or manual revocation, link returns 410 Gone

**Share Link Data Model addition to LabResult / Prescription:**

```
SharedLink:
  - resourceType  (lab_result | prescription)
  - resourceId    (ref LabResult | Prescription)
  - ownerId       (ref User — who created the link)
  - token         (string — 32-byte random hex, indexed unique)
  - passwordHash  (string | null — bcrypt hash of optional password)
  - expiresAt     (Date | null)
  - viewCount     (number — how many times accessed)
  - revokedAt     (Date | null)
  - createdAt     (Date)
```

**API:**
```
POST   /api/share              — create link (auth required, owner only)
GET    /api/share/:token       — view document (public, password required if set)
DELETE /api/share/:token       — revoke link (auth required, owner only)
```

---

## 3.4 Admin (Optional - Phase 2)

* Manage users
* Moderate doctors
* Analytics dashboard

---

## 4. 🌍 Platforms

* 📱 Mobile App: **React Native (iOS + Android)**
* 💻 Web App: **React.js (Doctor dashboard + Admin)**

---

## 5. 🏗️ Technical Architecture

### Frontend

* React Native (mobile)
* React.js (web)
* State Management: Redux / Zustand
* UI: Tailwind / Material UI

### Backend

* Node.js + Express.js
* REST API (or GraphQL optional)

### Database

* MongoDB (NoSQL)

### Key Services

* Authentication: JWT
* File storage: AWS S3 / Cloudinary
* Notifications: Firebase Cloud Messaging (FCM)
* Maps & Location: Google Maps API

---

## 6. 📊 Data Models (Simplified)

### User

```
- _id
- name
- email
- password
- role (doctor/patient)
- location
```

### Doctor

```
- userId
- specialty
- clinicAddress
- availabilitySlots
- ratings
```

### Patient

```
- userId
- medicalHistory
```

### Appointment

```
- doctorId
- patientId
- date
- status
- notes
```

### Prescription

```
- doctorId
- patientId
- medications[]
- instructions
- createdAt
```

---

## 7. 🔐 Security & Compliance

* Encrypt sensitive data
* HTTPS everywhere
* Role-based access control
* Consider compliance with:

  * HIPAA (if in US)
  * GDPR (if in EU)

---

## 8. 🔄 User Flow

### Patient Flow

1. Sign up
2. Search doctor
3. View profile
4. Book appointment
5. Receive confirmation
6. View prescription

### Doctor Flow

1. Login
2. Manage schedule
3. View appointments
4. Add notes
5. Issue prescription

---

## 9. 📈 MVP Scope (Phase 1)

Focus on:

* Authentication
* Doctor search (location-based)
* Appointment booking
* Basic patient records
* Prescription creation

---

## 10. 🚧 Future Enhancements

* Video consultation (Telemedicine)
* AI-based symptom checker
* Payment integration (Stripe)
* Reviews & ratings
* Wearable device integration

---

## 11. ⚠️ Risks & Challenges

* Data privacy concerns
* Real-time synchronization
* Doctor availability conflicts
* Scalability of search (geo queries in MongoDB)

---

## 12. 📅 Suggested Timeline

* Week 1–2: Design & architecture
* Week 3–6: Backend API
* Week 5–8: Mobile app
* Week 7–9: Web dashboard
* Week 10: Testing & launch MVP

---

## 13. 🧪 Success Metrics

* Number of registered users
* Appointment completion rate
* Daily active users (DAU)
* Doctor retention

