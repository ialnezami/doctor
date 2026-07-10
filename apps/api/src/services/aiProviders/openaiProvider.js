'use strict';

const OpenAI = require('openai');

const DEFAULT_MODEL = 'gpt-4o-mini';

function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Yields text chunks from OpenAI's streaming chat completions API.
 * System prompt is prepended as a system message in the messages array.
 * @param {{ history: Array<{role:string,content:string}>, systemPrompt: string, signal: AbortSignal }} opts
 * @yields {string}
 */
async function* streamChat({ history, systemPrompt, signal }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.AI_MODEL || DEFAULT_MODEL;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  const stream = await client.chat.completions.create(
    { model, messages, stream: true, max_tokens: 1024 },
    { signal }
  );

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

module.exports = { name: 'openai', isConfigured, streamChat };
