jest.mock('../../models/Appointment');
jest.mock('../../queues/reminderQueue', () => ({
  getConnection:   jest.fn(() => ({})),
  getSymptomQueue: jest.fn(() => ({})),
}));
jest.mock('@anthropic-ai/sdk');

const Appointment     = require('../../models/Appointment');
const Anthropic       = require('@anthropic-ai/sdk');
const { processSymptomJob } = require('../symptomWorker');

beforeEach(() => jest.clearAllMocks());

function mockAppt(overrides = {}) {
  const appt = { _id: 'a1', symptomText: 'I have a fever', save: jest.fn(), ...overrides };
  Appointment.findById = jest.fn().mockResolvedValue(appt);
  return appt;
}

function mockClaude(json) {
  Anthropic.mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: JSON.stringify(json) }],
      }),
    },
  }));
}

test('writes urgency and category to appointment', async () => {
  const appt = mockAppt();
  mockClaude({ urgency: 'low', category: 'fever' });
  process.env.ANTHROPIC_API_KEY = 'test-key';

  await processSymptomJob({ data: { appointmentId: 'a1' } });

  expect(appt.symptomAnalysis.urgency).toBe('low');
  expect(appt.symptomAnalysis.category).toBe('fever');
  expect(appt.symptomAnalysis.processedAt).toBeInstanceOf(Date);
  expect(appt.save).toHaveBeenCalled();
});

test('skips if appointment not found', async () => {
  Appointment.findById = jest.fn().mockResolvedValue(null);
  await expect(processSymptomJob({ data: { appointmentId: 'missing' } })).resolves.toBeUndefined();
});

test('skips if symptomText is null', async () => {
  mockAppt({ symptomText: null });
  await expect(processSymptomJob({ data: { appointmentId: 'a1' } })).resolves.toBeUndefined();
});

test('sets null analysis on JSON parse failure', async () => {
  const appt = mockAppt();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  Anthropic.mockImplementation(() => ({
    messages: { create: jest.fn().mockResolvedValue({ content: [{ text: 'not json' }] }) },
  }));

  await processSymptomJob({ data: { appointmentId: 'a1' } });

  expect(appt.symptomAnalysis.urgency).toBeNull();
  expect(appt.symptomAnalysis.category).toBeNull();
  expect(appt.symptomAnalysis.processedAt).toBeInstanceOf(Date);
  expect(appt.save).toHaveBeenCalled();
});

test('skips if ANTHROPIC_API_KEY not set', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const appt = mockAppt();
  await processSymptomJob({ data: { appointmentId: 'a1' } });
  expect(appt.save).not.toHaveBeenCalled();
});

test('propagates Claude API error so BullMQ can retry', async () => {
  mockAppt();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  Anthropic.mockImplementation(() => ({
    messages: { create: jest.fn().mockRejectedValue(new Error('API timeout')) },
  }));

  await expect(
    processSymptomJob({ data: { appointmentId: 'a1' } })
  ).rejects.toThrow('API timeout');
});
