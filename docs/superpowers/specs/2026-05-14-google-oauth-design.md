# Google OAuth Sign-In — Design Spec

**Date:** 2026-05-14
**Scope:** Mobile (Expo React Native) + Web (React/Vite) + API (Node.js/Express)
**Approach:** expo-auth-session (mobile) + Google Identity Services (web) + server-side ID token verification

---

## Decisions

| Question | Decision |
|---|---|
| Role for new Google sign-ups | `patient` (default). Doctors/labs must use email/password. |
| Email collision (existing account) | Auto-link: set `googleId` on the existing user, return JWT |
| Lab role via Google | Not supported — labs use email/password only |
| Verification library | `google-auth-library` on the backend |
| Mobile SDK | `expo-auth-session` + `expo-web-browser` (works in Expo Go) |

---

## Required Credentials

| Variable | Where | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `apps/api/.env` | Web OAuth Client ID — used for server-side token verification |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `apps/mobile/.env` | Same Web Client ID — used by expo-auth-session |
| `VITE_GOOGLE_CLIENT_ID` | `apps/web/.env` | Same Web Client ID — used by Google Identity Services |

All three values are the **same Web Client ID** from Google Cloud Console. Additionally, in Google Cloud Console you must:
- Register an **iOS OAuth Client** (bundle ID: from `app.json`)
- Register an **Android OAuth Client** (package name + SHA-1 fingerprint from `app.json`)
- Add `https://auth.expo.io` as an authorized redirect URI on the Web Client

---

## Backend

### Model change — `apps/api/src/models/User.js`

```js
googleId: { type: String, sparse: true, index: true, default: '' },
```

Sparse index so documents without `googleId` don't occupy index space.

### New route — `POST /api/auth/google`

**File:** `apps/api/src/routes/auth.js`

**Request body:**
```json
{ "idToken": "<Google ID token string>" }
```

**Logic:**
1. Verify the ID token using `google-auth-library` `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`
2. Extract `{ sub: googleId, email, name, email_verified }` from the payload
3. Reject (401) if `email_verified` is `false`
4. Find user by `googleId` → sign in, return JWT
5. Find user by `email` → link (`user.googleId = googleId`, save) → return JWT
6. No match → create new `patient` User + Patient profile → return JWT

**Response** (same shape as existing login):
```json
{ "token": "<JWT>", "user": { "id", "name", "email", "role" } }
```

**New dependency:** `google-auth-library`

**Error cases:**
- `400` — missing `idToken`
- `401` — token verification failed or `email_verified: false`
- `500` — unexpected error (logged, generic message to client)

---

## Mobile

### Dependencies
- `expo-auth-session` (new)
- `expo-web-browser` (new)

### `app.json` change
Add URL scheme for redirect:
```json
"scheme": "mediconnect"
```

### New hook — `apps/mobile/src/hooks/useGoogleSignIn.js`

Encapsulates the expo-auth-session OAuth flow:
- Uses `Google.useIdTokenAuthRequest({ webClientId })` from `expo-auth-session/providers/google` — returns the `id_token` directly without a separate token exchange step
- On `type === 'success'`: reads `response.params.id_token`
- Calls `POST /api/auth/google` with the ID token
- On success: calls `authStore.login(user, token)`
- Returns `{ signIn, loading, error }` for the UI to consume

### UI changes
- `apps/mobile/src/screens/auth/LoginScreen.js` — add "Sign in with Google" button below existing form
- `apps/mobile/src/screens/auth/RegisterScreen.js` — add "Sign up with Google" button below existing form

Button style: white background, Google logo icon (unicode `G` or image), border, matches existing screen palette.

---

## Web

### `apps/web/index.html` change
Add before `</head>`:
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

### New component — `apps/web/src/components/GoogleSignInButton.jsx`

- Renders a `<div ref>` and calls `google.accounts.id.renderButton()` on mount
- Accepts `onSuccess(idToken)` callback prop
- Internally calls `POST /api/auth/google` on credential response and dispatches to auth store
- Handles loading and error states inline

### UI changes
- `apps/web/src/pages/auth/LoginPage.jsx` — add `<GoogleSignInButton />` below form with a divider ("or")
- `apps/web/src/pages/auth/RegisterPage.jsx` — same

---

## Security Notes

- ID token verification **always** happens server-side — clients never decide auth outcome
- `email_verified: false` tokens are rejected — prevents unverified Google accounts
- Auto-linking only triggers on exact email match — no fuzzy matching
- Newly created Google accounts have no `password` field — `comparePassword` calls on them will always return false, which is correct (they must use Google to sign in unless they later set a password via change-password flow)
- `googleId` sparse index prevents collisions at DB level

---

## File Map

**Create:**
- `apps/api/src/utils/googleAuth.js` — `verifyGoogleToken(idToken)` helper
- `apps/mobile/src/hooks/useGoogleSignIn.js` — expo-auth-session hook
- `apps/web/src/components/GoogleSignInButton.jsx` — GSI button component

**Modify:**
- `apps/api/src/models/User.js` — add `googleId` field
- `apps/api/src/routes/auth.js` — add `POST /google` endpoint
- `apps/mobile/src/screens/auth/LoginScreen.js` — add Google button
- `apps/mobile/src/screens/auth/RegisterScreen.js` — add Google button
- `apps/web/src/pages/auth/LoginPage.jsx` — add Google button
- `apps/web/src/pages/auth/RegisterPage.jsx` — add Google button
- `apps/web/index.html` — add GSI script
- `apps/mobile/app.json` — add `scheme: "mediconnect"`
