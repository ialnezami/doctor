# Critical / High / Medium Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement remaining critical features (Cloudinary upload, FCM notifications), fix the hardcoded mobile API URL, and build high/medium UX polish (lab result flags, onboarding, error states, share modal, PDF template).

**Architecture:** Backend-first for services (Cloudinary, FCM), then wire into existing routes. Mobile API URL made dynamic via `Constants.expoConfig`. All UX tasks are self-contained screen/component additions. No new libraries beyond `multer`, `cloudinary`, `firebase-admin`.

**Tech Stack:** Node.js + Express + Mongoose (API), React + Vite (web), React Native + Expo SDK 54 (mobile), Cloudinary SDK, Firebase Admin SDK.

---

## File Map

**Create:**
- `apps/api/src/utils/cloudinary.js` — Cloudinary client + upload helper
- `apps/api/src/middleware/upload.js` — multer memoryStorage middleware
- `apps/mobile/src/screens/Onboarding.js` — 3-step onboarding flow
- `apps/mobile/src/components/ErrorState.js` — reusable empty/error component

**Modify:**
- `apps/api/src/routes/auth.js` — add profile photo upload on register (optional)
- `apps/api/src/routes/doctors.js` — `PATCH /doctors/:id/photo` endpoint
- `apps/api/src/routes/patients.js` — `PATCH /patients/me/photo` endpoint
- `apps/api/src/models/Doctor.js` — add `photoUrl` field
- `apps/api/src/models/Patient.js` — add `photoUrl` field
- `apps/api/src/index.js` — mount FCM notification service + Cloudinary import
- `apps/api/src/routes/appointments.js` — send FCM on status change
- `apps/mobile/src/constants/colors.js` — make API_URL dynamic
- `apps/mobile/src/navigation/AppNavigator.js` — add onboarding gate
- `apps/mobile/src/screens/patient/LabResultsScreen.js` — add flag colors + test table
- `apps/web/src/pages/doctor/LabResultsPage.jsx` — add flag colors + test table
- `apps/web/src/pages/patient/BookConfirmedPage.jsx` — add empty state
- `apps/web/src/pages/public/ShareViewerPage.jsx` — redesign with lock icon + countdown

---

## Task 1: Fix mobile API URL (Config — hardcoded IP)

**Files:**
- Modify: `apps/mobile/src/constants/colors.js`
- Modify: `apps/mobile/src/api/client.js`

- [ ] **Step 1: Install expo-constants**

```bash
cd /Users/ibrahimalnezami/Desktop/doctor && npm install expo-constants --legacy-peer-deps
```

- [ ] **Step 2: Update colors.js to remove hardcoded IP**

In `apps/mobile/src/constants/colors.js`, remove the `API_URL` line entirely (we'll set it in client.js).

Current line to remove:
```js
API_URL: 'http://192.168.57.245:3001/api',
```

- [ ] **Step 3: Update client.js to use dynamic URL**

Replace `apps/mobile/src/api/client.js` entirely:
```js
import axios from 'axios';
import Constants from 'expo-constants';
import useAuthStore from '../store/authStore';

// In Expo Go: hostUri is the LAN address of the dev machine (e.g. "192.168.x.x:8081")
// We swap the port to 3001 for the API. In production set EXPO_PUBLIC_API_URL.
function getBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:3001/api`;
}

const client = axios.create({ baseURL: getBaseUrl() });

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (r) => r.data,
  (err) => {
    if (err.response?.status === 401) useAuthStore.getState().logout();
    return Promise.reject(err.response?.data || err);
  }
);

export default client;
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/api/client.js apps/mobile/src/constants/colors.js package-lock.json
git commit -m "fix(mobile): make API URL dynamic via expo hostUri instead of hardcoded IP"
```

---

## Task 2: Cloudinary setup + upload middleware (B-09)

**Files:**
- Create: `apps/api/src/utils/cloudinary.js`
- Create: `apps/api/src/middleware/upload.js`

**Prereq:** Set in `apps/api/.env`:
```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
```

- [ ] **Step 1: Install packages**

```bash
cd /Users/ibrahimalnezami/Desktop/doctor && npm install cloudinary multer --workspace=@mediconnect/api --legacy-peer-deps
```

- [ ] **Step 2: Create `apps/api/src/utils/cloudinary.js`**

```js
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', transformation: [{ width: 400, height: 400, crop: 'fill' }] },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    );
    stream.end(buffer);
  });
}

