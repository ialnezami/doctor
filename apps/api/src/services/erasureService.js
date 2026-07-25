'use strict';
/**
 * GDPR Article 17 — Right to Erasure Service
 *
 * Strategy: Anonymize PHI, retain medical structure (HIPAA compliance).
 * Hard-delete: Messages, Notifications, SharedLinks (no clinical value).
 * Retain: Appointments, AuditLogs, Prescriptions structure, LabResult structure.
 *
 * Atomicity: Uses MongoDB session transaction. Requires replica set or Atlas.
 * If startSession fails (standalone MongoDB), the error propagates to the caller
 * who receives a 503 with a clear message — partial erasure is not acceptable.
 *
 * Idempotency: Repeated calls on an already-erased account are no-ops
 * (all fields already anonymized; erasedAt already set).
 *
 * PHI field notes:
 * - Patient.medicalHistory/allergies/conditions are encrypted via pre-save hook.
 *   updateMany() bypasses the hook — intentional for erasure since we're writing
 *   [] / null, not ciphertext. No decrypt needed on empty arrays.
 * - ConsultationNote.content / Prescription.instructions / LabResult.notes are
 *   encrypted via pre-save hook. updateMany() with '[ERASED]' stores the literal
 *   string — intentional. On read, post('init') will call decrypt('[ERASED]') which
 *   will return the string as-is (no sentinel prefix = treat as legacy plaintext).
 * - Prescription.medications.$[].name/dosage are anonymized outside the transaction
 *   due to arrayFilters + sessions compatibility issues in older MongoDB versions.
 *   This is post-transaction idempotent cleanup with acceptable brief inconsistency.
 */
const mongoose = require('mongoose');

const User             = require('../models/User');
const Patient          = require('../models/Patient');
const ConsultationNote = require('../models/ConsultationNote');
const Prescription     = require('../models/Prescription');
const LabResult        = require('../models/LabResult');
const Appointment      = require('../models/Appointment');
const AuditLog         = require('../models/AuditLog');
const Message          = require('../models/Message');
const Notification     = require('../models/Notification');
const SharedLink       = require('../models/SharedLink');
const Report           = require('../models/Report');

const ERASED_PLACEHOLDER = '[ERASED]';
const GRACE_PERIOD_DAYS  = parseInt(process.env.CONSENT_WITHDRAWAL_GRACE_DAYS || '30', 10);

// ---------------------------------------------------------------------------
// Blocking conditions
// ---------------------------------------------------------------------------

/**
 * Check whether erasure is currently blocked for this user.
 * Must be called BEFORE opening a transaction to avoid holding locks during
 * user-blocking conditions.
 *
 * @param {string|ObjectId} userId
 * @returns {{ blocked: boolean, reason?: string }}
 */
async function checkBlockingConditions(userId) {
  const now = new Date();

  // 1. Future pending or confirmed appointments prevent erasure.
  //    The patient must cancel or wait for them to complete.
  const blockingAppt = await Appointment.findOne({
    patientId: userId,
    status:    { $in: ['pending', 'confirmed'] },
    date:      { $gt: now },
  }).lean();

  if (blockingAppt) {
    return {
      blocked: true,
      reason:  'Cannot erase: you have future appointments that are pending or confirmed. Cancel them first.',
    };
  }

  // 2. Active (non-revoked, non-expired) SharedLinks block erasure.
  //    Revoking links first ensures third parties lose access before PHI is cleared.
  const blockingLink = await SharedLink.findOne({
    ownerId:   userId,
    revokedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  }).lean();

  if (blockingLink) {
    return {
      blocked: true,
      reason:  'Cannot erase: you have active shared record links. Revoke them first.',
    };
  }

  return { blocked: false };
}

// ---------------------------------------------------------------------------
// Main erasure function
// ---------------------------------------------------------------------------

/**
 * Perform GDPR Article 17 erasure for a patient user.
 *
 * @param {string} userId    - The User._id (ObjectId string) of the patient requesting erasure
 * @param {{ ip?: string, userAgent?: string }} context - For audit log
 * @returns {{ success: true }}
 * @throws Error with .status = 409 for blocking conditions, or undecorated errors for DB failures
 */
