# Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all three roles (doctor, patient, lab) the ability to view and edit their own account — name, email (read-only), change password, and role-specific profile fields — via mobile screens that don't yet exist.

**Architecture:** Backend-first: three new/extended API endpoints under `/api/auth` and `/api/labs`, one new endpoint on `/api/patients`. Mobile gets a shared `AccountSection` component (name, email, change-password, logout) reused by all three role-specific screens. Doctor account lives inside the existing SettingsScreen (no new tab); patient and lab each get a new Profile tab.

**Tech Stack:** Node.js + Express + express-validator + bcryptjs (API), React Native + Expo SDK 54 + Zustand (mobile), existing `client` axios instance with auth interceptor.

---

## File Map

**Create:**
- `apps/mobile/src/components/AccountSection.js` — shared name/email/change-password/logout block
- `apps/mobile/src/screens/patient/ProfileScreen.js` — patient account + medical profile (bloodType, dateOfBirth, allergies, conditions)
- `apps/mobile/src/screens/lab/ProfileScreen.js` — lab account + lab info (labName, address, licenseNumber)
- `apps/api/src/routes/labs.js` — GET/PATCH /api/labs/me

**Modify:**
- `apps/api/src/routes/auth.js` — add GET /me, PATCH /me, PATCH /change-password
- `apps/api/src/routes/patients.js` — add PATCH /me/profile
- `apps/api/src/index.js` — mount /api/labs route
- `apps/mobile/src/api/auth.js` — add getMe, updateMe, changePassword
- `apps/mobile/src/api/patients.js` — add updatePatientProfile (create if absent)
- `apps/mobile/src/api/labs.js` — create with getLabProfile, updateLabProfile
- `apps/mobile/src/store/authStore.js` — add updateUser action
- `apps/mobile/src/screens/doctor/SettingsScreen.js` — prepend AccountSection
- `apps/mobile/src/navigation/PatientTabs.js` — add Profile tab (👤)
- `apps/mobile/src/navigation/LabTabs.js` — add Profile tab (👤)

---

## Task 1: API — auth/me endpoints (GET, PATCH name, PATCH change-password)

**Files:**
- Modify: `apps/api/src/routes/auth.js`

- [ ] **Step 1: Add `auth` middleware import**

At the top of `apps/api/src/routes/auth.js`, add after the existing requires:
```js
const auth = require('../middleware/auth');
```

- [ ] **Step 2: Add GET /api/auth/me**

Add before `module.exports`:
```js
// GET /api/auth/me — fetch own name + email
router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('name email role');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Add PATCH /api/auth/me (name update)**

```js
// PATCH /api/auth/me — update own name
router.patch('/me', auth, [
  body('name').notEmpty().withMessage('name is required').trim(),
], validate, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { name: req.body.name } },
      { new: true }
    ).select('name email role');
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Add PATCH /api/auth/change-password**

```js
// PATCH /api/auth/change-password
router.patch('/change-password', auth, [
  body('currentPassword').notEmpty().withMessage('currentPassword required'),
  body('newPassword').isLength({ min: 8 }).withMessage('newPassword must be ≥8 chars'),
], validate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const valid = await user.comparePassword(req.body.currentPassword);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect' });

    user.password = req.body.newPassword; // pre-save hook hashes it
    await user.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

- [ ] **Step 5: Syntax check**

```bash
node --check apps/api/src/routes/auth.js
```

Expected: no output (clean parse).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/auth.js
git commit -m "feat(api): add GET/PATCH /auth/me and PATCH /auth/change-password"
```

---

## Task 2: API — PATCH /api/patients/me/profile

**Files:**
- Modify: `apps/api/src/routes/patients.js`

Context: The patient model has `bloodType` (enum), `dateOfBirth`, `allergies` (array), `conditions` (array). The existing `GET /api/patients/me` already returns the full patient document.

- [ ] **Step 1: Add PATCH /api/patients/me/profile**

In `apps/api/src/routes/patients.js`, add at the top after existing requires:
```js
const { body, validationResult } = require('express-validator');
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};
const BLOOD_TYPES = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
```

