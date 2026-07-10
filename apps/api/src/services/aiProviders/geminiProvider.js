'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const DEFAULT_MODEL = 'gemini-1.5-flash';

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Converts OpenAI-style history to Gemini's {role, parts} format.
 * Gemini uses 'model' instead of 'assistant'.
 */
function toGeminiHistory(history) {
  return history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
}

/**
 * Yields text chunks from Google Gemini's streaming API.
 * System prompt is passed via systemInstruction (Gemini 1.5+).
 * @param {{ history: Array<{role:string,content:string}>, systemPrompt: string, signal: AbortSignal }} opts
 * @yields {string}
 */
async function* streamChat({ history, systemPrompt, signal }) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = process.env.AI_MODEL || DEFAULT_MODEL;

  const geminiModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
  });

  // Split last user message from history for Gemini's sendMessageStream API
  const geminiHistory = toGeminiHistory(history.slice(0, -1));
  const lastMessage = history[history.length - 1]?.content ?? '';

  const chat = geminiModel.startChat({ history: geminiHistory });
  const result = await chat.sendMessageStream(lastMessage);

  for await (const chunk of result.stream) {
    if (signal?.aborted) break;
    const text = chunk.text();
    if (text) yield text;
  }
}

module.exports = { name: 'gemini', isConfigured, streamChat };
