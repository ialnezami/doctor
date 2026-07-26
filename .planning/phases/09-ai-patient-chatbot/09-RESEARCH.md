# Phase 9: AI Patient Chatbot - Research

**Researched:** 2026-07-02
**Domain:** Conversational AI, medical triage, geospatial ranking, streaming HTTP, React Native / React chat UI
**Confidence:** HIGH (core stack verified against codebase + npm registry + official docs)

---

## Summary

Phase 9 adds a conversational triage chatbot that helps patients describe symptoms, receive urgency-classified guidance, and get ranked doctor recommendations — all before booking. The project already has all required infrastructure: `@anthropic-ai/sdk@^0.106.0` is installed (current is 0.110.0), `express-rate-limit` is configured, `socket.io` is running, the Doctor model has a `2dsphere` index on `locations.coordinates`, and the symptom-worker demonstrates the exact Anthropic client pattern in production.

The critical architectural decision is **how AI responses reach the client**. Two options exist: (a) Server-Sent Events (SSE) streaming via a dedicated HTTP endpoint, or (b) Socket.io streaming over the existing WebSocket connection. SSE is simpler, stateless, and maps cleanly to HTTP auth middleware already in place. Socket.io is already installed but adds statefulness complexity for a feature that is inherently request-response. **Recommendation: SSE via HTTP — one endpoint, one auth check, no socket session management.**

HIPAA/GDPR posture for this feature is narrow: conversation history is ephemeral (in-memory, TTL-expired per session). No PHI is persisted to MongoDB, no user health identifiers are logged. The Anthropic API is a third-party data processor — a Business Associate Agreement (BAA) is required before processing identifiable patient symptom descriptions in production. This is a go/no-go gate for the feature.

**Primary recommendation:** Implement SSE streaming from `POST /api/chatbot/message`, maintain conversation history as an in-process Map keyed by JWT `sub` with 30-minute TTL, query ranked doctors with a single `$geoNear` aggregation pipeline, and render streaming responses in mobile with a FlatList (inverted) and in web with a sidebar widget using `react-markdown`.

---

## Project Constraints (from CLAUDE.md)

| Directive | Implication for Phase 9 |
|-----------|------------------------|
| Backend validation mandatory — Zod/express-validator on every endpoint | Validate message length, specialty enum, lat/lng range, limit param on both chatbot endpoints |
| HIPAA (US) / GDPR (EU) — encrypt sensitive fields at rest, HTTPS only | Conversation history must NOT be written to MongoDB. Anthropic BAA required. No PHI in logs. |
| Real-time availability conflicts prevented at booking layer | Doctor recommendation cards must link to existing `/api/doctors/:id/slots` — do not duplicate slot logic |
| RBAC — all API routes enforce role | Chatbot endpoints: `patient` role only. Doctors must not query the chatbot. |
| Structured logging + correlation IDs | Every chatbot request: log `requestId`, `userId` (not message content), `urgency` output, latency |
| Atomic operations — never leave partial state | N/A for ephemeral chatbot state, but doctor recommendation query must not partially execute |
| JWT auth middleware pattern already established | Reuse `src/middleware/auth.js` + `requireRole('patient')` on all chatbot routes |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Symptom triage (Claude API call) | API / Backend | — | LLM call requires server-side API key; never expose to client |
| Multi-turn conversation state | API / Backend (in-memory Map) | Redis (future scale) | State is ephemeral session data — belongs server-side |
| Doctor ranking (geo + availability score) | API / Backend (MongoDB aggregation) | — | 2dsphere index lives in Mongo; scoring is a DB-side pipeline |
| SSE response streaming | API / Backend → Client | — | Server writes SSE chunks; client reads ReadableStream |
| Markdown rendering of AI response | Browser / Client (web) + Mobile client | — | Rendering is purely presentational |
| Urgency badge / CTA rendering | Browser / Client + Mobile client | — | UI decision based on parsed urgency field from response |
| Rate limiting (30 req/user/hr) | API / Backend middleware | — | Must be keyed per authenticated user ID, not IP |
| Session reset | API / Backend | — | DELETE /api/chatbot/session clears in-memory history |
| Floating chat button | Mobile / Browser client | — | Pure UI, no backend involvement |

---

## Standard Stack

### Core (all already installed — verified against package.json)

| Library | Current Version | Purpose | Source |
|---------|----------------|---------|--------|
| `@anthropic-ai/sdk` | `^0.110.0` | Claude API client, streaming | [VERIFIED: npm registry] |
| `express-rate-limit` | `^8.5.2` | Per-user rate limiting | [VERIFIED: npm registry] |
| `mongoose` | `^8.0.0` | MongoDB `$geoNear` aggregation | [VERIFIED: codebase package.json] |
| `socket.io` | `^4.8.3` | Existing real-time (NOT used for chatbot — use SSE instead) | [VERIFIED: codebase] |
| `express-validator` | `^7.0.1` | Request body validation | [VERIFIED: codebase — used in notes.js] |

