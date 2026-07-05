# STATE.md

## Project Reference

**MediConnect** — web + mobile healthcare platform. Doctors manage appointments/notes/prescriptions. Patients book appointments, access records, find nearby doctors, and (Phase 09) get AI symptom triage via chatbot.

**Core Value:** Production-grade HIPAA-compliant healthcare platform with AI-powered patient triage.

---

## Current Position

- **Phase:** 09 of N — AI Patient Chatbot
- **Plan:** 0 of 4 — Not started
- **Status:** Ready to execute

---

## Progress

```
Phase 05.2 [████████████████████] COMPLETE (8/8 plans)
Phase 09   [░░░░░░░░░░░░░░░░░░░░] 0% (0/4 plans)
```

---

## Phase 09 Wave Structure

| Plan | Wave | Description | Status |
|------|------|-------------|--------|
| 09.1 | 1 | Backend: SSE chatbot API, session store, rate limiting | Not started |
| 09.2 | 2 | Mobile UI: FAB + full-screen chat modal, streaming | Not started |
| 09.3 | 3 | Web UI: floating bubble + sliding sidebar, streaming | Not started |
| 09.4 | 4 | Production hardening: integration tests, HIPAA audit | Not started |

---

## Known Blockers

- `node-cache` not installed in `apps/api/node_modules` — npm install must succeed before Plan 09.1 can execute
- Previous session attempts to install via npm all backgrounded without completing

---

## Recent Decisions

- AI processing server-side only (never expose ANTHROPIC_API_KEY to clients)
- Ephemeral in-memory sessions (no PHI persistence) via node-cache TTL 30 min, max 20 turns
- SSE streaming over WebSockets (cleaner with existing JWT middleware)
- Model: `claude-haiku-4-5-20251001` (reuse from symptomWorker.js)
- Emergency urgency → never show "find a doctor" → show 911 CTA only

---

## Session Continuity

Last session: 2026-07-04
Stopped at: node-cache install failed; plan 09.1 execution blocked
Resume file: none
Current session: 2026-07-04 — resuming, installing node-cache then executing plan 09.1
