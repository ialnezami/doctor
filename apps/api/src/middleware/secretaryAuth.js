'use strict';

/**
 * requireSecretary — only secretaries with a linked doctor pass.
 * Sets req.doctorUserId = req.user.linkedDoctorId for downstream use.
 */
const requireSecretary = (req, res, next) => {
  if (req.user?.role !== 'secretary') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (!req.user.linkedDoctorId) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  req.doctorUserId = req.user.linkedDoctorId;
  next();
};

/**
 * requireDoctorOrSecretary — doctors and secretaries pass.
 * Sets req.doctorUserId:
 *   - doctor  → req.user.id  (they ARE the doctor)
 *   - secretary → req.user.linkedDoctorId (the doctor they work for)
 */
const requireDoctorOrSecretary = (req, res, next) => {
  const { role, id, linkedDoctorId } = req.user || {};
  if (role === 'doctor') {
    req.doctorUserId = id;
    return next();
  }
  if (role === 'secretary' && linkedDoctorId) {
    req.doctorUserId = linkedDoctorId;
    return next();
  }
  return res.status(403).json({ message: 'Forbidden' });
};

module.exports = { requireSecretary, requireDoctorOrSecretary };
