jest.mock('@anthropic-ai/sdk');
jest.mock('../whatsappBookingTools');

const Anthropic = require('@anthropic-ai/sdk');
const { executeTool } = require('../whatsappBookingTools');
const { runAgent } = require('../whatsappAgent');

const CTX = { userId: 'u1', patientId: 'p1' };

beforeEach(() => jest.clearAllMocks());

function mockClaude(responses) {
  let call = 0;
  Anthropic.mockImplementation(() => ({
    messages: {
      create: jest.fn().mockImplementation(() => Promise.resolve(responses[call++])),
    },
  }));
}

test('returns plain text reply when no tools called', async () => {
  mockClaude([{ content: [{ type: 'text', text: 'أهلاً!' }], stop_reason: 'end_turn' }]);
  const { reply } = await runAgent('مرحبا', [], CTX);
  expect(reply).toBe('أهلاً!');
});

test('executes tool and returns final reply', async () => {
  mockClaude([
    {
      content: [{ type: 'tool_use', id: 't1', name: 'find_doctors', input: { specialty: 'cardiology' } }],
      stop_reason: 'tool_use',
    },
    {
      content: [{ type: 'text', text: 'وجدت طبيبين.' }],
      stop_reason: 'end_turn',
    },
  ]);
  executeTool.mockResolvedValue({ doctors: [{ doctorId: 'd1', name: 'Dr. Ali' }] });

  const { reply } = await runAgent('أريد طبيب قلب', [], CTX);
  expect(executeTool).toHaveBeenCalledWith('find_doctors', { specialty: 'cardiology' }, CTX);
  expect(reply).toBe('وجدت طبيبين.');
});

test('caps history at 20 messages to avoid token bloat', async () => {
  mockClaude([{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }]);
  const longHistory = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `message ${i}`,
  }));
  await runAgent('hello', longHistory, CTX);
  const createCall = Anthropic.mock.results[0].value.messages.create.mock.calls[0][0];
  expect(createCall.messages.length).toBeLessThanOrEqual(21); // 20 history + 1 new
});
