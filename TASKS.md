# MediConnect — Task Board

**Legend:** `⬜ Todo` · `🔄 In Progress` · `✅ Done` · `🚫 Blocked`

Agent names map to roles defined in `AGENTS.md`.

---

## Phase 1 — Foundation

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| F-01 | Initialize monorepo structure (`apps/web`, `apps/mobile`, `apps/api`) | DevOps | ✅ Done | |
| F-02 | Set up GitHub Actions CI pipeline | DevOps | ✅ Done | Lint + test on PR |
| F-03 | Configure Docker Compose for local dev (API + MongoDB) | DevOps | ✅ Done | |
| F-04 | Design token system & component library spec | UX/UI Designer | ✅ Done | See `design/prototype.html` |
| F-05 | Define MongoDB schemas: User, Doctor, Patient, Appointment, Prescription | Backend | ✅ Done | See `CLAUDE.md` for model specs |

---

## Phase 2 — Backend API

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| B-01 | Auth routes: `POST /auth/register`, `POST /auth/login` (JWT) | Backend | ✅ Done | Roles: doctor, patient |
| B-02 | Doctor profile CRUD: `GET/PUT /doctors/:id` | Backend | ✅ Done | |
| B-03 | Doctor availability slots: `GET/POST /doctors/:id/slots` | Backend | ✅ Done | Conflict prevention required |
| B-04 | Geo search: `GET /doctors?lat=&lng=&radius=` | Backend | ✅ Done | 2dsphere index on User.location |
| B-05 | Appointment booking: `POST /appointments` | Backend | ✅ Done | Atomic double-booking check |
| B-06 | Appointment status flow: accept / reject / cancel / complete | Backend | ✅ Done | |
| B-07 | Patient records: `GET/POST /patients/:id/notes` | Backend | ✅ Done | Doctor-only write access |
| B-08 | Prescription CRUD: `POST /prescriptions`, `GET /prescriptions/:id/pdf` | Backend | ✅ Done | PDF generation endpoint |
| B-09 | File upload to Cloudinary (profile photos) | Backend | ⬜ Todo | |
| B-10 | FCM push notification on appointment status change | Backend | ⬜ Todo | |

---

## Phase 3 — Web App (React.js)

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| W-01 | Auth screens: Login, Register with role toggle | Frontend Web | ✅ Done | Matches `design/prototype.html` auth screen |
| W-02 | Doctor Dashboard screen | Frontend Web | ✅ Done | Stats, today's schedule, mini calendar |
| W-03 | Appointments management screen (accept/reject/filter) | Frontend Web | ✅ Done | |
| W-04 | Patient Records screen + detail panel | Frontend Web | ✅ Done | Timeline, vitals, history |
| W-05 | Prescription builder form + PDF export | Frontend Web | ✅ Done | |
| W-06 | JWT auth integration (Axios interceptors) | Frontend Web | ✅ Done | Depends on B-01 |
| W-07 | Global state management setup (Zustand) | Frontend Web | ✅ Done | |

---

## Phase 4 — Mobile App (React Native)

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| M-01 | Auth screens: Login, Register (Patient / Doctor) | Frontend Mobile | ✅ Done | |
| M-02 | Patient: Find Doctor screen with GPS + filters | Frontend Mobile | ✅ Done | Static location for now |
| M-03 | Patient: Doctor profile + booking flow | Frontend Mobile | ⬜ Todo | Time slot picker |
| M-04 | Patient: My Appointments screen | Frontend Mobile | ✅ Done | |
| M-05 | Patient: Medical Records + prescription PDF view | Frontend Mobile | ✅ Done | |
| M-06 | Doctor: Dashboard + today's schedule | Frontend Mobile | ✅ Done | |
| M-07 | Doctor: Accept/reject appointments | Frontend Mobile | ✅ Done | |
| M-08 | FCM push notification integration (client-side) | Frontend Mobile | ⬜ Todo | Depends on B-10 |

---

