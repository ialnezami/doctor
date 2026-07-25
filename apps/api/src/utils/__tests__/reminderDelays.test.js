const { computeReminderDelays, nextLocalSevenAmDelay } = require('../reminderDelays');

describe('computeReminderDelays', () => {
  it('returns correct delays for appointment 48h away', () => {
    const now = Date.now();
    const apptDate = new Date(now + 48 * 60 * 60 * 1000);
    const { delay24h, delay1h } = computeReminderDelays(apptDate);
    // 24h delay should be ~24h (48h - 24h)
    expect(delay24h).toBeGreaterThan(23 * 60 * 60 * 1000 - 500);
    expect(delay24h).toBeLessThan(25 * 60 * 60 * 1000);
    // 1h delay should be ~47h (48h - 1h)
    expect(delay1h).toBeGreaterThan(46 * 60 * 60 * 1000 - 500);
    expect(delay1h).toBeLessThan(48 * 60 * 60 * 1000);
  });

  it('clamps to 0 when appointment is in the past', () => {
    const pastDate = new Date(Date.now() - 60 * 60 * 1000);
    const { delay24h, delay1h } = computeReminderDelays(pastDate);
    expect(delay24h).toBe(0);
    expect(delay1h).toBe(0);
  });
});

describe('nextLocalSevenAmDelay', () => {
  it('returns a positive delay in ms', () => {
    const delay = nextLocalSevenAmDelay('UTC');
    expect(delay).toBeGreaterThan(0);
  });

  it('returns delay of at most 24h + 1s', () => {
    const delay = nextLocalSevenAmDelay('Asia/Riyadh');
    expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
  });

  it('falls back to UTC for invalid timezone', () => {
    expect(() => nextLocalSevenAmDelay('Not/AZone')).not.toThrow();
  });
});
