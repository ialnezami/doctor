# Phase 9 QA Checklist — 2026-07-10 — ialnezami

## API (Wave 1)
- [x] Jest suite green: `cd apps/api && npx jest --testPathPattern='chatbot|sessionStore|triageParser'` (29 tests, 0 failures)
- [x] Manual curl SSE test streams events (delta → done → [DONE])
- [x] Non-patient JWT → 403
- [x] No JWT → 401
- [x] Empty body → 422
- [x] Rate limit fires at 31st request (same user, <1hr)
- [x] Logs contain requestId/userId/urgency — NO message content (grep gate PASS)

## Mobile (Wave 2)
- [x] FAB visible on all patient tabs
- [x] FAB tap opens ChatbotScreen modal
- [x] Streaming response renders token-by-token
- [x] Urgency badge appears after triage
- [x] "Severe chest pain" → 911 CTA + no doctor cards
- [x] "Mild headache" → ranked doctor cards appear
- [x] Doctor card tap → DoctorProfile
- [x] Reset clears state + calls DELETE /api/chatbot/session
- [x] Markdown renders (bold, lists)

## Web (Wave 3)
- [x] Floating bubble visible on patient pages
- [x] Bubble click opens sidebar
- [x] Streaming renders token-by-token
- [x] Emergency prompt → red banner + 911 link, no doctor cards
- [x] Non-emergency → ranked doctors
- [x] Reset clears + DELETE /session
- [x] Network tab: Content-Type: text/event-stream

## Compliance
- [x] HIPAA-AUDIT.md sign-off complete
- [x] BAA-STATUS.md documented (Status: UNKNOWN — explicit production launch blocker documented)
- [x] Grep gate PASS: 0 PHI references in log statements
- [x] No mongoose save of chat content in chatbot.js or chatbotService.js

## Sign-off
Tester: ialnezami
Result: PASS
Date: 2026-07-10
Notes: BAA with Anthropic is not yet signed — chatbot cleared for staging/dev only. Production launch requires BAA-STATUS.md updated to Status: SIGNED before enabling for real patients.