Add after the existing `PATCH /me/location` route:
```js
// PATCH /api/patients/me/profile — update medical profile fields
router.patch('/me/profile', auth, requireRole('patient'), [
  body('bloodType').optional().isIn(BLOOD_TYPES).withMessage('invalid bloodType'),
  body('dateOfBirth').optional().isISO8601().withMessage('dateOfBirth must be ISO8601'),
  body('allergies').optional().isArray().withMessage('allergies must be an array'),
  body('allergies.*').optional().isString().trim(),
  body('conditions').optional().isArray().withMessage('conditions must be an array'),
  body('conditions.*').optional().isString().trim(),
], validate, async (req, res, next) => {
  try {
    const { bloodType, dateOfBirth, allergies, conditions } = req.body;
    const update = {};
    if (bloodType !== undefined)  update.bloodType  = bloodType;
    if (dateOfBirth !== undefined) update.dateOfBirth = new Date(dateOfBirth);
    if (allergies !== undefined)  update.allergies  = allergies;
    if (conditions !== undefined) update.conditions = conditions;

    const patient = await Patient.findOneAndUpdate(
      { userId: req.user.id },
      { $set: update },
      { new: true }
    );
    if (!patient) return res.status(404).json({ message: 'Profile not found' });
    res.json(patient);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Syntax check**

```bash
node --check apps/api/src/routes/patients.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/patients.js
git commit -m "feat(api): add PATCH /patients/me/profile for bloodType, dateOfBirth, allergies, conditions"
```

---

## Task 3: API — GET/PATCH /api/labs/me

**Files:**
- Create: `apps/api/src/routes/labs.js`
- Modify: `apps/api/src/index.js`

- [ ] **Step 1: Check API entry point**

```bash
grep -n "require\|app.use" apps/api/src/index.js | head -30
```

Note the pattern used for mounting routes (e.g., `app.use('/api/labs-results', ...)`) so you mount the new route the same way.

- [ ] **Step 2: Create `apps/api/src/routes/labs.js`**

```js
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const Lab = require('../models/Lab');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// GET /api/labs/me
router.get('/me', auth, requireRole('laboratory'), async (req, res, next) => {
  try {
    const lab = await Lab.findOne({ userId: req.user.id });
    if (!lab) return res.status(404).json({ message: 'Lab profile not found' });
    res.json(lab);
  } catch (err) { next(err); }
});

