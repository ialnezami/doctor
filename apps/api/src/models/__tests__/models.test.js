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

describe('Notification model expireAt TTL', () => {
  it('has expireAt field defaulting to ~30 days from now', () => {
    const Notification = require('../Notification');
    const path = Notification.schema.paths.expireAt;
    expect(path).toBeDefined();
    const defaultVal = path.defaultValue();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(defaultVal.getTime()).toBeGreaterThan(Date.now() + thirtyDaysMs - 5000);
    expect(defaultVal.getTime()).toBeLessThan(Date.now() + thirtyDaysMs + 5000);
  });
});

describe('User model notificationPrefs', () => {
  it('has pushEnabled default true', () => {
    const User = require('../User');
    const prefs = User.schema.paths['notificationPrefs.pushEnabled'];
    expect(prefs.defaultValue).toBe(true);
  });
  it('has emailEnabled default true', () => {
    const User = require('../User');
    const prefs = User.schema.paths['notificationPrefs.emailEnabled'];
    expect(prefs.defaultValue).toBe(true);
  });
});

describe('Appointment symptom fields', () => {
  it('has symptomText defaulting to null', () => {
    const Appointment = require('../Appointment');
    const path = Appointment.schema.paths.symptomText;
    expect(path).toBeDefined();
    expect(path.defaultValue).toBeNull();
  });
  it('has symptomAnalysis.urgency enum low/medium/high', () => {
    const Appointment = require('../Appointment');
    const path = Appointment.schema.paths['symptomAnalysis.urgency'];
    expect(path).toBeDefined();
    expect(path.enumValues).toEqual(['low', 'medium', 'high']);
  });
  it('has symptomAnalysis.processedAt defaulting to null', () => {
    const Appointment = require('../Appointment');
    const path = Appointment.schema.paths['symptomAnalysis.processedAt'];
    expect(path).toBeDefined();
    expect(path.defaultValue).toBeNull();
  });
});
