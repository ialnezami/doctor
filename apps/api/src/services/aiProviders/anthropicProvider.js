'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Yields text chunks from Anthropic's streaming API.
 * @param {{ history: Array<{role:string,content:string}>, systemPrompt: string, signal: AbortSignal }} opts
 * @yields {string}
 */
async function* streamChat({ history, systemPrompt, signal }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.AI_MODEL || DEFAULT_MODEL;

  const stream = client.messages.stream(
    { model, max_tokens: 1024, system: systemPrompt, messages: history },
    { signal }
  );

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

module.exports = { name: 'anthropic', isConfigured, streamChat };
