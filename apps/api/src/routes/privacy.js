'use strict';
/**
 * Privacy routes — GDPR Article 15, 17, and 7(3) endpoints.
 *
 * All endpoints are patient-only (requireRole enforces this).
 * Doctors and admins manage data retention via separate admin tooling.
 *
 * Rate limiting: erasure and consent endpoints inherit the global apiLimiter
 * applied in index.js. These are low-frequency operations so no additional
 * limiter is applied here.
 */
const router      = require('express').Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const AuditLog    = require('../models/AuditLog');
const { erasePatient, withdrawConsent } = require('../services/erasureService');
const { getExportQueue }                = require('../queues/reminderQueue');

// ---------------------------------------------------------------------------
// DELETE /api/privacy/erase
// GDPR Article 17 — Right to Erasure
// ---------------------------------------------------------------------------
// Auth: authenticated patient only.
// Erases the requesting patient's own PHI — doctors cannot trigger this
// on behalf of patients (patient autonomy, non-repudiation).
//
// Blocking conditions (checked in erasureService, not here):
//   - Future pending or confirmed appointments must be cancelled first
//   - Active (non-revoked, non-expired) SharedLinks must be revoked first
//
// Success: returns 200 with message. auth middleware will now reject this
// user's tokens because erasedAt is set (checked on every request).
//
// 409 Conflict: blocking condition exists — message tells patient what to do.
// 5xx: unexpected DB error — surfaces through errorHandler.
// ---------------------------------------------------------------------------
router.delete('/erase', auth, requireRole('patient'), async (req, res, next) => {
  try {
    await erasePatient(req.user.id, {
      ip:        req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Erasure complete. The patient's account is deactivated — auth middleware
    // will reject further requests using the same JWT (erasedAt check).
    res.json({
      message: 'Your data has been anonymized per GDPR Article 17. Your account is now deactivated.',
    });
  } catch (err) {
    if (err.status === 409) {
      // Blocking condition — structured response for client to act on
      return res.status(409).json({ message: err.message });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/privacy/consent/withdraw
// GDPR Article 7(3) — Right to Withdraw Consent
// ---------------------------------------------------------------------------
// Auth: authenticated patient only.
// Sets dataProcessingAllowed=false and consentWithdrawnAt.
// Does NOT erase data immediately — the grace period (CONSENT_WITHDRAWAL_GRACE_DAYS,
// default 30 days) allows account reactivation before erasure is triggered.
//
// Retention worker (Plan 09) monitors for expired grace periods and queues erasure.
// ---------------------------------------------------------------------------
router.post('/consent/withdraw', auth, requireRole('patient'), async (req, res, next) => {
  try {
    await withdrawConsent(req.user.id, {
      ip:        req.ip,
      userAgent: req.headers['user-agent'],
    });

    const graceDays = parseInt(process.env.CONSENT_WITHDRAWAL_GRACE_DAYS || '30', 10);
    res.json({
      message:          `Consent withdrawn. Your data will be anonymized after a ${graceDays}-day grace period unless you reactivate your account.`,
      gracePeriodDays:  graceDays,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/privacy/audit-log
// GDPR Article 15 — Right of Access / Transparency
// ---------------------------------------------------------------------------
// Auth: authenticated patient only.
// Returns the last 100 audit entries targeting this patient's data.
// Patients have the right to see who accessed their records (GDPR Art. 15(1)(c)).
//
// Returns: { entries: AuditLog[] } — PHI content is never stored in AuditLog
// (meta contains only IDs and action context per AuditLog model constraints).
// ---------------------------------------------------------------------------
router.get('/audit-log', auth, requireRole('patient'), async (req, res, next) => {
  try {
    const entries = await AuditLog
      .find({ targetUserId: req.user.id })
      .select('action resourceType resourceId actorRole createdAt outcome meta')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ entries });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/privacy/export
// GDPR Article 20 — Right to Data Portability
// ---------------------------------------------------------------------------
// Auth: authenticated patient only.
// Enqueues a background BullMQ job that collects all PHI, serializes to JSON,
// uploads to Cloudinary, and notifies the patient via in-app Notification.
//
// Returns 202 (Accepted) with a jobId so the patient can poll job status.
// The download URL is delivered via Notification — NOT in this response —
// to minimize URL leakage surface (the response may be logged by proxies).
//
// Idempotency: jobId contains userId + timestamp, preventing BullMQ
// deduplication conflicts on rapid retries.
// ---------------------------------------------------------------------------
router.post('/export', auth, requireRole('patient'), async (req, res, next) => {
  try {
    const job = await getExportQueue().add(
      'export-patient-data',
      { userId: req.user.id },
      {
        jobId:             `export-${req.user.id}-${Date.now()}`,
        removeOnComplete:  { age: 24 * 60 * 60 },     // keep completed jobs 24h for status checks
        removeOnFail:      { age: 7 * 24 * 60 * 60 }, // keep failed jobs 7 days for support triage
      }
    );

    // Fire-and-forget audit — enqueue failure should not block the 202 response.
    AuditLog.create({
      actorId:      req.user.id,
      actorRole:    'patient',
      action:       'export',
      resourceType: 'User',
      resourceId:   req.user.id,
      targetUserId: req.user.id,
      ip:           req.ip,
      userAgent:    req.headers['user-agent'] || null,
      outcome:      'success',
      meta:         { jobId: job.id, status: 'queued' },
    }).catch(err => console.error('[audit] export enqueue log failed:', err.message));

    res.status(202).json({
      message: 'Export job queued. You will receive a notification when your data is ready.',
      jobId:   job.id,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/privacy/export/:jobId
// Check status of a previously enqueued export job.
// ---------------------------------------------------------------------------
// Auth: authenticated patient only.
// Ownership: jobId is prefixed with the patient's userId — mismatches return 403.
//
// Possible states returned by BullMQ: 'waiting' | 'active' | 'completed' | 'failed'
// On 'completed': download URL is in the patient's Notification (not exposed here).
// On 'failed': failedReason is surfaced so the patient can retry or contact support.
// ---------------------------------------------------------------------------
router.get('/export/:jobId', auth, requireRole('patient'), async (req, res, next) => {
  try {
    const { jobId } = req.params;

    // Ownership check before touching the queue — jobId format is
    // `export-{userId}-{timestamp}`, so the userId must appear in the jobId.
    if (!jobId.includes(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const queue = getExportQueue();
    const job   = await queue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ message: 'Export job not found or has expired' });
    }

    const state = await job.getState();

    res.json({
      jobId,
      status:     state, // 'waiting' | 'active' | 'completed' | 'failed'
      result:     state === 'completed'
        ? { message: 'Check your notifications for the download link' }
        : null,
      failReason: state === 'failed' ? job.failedReason : null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
