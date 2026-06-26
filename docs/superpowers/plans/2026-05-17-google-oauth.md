# Google OAuth Sign-In — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Sign-In to MediConnect — server-side ID token verification, auto-link on email collision, always creates `patient` role for new Google accounts.

**Architecture:** Three-layer implementation: (1) API backend receives ID token, verifies with `google-auth-library`, handles create/link/sign-in in one endpoint; (2) Mobile uses `expo-auth-session` to run the OAuth browser flow and hand the ID token to the backend; (3) Web uses Google Identity Services (GSI) to render a native Google button that calls the same backend endpoint. All auth decisions happen server-side.

**Tech Stack:** `google-auth-library` (API), `expo-auth-session` + `expo-web-browser` (Mobile), Google Identity Services GSI script (Web), existing `sign` JWT util, existing Zustand `authStore`.

---

## Critical Risk Before Starting

The current `User` model has `password: { type: String, required: true }`. Google sign-up users have no password — this will cause `User.create(...)` to fail. **Task 1 must be completed before any other task.**

---

## File Map

**Create:**
- `apps/api/src/utils/googleAuth.js` — `verifyGoogleToken(idToken)` helper
- `apps/mobile/src/hooks/useGoogleSignIn.js` — expo-auth-session hook
- `apps/web/src/components/GoogleSignInButton.jsx` — GSI button component

**Modify:**
- `apps/api/src/models/User.js` — make `password` optional, add `googleId`, fix `comparePassword`
- `apps/api/src/routes/auth.js` — add `POST /google` endpoint
- `apps/mobile/app.json` — add `scheme: "mediconnect"`
- `apps/mobile/src/api/auth.js` — add `googleSignIn` function
- `apps/mobile/src/screens/auth/LoginScreen.js` — add Google button
- `apps/mobile/src/screens/auth/RegisterScreen.js` — add Google button
- `apps/web/index.html` — add GSI script tag
- `apps/web/src/api/auth.js` — add `googleSignIn` function
- `apps/web/src/pages/auth/LoginPage.jsx` — add Google button
- `apps/web/src/pages/auth/RegisterPage.jsx` — add Google button

---

## Task 1: Fix User Model — Make Password Optional, Add googleId

The `password: required: true` field blocks Google user creation. Fix the model before touching any endpoint.

**Files:**
- Modify: `apps/api/src/models/User.js`

- [ ] **Step 1: Make password optional, add googleId field**

Replace the `password` field and add `googleId` in `apps/api/src/models/User.js`:

```js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false },           // optional — Google-only users have no password
  googleId: { type: String, sparse: true, index: true }, // sparse: only index documents that have this field
  role: { type: String, enum: ['doctor', 'patient', 'laboratory'], required: true },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
  },
  fcmToken: { type: String, default: '' },
  photoUrl: { type: String, default: '' },
}, { timestamps: true });

userSchema.index({ location: '2dsphere' });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next(); // skip if no password set
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  if (!this.password) return Promise.resolve(false); // Google-only user — always reject password login
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
```

- [ ] **Step 2: Verify the model loads without error**

```bash
cd apps/api && node -e "require('./src/models/User'); console.log('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/models/User.js
git commit -m "fix(api): make password optional on User model, add sparse googleId index"
```

---

## Task 2: Backend — Install google-auth-library and Create verifyGoogleToken Utility

**Files:**
- Create: `apps/api/src/utils/googleAuth.js`

- [ ] **Step 1: Install dependency**

```bash
cd apps/api && npm install google-auth-library
```

Expected: package installs without error; `package.json` gains `"google-auth-library"` entry.

- [ ] **Step 2: Create googleAuth.js**

Create `apps/api/src/utils/googleAuth.js`:

```js
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload.email_verified) {
    const err = new Error('Google account email is not verified');
    err.status = 401;
    throw err;
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
  };
}

module.exports = { verifyGoogleToken };
```

- [ ] **Step 3: Verify it loads**