## Phase 5 — UX/UI Design

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| D-01 | Interactive prototype — web screens | UX/UI Designer | ✅ Done | `design/prototype.html` — all 8 screens |
| D-02 | Mobile screen designs (patient + doctor flows) | UX/UI Designer | ⬜ Todo | React Native component specs |
| D-03 | Onboarding flow design | UX/UI Designer | ⬜ Todo | First-time user experience |
| D-04 | Error states & empty state illustrations | UX/UI Designer | ⬜ Todo | |
| D-05 | Prescription PDF template design | UX/UI Designer | ⬜ Todo | Printable layout |

---

## Phase 6 — Laboratory Feature

| ID | Task | Agent | Status | Notes |
|----|------|-------|--------|-------|
| L-01 | `LabResult` Mongoose model (tests[], flag, reportFile, status) | Backend | ⬜ Todo | See PRD §3.3 for schema |
| L-02 | `POST /api/lab-results` — upload result (doctor/lab) | Backend | ⬜ Todo | Cloudinary for report PDF/image |
| L-03 | `GET /api/lab-results` — list for current user (patient: own, doctor: patients') | Backend | ⬜ Todo | RBAC enforced |
| L-04 | `GET /api/lab-results/:id` — full result detail | Backend | ⬜ Todo | |
| L-05 | `PATCH /api/lab-results/:id/notes` — doctor adds interpretation | Backend | ⬜ Todo | Doctor-only |
| L-06 | `GET /api/lab-results/search?q=&patientId=&from=&to=` — search by test name/date | Backend | ⬜ Todo | Text index on tests.name + labName |
| L-07 | Web: Lab Results page (doctor view — patient's results + add notes) | Frontend Web | ⬜ Todo | Searchable list + detail panel |
| L-08 | Web: Lab Results tab in patient Medical Records | Frontend Web | ⬜ Todo | Download PDF button |
| L-09 | Mobile: Lab Results screen (patient view) | Frontend Mobile | ⬜ Todo | Flag indicators (normal/high/low/critical) |
| L-10 | Mobile: Lab Results screen (doctor view) | Frontend Mobile | ⬜ Todo | |
| L-11 | UX: Lab result detail design (flag colors, test table, PDF viewer) | UX/UI Designer | ⬜ Todo | Flag: mint=normal, rose=critical, amber=high/low |
| L-12 | Notification on result ready (patient + doctor) | Backend | ⬜ Todo | Depends on B-10 (FCM) |
| L-13 | `SharedLink` model (token, passwordHash, expiresAt, resourceType, viewCount, revokedAt) | Backend | ⬜ Todo | 32-byte random hex token, unique index |
| L-14 | `POST /api/share` — create secure link with optional password + expiry | Backend | ⬜ Todo | bcrypt hash password; owner-only |
| L-15 | `GET /api/share/:token` — public viewer (no auth, password gate if set) | Backend | ⬜ Todo | Check expiry + revocation; increment viewCount |
| L-16 | `DELETE /api/share/:token` — revoke link | Backend | ⬜ Todo | Owner-only; sets revokedAt |
| L-17 | Web: Share button on lab result + prescription — modal with link, password field, expiry picker | Frontend Web | ⬜ Todo | Copy-to-clipboard; show viewCount |
| L-18 | Public share page `/s/:token` — password entry → document view (no login needed) | Frontend Web | ⬜ Todo | Works for both lab results and prescriptions |
| L-19 | Mobile: Share sheet for lab result / prescription (copy link + set password) | Frontend Mobile | ⬜ Todo | |
| L-20 | UX: Share modal design + public viewer page design | UX/UI Designer | ⬜ Todo | Minimalist, trust-signaling (lock icon, expiry countdown) |

---

## Blocked / Deferred

| ID | Task | Agent | Status | Blocker |
|----|------|-------|--------|---------|
| — | Video consultation (Telemedicine) | — | 🚫 Blocked | Phase 2+ feature |
| — | Payment integration (Stripe) | — | 🚫 Blocked | Phase 2+ feature |
| — | Admin panel | — | 🚫 Blocked | Phase 2+ feature |

---

## How to Update This File

When you start a task:
```
⬜ Todo → 🔄 In Progress   (add your agent name)
```

When you finish:
```
🔄 In Progress → ✅ Done   (verify work is in codebase/design folder)
```

Never mark ✅ Done without the output being verifiable.