module.exports = { uploadBuffer };
```

- [ ] **Step 3: Create `apps/api/src/middleware/upload.js`**

```js
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

module.exports = upload;
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/utils/cloudinary.js apps/api/src/middleware/upload.js package-lock.json apps/api/package.json
git commit -m "feat(api): add Cloudinary upload utility and multer middleware"
```

---

## Task 3: Profile photo endpoints (B-09 continued)

**Files:**
- Modify: `apps/api/src/models/Doctor.js` — add `photoUrl`
- Modify: `apps/api/src/models/Patient.js` — add `photoUrl`
- Modify: `apps/api/src/routes/doctors.js` — add photo upload endpoint
- Modify: `apps/api/src/routes/patients.js` — add photo upload endpoint

- [ ] **Step 1: Add `photoUrl` to Doctor model**

In `apps/api/src/models/Doctor.js`, add inside the schema object:
```js
photoUrl: { type: String, default: '' },
```

- [ ] **Step 2: Add `photoUrl` to Patient model**

In `apps/api/src/models/Patient.js`, add inside the schema object:
```js
photoUrl: { type: String, default: '' },
```

- [ ] **Step 3: Add photo upload endpoint to doctors.js**

Add at top of `apps/api/src/routes/doctors.js`:
```js
const upload = require('../middleware/upload');
const { uploadBuffer } = require('../utils/cloudinary');
```

Add after the existing `PATCH /:id/settings` route:
```js
// PATCH /api/doctors/:id/photo — upload profile photo
router.patch('/:id/photo', auth, requireRole('doctor'), upload.single('photo'), async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Not found' });
    if (doctor.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
    if (!req.file) return res.status(422).json({ message: 'photo file required' });

    const photoUrl = await uploadBuffer(req.file.buffer, 'mediconnect/doctors');
    doctor.photoUrl = photoUrl;
    await doctor.save();
    res.json({ photoUrl });
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Add photo upload endpoint to patients.js**

Add at top of `apps/api/src/routes/patients.js`:
```js
const upload = require('../middleware/upload');
const { uploadBuffer } = require('../utils/cloudinary');
```

Add after the existing `PATCH /me/location` route:
```js
// PATCH /api/patients/me/photo
router.patch('/me/photo', auth, requireRole('patient'), upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(422).json({ message: 'photo file required' });
    const photoUrl = await uploadBuffer(req.file.buffer, 'mediconnect/patients');
    const patient = await Patient.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { photoUrl } },
      { new: true }
    );
    res.json({ photoUrl });
  } catch (err) { next(err); }
});
```

- [ ] **Step 5: Syntax check**

```bash
node --check apps/api/src/routes/doctors.js
node --check apps/api/src/routes/patients.js
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/models/Doctor.js apps/api/src/models/Patient.js apps/api/src/routes/doctors.js apps/api/src/routes/patients.js
git commit -m "feat(api): add profile photo upload endpoints via Cloudinary (B-09)"
```

---

## Task 4: FCM push notifications (B-10)

**Files:**
- Create: `apps/api/src/utils/fcm.js`
- Modify: `apps/api/src/routes/appointments.js`

**Prereq:** Set in `apps/api/.env`:
```
FCM_SERVER_KEY=your_firebase_server_key
```

- [ ] **Step 1: Install firebase-admin**

```bash
npm install firebase-admin --workspace=@mediconnect/api --legacy-peer-deps
```

- [ ] **Step 2: Create `apps/api/src/utils/fcm.js`**

```js
const admin = require('firebase-admin');

if (!admin.apps.length && process.env.FCM_SERVER_KEY) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FCM_SERVER_KEY)),
  });
}

async function sendPush(token, title, body, data = {}) {
  if (!token || !admin.apps.length) return;
  try {
    await admin.messaging().send({ token, notification: { title, body }, data });
  } catch (err) {
    console.error('[FCM] send failed:', err.message);
  }
}

module.exports = { sendPush };
```

- [ ] **Step 3: Add FCM trigger to appointment status changes**

In `apps/api/src/routes/appointments.js`, add at top:
```js
const { sendPush } = require('../utils/fcm');
const User = require('../models/User');
```

Find the `PATCH /appointments/:id/status` route (or equivalent status-change handler). After the appointment is saved, add:

```js
// Notify the other party
const isDoctor = req.user.role === 'doctor';
const notifyUserId = isDoctor ? appt.patientId : appt.doctorId;
const notifyUser = await User.findById(notifyUserId).select('fcmToken name');
const messages = {
  confirmed: { title: 'Appointment Confirmed ✅', body: 'Your appointment has been confirmed.' },
  rejected:  { title: 'Appointment Rejected', body: 'Your appointment request was not accepted.' },
  cancelled: { title: 'Appointment Cancelled', body: 'An appointment has been cancelled.' },
  completed: { title: 'Appointment Completed', body: 'Your appointment is marked complete.' },
};
const msg = messages[appt.status];
if (msg && notifyUser?.fcmToken) {
  await sendPush(notifyUser.fcmToken, msg.title, msg.body, { appointmentId: appt._id.toString() });
}
```

- [ ] **Step 4: Add `fcmToken` field to User model**

In `apps/api/src/models/User.js`, add to schema:
```js
fcmToken: { type: String, default: '' },
```

Add an endpoint in `apps/api/src/routes/auth.js` (or a new route) to save the FCM token after login:

In `apps/api/src/routes/auth.js`, add after the login route:
```js
// PATCH /api/auth/fcm-token — save device token
router.patch('/fcm-token', auth, async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(422).json({ message: 'fcmToken required' });
    await User.findByIdAndUpdate(req.user.id, { fcmToken });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

Also add `auth` require at top if not present:
```js
const { auth } = require('../middleware/rbac');
```

- [ ] **Step 5: Syntax check**

```bash
node --check apps/api/src/utils/fcm.js
node --check apps/api/src/routes/appointments.js
node --check apps/api/src/models/User.js
node --check apps/api/src/routes/auth.js
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/utils/fcm.js apps/api/src/routes/appointments.js apps/api/src/models/User.js apps/api/src/routes/auth.js apps/api/package.json package-lock.json
git commit -m "feat(api): add FCM push notifications on appointment status change (B-10)"
```

---

## Task 5: Lab result flag colors — Web (L-11)

**Files:**
- Modify: `apps/web/src/pages/doctor/LabResultsPage.jsx`
- Modify: `apps/web/src/pages/patient/MedicalRecordsPage.jsx` (Lab tab)

- [ ] **Step 1: Add flag color helper**

In `apps/web/src/pages/doctor/LabResultsPage.jsx`, add near the top (after imports):
```js
const FLAG_COLORS = {
  normal:   { bg: 'rgba(15,227,176,0.12)', text: '#0fe3b0', label: 'Normal' },
  high:     { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', label: 'High' },
  low:      { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', label: 'Low' },
  critical: { bg: 'rgba(244,63,94,0.15)',  text: '#f43f5e', label: 'Critical' },
};
function FlagBadge({ flag }) {
  const c = FLAG_COLORS[flag] || FLAG_COLORS.normal;
  return <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10 }}>{c.label}</span>;
}
```

- [ ] **Step 2: Add test table to the result detail view**

In the lab result detail/expansion section of `LabResultsPage.jsx`, replace any plain text test rendering with:
```jsx
{result.tests?.length > 0 && (
  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 12 }}>
    <thead>
      <tr style={{ borderBottom: '1px solid var(--border)' }}>
        {['Test', 'Value', 'Unit', 'Ref Range', 'Flag'].map(h => (
          <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text3)', fontWeight: 600 }}>{h}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {result.tests.map((t, i) => (
        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
          <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{t.name}</td>
          <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--text)' }}>{t.value}</td>
          <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{t.unit || '—'}</td>
          <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{t.referenceRange || '—'}</td>
          <td style={{ padding: '6px 8px' }}><FlagBadge flag={t.flag} /></td>
        </tr>
      ))}
    </tbody>
  </table>
)}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/doctor/LabResultsPage.jsx
git commit -m "feat(web): add flag color badges and test table to lab result detail (L-11)"
```

---

## Task 6: Lab result flag colors — Mobile (L-11 continued)

**Files:**
- Modify: `apps/mobile/src/screens/patient/LabResultsScreen.js`
- Modify: `apps/mobile/src/screens/doctor/LabResultsScreen.js`

- [ ] **Step 1: Add flag color helper**

In `apps/mobile/src/screens/patient/LabResultsScreen.js`, add near the top (after imports):
```js
import C from '../../constants/colors';