### New Dependencies (to install)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-markdown` | `^10.1.0` | Markdown rendering in web chat widget | [VERIFIED: npm registry] — standard for React |
| `remark-gfm` | `^4.0.1` | GitHub Flavored Markdown (lists, bold) | [VERIFIED: npm registry] — required plugin for react-markdown |
| `react-native-markdown-display` | `^7.0.2` | Markdown rendering in React Native | [VERIFIED: npm registry] — most maintained RN markdown lib |
| `node-cache` | `^5.1.2` | In-memory TTL store for conversation sessions | [VERIFIED: npm registry] — zero-dep, built-in TTL + cleanup |

### Alternatives Considered

| Instead of | Could Use | When to Use Instead |
|------------|-----------|---------------------|
| In-memory Map + node-cache | Redis (ioredis already installed) | Redis preferred when multiple API instances exist (horizontal scale). Use in-memory for Phase 9; migrate to Redis later. [ASSUMED] |
| SSE streaming | Socket.io streaming | Socket.io appropriate if chatbot needs server-push without request (e.g., async agent). Not needed here. |
| react-markdown | Custom renderer | Never — markdown edge cases (nested lists, tables) are highly complex to hand-roll |
| $geoNear aggregation | $near query operator | $near cannot add computed score fields; $geoNear + $addFields is required for weighted ranking |

**Installation:**

```bash
# API
cd apps/api && npm install node-cache

# Web
cd apps/web && npm install react-markdown remark-gfm

# Mobile
cd apps/mobile && npm install react-native-markdown-display
```

**Version verification:** All versions confirmed against npm registry on 2026-07-02.

---

## Architecture Patterns

### System Architecture Diagram

```
Patient Client (mobile / web)
        │
        │  POST /api/chatbot/message  {message, lat, lng}
        │  Authorization: Bearer <JWT>
        ▼
API Middleware Stack
  ├── apiKeyAuth
  ├── auth.js  (verify JWT, check erasedAt/isSuspended)
  ├── requireRole('patient')
  └── chatbotLimiter (30 req/user/hr, keyed by req.user.id)
        │
        ▼
chatbot.js route handler
  ├── Validate body (message ≤ 2000 chars, lat/lng range if present)
  ├── Load conversation history from SessionStore (in-memory, keyed by JWT sub)
  ├── Append user message to history
  │
  ├── Call Anthropic SDK  messages.stream()  ──────────────────┐
  │     model: claude-haiku-4-5-20251001                       │
  │     system: MEDICAL_TRIAGE_SYSTEM_PROMPT                   │
  │     messages: [...history]                                 │
  │                                                            │
  │   SSE response stream ◄────────────────────────────────────┘
  │   Set headers: text/event-stream, no-cache, keep-alive
  │   Write data: {type:"delta", text:"..."} per chunk
  │   On stream end: write final event {type:"done", urgency, specialties, doctors:[]}
  │
  ├── After stream completes:
  │     ├── Parse structured triage result from accumulated text
  │     ├── If lat/lng provided AND urgency != emergency:
  │     │     └── Query ranked doctors ($geoNear pipeline)
  │     ├── Append assistant response to history (full accumulated text)
  │     ├── Update SessionStore TTL (30 min sliding window)
  │     └── Emit final SSE event with doctors array
  │
  └── On error: write SSE error event, close stream

Doctor Ranking Pipeline (MongoDB $geoNear)
  ├── $geoNear: near=[lng,lat], distanceField="distMeters", query={specialty}
  ├── $lookup: join Doctor → User for name/photo
  ├── $addFields: compute normalizedDist, normalizedAvailability
  ├── $addFields: score = (0.6 * normalizedDist) + (0.4 * normalizedAvailability)
  ├── $sort: score desc
  └── $limit: 5

SessionStore (in-memory, node-cache)
  key:   JWT sub (user._id string)
  value: [{role:'user'|'assistant', content:string}]  (last N turns, max 20)
  TTL:   1800 seconds (30 min sliding, reset on each message)
  max:   Capped at 20 messages per session (prevent token blowout)
```

### Recommended Project Structure

```
apps/api/src/
├── routes/
│   └── chatbot.js           # POST /api/chatbot/message, GET /api/chatbot/doctors, DELETE /api/chatbot/session
├── services/
│   └── chatbotService.js    # Claude API call, SSE pipe, triage parse
├── utils/
│   └── sessionStore.js      # node-cache wrapper with TTL logic
│   └── doctorRanking.js     # $geoNear aggregation builder + weighted score
├── middleware/
│   └── rateLimiter.js       # ADD chatbotLimiter export (30/hr keyed by user ID)

apps/web/src/
├── components/
│   └── patient/
│       └── ChatWidget.jsx   # Sidebar widget, SSE EventSource consumer
│       └── ChatMessage.jsx  # react-markdown renderer + urgency badge

apps/mobile/src/
├── screens/
│   └── patient/
│       └── ChatbotScreen.js # Full-screen modal, streaming fetch consumer
├── components/
│   └── ChatFloatingButton.js  # Absolute-positioned TouchableOpacity FAB
│   └── ChatMessage.js         # react-native-markdown-display + urgency chip
```

