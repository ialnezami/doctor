# MediConnect Web

React.js web dashboard for the MediConnect healthcare platform — doctor dashboard and patient portal.

## Stack

- **Framework** — React 18
- **Build tool** — Vite 5
- **Routing** — React Router 6
- **State** — Zustand
- **HTTP** — Axios
- **i18n** — i18next (Arabic default, English, French)
- **Auth** — JWT + Google Sign-In (Google Identity Services)

## Setup

```bash
npm install
npm run dev
```

Runs on `http://localhost:5173`.

## Environment

Create a `.env` file:

```env
VITE_API_URL=http://localhost:3000/api
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

The API client reads `VITE_API_URL` from `src/api/client.js` (falls back to `http://localhost:3000/api`).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |

## Project Structure

```
src/
├── api/
│   ├── client.js           Axios instance with JWT interceptor
│   ├── auth.js             Login, register, Google sign-in, profile, password
│   ├── appointments.js     Appointments + status updates
│   ├── doctors.js          Doctor search + slots
│   ├── patients.js         Patient profile
│   ├── prescriptions.js    Prescriptions + PDF export
│   └── labResults.js       Lab results
├── components/
│   ├── GoogleSignInButton.jsx    Google GSI button component
│   ├── LanguageSwitcher.jsx      AR / EN / FR switcher
│   ├── layout/
│   │   ├── AppLayout.jsx         Sidebar + content wrapper
│   │   └── Sidebar.jsx           Role-aware nav links
│   └── ui/
│       ├── Button.jsx
│       ├── Card.jsx
│       └── StatusChip.jsx
├── i18n/
│   ├── index.js            i18next setup
│   ├── ar.json             Arabic translations
│   ├── en.json             English translations
│   └── fr.json             French translations
├── pages/
│   ├── auth/
│   │   ├── LoginPage.jsx         Email/password + Google Sign-In
│   │   └── RegisterPage.jsx      Role selection (doctor / patient / lab)
│   ├── doctor/
│   │   ├── DashboardPage.jsx
│   │   ├── AppointmentsPage.jsx
│   │   ├── PatientRecordsPage.jsx
│   │   ├── PrescriptionsPage.jsx  Printable prescription template
│   │   ├── LabResultsPage.jsx
│   │   └── DoctorSettingsPage.jsx Auto-accept toggle, availability editor
│   ├── patient/
│   │   ├── FindDoctorPage.jsx     Debounced search + slot picker
│   │   ├── DoctorProfilePage.jsx  Doctor info + date strip + slot picker
│   │   ├── BookAppointmentPage.jsx
│   │   ├── BookConfirmedPage.jsx
│   │   ├── MyAppointmentsPage.jsx
│   │   └── MedicalRecordsPage.jsx  Live health profile
│   ├── lab/
│   │   └── LabDashboardPage.jsx   Upload form + approval gate
│   └── public/
│       └── ShareViewerPage.jsx    Token-based record viewer, expiry countdown
├── router/
│   └── index.jsx           Route definitions — role-based guards
├── store/
│   └── authStore.js        Zustand — user, token, login, logout
└── main.jsx                App entry point, i18n init
```

## Pages by Role

### Doctor
| Page | Path | Description |
|---|---|---|
| Dashboard | `/doctor` | Overview |
| Appointments | `/doctor/appointments` | Manage appointments |
| Patient Records | `/doctor/patients` | Patient history and notes |
| Prescriptions | `/doctor/prescriptions` | Create + print prescriptions |
| Lab Results | `/doctor/lab-results` | View and annotate results |
| Settings | `/doctor/settings` | Auto-accept toggle, availability slots |

### Patient
| Page | Path | Description |
|---|---|---|
| Find Doctor | `/patient/find-doctor` | Debounced search + specialty filter |
| Doctor Profile | `/patient/doctors/:id` | Doctor info + date strip + slot picker |
| Book Appointment | `/patient/book` | Confirm booking |
| Book Confirmed | `/patient/book/confirmed` | Success screen |
| My Appointments | `/patient/appointments` | Appointment list |
| Medical Records | `/patient/records` | Health history + live health profile |

### Lab
| Page | Path | Description |
|---|---|---|
| Lab Dashboard | `/lab` | Upload results, approval gate message if not approved |

### Public
| Page | Path | Description |
|---|---|---|
| Share Viewer | `/share/:token` | View shared record without login, shows expiry countdown + lock icon |

### Auth
| Page | Path | Description |
|---|---|---|
| Login | `/login` | Email/password + Google Sign-In button |
| Register | `/register` | Name, email, password, role selection |

## Google Sign-In

The web app uses Google Identity Services (GSI) loaded via a script tag in `index.html`. The `GoogleSignInButton` component renders the standard Google button and calls `POST /api/auth/google` with the returned `id_token`.

## i18n

The web app ships with Arabic (RTL), English, and French. Language can be switched at runtime using the `LanguageSwitcher` component in the sidebar. Preference is stored in `localStorage`.

```js
import i18n from '../i18n';
i18n.changeLanguage('ar'); // 'ar' | 'en' | 'fr'
```

## Building for Production

```bash
npm run build
# Output in dist/ — serve as static files
```

For Railway deployment, the build output in `dist/` is served as static files. See the CI/CD configuration in `.github/workflows/`.