const FLAG = {
  normal:   { bg: C.mintDim,               text: C.mint,  label: 'Normal' },
  high:     { bg: 'rgba(245,158,11,0.15)', text: C.amber, label: 'High' },
  low:      { bg: 'rgba(245,158,11,0.15)', text: C.amber, label: 'Low' },
  critical: { bg: 'rgba(244,63,94,0.15)',  text: C.rose,  label: 'Critical' },
};
function FlagBadge({ flag }) {
  const f = FLAG[flag] || FLAG.normal;
  return (
    <View style={{ backgroundColor: f.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start' }}>
      <Text style={{ color: f.text, fontSize: 11, fontWeight: '600' }}>{f.label}</Text>
    </View>
  );
}
```

- [ ] **Step 2: Add test rows to the result detail section**

In the result detail expansion/modal section of the screen, add:
```jsx
{item.tests?.map((t, i) => (
  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 13, color: C.text }}>{t.name}</Text>
      {t.referenceRange ? <Text style={{ fontSize: 11, color: C.text3 }}>Ref: {t.referenceRange}</Text> : null}
    </View>
    <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginRight: 10 }}>{t.value} {t.unit}</Text>
    <FlagBadge flag={t.flag} />
  </View>
))}
```

Apply the same helper to `apps/mobile/src/screens/doctor/LabResultsScreen.js`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/patient/LabResultsScreen.js apps/mobile/src/screens/doctor/LabResultsScreen.js
git commit -m "feat(mobile): add flag color badges and test rows to lab result screens (L-11)"
```

