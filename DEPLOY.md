# MediConnect — Railway Deployment Guide

Two Railway services + MongoDB Atlas + Redis (Railway plugin).

---

## Prerequisites

- [Railway account](https://railway.app) (free tier works for staging)
- [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (free M0 tier works)
- Cloudinary account (required for GDPR data export + prescription QR)
- Resend account (optional — email notifications)
- Anthropic API key (optional — AI features degrade gracefully without it)

---

## Step 1 — MongoDB Atlas

1. Create a free M0 cluster at mongodb.com/atlas
2. Create a database user (username + password)
3. Whitelist all IPs: `0.0.0.0/0` (Railway IPs are dynamic)
4. Copy the connection string: `mongodb+srv://user:pass@cluster.mongodb.net/mediconnect`

---

## Step 2 — Generate Encryption Keys

Run locally (Node.js required):

```bash
node -e "console.log('FIELD_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('BLIND_INDEX_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

Save both values — they encrypt PHI at rest. **Losing these keys means losing access to all patient data.**

---

## Step 3 — Create Railway Project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Empty Project**
3. Add Redis plugin: **+ New** → **Database** → **Redis**
   - Copy `REDIS_URL` from the Redis plugin's Variables tab

---

## Step 4 — Deploy the API Service

1. In your Railway project: **+ New** → **GitHub Repo**
2. Select this repository
3. Set **Root Directory** → `apps/api`
4. Railway detects `railway.toml` and uses Nixpacks automatically

### API Environment Variables

In the API service **Variables** tab, add all of the following:

| Variable | Value |
|----------|-------|
| `MONGODB_URI` | Your Atlas connection string |
| `JWT_SECRET` | Random 32+ char string |
| `JWT_EXPIRES_IN` | `7d` |
| `NODE_ENV` | `production` |
| `FIELD_ENCRYPTION_KEY` | 64-char hex from Step 2 |
| `BLIND_INDEX_KEY` | 64-char hex from Step 2 |
| `REDIS_URL` | From Railway Redis plugin |
| `ALLOWED_ORIGINS` | Your web service URL (add after Step 5) |
| `ADMIN_SECRET` | Strong random string |
| `ANTHROPIC_API_KEY` | Optional — AI features |
| `RESEND_API_KEY` | Optional — email |
| `EMAIL_FROM` | Optional — e.g. `noreply@yourdomain.com` |
| `FIREBASE_SERVICE_ACCOUNT` | Optional — FCM push (JSON string) |
| `FCM_SERVER_KEY` | Optional — FCM legacy key |
| `CLOUDINARY_CLOUD_NAME` | Required for GDPR export |
| `CLOUDINARY_API_KEY` | Required for GDPR export |
| `CLOUDINARY_API_SECRET` | Required for GDPR export |
| `DAILY_API_KEY` | Optional — video consultations |
| `DAILY_DOMAIN` | Optional — video consultations |
| `GOOGLE_CLIENT_ID` | Optional — Google OAuth |

5. Click **Deploy**
6. Wait for build to complete (~2 min)
7. Copy the generated API URL: `https://xxxx.up.railway.app`
8. Verify: `curl https://xxxx.up.railway.app/health` → `{"status":"ok"}`

---

## Step 5 — Deploy the Web Service

1. In same Railway project: **+ New** → **GitHub Repo**
2. Select this repository again
3. Set **Root Directory** → `apps/web`
4. Railway detects `railway.toml` (uses `Dockerfile.railway`)

### Web Environment Variables

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | Your API service URL from Step 4 (e.g. `https://api-xxxx.up.railway.app`) |

> `VITE_API_URL` is baked into the JavaScript bundle at build time. Every time you change it, Railway will rebuild and redeploy.

5. Click **Deploy**
6. Copy the web service URL

### Update API CORS

Go back to the **API service** Variables:
- Set `ALLOWED_ORIGINS` = your web service URL

Redeploy the API service.

---

## Step 6 — Verify Deployment

```bash
# API health
curl https://YOUR-API-URL.up.railway.app/health

# Test auth (replace URL)
curl -X POST https://YOUR-API-URL.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"Test123!","role":"patient","consentAccepted":true}'
```

---

## Custom Domains (Optional)

In each service → **Settings** → **Domains** → **+ Custom Domain**

Recommended:
- API: `api.yourdomain.com`
- Web: `app.yourdomain.com`

Update `ALLOWED_ORIGINS` and `VITE_API_URL` accordingly and redeploy both services.

---

## Architecture on Railway

```
Railway Project
├── API Service (apps/api)
│   ├── Node.js 20, Nixpacks
│   ├── /health endpoint
│   └── connects to → MongoDB Atlas + Redis Plugin
├── Web Service (apps/web)
│   ├── nginx + React/Vite build (Dockerfile.railway)
│   └── API calls → API Service URL (baked in at build)
└── Redis Plugin
    └── used by BullMQ workers (reminders, AI, GDPR export)
```

---

## Local Development (Docker Compose)

For local development, use the existing Docker Compose setup (uses internal nginx proxy):

```bash
cp .env.example .env
# Fill in .env values
docker compose up
```

The local setup (`Dockerfile` + `nginx.conf`) proxies `/api/` to `http://api:3000` inside Docker's network.
The Railway setup (`Dockerfile.railway` + `nginx.railway.conf`) is SPA-only — frontend calls the API URL directly.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| API crashes on start | Check `MONGODB_URI` is correct and Atlas IP whitelist includes `0.0.0.0/0` |
| Workers not running | Verify `REDIS_URL` is set — workers only start when Redis is available |
| CORS errors | Ensure `ALLOWED_ORIGINS` matches your web service URL exactly (no trailing slash) |
| PHI encryption error | `FIELD_ENCRYPTION_KEY` or `BLIND_INDEX_KEY` missing or wrong length (must be 64 hex chars) |
| Vite app shows blank page | `VITE_API_URL` not set or set after build — set it and trigger a redeploy |
| `gdpr_export_ready` notification missing | `CLOUDINARY_*` variables not set — export worker silently fails without them |