// PATCH /api/labs/me
router.patch('/me', auth, requireRole('laboratory'), [
  body('labName').optional().notEmpty().trim().withMessage('labName cannot be empty'),
  body('address').optional().isString().trim(),
  body('licenseNumber').optional().isString().trim(),
], validate, async (req, res, next) => {
  try {
    const { labName, address, licenseNumber } = req.body;
    const update = {};
    if (labName !== undefined)       update.labName       = labName;
    if (address !== undefined)       update.address       = address;
    if (licenseNumber !== undefined) update.licenseNumber = licenseNumber;

    const lab = await Lab.findOneAndUpdate(
      { userId: req.user.id },
      { $set: update },
      { new: true }
    );
    if (!lab) return res.status(404).json({ message: 'Lab profile not found' });
    res.json(lab);
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 3: Mount in API entry point**

In `apps/api/src/index.js`, add after the existing route mounts:
```js
const labsRoute = require('./routes/labs');
app.use('/api/labs', labsRoute);
```

- [ ] **Step 4: Syntax check**

```bash
node --check apps/api/src/routes/labs.js && node --check apps/api/src/index.js
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/labs.js apps/api/src/index.js
git commit -m "feat(api): add GET/PATCH /api/labs/me for lab profile management"
```

---

## Task 4: Mobile — API layer + authStore updateUser

**Files:**
- Modify: `apps/mobile/src/api/auth.js`
- Create/Modify: `apps/mobile/src/api/patients.js`
- Create: `apps/mobile/src/api/labs.js`
- Modify: `apps/mobile/src/store/authStore.js`

- [ ] **Step 1: Check what mobile API files exist**

```bash
ls apps/mobile/src/api/
```

- [ ] **Step 2: Extend `apps/mobile/src/api/auth.js`**

The current file exports `login` and `register`. Add three more exports:
```js
import client from './client';

export const login = (d) => client.post('/auth/login', d);
export const register = (d) => client.post('/auth/register', d);
export const getMe = () => client.get('/auth/me');
export const updateMe = (d) => client.patch('/auth/me', d);
export const changePassword = (d) => client.patch('/auth/change-password', d);
```

- [ ] **Step 3: Create or update `apps/mobile/src/api/patients.js`**

If the file exists, read it and append. If not, create it:
```js
import client from './client';

export const getPatientMe = () => client.get('/patients/me');
export const updatePatientProfile = (d) => client.patch('/patients/me/profile', d);
```

- [ ] **Step 4: Create `apps/mobile/src/api/labs.js`**

```js
import client from './client';

export const getLabProfile = () => client.get('/labs/me');
export const updateLabProfile = (d) => client.patch('/labs/me', d);
```

- [ ] **Step 5: Add `updateUser` to `apps/mobile/src/store/authStore.js`**

Replace the entire file:
```js
import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: null,
  token: null,
  login: (user, token) => set({ user, token }),
  logout: () => set({ user: null, token: null }),
  updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
}));

export default useAuthStore;
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/api/auth.js apps/mobile/src/api/patients.js apps/mobile/src/api/labs.js apps/mobile/src/store/authStore.js
git commit -m "feat(mobile): add account management API helpers and authStore updateUser action"
```

---

## Task 5: Mobile — AccountSection shared component

**Files:**
- Create: `apps/mobile/src/components/AccountSection.js`

This component handles name (editable), email (read-only), change-password inline section, and logout. All three role screens use it.

- [ ] **Step 1: Create `apps/mobile/src/components/AccountSection.js`**

```js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { updateMe, changePassword } from '../api/auth';
import useAuthStore from '../store/authStore';
import C from '../constants/colors';

export default function AccountSection({ user }) {
  const { logout, updateUser } = useAuthStore();

  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const handleSaveName = async () => {
    if (!name.trim()) return Alert.alert('Name cannot be empty');
    setSavingName(true);
    try {
      const updated = await updateMe({ name: name.trim() });
      updateUser({ name: updated.name });
      Alert.alert('Saved', 'Name updated.');
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not update name');
    } finally { setSavingName(false); }
  };

  const handleChangePassword = async () => {
    if (newPw.length < 8) return Alert.alert('Validation', 'New password must be at least 8 characters.');
    if (newPw !== confirmPw) return Alert.alert('Validation', 'Passwords do not match.');
    setSavingPw(true);
    try {
      await changePassword({ currentPassword: currentPw, newPassword: newPw });
      Alert.alert('Success', 'Password changed. Please log in again.');
      logout();
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not change password');
    } finally { setSavingPw(false); }
  };

  return (
    <View>
      <Text style={s.sectionLabel}>Account</Text>
      <View style={s.card}>
        <Text style={s.fieldLabel}>Name</Text>
        <View style={s.row}>
          <TextInput
            style={[s.input, { flex: 1, marginRight: 8 }]}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={C.text3}
          />
          <TouchableOpacity style={s.saveBtn} onPress={handleSaveName} disabled={savingName}>
            {savingName
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={s.saveBtnTxt}>Save</Text>}
          </TouchableOpacity>
        </View>

        <Text style={[s.fieldLabel, { marginTop: 14 }]}>Email</Text>
        <Text style={s.emailText}>{user?.email}</Text>
      </View>

      <TouchableOpacity style={s.linkRow} onPress={() => setPwOpen(o => !o)}>
        <Text style={s.linkTxt}>🔑 Change Password</Text>
        <Text style={s.chevron}>{pwOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {pwOpen && (
        <View style={s.card}>
          <TextInput
            style={s.input}
            placeholder="Current password"
            placeholderTextColor={C.text3}
            secureTextEntry
            value={currentPw}
            onChangeText={setCurrentPw}
          />
          <TextInput
            style={[s.input, { marginTop: 10 }]}
            placeholder="New password (min 8 chars)"
            placeholderTextColor={C.text3}
            secureTextEntry
            value={newPw}
            onChangeText={setNewPw}
          />
          <TextInput
            style={[s.input, { marginTop: 10 }]}
            placeholder="Confirm new password"
            placeholderTextColor={C.text3}
            secureTextEntry
            value={confirmPw}
            onChangeText={setConfirmPw}
          />
          <TouchableOpacity
            style={[s.saveBtn, { marginTop: 14, alignSelf: 'flex-start' }]}
            onPress={handleChangePassword}
            disabled={savingPw}
          >
            {savingPw
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={s.saveBtnTxt}>Update Password</Text>}
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={s.logoutBtn} onPress={logout}>
        <Text style={s.logoutTxt}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.text3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  card:         { backgroundColor: C.bg2, borderRadius: 12, padding: 16, marginBottom: 12 },
  row:          { flexDirection: 'row', alignItems: 'center' },
  fieldLabel:   { fontSize: 12, color: C.text3, marginBottom: 6 },
  input:        { backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  emailText:    { fontSize: 14, color: C.text2 },
  saveBtn:      { backgroundColor: C.mint, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  saveBtnTxt:   { fontSize: 13, fontWeight: '700', color: '#000' },
  linkRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderColor: C.border, marginBottom: 4 },
  linkTxt:      { fontSize: 14, color: C.text },
  chevron:      { fontSize: 12, color: C.text3 },
  logoutBtn:    { marginTop: 20, borderWidth: 1, borderColor: C.rose ?? '#f43f5e', borderRadius: 12, padding: 14, alignItems: 'center' },
  logoutTxt:    { fontSize: 14, fontWeight: '700', color: C.rose ?? '#f43f5e' },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/AccountSection.js
git commit -m "feat(mobile): add shared AccountSection component (name, email, change-password, logout)"
```

---

## Task 6: Mobile — Doctor SettingsScreen account section

**Files:**
- Modify: `apps/mobile/src/screens/doctor/SettingsScreen.js`

Design decision: account block appears at the TOP of the screen, above the existing "Settings" heading. This keeps 4 tabs intact.

- [ ] **Step 1: Read the current file**

Read `apps/mobile/src/screens/doctor/SettingsScreen.js` to get the exact current imports and state initialization.

- [ ] **Step 2: Add imports**

At the top of the file, add:
```js
import AccountSection from '../../components/AccountSection';
import { getMe } from '../../api/auth';
import useAuthStore from '../../store/authStore';
```

- [ ] **Step 3: Add `me` state and fetch**

Inside `SettingsScreen`, add alongside existing state:
```js
const { user: storeUser } = useAuthStore();
const [me, setMe] = useState(null);
```

Inside the existing `useEffect` (or add a new one alongside it):
```js
useEffect(() => {
  getMe().then(setMe).catch(() => {});
}, []);
```

- [ ] **Step 4: Render AccountSection before existing content**

In the `return`, inside `<ScrollView contentContainerStyle={s.content}>`, add as the FIRST child (before `<Text style={s.heading}>Settings</Text>`):
```jsx
<AccountSection user={me ?? storeUser} />
```

- [ ] **Step 5: Syntax check**

```bash
node --check apps/mobile/src/screens/doctor/SettingsScreen.js 2>/dev/null || echo "JSX — skip node check"
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/doctor/SettingsScreen.js
git commit -m "feat(mobile): add account section to doctor SettingsScreen"
```

---

## Task 7: Mobile — Patient ProfileScreen

**Files:**
- Create: `apps/mobile/src/screens/patient/ProfileScreen.js`

The patient profile shows the shared `AccountSection` plus their medical details: blood type, date of birth, allergies list, and conditions list.

- [ ] **Step 1: Create `apps/mobile/src/screens/patient/ProfileScreen.js`**

```js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMe } from '../../api/auth';
import { getPatientMe, updatePatientProfile } from '../../api/patients';
import useAuthStore from '../../store/authStore';
import AccountSection from '../../components/AccountSection';
import C from '../../constants/colors';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function ProfileScreen() {
  const { user: storeUser } = useAuthStore();
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [bloodType, setBloodType] = useState('');
  const [dob, setDob] = useState('');
  const [allergies, setAllergies] = useState('');
  const [conditions, setConditions] = useState('');

  const load = useCallback(async () => {
    try {
      const [userRes, profRes] = await Promise.all([getMe(), getPatientMe()]);
      setMe(userRes);
      setProfile(profRes);
      setBloodType(profRes.bloodType ?? '');
      setDob(profRes.dateOfBirth ? profRes.dateOfBirth.slice(0, 10) : '');
      setAllergies((profRes.allergies ?? []).join(', '));
      setConditions((profRes.conditions ?? []).join(', '));
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not load profile');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updatePatientProfile({
        bloodType: bloodType || undefined,
        dateOfBirth: dob || undefined,
        allergies: allergies ? allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
        conditions: conditions ? conditions.split(',').map(s => s.trim()).filter(Boolean) : [],
      });
      Alert.alert('Saved', 'Medical profile updated.');
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not save profile');
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.heading}>Profile</Text>

        <AccountSection user={me ?? storeUser} />

        <Text style={s.sectionLabel}>Medical Profile</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>Blood Type</Text>
          <View style={s.chips}>
            {BLOOD_TYPES.map(bt => (
              <TouchableOpacity
                key={bt}
                style={[s.chip, bloodType === bt && s.chipActive]}
                onPress={() => setBloodType(bt === bloodType ? '' : bt)}
              >
                <Text style={[s.chipTxt, bloodType === bt && s.chipTxtActive]}>{bt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>Date of Birth (YYYY-MM-DD)</Text>
          <TextInput
            style={s.input}
            value={dob}
            onChangeText={setDob}
            placeholder="e.g. 1990-06-15"
            placeholderTextColor={C.text3}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>Allergies (comma-separated)</Text>
          <TextInput
            style={s.input}
            value={allergies}
            onChangeText={setAllergies}
            placeholder="e.g. Penicillin, Pollen"
            placeholderTextColor={C.text3}
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>Conditions (comma-separated)</Text>
          <TextInput
            style={s.input}
            value={conditions}
            onChangeText={setConditions}
            placeholder="e.g. Diabetes, Hypertension"
            placeholderTextColor={C.text3}
          />

          <TouchableOpacity style={[s.saveBtn, { marginTop: 16 }]} onPress={handleSaveProfile} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={s.saveBtnTxt}>Save Medical Profile</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  content:      { padding: 20, paddingBottom: 40 },
  heading:      { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.text3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  card:         { backgroundColor: C.bg2, borderRadius: 12, padding: 16, marginBottom: 12 },
  fieldLabel:   { fontSize: 12, color: C.text3, marginBottom: 6 },
  input:        { backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  chips:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  chipActive:   { backgroundColor: C.mint, borderColor: C.mint },
  chipTxt:      { fontSize: 13, color: C.text2 },
  chipTxtActive:{ color: '#000', fontWeight: '600' },
  saveBtn:      { backgroundColor: C.mint, borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnTxt:   { fontSize: 14, fontWeight: '700', color: '#000' },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/patient/ProfileScreen.js
git commit -m "feat(mobile): add patient ProfileScreen with account + medical profile sections"
```

---

## Task 8: Mobile — Lab ProfileScreen

**Files:**
- Create: `apps/mobile/src/screens/lab/ProfileScreen.js`

- [ ] **Step 1: Create `apps/mobile/src/screens/lab/ProfileScreen.js`**

```js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMe } from '../../api/auth';
import { getLabProfile, updateLabProfile } from '../../api/labs';
import useAuthStore from '../../store/authStore';
import AccountSection from '../../components/AccountSection';
import C from '../../constants/colors';

export default function LabProfileScreen() {
  const { user: storeUser } = useAuthStore();
  const [me, setMe] = useState(null);
  const [labName, setLabName] = useState('');
  const [address, setAddress] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [userRes, labRes] = await Promise.all([getMe(), getLabProfile()]);
      setMe(userRes);
      setLabName(labRes.labName ?? '');
      setAddress(labRes.address ?? '');
      setLicenseNumber(labRes.licenseNumber ?? '');
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not load lab profile');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!labName.trim()) return Alert.alert('Validation', 'Lab name cannot be empty.');
    setSaving(true);
    try {
      await updateLabProfile({
        labName: labName.trim(),
        address: address.trim(),
        licenseNumber: licenseNumber.trim(),
      });
      Alert.alert('Saved', 'Lab profile updated.');
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not save lab profile');
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.heading}>Profile</Text>

        <AccountSection user={me ?? storeUser} />

        <Text style={s.sectionLabel}>Lab Information</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>Lab Name</Text>
          <TextInput
            style={s.input}
            value={labName}
            onChangeText={setLabName}
            placeholder="Lab name"
            placeholderTextColor={C.text3}
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>Address</Text>
          <TextInput
            style={s.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Clinic / lab address"
            placeholderTextColor={C.text3}
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>License Number</Text>
          <TextInput
            style={s.input}
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            placeholder="Official license number"
            placeholderTextColor={C.text3}
          />

          <TouchableOpacity style={[s.saveBtn, { marginTop: 16 }]} onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={s.saveBtnTxt}>Save Lab Profile</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  content:      { padding: 20, paddingBottom: 40 },
  heading:      { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.text3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  card:         { backgroundColor: C.bg2, borderRadius: 12, padding: 16, marginBottom: 12 },
  fieldLabel:   { fontSize: 12, color: C.text3, marginBottom: 6 },
  input:        { backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  saveBtn:      { backgroundColor: C.mint, borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnTxt:   { fontSize: 14, fontWeight: '700', color: '#000' },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/lab/ProfileScreen.js
git commit -m "feat(mobile): add lab ProfileScreen with account + lab info sections"
```

---

## Task 9: Mobile — Add Profile tabs to PatientTabs and LabTabs

**Files:**
- Modify: `apps/mobile/src/navigation/PatientTabs.js`
- Modify: `apps/mobile/src/navigation/LabTabs.js`

- [ ] **Step 1: Update `apps/mobile/src/navigation/PatientTabs.js`**

Replace the entire file:
```js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import C from '../constants/colors';
import PatientStack from './PatientStack';
import MyAppointmentsScreen from '../screens/patient/MyAppointmentsScreen';
import MedicalRecordsScreen from '../screens/patient/MedicalRecordsScreen';
import LabResultsScreen from '../screens/patient/LabResultsScreen';
import ProfileScreen from '../screens/patient/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function PatientTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.border }, tabBarActiveTintColor: C.mint, tabBarInactiveTintColor: C.text3 }}>
      <Tab.Screen name="Find Doctor" component={PatientStack}           options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔍</Text> }} />
      <Tab.Screen name="Appointments" component={MyAppointmentsScreen}  options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>📅</Text> }} />
      <Tab.Screen name="Records" component={MedicalRecordsScreen}       options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text> }} />
      <Tab.Screen name="Lab Results" component={LabResultsScreen}       options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧪</Text> }} />
      <Tab.Screen name="Profile" component={ProfileScreen}              options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text> }} />
    </Tab.Navigator>
  );
}
```

- [ ] **Step 2: Update `apps/mobile/src/navigation/LabTabs.js`**

Replace the entire file:
```js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import C from '../constants/colors';
import LabUploadsScreen from '../screens/lab/LabUploadsScreen';
import LabProfileScreen from '../screens/lab/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function LabTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.border }, tabBarActiveTintColor: C.mint, tabBarInactiveTintColor: C.text3 }}>
      <Tab.Screen name="My Uploads" component={LabUploadsScreen} options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧪</Text> }} />
      <Tab.Screen name="Profile" component={LabProfileScreen}    options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text> }} />
    </Tab.Navigator>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/navigation/PatientTabs.js apps/mobile/src/navigation/LabTabs.js
git commit -m "feat(mobile): add Profile tab (👤) to patient and lab navigation"
```

---

---

## Task 10: API — admin doctor endpoints + update admin.js

**Files:**
- Modify: `apps/api/src/routes/admin.js`

Add doctor listing and verification to the existing admin router.

- [ ] **Step 1: Read current `apps/api/src/routes/admin.js`**

Confirm existing imports (Lab, adminAuth). Current file has GET /labs and PATCH /labs/:id/approve.

- [ ] **Step 2: Add Doctor model import and two doctor endpoints**

In `apps/api/src/routes/admin.js`, add after the existing requires:
```js
const Doctor = require('../models/Doctor');
const User = require('../models/User');
```

Add after the existing lab routes, before `module.exports`:
```js
// GET /api/admin/doctors — list all doctors (unverified first)
router.get('/doctors', adminAuth, async (req, res, next) => {
  try {
    const doctors = await Doctor.find()
      .sort({ isVerified: 1, createdAt: -1 })
      .populate('userId', 'name email createdAt');
    res.json(doctors);
  } catch (err) { next(err); }
});

// PATCH /api/admin/doctors/:id/verify
router.patch('/doctors/:id/verify', adminAuth, async (req, res, next) => {
  try {
    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { isVerified: true },
      { new: true }
    ).populate('userId', 'name email');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json(doctor);
  } catch (err) { next(err); }
});

// GET /api/admin/users — list all users with role counts
router.get('/users', adminAuth, async (req, res, next) => {
  try {
    const [doctors, labs, patients] = await Promise.all([
      Doctor.countDocuments(),
      require('../models/Lab').find().select('labName isApproved userId').populate('userId', 'name email createdAt'),
      User.countDocuments({ role: 'patient' }),
    ]);
    res.json({
      counts: { doctors: doctors, patients },
      labs,
    });
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Syntax check**

```bash
node --check apps/api/src/routes/admin.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/admin.js
git commit -m "feat(api): add admin doctor list/verify endpoints and user summary"
```

---

## Task 11: Admin web app — scaffolding + login

**Files:**
- Create: `apps/admin/package.json`
- Create: `apps/admin/index.html`
- Create: `apps/admin/vite.config.js`
- Create: `apps/admin/src/main.jsx`
- Create: `apps/admin/src/App.jsx`
- Create: `apps/admin/src/store.js`
- Create: `apps/admin/src/api/client.js`
- Create: `apps/admin/src/pages/LoginPage.jsx`

The admin app is a standalone Vite + React SPA. Auth = admin secret stored in localStorage, sent as `x-admin-secret` header. No JWT needed.

- [ ] **Step 1: Create `apps/admin/package.json`**

```json
{
  "name": "@mediconnect/admin",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5174",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd apps/admin && npm install
```

- [ ] **Step 3: Create `apps/admin/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MediConnect Admin</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; }
      #root { min-height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `apps/admin/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

- [ ] **Step 5: Create `apps/admin/src/store.js`**

```js
const KEY = 'admin_secret';
export const getSecret = () => localStorage.getItem(KEY) ?? '';
export const setSecret = (s) => localStorage.setItem(KEY, s);
export const clearSecret = () => localStorage.removeItem(KEY);
```

- [ ] **Step 6: Create `apps/admin/src/api/client.js`**

```js
import { getSecret } from '../store.js';

const BASE = '/api/admin';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': getSecret(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? `${method} ${path} failed`);
  return data;
}

export const get = (path) => request('GET', path);
export const patch = (path, body) => request('PATCH', path, body);
```

- [ ] **Step 7: Create `apps/admin/src/pages/LoginPage.jsx`**

```jsx
import { useState } from 'react';
import { setSecret } from '../store.js';
import { get } from '../api/client.js';

export default function LoginPage({ onLogin }) {
  const [secret, setSecretInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setSecret(secret);
    try {
      await get('/users');
      onLogin();
    } catch {
      setError('Invalid admin secret. Try again.');
      setSecretInput('');
    } finally { setLoading(false); }
  };

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h1 style={s.title}>MediConnect Admin</h1>
        <p style={s.sub}>Enter your admin secret to continue</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={secret}
            onChange={e => setSecretInput(e.target.value)}
            placeholder="Admin secret"
            required
            style={s.input}
            autoFocus
          />
          {error && <p style={s.err}>{error}</p>}
          <button type="submit" disabled={loading} style={s.btn}>
            {loading ? 'Verifying…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const s = {
  wrap:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' },
  card:  { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 40, width: 360 },
  title: { fontSize: 22, fontWeight: 700, color: '#e6edf3', marginBottom: 6 },
  sub:   { fontSize: 13, color: '#8b949e', marginBottom: 24 },
  input: { width: '100%', background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, color: '#e6edf3', fontSize: 14, padding: '10px 12px', outline: 'none', marginBottom: 12 },
  err:   { color: '#f85149', fontSize: 13, marginBottom: 10 },
  btn:   { width: '100%', background: '#238636', border: 'none', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 600, padding: '10px 0', cursor: 'pointer' },
};
```

- [ ] **Step 8: Create `apps/admin/src/App.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { getSecret, clearSecret } from './store.js';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import DoctorsPage from './pages/DoctorsPage.jsx';
import LabsPage from './pages/LabsPage.jsx';

const NAV = [
  { to: '/dashboard', label: '📊 Dashboard' },
  { to: '/doctors',   label: '🩺 Doctors' },
  { to: '/labs',      label: '🧪 Labs' },
];

function Layout({ onLogout }) {
  return (
    <div style={s.shell}>
      <nav style={s.nav}>
        <span style={s.brand}>MediConnect Admin</span>
        <div style={s.links}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} style={({ isActive }) => ({ ...s.link, color: isActive ? '#58a6ff' : '#8b949e' })}>
              {n.label}
            </NavLink>
          ))}
        </div>
        <button onClick={onLogout} style={s.logout}>Sign Out</button>
      </nav>
      <main style={s.main}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/doctors"   element={<DoctorsPage />} />
          <Route path="/labs"      element={<LabsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!getSecret());

  const handleLogout = () => { clearSecret(); setAuthed(false); };

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;
  return (
    <BrowserRouter>
      <Layout onLogout={handleLogout} />
    </BrowserRouter>
  );
}

const s = {
  shell:  { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  nav:    { display: 'flex', alignItems: 'center', gap: 24, padding: '0 24px', height: 56, background: '#161b22', borderBottom: '1px solid #30363d' },
  brand:  { fontWeight: 700, color: '#e6edf3', fontSize: 15, marginRight: 16 },
  links:  { display: 'flex', gap: 20, flex: 1 },
  link:   { fontSize: 14, textDecoration: 'none', fontWeight: 500 },
  logout: { background: 'none', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e', fontSize: 13, padding: '5px 12px', cursor: 'pointer' },
  main:   { flex: 1, padding: 24, maxWidth: 1100, margin: '0 auto', width: '100%' },
};
```

- [ ] **Step 9: Create `apps/admin/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 10: Create placeholder page files (needed by App.jsx imports)**

Create `apps/admin/src/pages/DashboardPage.jsx`:
```jsx
export default function DashboardPage() {
  return <div><h2 style={{ color: '#e6edf3', marginBottom: 8 }}>Dashboard</h2><p style={{ color: '#8b949e' }}>Loading…</p></div>;
}
```

Create `apps/admin/src/pages/DoctorsPage.jsx`:
```jsx
export default function DoctorsPage() {
  return <div><h2 style={{ color: '#e6edf3' }}>Doctors</h2></div>;
}
```

Create `apps/admin/src/pages/LabsPage.jsx`:
```jsx
export default function LabsPage() {
  return <div><h2 style={{ color: '#e6edf3' }}>Labs</h2></div>;
}
```

- [ ] **Step 11: Verify dev server starts**

```bash
cd apps/admin && npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:5174
```

Expected: `200`

Kill the dev server after check:
```bash
kill %1 2>/dev/null; true
```

- [ ] **Step 12: Commit**

```bash
git add apps/admin/
git commit -m "feat(admin): scaffold standalone admin web app with login page"
```

---

## Task 12: Admin web app — Dashboard page

**Files:**
- Modify: `apps/admin/src/pages/DashboardPage.jsx`

Replaces the placeholder with real data from GET /api/admin/users.

- [ ] **Step 1: Replace `apps/admin/src/pages/DashboardPage.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { get } from '../api/client.js';

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: 20, minWidth: 160 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? '#e6edf3' }}>{value ?? '—'}</div>
      <div style={{ fontSize: 13, color: '#8b949e', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    get('/users').then(setData).catch(e => setError(e.message));
  }, []);

  const pendingDoctors = data ? 0 : null; // computed below
  const pendingLabs = data ? data.labs.filter(l => !l.isApproved).length : null;

  return (
    <div>
      <h2 style={{ color: '#e6edf3', marginBottom: 20, fontSize: 20 }}>Dashboard</h2>
      {error && <p style={{ color: '#f85149', marginBottom: 16 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard label="Total Doctors"   value={data?.counts?.doctors} color="#58a6ff" />
        <StatCard label="Total Patients"  value={data?.counts?.patients} color="#3fb950" />
        <StatCard label="Pending Labs"    value={pendingLabs} color={pendingLabs > 0 ? '#d29922' : '#3fb950'} />
      </div>
      {data?.labs?.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ color: '#e6edf3', marginBottom: 12, fontSize: 16 }}>Recent Labs</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #30363d' }}>
                {['Lab Name','Email','Status'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#8b949e' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.labs.slice(0, 5).map(lab => (
                <tr key={lab._id} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={{ padding: '10px 12px', color: '#e6edf3' }}>{lab.labName}</td>
                  <td style={{ padding: '10px 12px', color: '#8b949e' }}>{lab.userId?.email}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ background: lab.isApproved ? 'rgba(63,185,80,0.15)' : 'rgba(210,153,34,0.15)', color: lab.isApproved ? '#3fb950' : '#d29922', borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                      {lab.isApproved ? 'Approved' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/pages/DashboardPage.jsx
git commit -m "feat(admin): implement dashboard page with user counts and lab summary"
```

---

## Task 13: Admin web app — Doctors page

**Files:**
- Modify: `apps/admin/src/pages/DoctorsPage.jsx`

Lists all doctors with their verification status. Admin can click "Verify" to activate unverified doctors.

- [ ] **Step 1: Replace `apps/admin/src/pages/DoctorsPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { get, patch } from '../api/client.js';

const STATUS = {
  true:  { label: 'Verified',    bg: 'rgba(63,185,80,0.15)',   text: '#3fb950' },
  false: { label: 'Unverified',  bg: 'rgba(210,153,34,0.15)', text: '#d29922' },
};

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setDoctors(await get('/doctors')); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleVerify = async (id) => {
    setVerifying(id);
    try {
      await patch(`/doctors/${id}/verify`);
      setDoctors(prev => prev.map(d => d._id === id ? { ...d, isVerified: true } : d));
    } catch (e) {
      alert('Failed to verify: ' + e.message);
    } finally { setVerifying(null); }
  };

  return (
    <div>
      <h2 style={{ color: '#e6edf3', marginBottom: 20, fontSize: 20 }}>Doctors</h2>
      {error && <p style={{ color: '#f85149', marginBottom: 12 }}>{error}</p>}
      {loading ? (
        <p style={{ color: '#8b949e' }}>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #30363d' }}>
              {['Name','Email','Specialty','Joined','Status','Action'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#8b949e', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doctors.map(doc => {
              const st = STATUS[String(doc.isVerified)];
              return (
                <tr key={doc._id} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={{ padding: '12px', color: '#e6edf3', fontWeight: 500 }}>{doc.userId?.name ?? '—'}</td>
                  <td style={{ padding: '12px', color: '#8b949e' }}>{doc.userId?.email}</td>
                  <td style={{ padding: '12px', color: '#8b949e' }}>{doc.specialty}</td>
                  <td style={{ padding: '12px', color: '#8b949e' }}>{doc.userId?.createdAt ? new Date(doc.userId.createdAt).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ background: st.bg, color: st.text, borderRadius: 10, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{st.label}</span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {!doc.isVerified && (
                      <button
                        onClick={() => handleVerify(doc._id)}
                        disabled={verifying === doc._id}
                        style={{ background: '#238636', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, padding: '5px 12px', cursor: 'pointer', opacity: verifying === doc._id ? 0.6 : 1 }}
                      >
                        {verifying === doc._id ? 'Verifying…' : 'Verify'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {doctors.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, color: '#8b949e', textAlign: 'center' }}>No doctors found.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/pages/DoctorsPage.jsx
git commit -m "feat(admin): implement doctors management page with verify action"
```

---

## Task 14: Admin web app — Labs page

**Files:**
- Modify: `apps/admin/src/pages/LabsPage.jsx`

Lists all labs. Admin can approve pending labs.

- [ ] **Step 1: Replace `apps/admin/src/pages/LabsPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { get, patch } from '../api/client.js';

const STATUS = {
  true:  { label: 'Approved', bg: 'rgba(63,185,80,0.15)',  text: '#3fb950' },
  false: { label: 'Pending',  bg: 'rgba(210,153,34,0.15)', text: '#d29922' },
};

export default function LabsPage() {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get('/users');
      setLabs(data.labs);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    setApproving(id);
    try {
      await patch(`/labs/${id}/approve`);
      setLabs(prev => prev.map(l => l._id === id ? { ...l, isApproved: true } : l));
    } catch (e) {
      alert('Failed to approve: ' + e.message);
    } finally { setApproving(null); }
  };

  return (
    <div>
      <h2 style={{ color: '#e6edf3', marginBottom: 20, fontSize: 20 }}>Labs</h2>
      {error && <p style={{ color: '#f85149', marginBottom: 12 }}>{error}</p>}
      {loading ? (
        <p style={{ color: '#8b949e' }}>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #30363d' }}>
              {['Lab Name','Email','Joined','Status','Action'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#8b949e', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labs.map(lab => {
              const st = STATUS[String(lab.isApproved)];
              return (
                <tr key={lab._id} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={{ padding: '12px', color: '#e6edf3', fontWeight: 500 }}>{lab.labName}</td>
                  <td style={{ padding: '12px', color: '#8b949e' }}>{lab.userId?.email}</td>
                  <td style={{ padding: '12px', color: '#8b949e' }}>{lab.userId?.createdAt ? new Date(lab.userId.createdAt).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ background: st.bg, color: st.text, borderRadius: 10, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{st.label}</span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {!lab.isApproved && (
                      <button
                        onClick={() => handleApprove(lab._id)}
                        disabled={approving === lab._id}
                        style={{ background: '#238636', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, padding: '5px 12px', cursor: 'pointer', opacity: approving === lab._id ? 0.6 : 1 }}
                      >
                        {approving === lab._id ? 'Approving…' : 'Approve'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {labs.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, color: '#8b949e', textAlign: 'center' }}>No labs found.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

Note: The LabsPage uses `GET /api/admin/users` (which returns `{ counts, labs }`) to reuse the same endpoint. The PATCH `/api/admin/labs/:id/approve` already exists.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/pages/LabsPage.jsx
git commit -m "feat(admin): implement labs management page with approve action"
```

---

## Updated Self-Review Checklist

## Self-Review Checklist

- [x] **Doctor account** — AccountSection prepended in SettingsScreen; no new tab (stays at 4) — Task 6
- [x] **Patient account** — ProfileScreen with AccountSection + medical fields; Profile tab added — Tasks 7, 9
- [x] **Lab account** — LabProfileScreen with AccountSection + labName/address/license; Profile tab added — Tasks 8, 9
- [x] **Common to all: name (editable)** — AccountSection handleSaveName via PATCH /auth/me — Task 5
- [x] **Common to all: email (read-only)** — AccountSection renders user.email as Text — Task 5
- [x] **Common to all: change password** — AccountSection inline collapsible + PATCH /auth/change-password — Tasks 1, 5
- [x] **Common to all: logout** — AccountSection logout button calls authStore.logout() — Task 5
- [x] **API — GET/PATCH /auth/me** — Task 1
- [x] **API — PATCH /auth/change-password** — Task 1 (requires currentPassword; bcrypt verify before hash)
- [x] **API — PATCH /patients/me/profile** — Task 2 (validated enum bloodType, ISO8601 dob, string arrays)
- [x] **API — GET/PATCH /labs/me** — Task 3
- [x] **authStore.updateUser** — Task 4 (name reflected in UI after save without re-login)
- [x] **No placeholders** — all code complete
- [x] **Type consistency** — `getMe` → `{ id, name, email, role }` used as `me` prop everywhere; `updateMe`/`changePassword` consistent in auth.js and AccountSection; `getPatientMe`/`updatePatientProfile` consistent in patients.js and ProfileScreen; `getLabProfile`/`updateLabProfile` consistent in labs.js and LabProfileScreen
- [x] **Security** — change-password verifies currentPassword before update; email immutable; all endpoints behind `auth` middleware; role-scoped (`requireRole`) on patient and lab routes; no client-trusted fields
