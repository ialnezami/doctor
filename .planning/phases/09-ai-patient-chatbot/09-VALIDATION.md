---
phase: 9
phase_slug: ai-patient-chatbot
date: 2026-07-03
source: extracted from 09-RESEARCH.md § Validation Architecture
---

# Phase 9: AI Patient Chatbot — Validation Strategy

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 (installed in `apps/api/devDependencies`) |
| Config file | none — `package.json` script: `"test": "jest"` |
| Quick run command | `cd apps/api && npx jest --testPathPattern=chatbot --passWithNoTests` |
| Full suite command | `cd apps/api && npx jest` |

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| 9.1-A | POST /api/chatbot/message rejects non-patient role with 403 | unit (supertest) | `npx jest chatbot --testNamePattern="role"` | Wave 0 |
| 9.1-B | POST /api/chatbot/message validates body (message required, max 2000 chars) | unit | `npx jest chatbot --testNamePattern="validation"` | Wave 0 |
| 9.1-C | Rate limiter blocks after 30 requests per user per hour | unit | `npx jest chatbot --testNamePattern="rate"` | Wave 0 |
| 9.1-D | Triage parser extracts urgency + specialties from `<triage>` block | unit | `npx jest triageParser` | Wave 0 |
| 9.1-E | emergency urgency → no doctor query executed (doctors: []) | unit (mock Anthropic) | `npx jest chatbot --testNamePattern="emergency"` | Wave 0 |
| 9.2-A | $geoNear pipeline returns doctors sorted by score (proximity+rating) | integration (test DB) | `npx jest doctorRanking` | Wave 0 |
| 9.2-B | Empty result with specialty filter triggers no-specialty fallback | integration | `npx jest doctorRanking --testNamePattern="fallback"` | Wave 0 |
| 9.4-A | DELETE /api/chatbot/session clears session store | unit | `npx jest chatbot --testNamePattern="reset"` | Wave 0 |
| 9.4-B | Session capped at 20 messages (no unbounded growth) | unit | `npx jest sessionStore` | Wave 0 |

**Note:** Chatbot SSE streaming and UI rendering are manual-only tests (cannot automate SSE in Jest without a live server). These are verified via smoke test checklist in Wave 4 QA-CHECKLIST.md.

---

## Sampling Rate

| Trigger | Command |
|---------|---------|
| Per task commit | `cd apps/api && npx jest --testPathPattern=chatbot --passWithNoTests` |
| Per wave merge | `cd apps/api && npx jest` |
| Phase gate | Full suite green before `/gsd-verify-work` |

---

## Wave 0 Test Files to Create

- [ ] `apps/api/src/routes/__tests__/chatbot.test.js` — REQ 9.1-A, 9.1-B, 9.1-C, 9.1-E, 9.4-A
- [ ] `apps/api/src/utils/__tests__/triageParser.test.js` — REQ 9.1-D
- [ ] `apps/api/src/utils/__tests__/sessionStore.test.js` — REQ 9.4-B
- [ ] `apps/api/src/utils/__tests__/doctorRanking.test.js` — REQ 9.2-A, 9.2-B

---

## HIPAA Compliance Validation Gates

These are grep-verifiable acceptance criteria enforced in Wave 4 (09.4):

```bash
# No PHI (message content) in any log call inside chatbot route
grep -rn "req\.body\.message\|history" apps/api/src/routes/chatbot.js apps/api/src/services/chatbotService.js | grep -v "//\|test" | grep "console\.\|logger\." && echo "PHI LEAK DETECTED" || echo "PHI-SAFE"

# Conversation never written to MongoDB
grep -rn "\.save()\|\.create(\|\.insertOne\|\.updateOne" apps/api/src/routes/chatbot.js apps/api/src/utils/sessionStore.js && echo "PERSISTENCE DETECTED" || echo "EPHEMERAL-SAFE"

# ANTHROPIC_API_KEY never returned in any response
grep -rn "ANTHROPIC_API_KEY" apps/api/src/routes/chatbot.js | grep "res\." && echo "KEY LEAK" || echo "KEY-SAFE"
```

---

## Manual Smoke Test Checklist (Wave 4)

See `QA-CHECKLIST.md` (created in 09.4) for cross-platform manual verification steps covering:
- SSE streaming token-by-token display
- Urgency badge rendering (routine/soon/urgent/emergency)
- Emergency 911 CTA (no doctor cards shown)
- Doctor recommendation cards + one-tap navigation
- Conversation reset button
- Rate limit enforcement (30 req/hr)
- Mobile floating button → full-screen modal
- Web floating bubble → chat widget panel
