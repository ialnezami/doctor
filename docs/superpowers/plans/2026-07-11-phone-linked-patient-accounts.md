# Phone-Linked Patient Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add phone number as a unique login identifier, allow doctors/labs to create patient accounts with name + phone + temp password (email optional), and update login to accept phone or email.

**Architecture:** Phone is stored normalized (E.164) on the User model alongside a `phoneHash` HMAC blind index (same pattern as `emailHash`). Login detects identifier type by presence of `@`. A new protected endpoint `POST /api/auth/create-patient` handles doctor/lab patient creation. UI changes are label + field renames on login screens and an "Add Patient" modal on doctor/lab dashboards.

**Tech Stack:** Node.js/Express/Mongoose (API), React (web), React Native (mobile), existing `hmacHash` from `apps/api/src/utils/blindIndex.js`

## Global Constraints

- Phone must be normalized to E.164 format before storing or hashing (e.g. `+966501234567`)
- `phoneHash` uses the same `hmacHash()` function from `apps/api/src/utils/blindIndex.js` as `emailHash`
- Every User must have at least one of `email` or `phone` — enforced at route level
- `email` field becomes optional (sparse unique) but existing users are unaffected
- Login endpoint must accept both `identifier` and legacy `email` field for backward compatibility
- `create-patient` is restricted to `role: doctor` or `role: laboratory` only
- Password minimum 8 characters (existing rule)
- No SMS, no OTP, no email invite in scope

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/utils/phoneUtils.js` | **Create** | E.164 normalization helper |
| `apps/api/src/models/User.js` | **Modify** | Add `phone`, `phoneHash` fields; make `email` optional |
| `apps/api/src/routes/auth.js` | **Modify** | Login accepts `identifier`; add `POST /create-patient` |
| `apps/web/src/api/auth.js` | **Modify** | Add `createPatient()` export |
| `apps/web/src/pages/auth/LoginPage.jsx` | **Modify** | `email` field → `identifier` |
| `apps/web/src/components/CreatePatientModal.jsx` | **Create** | Shared modal for doctor + lab |
| `apps/web/src/pages/doctor/PatientRecordsPage.jsx` | **Modify** | Add `+ Add Patient` button + modal |
| `apps/web/src/pages/lab/LabDashboardPage.jsx` | **Modify** | Add `+ Add Patient` button + modal |
| `apps/mobile/src/screens/auth/LoginScreen.js` | **Modify** | `email` state/field → `identifier` |

---

## Task 1: Phone Normalization Utility

**Files:**
- Create: `apps/api/src/utils/phoneUtils.js`

**Interfaces:**
- Produces: `normalizePhone(raw: string): string` — returns E.164 string or throws if result has fewer than 7 digits

- [ ] **Step 1: Create the utility**

```js
// apps/api/src/utils/phoneUtils.js
'use strict';

/**
 * Normalizes a phone number to E.164 format (+countrycodenumber).
 * Strips spaces, dashes, dots, parentheses.
 * Prepends '+' if not already present.
 * Throws if the result has fewer than 7 digits (clearly invalid).
 */
function normalizePhone(raw) {
  const stripped = String(raw).trim().replace(/[\s\-().]/g, '');
  const e164 = stripped.startsWith('+') ? stripped : `+${stripped}`;
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 7) throw new Error('Invalid phone number');
  return e164;
}

module.exports = { normalizePhone };
```

- [ ] **Step 2: Verify manually**

```bash
node -e "const {normalizePhone}=require('./apps/api/src/utils/phoneUtils'); console.log(normalizePhone('+966 50 123 4567')); console.log(normalizePhone('0501234567'));"
```

Expected output:
```
+966501234567
+0501234567
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/utils/phoneUtils.js
git commit -m "feat(api/utils): add phone E.164 normalization helper"
```

---

## Task 2: User Model — Phone + phoneHash Fields

**Files:**
- Modify: `apps/api/src/models/User.js`

**Interfaces:**
- Consumes: `normalizePhone` from `apps/api/src/utils/phoneUtils.js`, `hmacHash` from `apps/api/src/utils/blindIndex.js`
- Produces: `User` documents with optional `phone` (E.164 string), `phoneHash` (HMAC hex string), and optional `email`

- [ ] **Step 1: Change `email` to optional + add `phone`/`phoneHash` fields**

In `apps/api/src/models/User.js`, make these changes:

```js
// ADD at top with other requires:
const { normalizePhone } = require('../utils/phoneUtils');