### Pattern 1: SSE Streaming with Anthropic SDK (Express)

```javascript
// Source: platform.claude.com/docs/en/build-with-claude/streaming
// apps/api/src/services/chatbotService.js

const Anthropic = require('@anthropic-ai/sdk');

async function streamChatResponse(res, history, systemPrompt) {
  // Set SSE headers BEFORE any async work
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: disable proxy buffering

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let accumulatedText = '';

  try {
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: history,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        accumulatedText += event.delta.text;
        res.write(`data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`);
      }
    }

    // Return accumulated text for structured parsing
    return accumulatedText;

  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service temporarily unavailable' })}\n\n`);
    throw err;
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
```

### Pattern 2: Multi-Turn Conversation State (SessionStore)

```javascript
// Source: node-cache docs + [ASSUMED] pattern
// apps/api/src/utils/sessionStore.js
'use strict';
const NodeCache = require('node-cache');

const MAX_TURNS = 20; // ~10 exchanges; keeps token count bounded
const TTL_SECONDS = 1800; // 30 min sliding window

const cache = new NodeCache({ stdTTL: TTL_SECONDS, checkperiod: 300, useClones: false });

function getHistory(userId) {
  return cache.get(userId) || [];
}

function appendAndSave(userId, userMessage, assistantMessage) {
  let history = cache.get(userId) || [];
  history.push({ role: 'user', content: userMessage });
  history.push({ role: 'assistant', content: assistantMessage });
  // Trim oldest pairs to keep within MAX_TURNS
  if (history.length > MAX_TURNS) {
    history = history.slice(history.length - MAX_TURNS);
  }
  cache.set(userId, history); // resets TTL (sliding window)
}

function clearSession(userId) {
  cache.del(userId);
}

module.exports = { getHistory, appendAndSave, clearSession };
```

**Why this over Redis for Phase 9:** The project runs a single API instance (Railway). Redis is available via `REDIS_URL` but adding it for ephemeral non-critical data adds operational complexity. node-cache is zero-infrastructure, the data is intentionally ephemeral, and TTL cleanup is built-in. [ASSUMED: single-instance deployment]

### Pattern 3: Medical Triage System Prompt

```javascript
// Source: Anthropic healthcare docs + symptomWorker.js existing pattern [ASSUMED structure]
// apps/api/src/services/chatbotService.js

const TRIAGE_SYSTEM_PROMPT = `You are a medical triage assistant for MediConnect. Your role is to help patients understand their symptoms and find appropriate medical care.

STRICT RULES:
1. You provide general health information ONLY — never diagnoses, never medication recommendations.
2. Always include this disclaimer at the end of your first response: "This is general health information only, not medical advice. Please consult a qualified healthcare provider."
3. If the patient describes ANY of these — chest pain, difficulty breathing, severe bleeding, loss of consciousness, stroke signs, anaphylaxis, severe burns — respond IMMEDIATELY with: urgency=emergency and instruct them to call emergency services NOW. Do not continue the conversation.
4. Never roleplay as a doctor or claim to examine the patient.
5. Do not ask for or repeat personally identifiable information.

RESPONSE FORMAT:
Respond naturally in conversational prose. After gathering sufficient symptom information, output a structured JSON block enclosed in <triage> tags:
<triage>
{
  "urgency": "routine" | "soon" | "urgent" | "emergency",
  "specialties": ["string"],
  "summary": "one sentence for display",
  "ready_for_referral": true | false
}
</triage>

Urgency definitions:
- routine: can wait days/weeks, no acute distress
- soon: should see doctor within 1-3 days
- urgent: needs same-day or next-day care
- emergency: call emergency services immediately

Only output the <triage> block when you have enough information to make a reasonable assessment, or when the patient explicitly asks for doctor recommendations.`;
```

**Safety design decisions:**
- Triage result is returned in a parseable `<triage>` XML tag, not embedded in prose — avoids hallucinated JSON
- `emergency` urgency triggers immediate front-end CTA, bypasses doctor recommendation engine
- System prompt prohibits PII collection (HIPAA safeguard)
- Disclaimer is mandatory on first response (HIPAA/GDPR safe harbor practice)

### Pattern 4: Doctor Ranking ($geoNear Aggregation)

```javascript
// Source: mongodb.com/docs/manual/reference/operator/aggregation/geonear/ [CITED]
// apps/api/src/utils/doctorRanking.js
'use strict';
const Doctor = require('../models/Doctor');

// MAX_DISTANCE_METERS: 50km default search radius
const MAX_DISTANCE_METERS = 50000;

