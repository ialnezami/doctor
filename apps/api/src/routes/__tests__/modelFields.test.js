'use strict';

const UserSchema    = require('../../models/User').schema;
const ApptSchema    = require('../../models/Appointment').schema;

describe('User schema — secretary fields', () => {
  it('includes secretary in role enum', () => {
    const roleEnum = UserSchema.path('role').enumValues;
    expect(roleEnum).toContain('secretary');
  });

  it('has linkedDoctorId field', () => {
    const path = UserSchema.path('linkedDoctorId');
    expect(path).toBeDefined();
  });

  it('has isActive field defaulting to true', () => {
    const path = UserSchema.path('isActive');
    expect(path).toBeDefined();
    expect(path.defaultValue).toBe(true);
  });

  it('has inviteToken field', () => {
    expect(UserSchema.path('inviteToken')).toBeDefined();
  });

  it('has inviteExpiry field', () => {
    expect(UserSchema.path('inviteExpiry')).toBeDefined();
  });
});

describe('Appointment schema — QR fields', () => {
  it('has qrToken field', () => {
    expect(ApptSchema.path('qrToken')).toBeDefined();
  });

  it('has checkedInAt field', () => {
    expect(ApptSchema.path('checkedInAt')).toBeDefined();
  });
});