```bash
cd apps/api && node -e "require('./src/utils/googleAuth'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 4: Add GOOGLE_CLIENT_ID to .env**

Open `apps/api/.env` and add:

```
GOOGLE_CLIENT_ID=<your-web-oauth-client-id-from-google-cloud-console>
```

_(Leave the value empty for now if you don't have the credential yet — the app will boot, but `/api/auth/google` will fail at runtime until the real value is set.)_

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/utils/googleAuth.js apps/api/package.json apps/api/package-lock.json
git commit -m "feat(api): add google-auth-library and verifyGoogleToken utility"
```

---

## Task 3: Backend — POST /api/auth/google Endpoint

**Files:**
- Modify: `apps/api/src/routes/auth.js`

- [ ] **Step 1: Add import for verifyGoogleToken at top of auth.js**

After the existing imports at the top of `apps/api/src/routes/auth.js`, add:

```js
const { verifyGoogleToken } = require('../utils/googleAuth');
```

- [ ] **Step 2: Add the endpoint before `module.exports`**

At the end of `apps/api/src/routes/auth.js`, before `module.exports = router;`, add:

```js
// POST /api/auth/google
// Body: { idToken: string }  — Google ID token from client
router.post('/google', [
  body('idToken').notEmpty().withMessage('idToken is required'),
], validate, async (req, res, next) => {
  try {
    const { googleId, email, name } = await verifyGoogleToken(req.body.idToken);

    // 1. Already linked to a Google account — fastest path
    let user = await User.findOne({ googleId });
    if (user) {
      const token = sign({ id: user._id, role: user.role });
      return res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    }

    // 2. Email exists — link this Google account to the existing user
    user = await User.findOne({ email });
    if (user) {
      user.googleId = googleId;
      await user.save();
      const token = sign({ id: user._id, role: user.role });
      return res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    }

    // 3. New user — create patient (Google sign-up always = patient role)
    user = await User.create({ name, email, googleId, role: 'patient' });
    await Patient.create({ userId: user._id });
    const token = sign({ id: user._id, role: user.role });
    return res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ message: err.message });
    next(err);
  }
});
```

- [ ] **Step 3: Verify no syntax errors**

```bash
cd apps/api && node -e "require('./src/routes/auth'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 4: Test the endpoint manually**

Start the API: `cd apps/api && npm run dev`

Test missing body:
```bash
curl -s -X POST http://localhost:5000/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
```
Expected: `422` with `"idToken is required"` in the errors array.

Test invalid token:
```bash
curl -s -X POST http://localhost:5000/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{"idToken":"not-a-real-token"}' | python3 -m json.tool
```
Expected: `500` (or `401` once `GOOGLE_CLIENT_ID` is set and the library rejects the bad token). With no real credential: the library throws `Error: Token used too late` or similar — the `next(err)` handler will return a 500. That's expected here.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/auth.js
git commit -m "feat(api): add POST /api/auth/google endpoint with create/link/sign-in logic"
```

---

## Task 4: Mobile — Add expo-auth-session, expo-web-browser, Scheme, and API Function

**Files:**
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/src/api/auth.js`

- [ ] **Step 1: Install mobile dependencies**

```bash
cd apps/mobile && npx expo install expo-auth-session expo-web-browser
```

Expected: Both packages added to `package.json` without peer dependency errors.

- [ ] **Step 2: Add scheme to app.json**

In `apps/mobile/app.json`, inside the `"expo"` object, add:

```json
"scheme": "mediconnect"
```

The result should look like:
```json
{
  "expo": {
    "name": "...",
    "slug": "...",
    "scheme": "mediconnect",
    ...
  }
}
```

- [ ] **Step 3: Add googleSignIn to mobile API module**

Open `apps/mobile/src/api/auth.js` and add at the end (before any `export default` if present):

```js
export async function googleSignIn(idToken) {
  const { data } = await api.post('/auth/google', { idToken });
  return data; // { token, user }
}
```

_(`api` is the axios instance already defined at the top of that file.)_

- [ ] **Step 4: Add EXPO_PUBLIC env var**

Create or open `apps/mobile/.env` and add:

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<your-web-oauth-client-id-from-google-cloud-console>
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app.json apps/mobile/package.json apps/mobile/package-lock.json apps/mobile/src/api/auth.js
git commit -m "feat(mobile): install expo-auth-session, add mediconnect scheme, add googleSignIn API call"
```

