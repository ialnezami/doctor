jest.mock('../../models/ConsultationNote');
jest.mock('../../queues/reminderQueue', () => ({
  getConnection: jest.fn(() => ({})),
  getNoteQueue:  jest.fn(() => ({})),
}));
jest.mock('@anthropic-ai/sdk');

const ConsultationNote  = require('../../models/ConsultationNote');
const Anthropic         = require('@anthropic-ai/sdk');
const { processNoteJob } = require('../noteWorker');

beforeEach(() => jest.clearAllMocks());

function mockNote(overrides = {}) {
  const note = {
    _id:     'n1',
    content: 'Patient has persistent cough and fever for 5 days.',
    save:    jest.fn(),
    ...overrides,
  };
  ConsultationNote.findById = jest.fn().mockResolvedValue(note);
  return note;
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

const VALID_RESPONSE = {
  icdCodes: [
    { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified' },
    { code: 'R50.9', description: 'Fever, unspecified' },
  ],
  patientSummary: 'You have had a cough and fever for 5 days. Please follow up as directed.',
  flags: ['Missing: follow-up date', 'Missing: medication dosage'],
};

test('writes icdCodes, patientSummary, flags, and processedAt to note', async () => {
  const note = mockNote();
  mockClaude(VALID_RESPONSE);
  process.env.ANTHROPIC_API_KEY = 'test-key';

  await processNoteJob({ data: { noteId: 'n1' } });

  expect(note.aiAssist.icdCodes).toHaveLength(2);
  expect(note.aiAssist.icdCodes[0].code).toBe('J06.9');
  expect(note.aiAssist.patientSummary).toContain('cough');
  expect(note.aiAssist.flags).toHaveLength(2);
  expect(note.aiAssist.processedAt).toBeInstanceOf(Date);
  expect(note.save).toHaveBeenCalled();
});

test('skips if note not found', async () => {
  ConsultationNote.findById = jest.fn().mockResolvedValue(null);
  await expect(processNoteJob({ data: { noteId: 'missing' } })).resolves.toBeUndefined();
});

test('skips if ANTHROPIC_API_KEY not set', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const note = mockNote();
  await processNoteJob({ data: { noteId: 'n1' } });
  expect(note.save).not.toHaveBeenCalled();
});

test('silent degradation on JSON parse failure — still saves processedAt with empty defaults', async () => {
  const note = mockNote();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  Anthropic.mockImplementation(() => ({
    messages: { create: jest.fn().mockResolvedValue({ content: [{ text: 'not json at all' }] }) },
  }));

  await processNoteJob({ data: { noteId: 'n1' } });

  expect(note.aiAssist.icdCodes).toEqual([]);
  expect(note.aiAssist.patientSummary).toBeNull();
  expect(note.aiAssist.flags).toEqual([]);
  expect(note.aiAssist.processedAt).toBeInstanceOf(Date);
  expect(note.save).toHaveBeenCalled();
});

test('caps icdCodes at 5 entries', async () => {
  const note = mockNote();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const codes = Array.from({ length: 8 }, (_, i) => ({ code: `Z${i}`, description: `desc ${i}` }));
  mockClaude({ icdCodes: codes, patientSummary: 'summary', flags: [] });

  await processNoteJob({ data: { noteId: 'n1' } });

  expect(note.aiAssist.icdCodes).toHaveLength(5);
});

test('caps flags at 3 entries', async () => {
  const note = mockNote();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  mockClaude({ icdCodes: [], patientSummary: 'ok', flags: ['f1', 'f2', 'f3', 'f4', 'f5'] });

  await processNoteJob({ data: { noteId: 'n1' } });

  expect(note.aiAssist.flags).toHaveLength(3);
});

test('propagates Claude API error so BullMQ can retry', async () => {
  mockNote();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  Anthropic.mockImplementation(() => ({
    messages: { create: jest.fn().mockRejectedValue(new Error('API timeout')) },
  }));

  await expect(
    processNoteJob({ data: { noteId: 'n1' } })
  ).rejects.toThrow('API timeout');
});
