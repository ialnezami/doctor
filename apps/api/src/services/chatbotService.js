'use strict';

const Anthropic = require('@anthropic-ai/sdk');

// Medical triage system prompt — instructs Claude on role, safety rules, and output format.
// The <triage> block is the structured output contract; triageParser.js extracts it.
const TRIAGE_SYSTEM_PROMPT = `You are a medical triage assistant for MediConnect. Your role is to help patients understand their symptoms and find appropriate medical care.

STRICT RULES:
1. You provide general health information ONLY — never diagnoses, never medication recommendations.
2. Always include this disclaimer at the end of your first response: "This is general health information only, not medical advice. Please consult a qualified healthcare provider."
3. If the patient describes ANY of these — chest pain, difficulty breathing, severe bleeding, loss of consciousness, stroke signs, anaphylaxis, severe burns — respond IMMEDIATELY with: urgency=emergency and instruct them to call emergency services NOW. Do not continue the conversation.
4. Never roleplay as a doctor or claim to examine the patient.
5. Do not ask for or repeat personally identifiable information.

RESPONSE FORMAT:
Respond naturally in conversational prose. After gathering sufficient symptom information, output a structured JSON block enclosed in <triage> tags:
<triage>
{
  "urgency": "routine" | "soon" | "urgent" | "emergency",
  "specialties": ["string"],
  "summary": "one sentence for display",
  "ready_for_referral": true | false
}
</triage>

Urgency definitions:
- routine: can wait days/weeks, no acute distress
- soon: should see doctor within 1-3 days
- urgent: needs same-day or next-day care
- emergency: call emergency services immediately

Only output the <triage> block when you have enough information to make a reasonable assessment, or when the patient explicitly asks for doctor recommendations.`;

/**
 * Streams a Claude response over SSE and returns the full accumulated text.
 *
 * STREAM LIFECYCLE CONTRACT:
 * - This function sets SSE headers and writes delta/error events.
 * - It does NOT finalize the stream (no done event, no stream close).
 * - The CALLER (route handler) owns stream finalization and the done event.
 * - This allows the route to append triage + doctors to the done event AFTER the stream completes.
 *
 * Returns:
 * - The accumulated response text string on success.
 * - null if ANTHROPIC_API_KEY is missing (a 503 JSON response is sent instead — no SSE headers set).
 * - Re-throws on error after writing an SSE error event (caller handles close).
 *
 * @param {import('express').Response} res
 * @param {Array<{role:string,content:string}>} history - conversation history including current user message
 * @param {string} systemPrompt
 * @param {{ requestId: string, userId: string }} meta - for structured (non-PHI) logging
 * @returns {Promise<string|null>}
 */
async function streamChatResponse(res, history, systemPrompt, { requestId, userId } = {}) {
  // Guard: graceful degradation if API key is not configured
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ message: 'AI service unavailable' });
    return null;
  }

  // Set SSE headers BEFORE any async work — once headers are sent the response is streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: disable proxy buffering for SSE

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // AbortController limits Anthropic API calls to 25 seconds.
  // Pitfall 2: without this, a slow/hung API call leaves the SSE connection open indefinitely.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let accumulatedText = '';
  const startedAt = Date.now();

  try {
    const stream = client.messages.stream(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: history,
      },
      { signal: controller.signal }
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        accumulatedText += event.delta.text;
        res.write(`data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`);
      }
    }

    // Log non-PHI metrics — never log history or accumulated text content
    console.log(
      `[chatbot] requestId=${requestId} userId=${userId} durationMs=${Date.now() - startedAt} ` +
      `tokens_approx=${Math.ceil(accumulatedText.length / 4)}`
    );

    return accumulatedText;
  } catch (err) {
    // Distinguish abort (timeout) from other errors for client messaging
    if (err.name === 'AbortError' || err.name === 'APIUserAbortError') {
      console.error(`[chatbot] requestId=${requestId} userId=${userId} error=timeout durationMs=${Date.now() - startedAt}`);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Response timed out — please try again.' })}\n\n`);
    } else {
      console.error(`[chatbot] requestId=${requestId} userId=${userId} error=${err.name}: ${String(err.message).slice(0, 200)} durationMs=${Date.now() - startedAt}`);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service temporarily unavailable' })}\n\n`);
    }
    // Re-throw so the route handler can close the stream and log the failure
    throw err;
  } finally {
    // Only clear the timeout — stream finalization is the route's responsibility.
    // The route handler owns the stream lifecycle after this function returns/throws.
    clearTimeout(timeoutId);
  }
}

module.exports = { streamChatResponse, TRIAGE_SYSTEM_PROMPT };
