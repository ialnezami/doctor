'use strict';

// Helper to collect SSE events from a mock response
function mockRes() {
  const events = [];
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
    write: jest.fn((data) => {
      if (data.startsWith('data: ') && !data.includes('[DONE]')) {
        try {
          events.push(JSON.parse(data.replace(/^data: /, '').trim()));
        } catch (_) {}
      }
    }),
    end: jest.fn(),
    _events: events,
  };
}

// Build a minimal Anthropic streaming event sequence
function makeStreamEvents(blocks) {
  const events = [];
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text' } });
      for (const chunk of block.chunks) {
        events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: chunk } });
      }
      events.push({ type: 'content_block_stop', index });
    } else if (block.type === 'tool_use') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
      events.push({ type: 'content_block_stop', index });
    }
  });
  events.push({ type: 'message_delta', delta: { stop_reason: blocks.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn' } });
  return events;
}

function makeAsyncIterable(events) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const e of events) yield e;
    },
  };
}

describe('streamChatWithTools', () => {
  let streamChatWithTools;
  let mockStream;
  let executeTool;

  beforeEach(() => {
    jest.resetModules();

    executeTool = jest.fn().mockResolvedValue({ doctors: [] });

    jest.mock('../../utils/chatbotTools', () => ({
      TOOL_DEFINITIONS: [{ name: 'search_doctors' }],
      executeTool,
    }));

    jest.mock('../../utils/triageParser', () => ({
      parseTriage: jest.fn(() => null),
    }));

    mockStream = null;

    jest.mock('@anthropic-ai/sdk', () => {
      return jest.fn().mockImplementation(() => ({
        messages: {
          stream: jest.fn((...args) => mockStream),
        },
      }));
    });

    process.env.ANTHROPIC_API_KEY = 'test-key';

    const mod = require('../../services/chatbotService');
    streamChatWithTools = mod.streamChatWithTools;
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns null and sends 503 when ANTHROPIC_API_KEY not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = mockRes();
    const result = await streamChatWithTools(res, [], 'sys', { userId: 'u1', lat: 0, lng: 0, requestId: 'r1' });
    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ message: 'AI service unavailable' });
  });

  it('sets SSE headers and returns accumulated text for text-only response', async () => {
    const events = makeStreamEvents([{ type: 'text', chunks: ['Hello ', 'world'] }]);
    mockStream = makeAsyncIterable(events);
    const res = mockRes();

    const result = await streamChatWithTools(
      res, [{ role: 'user', content: 'hi' }], 'sys',
      { userId: 'u1', lat: 24.7, lng: 46.7, requestId: 'r1' },
      { requestId: 'r1', userId: 'u1' }
    );

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(result).toBe('Hello world');
    const deltaEvents = res._events.filter(e => e.type === 'delta');
    expect(deltaEvents).toHaveLength(2);
    expect(deltaEvents[0].text).toBe('Hello ');
    expect(deltaEvents[1].text).toBe('world');
  });

  it('emits tool_call and tool_result events when Claude calls a tool', async () => {
    let callCount = 0;
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        stream: jest.fn(() => {
          callCount++;
          if (callCount === 1) {
            // First round: tool_use
            return makeAsyncIterable(makeStreamEvents([
              { type: 'tool_use', id: 'tu_1', name: 'search_doctors', input: { lat: 24.7, lng: 46.7 } },
            ]));
          }
          // Second round: text response
          return makeAsyncIterable(makeStreamEvents([{ type: 'text', chunks: ['I found some doctors.'] }]));
        }),
      },
    }));

    jest.resetModules();
    jest.mock('../../utils/chatbotTools', () => ({
      TOOL_DEFINITIONS: [{ name: 'search_doctors' }],
      executeTool: jest.fn().mockResolvedValue({ doctors: [{ _id: 'doc1' }] }),
    }));
    jest.mock('../../utils/triageParser', () => ({ parseTriage: jest.fn(() => null) }));

    const mod = require('../../services/chatbotService');
    const res = mockRes();

    const result = await mod.streamChatWithTools(
      res, [], 'sys',
      { userId: 'u1', lat: 24.7, lng: 46.7, requestId: 'r1' },
      { requestId: 'r1', userId: 'u1' }
    );

    const toolCallEvents   = res._events.filter(e => e.type === 'tool_call');
    const toolResultEvents = res._events.filter(e => e.type === 'tool_result');
    expect(toolCallEvents).toHaveLength(1);
    expect(toolCallEvents[0].name).toBe('search_doctors');
    expect(toolResultEvents).toHaveLength(1);
    expect(result).toBe('I found some doctors.');
  });

  it('stops tool loop when emergency triage detected in accumulated text', async () => {
    let callCount = 0;
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        stream: jest.fn(() => {
          callCount++;
          return makeAsyncIterable(makeStreamEvents([
            { type: 'text', chunks: ['<triage>{"urgency":"emergency","specialties":[],"summary":"emergency","ready_for_referral":false}</triage>'] },
            { type: 'tool_use', id: 'tu_1', name: 'search_doctors', input: { lat: 24.7, lng: 46.7 } },
          ]));
        }),
      },
    }));

    const mockExecuteTool = jest.fn().mockResolvedValue({ doctors: [] });
    jest.resetModules();
    jest.mock('../../utils/chatbotTools', () => ({
      TOOL_DEFINITIONS: [{ name: 'search_doctors' }],
      executeTool: mockExecuteTool,
    }));
    jest.mock('../../utils/triageParser', () => ({
      parseTriage: jest.fn((text) =>
        text.includes('"emergency"') ? { urgency: 'emergency' } : null
      ),
    }));

    const mod = require('../../services/chatbotService');
    const res = mockRes();

    await mod.streamChatWithTools(
      res, [], 'sys',
      { userId: 'u1', lat: 24.7, lng: 46.7, requestId: 'r1' },
      { requestId: 'r1', userId: 'u1' }
    );

    // Tools should not be executed when emergency triage is detected
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('writes SSE error event and re-throws on stream error', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    const err = new Error('network failure');
    Anthropic.mockImplementation(() => ({
      messages: {
        stream: jest.fn(() => {
          throw err;
        }),
      },
    }));

    jest.resetModules();
    jest.mock('../../utils/chatbotTools', () => ({ TOOL_DEFINITIONS: [], executeTool: jest.fn() }));
    jest.mock('../../utils/triageParser', () => ({ parseTriage: jest.fn(() => null) }));

    const mod = require('../../services/chatbotService');
    const res = mockRes();

    await expect(
      mod.streamChatWithTools(res, [], 'sys', { userId: 'u1', lat: 0, lng: 0, requestId: 'r1' })
    ).rejects.toThrow('network failure');

    const errorEvents = res._events.filter(e => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
  });
});