---

## Task 5: Mobile — useGoogleSignIn Hook

**Files:**
- Create: `apps/mobile/src/hooks/useGoogleSignIn.js`

- [ ] **Step 1: Create the hooks directory if needed**

```bash
mkdir -p apps/mobile/src/hooks
```

- [ ] **Step 2: Create useGoogleSignIn.js**

Create `apps/mobile/src/hooks/useGoogleSignIn.js`:

```js
import { useEffect, useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import useAuthStore from '../store/authStore';
import { googleSignIn } from '../api/auth';

WebBrowser.maybeCompleteAuthSession();

export default function useGoogleSignIn() {
  const setAuth = useAuthStore(s => s.login);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (!response) return;

    if (response.type === 'success') {
      const idToken = response.params.id_token;
      setLoading(true);
      setError('');
      googleSignIn(idToken)
        .then(({ token, user }) => setAuth(user, token))
        .catch(e => setError(e.message || 'Google sign-in failed'))
        .finally(() => setLoading(false));
    } else if (response.type === 'error' || response.type === 'cancel') {
      setError(response.type === 'cancel' ? '' : 'Google sign-in failed');
    }
  }, [response]);

  const signIn = useCallback(() => {
    setError('');
    promptAsync();
  }, [promptAsync]);

  return { signIn, loading, error, ready: !!request };
}
```

- [ ] **Step 3: Verify no import errors in the hook**

```bash
cd apps/mobile && node -e "
const { parse } = require('@babel/parser');
const fs = require('fs');
parse(fs.readFileSync('src/hooks/useGoogleSignIn.js','utf8'), { sourceType:'module', plugins:['jsx'] });
console.log('Parse OK');
" 2>/dev/null || echo "Note: babel not available — check manually"
```

Expected: `Parse OK` or the manual note. If babel is unavailable, just visually check the file for syntax.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/hooks/useGoogleSignIn.js
git commit -m "feat(mobile): add useGoogleSignIn hook using expo-auth-session"
```

---

## Task 6: Mobile — Add Google Button to LoginScreen and RegisterScreen

**Files:**
- Modify: `apps/mobile/src/screens/auth/LoginScreen.js`
- Modify: `apps/mobile/src/screens/auth/RegisterScreen.js`

- [ ] **Step 1: Update LoginScreen.js**

At the top of `apps/mobile/src/screens/auth/LoginScreen.js`, add the import after the existing imports:

```js
import useGoogleSignIn from '../../hooks/useGoogleSignIn';
```

Inside `LoginScreen`, add the hook call after the existing state declarations:

```js
const { signIn: googleSignIn, loading: googleLoading, error: googleError } = useGoogleSignIn();
```

Replace the closing of the `ScrollView` (just before `</ScrollView>`) — add the divider and Google button after the existing "No account?" link:

```jsx
      {/* divider */}
      <View style={{ flexDirection:'row', alignItems:'center', marginTop:24, marginBottom:12, width:'100%' }}>
        <View style={{ flex:1, height:1, backgroundColor:C.border2 }} />
        <Text style={{ color:C.text3, fontSize:12, marginHorizontal:10 }}>or</Text>
        <View style={{ flex:1, height:1, backgroundColor:C.border2 }} />
      </View>

      <TouchableOpacity
        style={[s.btn, { backgroundColor:'#fff', borderWidth:1, borderColor:C.border2 }]}
        onPress={googleSignIn}
        disabled={googleLoading}
      >
        <Text style={{ fontSize:15, fontWeight:'700', color:'#333' }}>
          {googleLoading ? 'Signing in…' : 'G  Sign in with Google'}
        </Text>
      </TouchableOpacity>
      {!!googleError && <Text style={[s.error, { marginTop:8 }]}>{googleError}</Text>}
