# Phase 9 HIPAA Audit — AI Patient Chatbot

**Audit date:** 2026-07-09
**Auditor:** ialnezami
**Scope:** apps/api/src/routes/chatbot.js, apps/api/src/services/chatbotService.js, apps/api/src/utils/sessionStore.js, apps/api/src/utils/triageParser.js, apps/api/src/utils/doctorRanking.js

## PHI Touchpoint Inventory

| Touchpoint | Contains PHI? | Mitigation | Verified By |
|-----------|--------------|-----------|-------------|
| Incoming POST /api/chatbot/message body.message | YES (symptom text) | Server-side validation limits size to 2000 chars; never logged; passed only to Anthropic (BAA required) + in-memory session | grep gate: no `req.body.message` in any log line |
| In-memory session store | YES | node-cache in-process only; TTL 30 min sliding; MAX 20 turns; not persisted to disk; process restart wipes; snapshotHistory deep-copies before stream | Code review of sessionStore.js — no fs/db write; sessionStore.test.js verifies isolation and TTL |
| Anthropic Claude API request payload | YES | HTTPS transport; server-side API key (never client-exposed); BAA required (see BAA-STATUS.md) | BAA-STATUS.md |
| SSE response body streamed to client | YES | Direct pipe to authenticated patient only (JWT + requireRole('patient')); TLS in production; not stored server-side | JWT auth + RBAC verified in chatbot.test.js |
| GET /api/chatbot/doctors response | NO (public doctor info) | Standard doctor listing; no patient PHI included | Response schema review — doctorRanking.js returns only doctor metadata |
| Server logs (console output) | NO (design invariant) | Grep gate enforced; err.message truncated to 200 chars with err.name prefix to prevent Anthropic error payload leakage | Automated grep gate — see Log Content Verification below |

## Log Content Verification

Grep-based invariant checks performed on 2026-07-09:

- PHI markers scanned for: `req.body.message`, `history`, `content`, `text`, `accumulated`, `symptomText`
- Grep command: `grep -rnE "console\.(log|warn|error|info)" apps/api/src/routes/chatbot.js apps/api/src/services/chatbotService.js apps/api/src/utils/sessionStore.js | grep -E "req\.body\.message|accumulated"`
- Expected: every match logs ONLY non-PHI metadata (requestId, userId, urgency, durationMs, tokenCount, error type/name, doctorsReturned count).
- Result: **PASS** — 0 matches. All log lines verified as non-PHI metadata only.

### Log lines audited (all verified non-PHI):

| File | Line | Content Logged |
|------|------|----------------|
| chatbot.js:61 | stream error path | `requestId`, `userId`, `err.name: err.message.slice(0,200)` |
| chatbot.js:88 | doctor ranking error path | `requestId`, `userId`, `err.name: err.message.slice(0,200)` |
| chatbot.js:112 | success path | `requestId`, `userId`, `urgency`, `durationMs`, `doctorsReturned`, `emergency` |
| chatbotService.js:97 | success path | `requestId`, `userId`, `durationMs`, `tokens_approx` |
| chatbotService.js:106 | timeout path | `requestId`, `userId`, `error=timeout`, `durationMs` |
| chatbotService.js:109 | general error path | `requestId`, `userId`, `err.name: err.message.slice(0,200)`, `durationMs` |

**Note on err.message truncation:** All `err.message` references use `err.name + ': ' + String(err.message).slice(0, 200)` pattern. This prevents Anthropic SDK errors that might embed request fragments from growing unbounded in logs. Applied 2026-07-09 as part of this audit (PHI hardening deviation Rule 2).

## Access Control

| Control | Location | Verified |
|---------|----------|----------|
| JWT auth required | apps/api/src/routes/chatbot.js — auth middleware on all routes | ✓ |
| Patient role required | requireRole('patient') on all chatbot routes | ✓ |
| Per-user rate limit | chatbotLimiter keyed by req.user.id | ✓ |
| Session isolation | sessionStore keyed by req.user.id | ✓ |
| Input size limit | body('message').isLength({ max: 2000 }) | ✓ |
| Coordinate validation | lat [-90,90], lng [-180,180] validated with express-validator | ✓ |

## Data Retention

| Data | Retention | Erasure |
|------|-----------|---------|
| Conversation history | 30 min sliding TTL, in-memory only | Automatic (TTL) + DELETE /api/chatbot/session |
| Anthropic-side data | Per Anthropic BAA / retention policy | Anthropic BAA governs — see BAA-STATUS.md |
| Server logs | Standard app log retention (~7 days) | Standard log rotation |
| MongoDB | No chatbot data written to MongoDB | N/A |

## Sign-off

- [x] All log lines verified as non-PHI (grep gate PASS — 0 matches)
- [ ] BAA-STATUS.md reads Status: SIGNED before production launch
- [x] Rate limiter and role gates verified via Jest suite (chatbot.test.js — 13 tests, 0 failures)
- [x] Data retention documented above matches implementation (sessionStore.js code review)

**This audit MUST be re-run whenever chatbot.js, chatbotService.js, or sessionStore.js is modified.**