---

## Task 7: Onboarding flow — Mobile (D-03)

**Files:**
- Create: `apps/mobile/src/screens/Onboarding.js`
- Modify: `apps/mobile/src/navigation/AppNavigator.js`

- [ ] **Step 1: Create `apps/mobile/src/screens/Onboarding.js`**

```js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import C from '../constants/colors';

const { width } = Dimensions.get('window');
const STEPS = [
  { icon: '🩺', title: 'Find Doctors Near You', body: 'Search by specialty or location and book an appointment in seconds.' },
  { icon: '📋', title: 'Manage Your Health Records', body: 'Access prescriptions, lab results, and medical notes all in one place.' },
  { icon: '🔒', title: 'Private & Secure', body: 'Your data is encrypted and only shared with your care team.' },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);

  const finish = async () => {
    await AsyncStorage.setItem('onboarded', '1');
    onDone();
  };

  const s = STEPS[step];
  return (
    <SafeAreaView style={st.safe}>
      <View style={st.content}>
        <Text style={st.icon}>{s.icon}</Text>
        <Text style={st.title}>{s.title}</Text>
        <Text style={st.body}>{s.body}</Text>

        <View style={st.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[st.dot, i === step && st.dotActive]} />
          ))}
        </View>
      </View>

      <View style={st.footer}>
        {step < STEPS.length - 1 ? (
          <>
            <TouchableOpacity onPress={finish}>
              <Text style={st.skip}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.btn} onPress={() => setStep(s => s + 1)}>
              <Text style={st.btnTxt}>Next →</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[st.btn, { flex: 1 }]} onPress={finish}>
            <Text style={st.btnTxt}>Get Started</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  icon:    { fontSize: 72, marginBottom: 24 },
  title:   { fontSize: 24, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 14 },
  body:    { fontSize: 15, color: C.text2, textAlign: 'center', lineHeight: 23 },
  dots:    { flexDirection: 'row', gap: 8, marginTop: 36 },
  dot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border2 },
  dotActive: { backgroundColor: C.mint, width: 20 },
  footer:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, gap: 12 },
  skip:    { fontSize: 14, color: C.text2 },
  btn:     { backgroundColor: C.mint, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
  btnTxt:  { fontSize: 15, fontWeight: '700', color: '#000' },
});
```