```

- [ ] **Step 2: Update RegisterScreen.js**

At the top of `apps/mobile/src/screens/auth/RegisterScreen.js`, add:

```js
import useGoogleSignIn from '../../hooks/useGoogleSignIn';
```

Inside `RegisterScreen`, add the hook call after the existing state declarations:

```js
const { signIn: googleSignIn, loading: googleLoading, error: googleError } = useGoogleSignIn();
```

Add the divider and button after the existing "Have an account?" link (just before `</ScrollView>`):

```jsx
      {/* divider */}
      <View style={{ flexDirection:'row', alignItems:'center', marginTop:24, marginBottom:12, width:'100%' }}>
        <View style={{ flex:1, height:1, backgroundColor:C.border2 }} />
        <Text style={{ color:C.text3, fontSize:12, marginHorizontal:10 }}>or</Text>
        <View style={{ flex:1, height:1, backgroundColor:C.border2 }} />
      </View>

      <TouchableOpacity
        style={[s.btn, { backgroundColor:'#fff', borderWidth:1, borderColor:C.border2 }]}
        onPress={googleSignIn}
        disabled={googleLoading}
      >
        <Text style={{ fontSize:15, fontWeight:'700', color:'#333' }}>
          {googleLoading ? 'Creating account…' : 'G  Sign up with Google'}
        </Text>
      </TouchableOpacity>
      <Text style={{ color:C.text3, fontSize:11, marginTop:8, textAlign:'center' }}>
        Google sign-up creates a patient account
      </Text>
      {!!googleError && <Text style={{ color:C.rose, fontSize:13, marginTop:6 }}>{googleError}</Text>}
```

- [ ] **Step 3: Run the app and test**

```bash
cd apps/mobile && npx expo start
```

Open in Expo Go. Navigate to Login screen and Register screen. Verify:
- Google button appears below the divider on both screens
- Tapping it opens a browser window for Google sign-in (requires `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to be set)
- After sign-in, app navigates to the appropriate home screen

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/auth/LoginScreen.js apps/mobile/src/screens/auth/RegisterScreen.js
git commit -m "feat(mobile): add Google sign-in button to LoginScreen and RegisterScreen"
```

---

## Task 7: Web — GSI Script, googleSignIn API, and GoogleSignInButton Component

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/api/auth.js`
- Create: `apps/web/src/components/GoogleSignInButton.jsx`

- [ ] **Step 1: Add GSI script to index.html**

In `apps/web/index.html`, add this line before `</head>`:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

- [ ] **Step 2: Add VITE_GOOGLE_CLIENT_ID to web .env**

Create or open `apps/web/.env` and add:

```
VITE_GOOGLE_CLIENT_ID=<your-web-oauth-client-id-from-google-cloud-console>
```

- [ ] **Step 3: Add googleSignIn to web API module**

Open `apps/web/src/api/auth.js` and add at the end:

```js
export async function googleSignIn(idToken) {
  const { data } = await api.post('/auth/google', { idToken });
  return data; // { token, user }
}
```

_(Same `api` axios instance already used by `login` and `register` in that file.)_

- [ ] **Step 4: Create GoogleSignInButton.jsx**

Create `apps/web/src/components/GoogleSignInButton.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { googleSignIn } from '../api/auth';

export default function GoogleSignInButton() {
  const ref = useRef(null);
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.login);
  const [error, setError] = useState('');

  useEffect(() => {
    const init = () => {
      if (!window.google || !ref.current) return;

      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setError('');
          try {
            const { token, user } = await googleSignIn(credential);
            setAuth(user, token);
            navigate('/find-doctor');
          } catch (e) {
            setError(e.message || 'Google sign-in failed');
          }
        },
      });

      window.google.accounts.id.renderButton(ref.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: ref.current.offsetWidth || 360,
      });
    };

    if (window.google) {
      init();
    } else {
      // GSI script is async — wait for it to load
      const script = document.querySelector('script[src*="accounts.google.com/gsi"]');
      if (script) {
        script.addEventListener('load', init);
        return () => script.removeEventListener('load', init);
      }
    }
  }, []);

  return (
    <div>
      <div ref={ref} style={{ width: '100%' }} />
      {error && (
        <p style={{ color: 'var(--rose)', fontSize: 13, margin: '8px 0 0', textAlign: 'center' }}>
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/index.html apps/web/src/api/auth.js apps/web/src/components/GoogleSignInButton.jsx apps/web/.env
git commit -m "feat(web): add GSI script, googleSignIn API call, GoogleSignInButton component"
```