async function getRankedDoctors({ specialty, lat, lng, limit = 5 }) {
  // $geoNear MUST be first stage; index on locations.coordinates ('2dsphere') already exists
  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        distanceField: 'distMeters',
        maxDistance: MAX_DISTANCE_METERS,
        spherical: true,
        query: { 'locations.type': 'bookable' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    { $unwind: '$user' },
    // Filter by specialty (case-insensitive regex)
    ...(specialty ? [{ $match: { specialty: new RegExp(specialty, 'i') } }] : []),
    {
      $addFields: {
        // Normalize distance: 0 = at doorstep, 1 = at max distance
        normalizedDist: { $divide: ['$distMeters', MAX_DISTANCE_METERS] },
        // Proxy for availability: use averageRating as secondary signal
        // (next-available-slot requires N+1 queries — deferred to dedicated endpoint)
        ratingScore: { $divide: ['$averageRating', 5] },
      },
    },
    {
      $addFields: {
        // Weighted score: closer + better rated = lower score = ranked higher
        score: {
          $add: [
            { $multiply: [0.7, '$normalizedDist'] },       // proximity weight 70%
            { $multiply: [0.3, { $subtract: [1, '$ratingScore'] }] }, // rating weight 30%
          ],
        },
      },
    },
    { $sort: { score: 1 } },
    { $limit: parseInt(limit) },
    {
      $project: {
        _id: 1,
        specialty: 1,
        photoUrl: 1,
        averageRating: 1,
        reviewCount: 1,
        consultationFee: 1,
        distMeters: 1,
        'user.name': 1,
        'locations': { $filter: { input: '$locations', as: 'l', cond: { $eq: ['$$l.type', 'bookable'] } } },
      },
    },
  ];

  return Doctor.aggregate(pipeline);
}

module.exports = { getRankedDoctors };
```

**Note on availability ranking:** True "earliest available slot" requires querying each doctor's appointment collection — an N+1 problem at scale. For Phase 9, proximity (70%) + rating (30%) is the weighted score. The doctor card links to `GET /api/doctors/:id/slots` for live slot data before booking. [ASSUMED: availability score deferred to Phase 9.x or pre-computed field]

### Pattern 5: Per-User Rate Limiter (chatbot-specific)

```javascript
// Source: express-rate-limit docs + existing rateLimiter.js pattern [CITED: npmjs.com/package/express-rate-limit]
// apps/api/src/middleware/rateLimiter.js  (add to existing file)

const chatbotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 30,                    // 30 requests per user per hour
  keyGenerator: (req) => {
    // auth middleware runs BEFORE this — req.user is populated
    // Fall back to IP only if somehow req.user is missing (defensive)
    return req.user?.id || req.ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Chatbot rate limit exceeded — 30 messages per hour allowed.' },
});

module.exports = { apiLimiter, registerLimiter, loginLimiter, chatbotLimiter };
```

**Critical:** The `chatbotLimiter` must be applied AFTER `auth` middleware so `req.user.id` is available. Applying it before auth means the key falls back to IP, defeating per-user isolation.

### Pattern 6: SSE Client (Mobile — fetch with streaming)

```javascript
// Source: MDN ReadableStream + [ASSUMED] React Native fetch streaming
// apps/mobile/src/screens/patient/ChatbotScreen.js