async function erasePatient(userId, { ip, userAgent } = {}) {
  // Validate blocking conditions BEFORE opening a transaction to avoid holding
  // a session lock during what could be a user-facing "fix your state" error.
  const block = await checkBlockingConditions(userId);
  if (block.blocked) {
    const err = new Error(block.reason);
    err.status = 409;
    throw err;
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const opts = { session };

      // ------------------------------------------------------------------
      // Step 1: Anonymize User PII
      // ------------------------------------------------------------------
      // erasedAt is set here — auth middleware will reject this user's JWTs
      // immediately after the transaction commits.
      //
      // emailHash is nulled to prevent login lookups — this is correct because
      // the blind index would otherwise allow re-identification via email lookup.
      //
      // The erased email is a synthetic non-routable address for uniqueness.
      // The unique index on User.email means we cannot simply set it to null.
      const erasedEmail = `erased-${userId}@deleted.invalid`;
      await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            name:                  '[DELETED]',
            email:                 erasedEmail,
            emailHash:             null,     // remove blind index — prevents login after erasure
            googleId:              null,
            fcmToken:              null,
            photoUrl:              '',
            erasedAt:              new Date(),
            dataProcessingAllowed: false,
            consentWithdrawnAt:    new Date(),
          },
        },
        opts
      );

      // ------------------------------------------------------------------
      // Step 2: Anonymize Patient PHI
      // ------------------------------------------------------------------
      // updateMany() bypasses pre-save encryption hook. Intentional — we're
      // writing [], null, '' which represent absent data, not PHI content.
      await Patient.findOneAndUpdate(
        { userId },
        {
          $set: {
            medicalHistory: [],
            allergies:      [],
            conditions:     [],
            dateOfBirth:    null,
            bloodType:      null,
            notes:          [],
            homeLocation:   null,
            city:           '',
            photoUrl:       '',
          },
        },
        opts
      );

      // ------------------------------------------------------------------
      // Step 3: Anonymize ConsultationNote PHI
      // ------------------------------------------------------------------
      // Collect appointment IDs for this patient (needed for Notes and Messages).
      const appts   = await Appointment.find({ patientId: userId }, '_id', opts).lean();
      const apptIds = appts.map(a => a._id);

      if (apptIds.length > 0) {
        // content and aiAssist.patientSummary are PHI.
        // Storing literal '[ERASED]' bypasses encryption on read — post('init')
        // decrypt('[ERASED]') returns the string as-is (no "|" sentinel = plaintext pass-through).
        await ConsultationNote.updateMany(
          { appointmentId: { $in: apptIds } },
          {
            $set: {
              content:                  ERASED_PLACEHOLDER,
              'aiAssist.patientSummary': null,
              'aiAssist.icdCodes':       [],
              'aiAssist.flags':          [],
            },
          },
          opts
        );
      }

      // ------------------------------------------------------------------
      // Step 4: Anonymize Prescription PHI (scalar fields)
      // ------------------------------------------------------------------
      // instructions is PHI. medications array element fields are handled
      // post-transaction (see below).
      await Prescription.updateMany(
        { patientId: userId },
        { $set: { instructions: ERASED_PLACEHOLDER } },
        opts
      );

      // ------------------------------------------------------------------
      // Step 5: Anonymize LabResult PHI
      // ------------------------------------------------------------------
      await LabResult.updateMany(
        { patientId: userId },
        {
          $set: {
            notes:                       ERASED_PLACEHOLDER,
            'aiInterpretation.summary':  null,
          },
        },
        opts
      );
      // tests[].value — positional all-elements operator works with session in
      // MongoDB 4.4+ (the minimum version for Atlas). Using separate updateMany
      // to isolate any compatibility issue with icdCodes update above.
      await LabResult.updateMany(
        { patientId: userId },
        { $set: { 'tests.$[].value': ERASED_PLACEHOLDER } },
        opts
      );

      // ------------------------------------------------------------------
      // Step 6: Hard delete Messages (no clinical value, pure convenience)
      // ------------------------------------------------------------------
      if (apptIds.length > 0) {
        await Message.deleteMany({ appointmentId: { $in: apptIds } }, opts);
      }

      // ------------------------------------------------------------------
      // Step 7: Hard delete Notifications for this patient
      // ------------------------------------------------------------------
      await Notification.deleteMany({ recipientId: userId }, opts);

      // ------------------------------------------------------------------
      // Step 8: Hard delete SharedLinks (all, including expired/revoked)
      // ------------------------------------------------------------------
      // Blocking check above ensures no active links remain. We still hard-delete
      // expired/revoked ones to fully remove the patient's data from this collection.
      await SharedLink.deleteMany({ ownerId: userId }, opts);

      // ------------------------------------------------------------------
      // Step 9: Anonymize Report references where patient is the reporter
      // ------------------------------------------------------------------
      // Reports have medical/legal value — retain structure, remove reporter identity.
      await Report.updateMany(
        { reporterId: userId },
        { $set: { reporterId: null } },
        opts
      );
    });

    // ------------------------------------------------------------------
    // Post-transaction: anonymize Prescription medication array fields
    // ------------------------------------------------------------------
    // Done outside the transaction because $[] (all-positional) arrayFilters
    // with a session can fail on MongoDB versions < 4.4 and some driver versions.
    // This is idempotent — repeated calls leave medications.$[].name = '[ERASED]'.
    // Acceptable brief inconsistency window: medication names remain encrypted
    // in DB until this line executes (milliseconds after transaction commit).
    await Prescription.updateMany(
      { patientId: userId },
      {
        $set: {
          'medications.$[].name':      ERASED_PLACEHOLDER,
          'medications.$[].dosage':    ERASED_PLACEHOLDER,
          'medications.$[].frequency': ERASED_PLACEHOLDER,
          'medications.$[].duration':  ERASED_PLACEHOLDER,
        },
      }
    );

    // ------------------------------------------------------------------
    // Audit log (outside transaction — audit logs must survive transaction retries)
    // ------------------------------------------------------------------
    // AuditLog.create() is fire-and-forget here. A failure to write the audit log
    // must NOT roll back the erasure (the patient's right to erasure takes priority).
    // The error is logged for manual remediation.
    AuditLog.create({
      actorId:      userId,
      actorRole:    'patient',
      action:       'erase',
      resourceType: 'User',
      resourceId:   userId,
      targetUserId: userId,
      ip,
      userAgent,
      outcome:      'success',
      meta:         { erasedAt: new Date() },
    }).catch(auditErr => {
      // Audit log failure — log for monitoring but do not surface to client
      console.error('[audit] erase log write failed for user', userId, ':', auditErr.message);
    });

    return { success: true };
  } finally {
    // Always end the session — even if withTransaction threw or retried
    await session.endSession();
  }
}