---

## Task 8: Web — Add Google Button to LoginPage and RegisterPage

**Files:**
- Modify: `apps/web/src/pages/auth/LoginPage.jsx`
- Modify: `apps/web/src/pages/auth/RegisterPage.jsx`

- [ ] **Step 1: Update LoginPage.jsx**

At the top of `apps/web/src/pages/auth/LoginPage.jsx`, add the import after the existing imports:

```js
import GoogleSignInButton from '../../components/GoogleSignInButton';
```

Inside the form card JSX, after the submit `<Button>` element, add:

```jsx
{/* Google sign-in */}
<div style={{ display:'flex', alignItems:'center', gap:12, margin:'20px 0 16px' }}>
  <div style={{ flex:1, height:1, background:'var(--border)' }} />
  <span style={{ color:'var(--text2)', fontSize:12 }}>or</span>
  <div style={{ flex:1, height:1, background:'var(--border)' }} />
</div>
<GoogleSignInButton />
```

- [ ] **Step 2: Update RegisterPage.jsx**

At the top of `apps/web/src/pages/auth/RegisterPage.jsx`, add the import:

```js
import GoogleSignInButton from '../../components/GoogleSignInButton';
```

Inside the form card JSX, after the submit `<Button>` element, add:

```jsx
{/* Google sign-up — always creates a patient account */}
<div style={{ display:'flex', alignItems:'center', gap:12, margin:'20px 0 16px' }}>
  <div style={{ flex:1, height:1, background:'var(--border)' }} />
  <span style={{ color:'var(--text2)', fontSize:12 }}>or</span>
  <div style={{ flex:1, height:1, background:'var(--border)' }} />
</div>
<GoogleSignInButton />
<p style={{ color:'var(--text2)', fontSize:12, textAlign:'center', margin:'8px 0 0' }}>
  Google sign-up creates a patient account
</p>
```

- [ ] **Step 3: Start the web app and test**

```bash
cd apps/web && npm run dev
```

Open http://localhost:5173 (or the port shown). Go to `/login` and `/register`. Verify:
- Google button renders below the divider on both pages
- Clicking it opens the Google OAuth popup (requires `VITE_GOOGLE_CLIENT_ID` to be set and the current origin registered in Google Cloud Console)
- Successful sign-in redirects to `/find-doctor`
- Error state displays below the button on failure

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/auth/LoginPage.jsx apps/web/src/pages/auth/RegisterPage.jsx
git commit -m "feat(web): add Google sign-in button to LoginPage and RegisterPage"
```

---

## Credential Setup Checklist (One-time, Do Outside Code)

Before end-to-end testing works, complete these in Google Cloud Console:

- [ ] Create a project (or use existing)
- [ ] Enable "Google Identity" / OAuth2 API
- [ ] Create a **Web** OAuth 2.0 Client ID
  - Authorized JS origins: `http://localhost:5173` (web dev), your production domain
  - Authorized redirect URIs: `https://auth.expo.io` (mobile Expo Go redirect)
- [ ] Create an **iOS** OAuth Client (bundle ID from `app.json`)
- [ ] Create an **Android** OAuth Client (package + SHA-1 from `app.json`)
- [ ] Put the Web Client ID in:
  - `apps/api/.env` → `GOOGLE_CLIENT_ID`
  - `apps/mobile/.env` → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
  - `apps/web/.env` → `VITE_GOOGLE_CLIENT_ID`

---

## End-to-End Test Matrix

| Scenario | Expected Result |
|---|---|
| New Google user signs in (mobile or web) | Patient account created; JWT returned; navigate to home |
| Existing email/password user signs in with same email Google account | `googleId` linked to existing account; JWT returned |
| Already-linked Google user signs in again | Found by `googleId`; JWT returned; no duplicate created |
| Google account with `email_verified: false` | 401 — "Google account email is not verified" |
| Missing `idToken` in request body | 422 — validation error |
| Google-only user attempts password login | 401 — "Invalid credentials" (comparePassword returns false) |
