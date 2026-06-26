# MediConnect Mobile

React Native mobile app for the MediConnect healthcare platform — iOS and Android.

## Stack

- **Framework** — React Native 0.81, Expo SDK 54
- **Navigation** — React Navigation 7 (Stack + Bottom Tabs)
- **State** — Zustand
- **HTTP** — Axios
- **i18n** — i18next (Arabic default, English, French)
- **Auth** — JWT + Google Sign-In (`expo-auth-session`)
- **Location** — `expo-location`
- **Fonts** — Outfit (Google Fonts via `@expo-google-fonts/outfit`)

## Setup

```bash
npm install
npx expo start
```

Press `i` for iOS simulator, `a` for Android, or scan the QR code with Expo Go.

### Tunnel mode (for physical device on different network)

```bash
npx expo start --tunnel
```

## Environment

Set your API URL in `src/constants/colors.js`:

```js
API_URL: 'http://YOUR_LOCAL_IP:3000/api'
```

Or set `EXPO_PUBLIC_API_URL` in a `.env` file at the app root.

For Google Sign-In, set in `app.json`:
```json
{
  "expo": {
    "extra": {
      "googleClientId": "YOUR_EXPO_CLIENT_ID",
      "googleIosClientId": "YOUR_IOS_CLIENT_ID"
    }
  }
}
```

## Project Structure

```
src/
├── api/
│   ├── client.js           Axios instance with JWT interceptor
│   ├── auth.js             Login, register, Google sign-in, profile
│   ├── appointments.js     Appointments + notes + read tracking
│   ├── notifications.js    In-app notifications
│   ├── doctors.js          Doctor search + slots
│   ├── patients.js         Patient profile
│   ├── prescriptions.js    Prescriptions
│   ├── labResults.js       Lab results
│   └── labs.js             Lab profile
├── components/
│   ├── AccountSection.js   Shared account management section
│   └── ErrorState.js       Reusable empty/error screen component
├── constants/
│   └── colors.js           Design tokens + API_URL
├── hooks/
│   └── useGoogleSignIn.js  Google Sign-In hook (expo-auth-session)
├── i18n/
│   ├── index.js            i18next setup
│   ├── ar.json             Arabic translations
│   ├── en.json             English translations
│   └── fr.json             French translations
├── navigation/
│   ├── AppNavigator.js     Root navigator — auth gate by role
│   ├── DoctorTabs.js       Doctor tab bar + detail screen stack
│   ├── PatientTabs.js      Patient tab bar + consultation summary stack
│   ├── PatientStack.js     Find Doctor → Doctor Profile → Book → Confirmed
│   └── LabTabs.js          Lab tab bar
├── screens/
│   ├── Onboarding.js       3-step onboarding (shown once via AsyncStorage)
│   ├── auth/
│   │   ├── LoginScreen.js
│   │   └── RegisterScreen.js
│   ├── doctor/
│   │   ├── DashboardScreen.js
│   │   ├── AppointmentsScreen.js       List + pending approval queue
│   │   ├── AppointmentDetailScreen.js  Notes list, confirm, validate
│   │   ├── NoteEditorScreen.js         Write/edit note with private/shared toggle
│   │   ├── LabResultsScreen.js
│   │   └── SettingsScreen.js           Auto-accept toggle, availability
│   ├── patient/
│   │   ├── FindDoctorScreen.js         Geo-search with specialty filter chips
│   │   ├── DoctorProfileScreen.js      Doctor info + date strip + slot picker
│   │   ├── BookAppointmentScreen.js    Confirm booking details
│   │   ├── BookConfirmedScreen.js      Success confirmation
│   │   ├── MyAppointmentsScreen.js     Status filter chips, tap to open
│   │   ├── ConsultationSummaryScreen.js Shared notes after validation
│   │   ├── MedicalRecordsScreen.js
│   │   ├── LabResultsScreen.js         Flag color badges
│   │   └── ProfileScreen.js            Account + medical profile sections
│   ├── lab/
│   │   ├── LabUploadsScreen.js
│   │   └── ProfileScreen.js
│   └── shared/
│       └── NotificationsScreen.js      Unread count, mark-all-read
└── store/
    ├── authStore.js        Zustand — user, token, login, logout, updateUser
    └── langStore.js        Zustand — current language, switcher
```

## Navigation Structure

```
AppNavigator (Stack)
├── Onboarding              shown once on first launch
├── Login / Register        unauthenticated
├── DoctorTabs (Stack)
│   ├── DoctorHome (Tabs)
│   │   ├── Dashboard
│   │   ├── Appointments
│   │   ├── Lab Results
│   │   ├── Notifications
│   │   └── Settings
│   ├── AppointmentDetail   pushed from Appointments tab
│   └── NoteEditor          pushed from AppointmentDetail
├── PatientTabs (Stack)
│   ├── PatientHome (Tabs)
│   │   ├── Find Doctor → PatientStack
│   │   │   ├── FindDoctor
│   │   │   ├── DoctorProfile
│   │   │   ├── BookAppointment
│   │   │   └── BookConfirmed
│   │   ├── Appointments
│   │   ├── Records
│   │   ├── Notifications
│   │   └── Profile
│   └── ConsultationSummary  pushed from Appointments tab
└── LabTabs (Tabs)
    ├── Uploads
    └── Profile
```

## Screens by Role

### Doctor
| Screen | Description |
|---|---|
| Dashboard | Overview |
| Appointments | Full list with pending approval queue; tap to open detail |
| AppointmentDetail | Appointment info, all notes (private/shared badges), confirm + validate actions |
| NoteEditor | Write/edit note with private/shared toggle and 5000-char counter |
| Lab Results | View and annotate lab results |
| Settings | Auto-accept toggle, availability editor, account section |
| Notifications | In-app notifications with unread badge and mark-all-read |

### Patient
| Screen | Description |
|---|---|
| Find Doctor | Geo-search with debounced name search and specialty filter chips |
| Doctor Profile | Doctor info, date strip, slot picker |
| Book Appointment | Confirm booking details |
| Book Confirmed | Success screen with appointment summary |
| My Appointments | Status filter chips; validated appointments link to consultation summary |
| Consultation Summary | Shared notes compiled after doctor validates |
| Medical Records | Patient health history |
| Lab Results | Own lab results with abnormal value flags |
| Profile | Account management + medical profile (blood type, allergies, conditions) |
| Notifications | In-app notifications |

### Lab
| Screen | Description |
|---|---|
| Lab Uploads | Upload and manage lab results |
| Profile | Account + lab info |

## i18n

The app ships with three languages, with Arabic as the default.

```js
// Change language programmatically
import { changeLanguage } from '../i18n';
changeLanguage('ar'); // 'ar' | 'en' | 'fr'
```

RTL layout is handled automatically by React Native when Arabic is active.

Language preference is persisted via Zustand (`langStore`).

## Design Tokens (`src/constants/colors.js`)

```js
bg, bg2, bg3, card       // backgrounds
border, border2           // borders
mint, mintDim             // primary accent
amber, rose, blue         // status colors
text, text2, text3        // typography
API_URL                   // base API URL
```
