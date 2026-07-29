'use strict';

// Mock User model (used by auth middleware)
jest.mock('../../models/User');

const { requireSecretary, requireDoctorOrSecretary } = require('../secretaryAuth');

function makeReq(role, id = 'uid1', linkedDoctorId = null) {
  return { user: { id, role, linkedDoctorId } };
}
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireSecretary', () => {
  it('passes for secretary with linkedDoctorId, sets req.doctorUserId', () => {
    const req  = makeReq('secretary', 'uid1', 'doc1');
    const res  = makeRes();
    const next = jest.fn();
    requireSecretary(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.doctorUserId).toBe('doc1');
  });

  it('returns 403 for doctor', () => {
    const req = makeReq('doctor', 'uid1', null);
    const res = makeRes();
    requireSecretary(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 for secretary missing linkedDoctorId', () => {
    const req = makeReq('secretary', 'uid1', null);
    const res = makeRes();
    requireSecretary(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('requireDoctorOrSecretary', () => {
  it('passes for doctor, sets req.doctorUserId = req.user.id', () => {
    const req  = makeReq('doctor', 'doc_user_id', null);
    const res  = makeRes();
    const next = jest.fn();
    requireDoctorOrSecretary(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.doctorUserId).toBe('doc_user_id');
  });

  it('passes for secretary, sets req.doctorUserId = linkedDoctorId', () => {
    const req  = makeReq('secretary', 'sec_id', 'linked_doc_id');
    const res  = makeRes();
    const next = jest.fn();
    requireDoctorOrSecretary(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.doctorUserId).toBe('linked_doc_id');
  });

  it('returns 403 for patient', () => {
    const req = makeReq('patient');
    const res = makeRes();
    requireDoctorOrSecretary(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