- [ ] **Step 2: Install AsyncStorage**

```bash
npm install @react-native-async-storage/async-storage --legacy-peer-deps
```

- [ ] **Step 3: Add onboarding gate to AppNavigator.js**

In `apps/mobile/src/navigation/AppNavigator.js`, add imports:
```js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import Onboarding from '../screens/Onboarding';
```

Inside `AppNavigator`, add state and effect before the return:
```js
const [onboarded, setOnboarded] = useState(null);

useEffect(() => {
  AsyncStorage.getItem('onboarded').then(v => setOnboarded(!!v));
}, []);

if (onboarded === null) return null; // loading
if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />;
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/Onboarding.js apps/mobile/src/navigation/AppNavigator.js package-lock.json apps/mobile/package.json
git commit -m "feat(mobile): add 3-step onboarding flow with AsyncStorage gate (D-03)"
```

---

## Task 8: Reusable error/empty state component — Mobile (D-04)

**Files:**
- Create: `apps/mobile/src/components/ErrorState.js`

- [ ] **Step 1: Create component**

```js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import C from '../constants/colors';

export default function ErrorState({ icon = '🔍', title, message, action, onAction }) {
  return (
    <View style={s.container}>
      <Text style={s.icon}>{icon}</Text>
      <Text style={s.title}>{title}</Text>
      {message ? <Text style={s.message}>{message}</Text> : null}
      {action && onAction ? (
        <TouchableOpacity style={s.btn} onPress={onAction}>
          <Text style={s.btnTxt}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  icon:      { fontSize: 52, marginBottom: 16 },
  title:     { fontSize: 17, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 8 },
  message:   { fontSize: 13, color: C.text2, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btn:       { backgroundColor: C.mint, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 11 },
  btnTxt:    { fontSize: 14, fontWeight: '700', color: '#000' },
});
```

- [ ] **Step 2: Wire into FindDoctorScreen empty state**

In `apps/mobile/src/screens/patient/FindDoctorScreen.js`, add import:
```js
import ErrorState from '../../components/ErrorState';
```

Replace the no-results text in FlatList `ListEmptyComponent`:
```jsx
ListEmptyComponent={!loading ? (
  <ErrorState icon="🔍" title="No doctors found" message="Try a different name or specialty filter." />
) : null}
```

- [ ] **Step 3: Wire into LabResultsScreen empty state**

In `apps/mobile/src/screens/patient/LabResultsScreen.js`, replace plain "no results" text with:
```jsx
import ErrorState from '../../components/ErrorState';
// ...
{results.length === 0 && !loading && (
  <ErrorState icon="🧪" title="No lab results yet" message="Your lab results will appear here once available." />
)}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/ErrorState.js apps/mobile/src/screens/patient/FindDoctorScreen.js apps/mobile/src/screens/patient/LabResultsScreen.js
git commit -m "feat(mobile): add reusable ErrorState component for empty/error screens (D-04)"
```

---

## Task 9: Share viewer redesign — Web (L-20)