async function sendMessage(userText, token, apiUrl) {
  const response = await fetch(`${apiUrl}/api/chatbot/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ message: userText }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // Parse SSE lines
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === 'delta') {
            accumulated += parsed.text;
            // Update UI incrementally via setState
          }
          if (parsed.type === 'done') {
            // parsed.urgency, parsed.doctors available here
          }
        } catch (_) {}
      }
    }
  }
}
```

**Note:** `EventSource` API is not natively available in React Native — use `fetch` + `ReadableStream` as shown above. The `expo` fetch polyfill supports streaming as of Expo SDK 54 (the project is on SDK 54). [ASSUMED: Expo 54 fetch streaming support]

### Pattern 7: SSE Client (Web — EventSource)

```jsx
// Source: MDN EventSource API [CITED: developer.mozilla.org]
// apps/web/src/components/patient/ChatWidget.jsx

// NOTE: EventSource does not support custom headers — use fetch with ReadableStream
// (same pattern as mobile above). Browser EventSource is only for unauthenticated SSE.
// Since we need Authorization header, use fetch streaming in web too.

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function ChatMessage({ content, role }) {
  return (
    <div className={`message ${role}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

**Key insight:** The browser `EventSource` API cannot send custom headers. Since the chatbot endpoint requires `Authorization: Bearer <jwt>`, use `fetch` + `ReadableStream` in both web and mobile. This is identical to the mobile pattern. [CITED: developer.mozilla.org/EventSource]

### Anti-Patterns to Avoid

- **Storing conversation history in MongoDB:** Violates HIPAA — symptom descriptions are PHI. Use in-memory only.
- **Using EventSource in web/mobile for authenticated SSE:** EventSource cannot send Authorization headers. Use fetch streaming.
- **Trusting Claude's urgency classification without parsing:** Always extract the `<triage>` block; never regex-parse prose for urgency.
- **Running doctor ranking for `emergency` urgency:** Emergency → call 911 CTA immediately; never offer "book a doctor" as an alternative.
- **Blocking the Node.js event loop during stream accumulation:** Use `for await...of` on the stream, never `await stream.finalMessage()` for streaming UX.
- **Logging message content:** Log `userId`, `urgency`, `requestId`, and latency — never log the patient's symptom text (PHI).
- **Putting chatbotLimiter before auth middleware:** Rate limit key falls back to IP, breaks per-user isolation.
- **Using `$near` query operator instead of `$geoNear` aggregation:** `$near` cannot be combined with `$addFields` for score computation.
- **Using doctor.availabilitySlots for next-slot computation inside the ranking pipeline:** The location-based slot model (doctor.locations[].slots) requires per-location queries — handle this in the doctor card, not in ranking.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown rendering (web) | Custom HTML parser from markdown text | `react-markdown` + `remark-gfm` | Nested lists, escaped chars, XSS edge cases |
| Markdown rendering (mobile) | Raw `Text` with regex bold detection | `react-native-markdown-display` | Handles nested inline styles, code blocks, lists correctly |
| In-memory TTL store | `new Map()` + `setInterval` for cleanup | `node-cache` | Built-in TTL, LRU eviction, periodic pruning — Map leaks on missed cleanup |
| SSE protocol parsing (client) | Custom byte parser | Standard `ReadableStream` + `TextDecoder` | SSE line boundary edge cases (chunks can split across `\n\n`) |
| Geo ranking | Custom Haversine distance sort in JS | MongoDB `$geoNear` aggregation | DB-side computation, uses existing 2dsphere index, far faster at scale |
| Safety disclaimer injection | Prompt engineering alone | Explicit post-processing check: if first message and no disclaimer found in output, append | LLMs can skip disclaimer under unusual inputs |

**Key insight:** The medical domain compounds normal chatbot complexity. Incorrectly parsed urgency levels have patient safety implications. Every structured output from Claude must be validated server-side before being acted upon.

---

## Common Pitfalls

### Pitfall 1: PHI Leakage via Structured Logging

**What goes wrong:** Developer adds `console.log('[chatbot] user message:', req.body.message)` for debugging. Patient symptom descriptions appear in server logs → HIPAA violation.

**Why it happens:** Standard debug logging practice applied without thinking about data classification.

**How to avoid:** Log only non-PHI fields: `userId`, `requestId`, `urgency` (the output classification), `durationMs`, `tokenCount`. Never log `message`, `history`, or doctor recommendation results that include patient context.

**Warning signs:** Any log line containing `req.body.message` or `history` in the chatbot route.

---

### Pitfall 2: Anthropic API Timeout Leaves SSE Connection Hanging

**What goes wrong:** Claude API takes > 30s (network issue, model overload). Express default socket timeout is 5 min. Client shows infinite typing indicator. No error event emitted.

**Why it happens:** `messages.stream()` iterator blocks until first token or error; no timeout set.

**How to avoid:**

```javascript
// Wrap stream call with AbortController timeout
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 25000); // 25s max

try {
  const stream = client.messages.stream({ ... }, { signal: controller.signal });
  // ...
} catch (err) {
  if (err.name === 'AbortError') {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Response timed out — please try again.' })}\n\n`);
  }
} finally {
  clearTimeout(timeout);
}
```

**Warning signs:** Typing indicator that never resolves; SSE connection open > 30s in network panel.

---

### Pitfall 3: In-Memory Session Store Grows Without Bound

**What goes wrong:** `node-cache` `checkperiod` not set or set too high. 10,000 patients chat for 30 min each. Old sessions not evicted. API process OOM-killed.

**Why it happens:** Default `node-cache` options need explicit `checkperiod` (background eviction interval).

**How to avoid:** Set `checkperiod: 300` (evict expired entries every 5 min). Cap `MAX_TURNS = 20` so each session value is bounded (~20 messages × ~200 tokens × 4 bytes ≈ ~16KB per session). At 10,000 concurrent sessions: ~160MB peak.

**Warning signs:** RSS memory growing steadily; no corresponding request volume increase.

---

### Pitfall 4: $geoNear Fails When Specialty Filter Eliminates All Nearby Doctors

**What goes wrong:** Patient in rural area reports symptoms matching "neurology". `$geoNear` with `maxDistance: 50000` returns 0 results. Response has empty doctors array. No fallback.

**Why it happens:** Specialty filter applied inside `$geoNear.query` eliminates candidates before distance check, unlike a post-stage `$match`.

**How to avoid:** Apply specialty filter as a `$match` after `$geoNear` (not in `$geoNear.query`). If result count < 3, re-query without specialty filter and flag results as "nearest available, not specialty-matched". [ASSUMED: fallback logic]

**Warning signs:** Empty doctor list for valid geo coordinates + specialty combination.

---

### Pitfall 5: React Native fetch Streaming Not Working in Debug/Metro Mode

**What goes wrong:** `response.body.getReader()` throws `TypeError: Cannot read properties of undefined (reading 'getReader')` in Expo Go or old React Native.

**Why it happens:** The `fetch` streaming (`response.body` as ReadableStream) requires Hermes engine + React Native >= 0.71. Project is on RN 0.81.5 — this is supported. However, `expo-fetch` polyfill is needed in some Expo configurations.

**How to avoid:** Test streaming fetch early in Wave 0. If `response.body` is null, use chunked `onreadystatechange` pattern or consider polling fallback.

**Warning signs:** `response.body` is `null` or `undefined`; no streaming events received.

---

### Pitfall 6: Session Reset Race Condition

**What goes wrong:** User taps "Reset conversation" while a streaming response is in-flight. Session is cleared from SessionStore. Stream completes and tries to `appendAndSave` — now starts a new session with only the assistant message (no user message).

**Why it happens:** `appendAndSave` runs after stream completes, but session was deleted mid-stream.

**How to avoid:** Snapshot the conversation history at request start (before stream begins). Use the snapshot for the Claude API call. `appendAndSave` uses the snapshot context regardless of session state. If session was reset, write is a no-op (cleared session gets a fresh write).

---

### Pitfall 7: Anthropic BAA Not Signed Before Processing Real Patient Data

**What goes wrong:** App deployed to production, patients describe real symptoms, identifiable health data hits Anthropic's API without a signed Business Associate Agreement. HIPAA violation.

**Why it happens:** Developer focuses on technical integration, compliance gate missed.

**How to avoid:** This is a **go/no-go gate** before any real patient data flows to Anthropic. Anthropic offers HIPAA-eligible services for enterprise customers. The BAA must be signed with Anthropic before the chatbot is used by real patients. [CITED: anthropic.com/healthcare — healthcare stack page confirms HIPAA-eligible availability]

**Warning signs:** None — this is a process gate, not a code gate. Must be tracked as a non-code task in the plan.

---

## Runtime State Inventory

Phase 9 is **greenfield** — no existing state to migrate. No renames. No refactors of stored data. Skipped per instructions.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | API runtime | ✓ | v24.10.0 | — |
| `@anthropic-ai/sdk` | Claude API calls | ✓ (installed) | 0.106.0 installed, 0.110.0 latest | — |
| `ANTHROPIC_API_KEY` env var | All AI features | Unknown | Must verify .env | Feature disabled — existing pattern in symptomWorker |
| Redis / `REDIS_URL` | BullMQ workers (existing) | Unknown | — | node-cache (in-memory) for session state |
| MongoDB 2dsphere index | $geoNear aggregation | ✓ | Index confirmed in Doctor model (`doctorSchema.index`) | — |
| `react-markdown` | Web chat widget | ✗ (not installed) | — | Install: `npm install react-markdown remark-gfm` |
| `react-native-markdown-display` | Mobile chat messages | ✗ (not installed) | — | Install: `npm install react-native-markdown-display` |
| `node-cache` | Session TTL store | ✗ (not installed) | — | Install: `npm install node-cache` |
| Anthropic BAA (legal) | HIPAA compliance | Unknown | — | Cannot process real PHI without it |

**Missing dependencies with no fallback:**
- Anthropic BAA — legal gate, must be resolved before production launch
- `ANTHROPIC_API_KEY` — existing graceful-degradation pattern: check in route, return 503 if absent

**Missing dependencies with fallback:**
- `react-markdown`, `react-native-markdown-display`, `node-cache` — install commands above

---

## Validation Architecture

No `config.json` found; treating `nyquist_validation` as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 (installed in `apps/api/devDependencies`) |
| Config file | none — `package.json` script: `"test": "jest"` |
| Quick run command | `cd apps/api && npx jest --testPathPattern=chatbot --passWithNoTests` |
| Full suite command | `cd apps/api && npx jest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| 9.1-A | POST /api/chatbot/message rejects non-patient role | unit (supertest) | `npx jest chatbot --testNamePattern="role"` | ❌ Wave 0 |
| 9.1-B | POST /api/chatbot/message validates body (message required, max 2000 chars) | unit | `npx jest chatbot --testNamePattern="validation"` | ❌ Wave 0 |
| 9.1-C | Rate limiter blocks after 30 requests | unit | `npx jest chatbot --testNamePattern="rate"` | ❌ Wave 0 |
| 9.1-D | Triage parser extracts urgency + specialties from `<triage>` block | unit | `npx jest triageParser` | ❌ Wave 0 |
| 9.1-E | emergency urgency → no doctor query executed | unit (mock Anthropic) | `npx jest chatbot --testNamePattern="emergency"` | ❌ Wave 0 |
| 9.2-A | $geoNear pipeline returns doctors sorted by score | integration (test DB) | `npx jest doctorRanking` | ❌ Wave 0 |
| 9.2-B | Empty result with specialty filter triggers fallback | integration | `npx jest doctorRanking --testNamePattern="fallback"` | ❌ Wave 0 |
| 9.4-A | DELETE /api/chatbot/session clears session store | unit | `npx jest chatbot --testNamePattern="reset"` | ❌ Wave 0 |
| 9.4-B | Session capped at 20 messages (no unbounded growth) | unit | `npx jest sessionStore` | ❌ Wave 0 |

