'use strict';

// triageParser.js is not implemented yet — RED state tests.
// Validates the <triage>{JSON}</triage> block parser.

describe('triageParser', () => {
  let parseTriage;

  beforeAll(() => {
    const mod = require('../triageParser');
    parseTriage = mod.parseTriage;
  });

  it('parses a well-formed <triage> block', () => {
    const text = `I understand your symptoms.\n<triage>{"urgency":"routine","specialties":["cardiology"],"summary":"Mild chest tightness — routine follow-up","ready_for_referral":true}</triage>\nPlease see a doctor.`;
    const result = parseTriage(text);
    expect(result).not.toBeNull();
    expect(result.urgency).toBe('routine');
    expect(result.specialties).toEqual(['cardiology']);
    expect(result.summary).toBe('Mild chest tightness — routine follow-up');
    expect(result.ready_for_referral).toBe(true);
  });

  it('returns null when no <triage> block is present', () => {
    expect(parseTriage('This is just a normal response with no triage block.')).toBeNull();
  });

  it('returns null on malformed JSON inside <triage> tags', () => {
    const text = '<triage>{urgency: "routine", broken</triage>';
    expect(parseTriage(text)).toBeNull();
  });

  it('rejects unknown urgency values (returns null)', () => {
    const text = '<triage>{"urgency":"critical","specialties":[],"summary":"test","ready_for_referral":false}</triage>';
    expect(parseTriage(text)).toBeNull();
  });

  it('accepts all valid urgency values: routine, soon, urgent, emergency', () => {
    for (const urgency of ['routine', 'soon', 'urgent', 'emergency']) {
      const text = `<triage>{"urgency":"${urgency}","specialties":[],"summary":"x","ready_for_referral":false}</triage>`;
      const result = parseTriage(text);
      expect(result).not.toBeNull();
      expect(result.urgency).toBe(urgency);
    }
  });

  it('returns null when called with non-string input', () => {
    expect(parseTriage(null)).toBeNull();
    expect(parseTriage(42)).toBeNull();
    expect(parseTriage(undefined)).toBeNull();
  });

  it('filters non-string values from specialties array', () => {
    const text = '<triage>{"urgency":"soon","specialties":["cardiology",42,null,"neurology"],"summary":"x","ready_for_referral":false}</triage>';
    const result = parseTriage(text);
    expect(result).not.toBeNull();
    expect(result.specialties).toEqual(['cardiology', 'neurology']);
  });
});