**Files:**
- Modify: `apps/web/src/pages/public/ShareViewerPage.jsx`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/pages/public/ShareViewerPage.jsx` to understand the existing structure.

- [ ] **Step 2: Add countdown + lock icon + trust signals**

Add these helpers before the component:
```jsx
function useCountdown(expiresAt) {
  const [remaining, setRemaining] = React.useState('');
  React.useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = new Date(expiresAt) - Date.now();
      if (diff <= 0) { setRemaining('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}h ${m}m ${s}s remaining`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}
```

In the header / trust bar section of the page, add:
```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', marginBottom: 16, padding: '10px 16px', background: 'rgba(15,227,176,0.07)', border: '1px solid rgba(15,227,176,0.2)', borderRadius: 8 }}>
  <span>🔒</span>
  <span>Secure, encrypted link</span>
  {doc?.expiresAt && <span style={{ marginLeft: 'auto', color: 'var(--mint)' }}>{countdown}</span>}
</div>
```

Wire `useCountdown` in the component:
```jsx
const countdown = useCountdown(doc?.expiresAt);
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/public/ShareViewerPage.jsx
git commit -m "feat(web): add lock icon, expiry countdown to share viewer page (L-20)"
```

---

## Task 10: Prescription PDF template — Web (D-05)

**Files:**
- Modify: `apps/web/src/pages/doctor/PrescriptionsPage.jsx`

- [ ] **Step 1: Read PrescriptionsPage to find the PDF generation section**

Read `apps/web/src/pages/doctor/PrescriptionsPage.jsx` and locate where the PDF URL is constructed or the prescription is displayed for printing.

- [ ] **Step 2: Add a styled print view**

Add a print-only CSS section. In the JSX, add a hidden div with `id="prescription-print"`:
```jsx
<div id="prescription-print" style={{ display: 'none' }}>
  <div style={{ fontFamily: 'Georgia, serif', padding: 40, maxWidth: 600, margin: '0 auto', color: '#000' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, borderBottom: '2px solid #000', paddingBottom: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22 }}>MediConnect</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#555' }}>Digital Prescription</p>
      </div>
      <div style={{ textAlign: 'right', fontSize: 12 }}>
        <div>Date: {new Date(selectedPrescription?.createdAt).toLocaleDateString()}</div>
        <div>Rx #{selectedPrescription?._id?.slice(-6).toUpperCase()}</div>
      </div>
    </div>
    <div style={{ marginBottom: 20 }}>
      <strong>Patient:</strong> {selectedPrescription?.patientId?.name || '—'}
    </div>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: '#f5f5f5' }}>
          {['Medication','Dosage','Frequency','Duration'].map(h => (
            <th key={h} style={{ border: '1px solid #ddd', padding: '6px 10px', textAlign: 'left' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {selectedPrescription?.medications?.map((m, i) => (
          <tr key={i}>
            <td style={{ border: '1px solid #ddd', padding: '6px 10px' }}>{m.name}</td>
            <td style={{ border: '1px solid #ddd', padding: '6px 10px' }}>{m.dosage}</td>
            <td style={{ border: '1px solid #ddd', padding: '6px 10px' }}>{m.frequency}</td>
            <td style={{ border: '1px solid #ddd', padding: '6px 10px' }}>{m.duration}</td>
          </tr>
        ))}
      </tbody>
    </table>
    {selectedPrescription?.instructions && (
      <div style={{ marginTop: 20, fontSize: 13 }}>
        <strong>Instructions:</strong> {selectedPrescription.instructions}
      </div>
    )}
    <div style={{ marginTop: 40, borderTop: '1px solid #ccc', paddingTop: 16, fontSize: 12, color: '#555', textAlign: 'center' }}>
      Generated by MediConnect · This prescription is digitally issued and valid without a physical signature.
    </div>
  </div>
</div>
```

Add a print button near the prescription detail:
```jsx
<button onClick={() => {
  const el = document.getElementById('prescription-print');
  el.style.display = 'block';
  window.print();
  el.style.display = 'none';
}} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}>
  🖨 Print
</button>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/doctor/PrescriptionsPage.jsx
git commit -m "feat(web): add printable prescription PDF template (D-05)"
```

---

## Self-Review Checklist

- [x] Config: Mobile API URL dynamic — Task 1
- [x] B-09 Cloudinary: utility + middleware + doctor/patient endpoints — Tasks 2, 3
- [x] B-10 FCM: service + appointment trigger + token save endpoint — Task 4
- [x] L-11 flag colors: web + mobile test table — Tasks 5, 6
- [x] D-03 onboarding: 3-step flow + AsyncStorage gate — Task 7
- [x] D-04 error states: ErrorState component + wired into 2 screens — Task 8
- [x] L-20 share viewer: lock icon + countdown — Task 9
- [x] D-05 PDF template: printable prescription layout + button — Task 10
- [x] No placeholders — all code is complete
- [x] Type consistency — FlagBadge, ErrorState, sendPush, uploadBuffer consistent throughout

