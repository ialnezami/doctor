# MediConnect — Agent Roles

This file defines the specialized agents for the MediConnect project.
Each agent owns specific responsibilities and must mark their tasks complete in `TASKS.md`.

---

## Agent Roster

### 🎨 UX/UI Designer
**Role:** Design system, wireframes, user flows, component specifications  
**Owns:** `design/`, component library, accessibility, design tokens  
**Stack:** Figma specs → HTML/CSS prototypes, design system documentation  
**Mandate:**
- All new screens must have a prototype in `design/` before development starts
- Maintain visual consistency: dark clinical theme (see `design/prototype.html`)
- Fonts: Cormorant Garamond (display) + Outfit (body) + JetBrains Mono (data)
- Color tokens: `--mint #0fe3b0`, `--amber #f59e0b`, `--rose #f43f5e`, `--blue #60a5fa`

---

### 💻 Frontend Web Developer
**Role:** React.js web app (doctor dashboard + admin panel)  
**Owns:** `apps/web/`  
**Stack:** React.js, Zustand/Redux, Tailwind CSS or MUI, React Router  
**Mandate:**
- Implement screens from `design/prototype.html`
- Doctor dashboard, appointment management, patient records, prescription builder
- JWT auth integration with backend API
- PDF export for prescriptions (use `react-pdf` or `pdfmake`)

---

### 📱 Frontend Mobile Developer
**Role:** React Native app (patient + doctor mobile flows)  
**Owns:** `apps/mobile/`  
**Stack:** React Native, Expo, React Navigation, Zustand  
**Mandate:**
- Patient app: doctor search (GPS), booking, medical records, prescription view
- Doctor app: schedule overview, appointment accept/reject, notes
- FCM push notifications for appointment confirmations

---

### ⚙️ Backend Developer
**Role:** Node.js REST API, database, business logic  
**Owns:** `apps/api/`  
**Stack:** Node.js, Express.js, MongoDB (Mongoose), JWT  
**Mandate:**
- All routes must enforce RBAC (doctor / patient / admin roles)
- MongoDB 2dsphere index on `User.location` for geo queries
- Prevent double-booking at the database layer (atomic check + reserve)
- Prescription model must support PDF generation metadata

---

### 🏗️ DevOps Engineer
**Role:** Infrastructure, CI/CD, deployment, environment configuration  
**Owns:** `docker/`, `.github/workflows/`, deployment configs  
**Stack:** Docker, GitHub Actions, AWS S3 (file storage), Cloudinary (images)  
**Mandate:**
- Separate environments: `dev`, `staging`, `production`
- Secrets via environment variables only — never hardcoded
- S3 / Cloudinary for prescription PDFs and profile images
- FCM credentials managed via env, not repo

---

## Agent Protocol

1. **Pick a task** from `TASKS.md` that matches your role
2. **Set status** to `🔄 In Progress` and add your agent name
3. **Complete the work** — commit code, update docs
4. **Mark done** — change status to `✅ Done` in `TASKS.md`
5. **Never close a task** without the work being verifiable in the codebase