// ---------------------------------------------------------------------------
// Consent withdrawal
// ---------------------------------------------------------------------------

/**
 * Record consent withdrawal per GDPR Article 7(3).
 *
 * Does NOT trigger immediate erasure. A retention worker (Plan 09) monitors
 * accounts where consentWithdrawnAt > GRACE_PERIOD_DAYS and queues them for erasure.
 *
 * @param {string} userId
 * @param {{ ip?: string, userAgent?: string }} context
 */
async function withdrawConsent(userId, { ip, userAgent } = {}) {
  await User.findByIdAndUpdate(userId, {
    $set: {
      dataProcessingAllowed: false,
      consentWithdrawnAt:    new Date(),
    },
  });

  // Audit log — fire-and-forget, same rationale as erasure audit
  AuditLog.create({
    actorId:      userId,
    actorRole:    'patient',
    action:       'consent',
    resourceType: 'User',
    resourceId:   userId,
    targetUserId: userId,
    ip,
    userAgent,
    outcome:      'success',
    meta:         { type: 'withdrawal', gracePeriodDays: GRACE_PERIOD_DAYS },
  }).catch(auditErr => {
    console.error('[audit] consent withdrawal log failed for user', userId, ':', auditErr.message);
  });
}

module.exports = { erasePatient, withdrawConsent, checkBlockingConditions };