// CHANGE email field from:
//   email: { type: String, required: true, unique: true, lowercase: true, trim: true },
// TO:
email: { type: String, required: false, sparse: true, unique: true, lowercase: true, trim: true },

// ADD after the googleId field:
phone:     { type: String, default: null },
phoneHash: { type: String, default: null },
```

- [ ] **Step 2: Add sparse unique index on phoneHash (after the emailHash index line)**

```js
userSchema.index({ phoneHash: 1 }, { unique: true, sparse: true });
```

- [ ] **Step 3: Add pre-save hook for phone normalization and phoneHash maintenance**

Add this block immediately after the existing `emailHash` pre-save hook:

```js
// Normalize phone to E.164 and maintain phoneHash blind index.
userSchema.pre('save', function (next) {
  try {
    if (this.isModified('phone') && this.phone) {
      this.phone = normalizePhone(this.phone);
      this.phoneHash = hmacHash(this.phone);
    } else if (this.isModified('phone') && !this.phone) {
      this.phone = null;
      this.phoneHash = null;
    }
    next();
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Verify the model loads without error**

```bash
node -e "require('./apps/api/src/models/User'); console.log('User model OK');"
```

Expected: `User model OK`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/models/User.js apps/api/src/utils/phoneUtils.js
git commit -m "feat(api/model): add phone + phoneHash to User; make email optional"
```

---

## Task 3: Login Endpoint — Accept Phone or Email

**Files:**
- Modify: `apps/api/src/routes/auth.js` (the `POST /login` handler)

**Interfaces:**
- Consumes: `normalizePhone` from `../utils/phoneUtils`, `hmacHash` from `../utils/blindIndex`
- Produces: same JWT response as current login; accepts `{ identifier, password }` or `{ email, password }` (backward compat)

- [ ] **Step 1: Add `normalizePhone` import at top of `apps/api/src/routes/auth.js`**

```js
const { normalizePhone } = require('../utils/phoneUtils');
```

- [ ] **Step 2: Replace the login route validation and handler**

Find the block starting with `router.post('/login', loginLimiter, [` and replace it:

```js
// POST /api/auth/login
// Accepts { identifier, password } where identifier is email or phone.
// Also accepts legacy { email, password } for backward compatibility.
router.post('/login', loginLimiter, [
  body('identifier').optional().notEmpty(),
  body('email').optional().isEmail(),
  body('password').notEmpty(),
], validate, async (req, res, next) => {
  try {
    const { identifier, email: legacyEmail, password } = req.body;
    const raw = identifier || legacyEmail;
    if (!raw) return res.status(422).json({ message: 'identifier or email is required' });

    let user;
    if (raw.includes('@')) {
      // Email login
      const emailHashValue = hmacHash(raw.toLowerCase().trim());
      user = await User.findOne({ emailHash: emailHashValue }).select('+password');
    } else {
      // Phone login
      let normalizedPhone;
      try { normalizedPhone = normalizePhone(raw); } catch {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      const phoneHashValue = hmacHash(normalizedPhone);
      user = await User.findOne({ phoneHash: phoneHashValue }).select('+password');
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ message: 'Account suspended' });
    }

    AuditLog.create({
      userId: user._id,
      action: 'login',
      meta: { role: user.role },
    }).catch(err => console.error('[audit] login log failed:', err.message));

    const token = signToken(user._id);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Test login with email still works**

Start the API server and run:
```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"testpass123"}' | jq .
```

Expected: `{ token: "...", user: { ... } }` or `{ message: "Invalid credentials" }` (not a 500).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/auth.js
git commit -m "feat(api/auth): login accepts phone or email via identifier field"
```

---

## Task 4: Create Patient Endpoint

**Files:**
- Modify: `apps/api/src/routes/auth.js` (add new route after login)

**Interfaces:**
- Consumes: `Patient` model from `../models/Patient`, `normalizePhone`, `hmacHash`
- Produces: `POST /api/auth/create-patient` → `201 { id, name, phone, email, createdAt }`

- [ ] **Step 1: Add Patient model import at top of `apps/api/src/routes/auth.js`**

```js
const Patient = require('../models/Patient');
```

- [ ] **Step 2: Add the new route (place it after the existing `/login` route)**

```js
// POST /api/auth/create-patient — doctor or lab creates a patient account
router.post('/create-patient', auth, [
  body('name').notEmpty().trim().withMessage('name is required'),
  body('phone').notEmpty().withMessage('phone is required'),
  body('password').isLength({ min: 8 }).withMessage('password must be at least 8 characters'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('invalid email format'),
], validate, async (req, res, next) => {
  try {
    if (!['doctor', 'laboratory'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only doctors and labs can create patient accounts' });
    }

    const { name, phone, password, email } = req.body;

    // Normalize and hash phone upfront — fail fast before any DB writes
    let normalizedPhone;
    try { normalizedPhone = normalizePhone(phone); } catch {
      return res.status(422).json({ message: 'Invalid phone number format' });
    }
    const phoneHashValue = hmacHash(normalizedPhone);

    // Uniqueness checks before writes
    if (await User.findOne({ phoneHash: phoneHashValue })) {
      return res.status(409).json({ message: 'Phone number already registered' });
    }
    if (email) {
      const emailHashValue = hmacHash(email.toLowerCase().trim());
      if (await User.findOne({ emailHash: emailHashValue })) {
        return res.status(409).json({ message: 'Email already registered' });
      }
    }

    // Create User
    const userData = { name, phone: normalizedPhone, password, role: 'patient' };
    if (email) userData.email = email.toLowerCase().trim();
    const user = new User(userData);
    await user.save();

    // Create Patient profile — rollback User on failure
    try {
      await Patient.create({ userId: user._id });
    } catch (patientErr) {
      await User.findByIdAndDelete(user._id);
      throw patientErr;
    }

    AuditLog.create({
      userId: req.user.id,
      action: 'create_patient',
      meta: { createdPatientId: user._id, role: req.user.role },
    }).catch(err => console.error('[audit] create_patient log failed:', err.message));

    res.status(201).json({
      id: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email || null,
      createdAt: user.createdAt,
    });
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Verify route is accessible**

```bash
curl -s -X POST http://localhost:3000/api/auth/create-patient \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+966501234567","password":"testpass123"}' | jq .
```

Expected: `{ message: "No token provided" }` or `401` — confirms route exists and auth middleware runs.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/auth.js
git commit -m "feat(api/auth): POST /create-patient for doctor and lab roles"
```

---

## Task 5: Web Login Page — Identifier Field

**Files:**
- Modify: `apps/web/src/pages/auth/LoginPage.jsx`

**Interfaces:**
- Consumes: `login(data)` from `../../api/auth` — passes `{ identifier, password }` instead of `{ email, password }`

- [ ] **Step 1: Update LoginPage.jsx**

In `apps/web/src/pages/auth/LoginPage.jsx`:

Change the initial form state from:
```js
const [form, setForm] = useState({ email: '', password: '' });
```
To:
```js
const [form, setForm] = useState({ identifier: '', password: '' });
```

Change the fields array from:
```js
{[['email', t('auth.email'), 'email'],['password', t('auth.password'), 'password']].map(...)}
```
To:
```js
{[['identifier', t('auth.identifier') || 'Email or Phone Number', 'text'],['password', t('auth.password'), 'password']].map(...)}
```

- [ ] **Step 2: Verify web login page renders without errors**

Run the web dev server and open the login page. Confirm the label shows "Email or Phone Number" and the input accepts text.

```bash
cd apps/web && npm run dev
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/auth/LoginPage.jsx
git commit -m "feat(web/login): accept phone or email via identifier field"
```

---

## Task 6: Web API Client + CreatePatientModal

**Files:**
- Modify: `apps/web/src/api/auth.js`
- Create: `apps/web/src/components/CreatePatientModal.jsx`

**Interfaces:**
- Produces: `createPatient({ name, phone, password, email? })` → Promise resolving to `{ id, name, phone, email, createdAt }`
- Produces: `<CreatePatientModal onClose={() => void} onCreated={(patient) => void} />` React component

- [ ] **Step 1: Add `createPatient` to `apps/web/src/api/auth.js`**

```js
export const createPatient = (data) => client.post('/auth/create-patient', data);
```

- [ ] **Step 2: Create `apps/web/src/components/CreatePatientModal.jsx`**

```jsx
import { useState } from 'react';
import { createPatient } from '../api/auth';

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'grid', placeItems:'center', zIndex:1000 },
  modal:   { background:'var(--bg2,#0d1a2b)', border:'1px solid var(--border,#1e2d3d)', borderRadius:14, padding:28, width:'min(440px, 92vw)', display:'flex', flexDirection:'column', gap:18 },
  title:   { fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, marginBottom:2 },
  label:   { display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2,#94a3b8)', marginBottom:6 },
  input:   { width:'100%', padding:'9px 12px', background:'var(--bg3,#1e293b)', border:'1px solid var(--border,#1e2d3d)', borderRadius:8, color:'var(--text,#e2e8f0)', fontSize:13, outline:'none', boxSizing:'border-box' },
  error:   { fontSize:12, color:'#f43f5e', marginTop:4 },
  row:     { display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 },
  btnMint: { padding:'9px 20px', borderRadius:8, border:'none', cursor:'pointer', background:'var(--mint,#0fe3b0)', color:'#000', fontWeight:600, fontSize:13 },
  btnGray: { padding:'9px 20px', borderRadius:8, border:'1px solid var(--border,#1e2d3d)', cursor:'pointer', background:'transparent', color:'var(--text2,#94a3b8)', fontSize:13 },
};

export default function CreatePatientModal({ onClose, onCreated }) {
  const [form, setForm]     = useState({ name: '', phone: '', password: '', email: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  const set = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim())     e.name     = 'Name is required';
    if (!form.phone.trim())    e.phone    = 'Phone is required';
    if (form.password.length < 8) e.password = 'Minimum 8 characters';
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email format';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setLoading(true);
    try {
      const payload = { name: form.name.trim(), phone: form.phone.trim(), password: form.password };
      if (form.email.trim()) payload.email = form.email.trim();
      const patient = await createPatient(payload);
      setSuccess(patient);
      onCreated?.(patient);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to create patient';
      if (msg.toLowerCase().includes('phone')) setErrors({ phone: msg });
      else if (msg.toLowerCase().includes('email')) setErrors({ email: msg });
      else setErrors({ form: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.title}>Add Patient Account</div>

        {success ? (
          <>
            <div style={{ fontSize:14, color:'var(--mint,#0fe3b0)' }}>
              Patient created — <strong>{success.name}</strong> ({success.phone})
            </div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>Share the temporary password with them so they can log in.</div>
            <div style={S.row}>
              <button style={S.btnMint} onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {errors.form && <div style={S.error}>{errors.form}</div>}

            <div>
              <label style={S.label}>Full Name *</label>
              <input style={S.input} value={form.name} onChange={set('name')} placeholder="Fatima Al-Zahra" />
              {errors.name && <div style={S.error}>{errors.name}</div>}
            </div>

            <div>
              <label style={S.label}>Phone Number * <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(international format: +966...)</span></label>
              <input style={S.input} value={form.phone} onChange={set('phone')} placeholder="+966501234567" type="tel" />
              {errors.phone && <div style={S.error}>{errors.phone}</div>}
            </div>

            <div>
              <label style={S.label}>Temporary Password *</label>
              <input style={S.input} value={form.password} onChange={set('password')} type="password" placeholder="Min 8 characters" />
              {errors.password && <div style={S.error}>{errors.password}</div>}
            </div>

            <div>
              <label style={S.label}>Email <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(optional)</span></label>
              <input style={S.input} value={form.email} onChange={set('email')} type="email" placeholder="patient@example.com" />
              {errors.email && <div style={S.error}>{errors.email}</div>}
            </div>

            <div style={S.row}>
              <button type="button" style={S.btnGray} onClick={onClose}>Cancel</button>
              <button type="submit" style={{ ...S.btnMint, opacity: loading ? 0.6 : 1 }} disabled={loading}>
                {loading ? 'Creating…' : 'Create Patient'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/auth.js apps/web/src/components/CreatePatientModal.jsx
git commit -m "feat(web): createPatient API client + CreatePatientModal component"
```

---

## Task 7: Wire Add Patient Button — Doctor Dashboard

**Files:**
- Modify: `apps/web/src/pages/doctor/PatientRecordsPage.jsx`

**Interfaces:**
- Consumes: `<CreatePatientModal>` from `../../components/CreatePatientModal`

- [ ] **Step 1: Add import and modal state to PatientRecordsPage.jsx**

At the top of `PatientRecordsPage.jsx`, add:
```js
import CreatePatientModal from '../../components/CreatePatientModal';
```

Inside the component, after the existing `useState` declarations, add:
```js
const [showModal, setShowModal] = useState(false);
```

- [ ] **Step 2: Add the "+ Add Patient" button in the sticky header**

In the sticky header `<div>`, add a button alongside the title:

```jsx
<div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
  <div>
    <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>{t('patientRecords.title')}</div>
    <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>
      {loading ? 'Loading…' : `${filtered.length} patient${filtered.length !== 1 ? 's' : ''}`}
    </div>
  </div>
  <button
    onClick={() => setShowModal(true)}
    style={{ padding:'8px 16px', borderRadius:8, border:'none', cursor:'pointer', background:'var(--mint,#0fe3b0)', color:'#000', fontWeight:600, fontSize:13 }}
  >
    + Add Patient
  </button>
</div>
```

- [ ] **Step 3: Render the modal at the bottom of the return block**

Before the closing `</div>` of the component's return:
```jsx
{showModal && (
  <CreatePatientModal
    onClose={() => setShowModal(false)}
    onCreated={() => setShowModal(false)}
  />
)}
```

- [ ] **Step 4: Test the flow**

Open the doctor dashboard → Patient Records page. Confirm:
- "+ Add Patient" button visible in header
- Clicking opens the modal
- Submitting with missing phone shows validation error inline
- Successful creation shows confirmation and closes on "Done"

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/doctor/PatientRecordsPage.jsx
git commit -m "feat(web/doctor): Add Patient button and modal on PatientRecordsPage"
```

---

## Task 8: Wire Add Patient Button — Lab Dashboard

**Files:**
- Modify: `apps/web/src/pages/lab/LabDashboardPage.jsx`

**Interfaces:**
- Consumes: `<CreatePatientModal>` from `../../components/CreatePatientModal`

- [ ] **Step 1: Add import and modal state**

```js
import CreatePatientModal from '../../components/CreatePatientModal';
```

Inside the component, add:
```js
const [showModal, setShowModal] = useState(false);
```

- [ ] **Step 2: Add the button**

In the page header area of `LabDashboardPage.jsx` (wherever the page title is), add:

```jsx
<button
  onClick={() => setShowModal(true)}
  style={{ padding:'8px 16px', borderRadius:8, border:'none', cursor:'pointer', background:'var(--mint,#0fe3b0)', color:'#000', fontWeight:600, fontSize:13 }}
>
  + Add Patient
</button>
```

- [ ] **Step 3: Render the modal**

Before the closing tag of the return:
```jsx
{showModal && (
  <CreatePatientModal
    onClose={() => setShowModal(false)}
    onCreated={() => setShowModal(false)}
  />
)}
```

- [ ] **Step 4: Test the flow**

Log in as a lab user. Confirm the button appears and the modal works identically to the doctor flow.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/lab/LabDashboardPage.jsx
git commit -m "feat(web/lab): Add Patient button and modal on LabDashboardPage"
```

---

## Task 9: Mobile Login Screen — Identifier Field

**Files:**
- Modify: `apps/mobile/src/screens/auth/LoginScreen.js`

**Interfaces:**
- Consumes: `login(d)` from `../../api/auth` — sends `{ identifier, password }` instead of `{ email, password }`

- [ ] **Step 1: Rename state variable and update the submit call**

In `apps/mobile/src/screens/auth/LoginScreen.js`:

Change:
```js
const [email, setEmail] = useState('');
```
To:
```js
const [identifier, setIdentifier] = useState('');
```

Change the submit call from:
```js
const { token, user } = await login({ email, password });
```
To:
```js
const { token, user } = await login({ identifier, password });
```

- [ ] **Step 2: Update the TextInput**

Change:
```jsx
<Text style={s.label}>{t('auth.email')}</Text>
<TextInput style={s.input} value={email} onChangeText={setEmail} placeholder={t('auth.emailPlaceholder')} placeholderTextColor={C.text3} keyboardType="email-address" autoCapitalize="none" />
```
To:
```jsx
<Text style={s.label}>{t('auth.identifier') || 'Email or Phone Number'}</Text>
<TextInput style={s.input} value={identifier} onChangeText={setIdentifier} placeholder={t('auth.identifierPlaceholder') || 'Email or +966...'} placeholderTextColor={C.text3} keyboardType="default" autoCapitalize="none" autoCorrect={false} />
```

- [ ] **Step 3: Verify no remaining references to `email` state in the login flow**

```bash
grep -n '\bemail\b' apps/mobile/src/screens/auth/LoginScreen.js
```

Expected: zero matches (or only in comments/unrelated code).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/auth/LoginScreen.js
git commit -m "feat(mobile/login): accept phone or email via identifier field"
```
