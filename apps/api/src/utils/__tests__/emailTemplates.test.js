const {
  appointmentConfirmedEmail,
  appointmentReminderEmail,
  consultationValidatedEmail,
  dailyDigestEmail,
} = require('../emailTemplates');

describe('appointmentConfirmedEmail', () => {
  it('includes patient name, doctor name, date, and time slot', () => {
    const html = appointmentConfirmedEmail('Alice', 'Dr. Smith', '2026-07-01', '10:00');
    expect(html).toContain('Alice');
    expect(html).toContain('Dr. Smith');
    expect(html).toContain('2026-07-01');
    expect(html).toContain('10:00');
  });
});

describe('appointmentReminderEmail', () => {
  it('includes patient name, doctor name, date, and time slot', () => {
    const html = appointmentReminderEmail('Bob', 'Dr. Jones', '2026-07-02', '14:30');
    expect(html).toContain('Bob');
    expect(html).toContain('Dr. Jones');
    expect(html).toContain('2026-07-02');
    expect(html).toContain('14:30');
  });
});

describe('consultationValidatedEmail', () => {
  it('includes patient name, doctor name, and date', () => {
    const html = consultationValidatedEmail('Carol', 'Dr. Lee', '2026-06-30');
    expect(html).toContain('Carol');
    expect(html).toContain('Dr. Lee');
    expect(html).toContain('2026-06-30');
  });
});

describe('dailyDigestEmail', () => {
  it('includes doctor name and appointment count', () => {
    const html = dailyDigestEmail('Dr. Khan', 5, '2026-07-01');
    expect(html).toContain('Dr. Khan');
    expect(html).toContain('5');
  });
});
