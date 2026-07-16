'use strict';

const router = require('express').Router();
const crypto = require('crypto');
const { body, query, validationResult } = require('express-validator');

const auth         = require('../middleware/auth');
const requireRole  = require('../middleware/rbac');
const { chatbotLimiter } = require('../middleware/rateLimiter');
const { streamChatResponse, TRIAGE_SYSTEM_PROMPT } = require('../services/chatbotService');
const { snapshotHistory, appendAndSave, clearSession } = require('../utils/sessionStore');
const { parseTriage } = require('../utils/triageParser');
const { getRankedDoctors } = require('../utils/doctorRanking');

/**
 * Inline validation result handler — returns 422 with structured errors.
 * Reused pattern from routes/notes.js.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// ---------------------------------------------------------------------------
// POST /api/chatbot/message
// Middleware order: auth → requireRole → chatbotLimiter (must come AFTER auth
// so chatbotLimiter can key on req.user.id rather than falling back to IP).
// ---------------------------------------------------------------------------
router.post('/message',
  auth,
  requireRole('patient'),
  chatbotLimiter,
  body('message').isString().trim().isLength({ min: 1, max: 2000 })
    .withMessage('message is required and must be 1–2000 characters'),
  body('lat').optional().isFloat({ min: -90, max: 90 })
    .withMessage('lat must be a float between -90 and 90'),
  body('lng').optional().isFloat({ min: -180, max: 180 })
    .withMessage('lng must be a float between -180 and 180'),
  validate,
  async (req, res) => {
    const requestId = crypto.randomUUID();
    const userId    = req.user.id;
    const { message, lat, lng } = req.body;

    // Pitfall 6: Snapshot history BEFORE the stream starts.
    // If the user calls DELETE /session mid-stream, the snapshot is unaffected.
    // appendAndSave later uses the snapshot context — safe against race condition.
    const historySnapshot   = snapshotHistory(userId);
    const historyForClaude  = [...historySnapshot, { role: 'user', content: message }];

    const startedAt = Date.now();
    let accumulated;

    try {
      accumulated = await streamChatResponse(res, historyForClaude, TRIAGE_SYSTEM_PROMPT, { requestId, userId });
    } catch (err) {
      // streamChatResponse already wrote an SSE error event and re-threw.
      // Our job: close the stream cleanly.
      // NOTE: req.body.message is intentionally NOT logged here (PHI).
      console.error(`[chatbot] requestId=${requestId} userId=${userId} stream_error=${err.name}: ${String(err.message).slice(0, 200)}`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Guard: if streamChatResponse returned null, a 503 JSON was already sent (no SSE headers).
    if (accumulated === null) return;

    // Parse the <triage> block from the accumulated Claude response
    const triage     = parseTriage(accumulated);
    const isEmergency = triage?.urgency === 'emergency';

    let doctors          = [];
    let specialtyFallback = false;

    // Emergency short-circuit: never offer "book a doctor" for emergency urgency.
    // Assumption A4: emergency → 911 CTA only (no doctor ranking query).
    if (triage && !isEmergency && lat != null && lng != null && triage.ready_for_referral) {
      try {
        const specialty = triage.specialties?.[0];
        const ranked    = await getRankedDoctors({ specialty, lat, lng, limit: 5 });
        doctors          = ranked.doctors;
        specialtyFallback = ranked.specialtyFallback;
      } catch (err) {
        // Doctor ranking failure is non-fatal — the conversational response was already streamed.
        // Log the error (non-PHI) and return empty doctors list.
        console.error(`[chatbot] requestId=${requestId} userId=${userId} doctorRanking_error=${err.name}: ${String(err.message).slice(0, 200)}`);
      }
    }

    // Persist conversation history.
    // Uses the snapshot (pre-stream) so session resets during the stream don't corrupt state.
    appendAndSave(userId, message, accumulated);

    // Route owns the stream lifecycle: write the structured done event then close.
    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        urgency: triage?.urgency || null,
        specialties: triage?.specialties || [],
        summary: triage?.summary || null,
        chiefComplaint: triage?.chief_complaint || null,
        emergency: isEmergency,
        doctors,
        specialtyFallback,
      })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    res.end();

    // Structured non-PHI log — urgency output, latency, doctor count. Never message text.
    console.log(
      `[chatbot] requestId=${requestId} userId=${userId} urgency=${triage?.urgency || 'unparsed'} ` +
      `durationMs=${Date.now() - startedAt} doctorsReturned=${doctors.length} emergency=${isEmergency}`
    );
  }
);

// ---------------------------------------------------------------------------
// GET /api/chatbot/doctors
// Direct geo-ranked doctor lookup — used when the UI lets the user override specialty.
// ---------------------------------------------------------------------------
router.get('/doctors',
  auth,
  requireRole('patient'),
  chatbotLimiter,
  query('specialty').optional().isString().isLength({ max: 100 })
    .withMessage('specialty must be a string up to 100 characters'),
  query('lat').isFloat({ min: -90, max: 90 })
    .withMessage('lat is required and must be a float between -90 and 90'),
  query('lng').isFloat({ min: -180, max: 180 })
    .withMessage('lng is required and must be a float between -180 and 180'),
  query('limit').optional().isInt({ min: 1, max: 20 })
    .withMessage('limit must be an integer between 1 and 20'),
  validate,
  async (req, res, next) => {
    try {
      const { specialty, lat, lng, limit } = req.query;
      const result = await getRankedDoctors({
        specialty,
        lat,
        lng,
        limit: parseInt(limit, 10) || 5,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/chatbot/session
// Clears the caller's in-memory conversation history.
// Returns 204 No Content on success.
// ---------------------------------------------------------------------------
router.delete('/session',
  auth,
  requireRole('patient'),
  (req, res) => {
    clearSession(req.user.id);
    res.status(204).end();
  }
);

module.exports = router;
