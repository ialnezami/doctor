describe('Appointment model reminder fields', () => {
  it('has remindersDisabled default false', () => {
    const Appointment = require('../Appointment');
    const paths = Appointment.schema.paths;
    expect(paths.remindersDisabled.defaultValue).toBe(false);
    expect(paths.reminder24hJobId.defaultValue).toBeNull();
    expect(paths.reminder1hJobId.defaultValue).toBeNull();
  });
});

describe('Doctor model timezone field', () => {
  it('has timezone default UTC', () => {
    const Doctor = require('../Doctor');
    expect(Doctor.schema.paths.timezone.defaultValue).toBe('UTC');
  });
});

describe('Notification model type enum', () => {
  it('includes appointment_reminder and daily_digest', () => {
    const Notification = require('../Notification');
    const enumValues = Notification.schema.paths.type.enumValues;
    expect(enumValues).toContain('appointment_reminder');
    expect(enumValues).toContain('daily_digest');
  });
});
