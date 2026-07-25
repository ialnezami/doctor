jest.mock('../../models/LabResult');
jest.mock('../../queues/reminderQueue', () => ({
  getConnection: jest.fn(() => ({})),
  getLabQueue:   jest.fn(() => ({})),
}));
jest.mock('@anthropic-ai/sdk');

const LabResult       = require('../../models/LabResult');
const Anthropic       = require('@anthropic-ai/sdk');
const { processLabJob } = require('../labWorker');

beforeEach(() => jest.clearAllMocks());

function mockLabResult(overrides = {}) {
  const result = {
    _id:     'lr1',
    labName: 'Complete Blood Count',
    tests: [
      { name: 'Hemoglobin', value: '10.5', unit: 'g/dL', referenceRange: '12-16', flag: 'low' },
      { name: 'WBC',        value: '6.0',  unit: 'K/uL',  referenceRange: '4-11',   flag: 'normal' },
    ],
    aiInterpretation: {},
    save: jest.fn(),
    ...overrides,
  };
  LabResult.findById = jest.fn().mockResolvedValue(result);
  return result;
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

test('happy path: writes summary and processedAt to LabResult', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const result = mockLabResult();
  mockClaude({ summary: 'Your hemoglobin is slightly low. Consult your doctor.' });

  await processLabJob({ data: { labResultId: 'lr1' } });

  expect(result.aiInterpretation.summary).toBe('Your hemoglobin is slightly low. Consult your doctor.');
  expect(result.aiInterpretation.processedAt).toBeInstanceOf(Date);
  expect(result.save).toHaveBeenCalledTimes(1);
});

test('skips if ANTHROPIC_API_KEY not set', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const result = mockLabResult();

  await processLabJob({ data: { labResultId: 'lr1' } });

  expect(result.save).not.toHaveBeenCalled();
});

test('skips if LabResult not found', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  LabResult.findById = jest.fn().mockResolvedValue(null);

  await expect(processLabJob({ data: { labResultId: 'missing' } })).resolves.toBeUndefined();
});

test('sets summary to null on JSON parse failure but still saves processedAt', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const result = mockLabResult();
  Anthropic.mockImplementation(() => ({
    messages: { create: jest.fn().mockResolvedValue({ content: [{ text: 'not json at all' }] }) },
  }));

  await processLabJob({ data: { labResultId: 'lr1' } });

  expect(result.aiInterpretation.summary).toBeNull();
  expect(result.aiInterpretation.processedAt).toBeInstanceOf(Date);
  expect(result.save).toHaveBeenCalledTimes(1);
});

test('sets summary to null when Claude returns JSON without summary field', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const result = mockLabResult();
  mockClaude({ unexpected: 'field' });

  await processLabJob({ data: { labResultId: 'lr1' } });

  expect(result.aiInterpretation.summary).toBeNull();
  expect(result.save).toHaveBeenCalledTimes(1);
});

test('propagates Claude API error so BullMQ can retry', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  mockLabResult();
  Anthropic.mockImplementation(() => ({
    messages: { create: jest.fn().mockRejectedValue(new Error('API timeout')) },
  }));

  await expect(processLabJob({ data: { labResultId: 'lr1' } })).rejects.toThrow('API timeout');
});