**Note:** Chatbot streaming SSE and UI rendering are manual-only tests (cannot automate SSE in Jest without a live server). Mark these as smoke tests in the QA checklist.

### Sampling Rate

- **Per task commit:** `cd apps/api && npx jest --testPathPattern=chatbot --passWithNoTests`
- **Per wave merge:** `cd apps/api && npx jest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/api/src/routes/__tests__/chatbot.test.js` — REQ 9.1-A through 9.1-E, 9.4-A
- [ ] `apps/api/src/utils/__tests__/triageParser.test.js` — REQ 9.1-D
- [ ] `apps/api/src/utils/__tests__/sessionStore.test.js` — REQ 9.4-B
- [ ] `apps/api/src/utils/__tests__/doctorRanking.test.js` — REQ 9.2-A, 9.2-B

---

## Security Domain

`security_enforcement` not set in config — treating as enabled (default).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing `auth.js` middleware — reuse unchanged |
| V3 Session Management | yes (ephemeral) | `node-cache` TTL; no persistent session tokens issued |
| V4 Access Control | yes | `requireRole('patient')` — doctors/admins blocked |
| V5 Input Validation | yes | `express-validator`: message ≤ 2000 chars, lat/lng numeric range, limit 1-20 |
| V6 Cryptography | no | No new encryption surfaces; Anthropic API is HTTPS only |
| V7 Error Handling / Logging | yes | PHI must never appear in logs — see Pitfall 1 |
| V8 Data Protection | yes | Conversation history is not persisted; Anthropic BAA required |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via user message | Tampering | System prompt instructs Claude to ignore user attempts to override rules; validate message is plain text (no HTML/script injection into the prompt context) |
| Rate limit bypass via IP cycling | Denial of Service | Key on `req.user.id` (JWT sub) not IP — requires compromising a valid JWT to bypass |
| Session fixation (steal another user's history) | Elevation of Privilege | Session key is JWT `sub` — only the authenticated user can read/write their session |
| Logging PHI (symptom text) | Information Disclosure | Strict no-logging rule on message content (see Pitfall 1) — enforced by code review gate |
| Claude returning harmful medical advice | Repudiation / Safety | System prompt guardrails + mandatory disclaimer + emergency escalation bypass |
| SSRF via user-supplied lat/lng | Tampering | lat/lng are parsed as floats with range validation (lat: -90 to 90, lng: -180 to 180) — never used in HTTP calls |
| API key exposure | Information Disclosure | `ANTHROPIC_API_KEY` is server-side env var only; never returned in any response |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Single Railway API instance — in-memory session store sufficient (no cross-instance session sharing needed) | Standard Stack, Pattern 2 | If multi-instance: sessions lost on failover, users lose conversation context — upgrade to Redis |
| A2 | Availability score deferred: use averageRating as proxy for "next available slot" in ranking | Pattern 4 | If users expect soonest-available ranking: implement per-doctor slot pre-computation job or accept N+1 query per ranked doctor |
| A3 | Expo SDK 54 `fetch` supports `response.body` as ReadableStream for SSE | Pattern 6 | If fetch streaming unavailable: fall back to polling GET /api/chatbot/message?session=<id> (non-streaming) |
| A4 | Emergency urgency → CTA only, no doctor recommendation (skip ranking query) | Pattern 3, Anti-patterns | If product wants "nearest ER" for emergency: integrate Google Maps Places API for hospital search — different scope |
| A5 | `claude-haiku-4-5-20251001` model used (matches existing codebase pattern) | Standard Stack | If Haiku discontinued or accuracy insufficient for triage: upgrade to claude-sonnet-4-x — higher cost, lower latency requirement relaxed |
| A6 | No BAA currently signed with Anthropic | Environment Availability | If BAA already signed: remove the go/no-go gate; proceed directly to implementation |

---

## Open Questions (RESOLVED)

1. **Anthropic BAA status**
   - What we know: Anthropic offers HIPAA-eligible infrastructure for enterprise customers
   - What's unclear: Whether the project's Anthropic account has an active BAA
   - Recommendation: Confirm with project owner before starting Wave 2. Wave 1 (non-AI scaffolding) can proceed without it.
   - RESOLVED: Tracked as a non-code go/no-go gate in 09.1 (BAA-STATUS.md) and finalized in 09.4. Wave 1 scaffolding proceeds; BAA confirmation required before real patient data flows to Anthropic.

2. **Streaming fetch in Expo Go vs standalone build**
   - What we know: React Native 0.81.5 on Hermes supports ReadableStream fetch
   - What's unclear: Whether Expo Go (development client) has the same support as a standalone build
   - Recommendation: Test streaming fetch in Wave 0 as a standalone spike. If unavailable in Expo Go, implement polling fallback for development, streaming for production builds.
   - RESOLVED: 09.2 Task 1 includes a defensive `response.body?.getReader` existence check with a graceful fallback note. If unavailable in Expo Go, the checkpoint gate (Task 4) requires manual verification before sign-off.

3. **Availability score in ranking**
   - What we know: Doctor.locations[].slots exists but querying "next available" requires checking Appointment collection per doctor
   - What's unclear: Whether the product requires true next-slot display or proximity+rating is acceptable for Phase 9
   - Recommendation: Use proximity+rating for Phase 9 MVP. Add next-slot computation as a Phase 9.x enhancement.
   - RESOLVED: Proximity (70%) + rating (30%) chosen as Phase 9 MVP ranking score per Assumption A2. Explicitly noted in 09.1 doctorRanking.js implementation. Deferred to Phase 9.x.

4. **Web chat widget placement**
   - What we know: Web has patient dashboard with Zustand state, React Router, no current chat component
   - What's unclear: Whether widget is a fixed sidebar panel or a floating bubble (like mobile)
   - Recommendation: Implement as a floating bubble (bottom-right) matching mobile UX. Sidebar requires layout restructuring.
   - RESOLVED: Floating bubble pattern chosen in 09.3 (FloatingBubble + ChatWidget sliding panel). Matches mobile UX pattern, avoids layout restructuring.

---

## Code Examples — Integration Points

### Registering the chatbot route in index.js

```javascript
// apps/api/src/index.js — add after existing routes
app.use('/api/chatbot', require('./routes/chatbot'));
```

### Doctor model geo index — ALREADY EXISTS

```javascript
// Confirmed in Doctor.js line 48 — no migration needed
doctorSchema.index({ 'locations.coordinates': '2dsphere' }, { sparse: true });
```

### Auth guard pattern — reuse exactly

```javascript
// apps/api/src/routes/chatbot.js
const auth         = require('../middleware/auth');
const requireRole  = require('../middleware/rbac');
const { chatbotLimiter } = require('../middleware/rateLimiter');

// Order matters: auth → role → rate limit (rate limit key needs req.user.id)
router.post('/message', auth, requireRole('patient'), chatbotLimiter, async (req, res, next) => {
  // ...
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `client.messages.create()` blocking | `client.messages.stream()` with `for await...of` | @anthropic-ai/sdk 0.9+ | Non-blocking; first token in ~800ms |
| `EventSource` for authenticated SSE | `fetch` + `ReadableStream` | Always required | EventSource cannot send Authorization headers |
| MongoDB `$near` for geo queries | `$geoNear` aggregation stage | MongoDB 2.6+ | $geoNear allows post-stage transformations for scoring |
| Storing chat history in DB | Ephemeral in-memory session | Healthcare compliance requirement | HIPAA — symptom text is PHI |

**Deprecated/outdated:**
- `client.messages.create({ stream: true })` with old event emitter pattern: replaced by `messages.stream()` iterator API in SDK 0.9+. Project uses 0.106.x — use iterator pattern.
- `EventSource` for chatbot SSE: not viable with JWT auth. Use `fetch` ReadableStream.

---

## Sources

### Primary (HIGH confidence)

- Codebase: `/apps/api/src/utils/smartScheduling.js` — established Anthropic SDK usage pattern (non-streaming, single-turn)
- Codebase: `/apps/api/src/middleware/rateLimiter.js` — established rate limit pattern to extend
- Codebase: `/apps/api/src/models/Doctor.js` — confirmed 2dsphere index on `locations.coordinates`
- Codebase: `/apps/api/src/workers/symptomWorker.js` — confirmed triage system prompt pattern, BullMQ + Claude Haiku
- npm registry: `@anthropic-ai/sdk@0.110.0`, `express-rate-limit@8.5.2`, `react-markdown@10.1.0`, `remark-gfm@4.0.1`, `react-native-markdown-display@7.0.2`, `node-cache@5.1.2`
- [CITED: mongodb.com/docs/manual/reference/operator/aggregation/geonear/] — $geoNear pipeline requirements and distanceField
- [CITED: platform.claude.com/docs/en/build-with-claude/streaming] — messages.stream() SSE event types

### Secondary (MEDIUM confidence)

- [CITED: anthropic.com/news/healthcare-life-sciences] — Anthropic healthcare stack, HIPAA-eligible infrastructure
- [CITED: pmc.ncbi.nlm.nih.gov/articles/PMC10937180/] — HIPAA chatbot compliance requirements (PHI, BAA obligations)
- [CITED: express-rate-limit docs] — `keyGenerator` per-user configuration pattern

### Tertiary (LOW confidence)

- [ASSUMED] Expo SDK 54 fetch streaming: based on React Native 0.81.5 + Hermes support for ReadableStream — requires validation in Wave 0
- [ASSUMED] Single API instance on Railway — in-memory session store sufficient for Phase 9

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against codebase package.json and npm registry
- Architecture (SSE vs Socket.io): HIGH — confirmed EventSource auth limitation via official docs
- $geoNear pattern: HIGH — verified against MongoDB official docs + existing Doctor model index
- Pitfalls: HIGH (code-based) / MEDIUM (HIPAA compliance specifics)
- React Native streaming fetch: LOW — confirmed theory, requires empirical Wave 0 spike

**Research date:** 2026-07-02
**Valid until:** 2026-08-02 (stable tech stack — 30 days)
