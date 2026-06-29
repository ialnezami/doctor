'use strict';
/**
 * auditLog(resourceType, action, getResourceId?, getTargetUserId?) — Express middleware factory.
 *
 * Usage in routes:
 *   router.get('/:id', auth, auditLog('Patient', 'read', (req) => req.params.id), handler)
 *   router.post('/', auth, handler, auditLog('Prescription', 'create', (req, res) => res.locals.createdId))
 *
 * Writes AuditLog ASYNCHRONOUSLY (fire-and-forget) to avoid adding latency to every PHI
 * request. A failed audit write is logged to stderr but does NOT cause the request to fail.
 *
 * NEVER include PHI content in meta — only IDs, action types, and non-sensitive context.
 */
const AuditLog = require('../models/AuditLog');

/**
 * @param {string} resourceType - e.g. 'Patient', 'ConsultationNote', 'Prescription', 'LabResult'
 * @param {string} action - one of: read | create | update | delete | export | erase | login | consent
 * @param {Function} [getResourceId] - (req, res) => ObjectId string
 * @param {Function} [getTargetUserId] - (req, res) => ObjectId string — whose PHI was touched
 */
function auditLog(resourceType, action, getResourceId, getTargetUserId) {
  return function auditLogMiddleware(req, res, next) {
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    function writeAuditEntry(statusCode) {
      const outcome =
        statusCode >= 200 && statusCode < 300 ? 'success'
        : statusCode === 403 || statusCode === 401 ? 'blocked'
        : 'failure';

      const resourceId = getResourceId ? getResourceId(req, res) : null;
      const targetUserId = getTargetUserId
        ? getTargetUserId(req, res)
        : req.user?.role === 'patient' ? req.user?.id : null;

      // Fire-and-forget: do not await, do not block response
      AuditLog.create({
        actorId:      req.user?.id,
        actorRole:    req.user?.role,
        action,
        resourceType,
        resourceId:   resourceId || null,
        targetUserId: targetUserId || null,
        ip:           req.ip,
        userAgent:    req.headers['user-agent'] || null,
        outcome,
        meta:         res.locals.auditMeta || null,
      }).catch(err => {
        // Never throw — audit failure must not crash the request
        console.error('[audit] write failed:', err.message);
      });
    }

    res.json = function (body) {
      writeAuditEntry(res.statusCode);
      return originalJson(body);
    };
    res.send = function (body) {
      writeAuditEntry(res.statusCode);
      return originalSend(body);
    };

    next();
  };
}

module.exports = { auditLog };
