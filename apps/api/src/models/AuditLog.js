'use strict';
/**
 * AuditLog — HIPAA/GDPR compliance audit trail.
 *
 * HIPAA requirement: Retain audit logs for 6 years minimum.
 * DO NOT add a TTL index to this collection — the data retention cron (Plan 09)
 * applies TTL only to PHI records, never to audit logs.
 *
 * Fields capture WHO (actorId + actorRole) accessed WHAT (resourceType + resourceId)
 * belonging to WHOM (targetUserId) at what time (createdAt via timestamps).
 * NEVER store PHI content in meta — only IDs and non-sensitive context.
 *
 * action enum:
 *   read    — PHI record was read
 *   create  — new PHI record was created
 *   update  — PHI record was modified
 *   delete  — PHI record was deleted
 *   export  — GDPR Article 20 data export requested
 *   erase   — GDPR Article 17 erasure executed
 *   login   — user authenticated
 *   consent — patient consent recorded or withdrawn
 */
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorRole: {
      type: String,
      enum: ['doctor', 'patient', 'laboratory', 'admin'],
      required: true,
    },
    action: {
      type: String,
      enum: ['read', 'create', 'update', 'delete', 'export', 'erase', 'login', 'consent'],
      required: true,
    },
    resourceType: {
      type: String,
      required: true, // 'Patient', 'ConsultationNote', 'Prescription', 'LabResult', 'User'
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // whose PHI was accessed — null for non-PHI actions (login)
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    outcome: {
      type: String,
      enum: ['success', 'failure', 'blocked'],
      default: 'success',
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      // Permitted: jobId, reason, exportFormat — NEVER PHI content
    },
  },
  {
    timestamps: true, // createdAt is the audit timestamp
    // No TTL — HIPAA requires 6-year retention of audit logs
  }
);

// Query patterns: admin views by actor, by patient, by resource, by action + time
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetUserId: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
