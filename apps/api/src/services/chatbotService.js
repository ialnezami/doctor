'use strict';

const { getProvider } = require('./aiProviders');
const Anthropic = require('@anthropic-ai/sdk');

let _anthropicClient = null;
function getAnthropicClient() {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropicClient;
}
const { TOOL_DEFINITIONS, executeTool } = require('../utils/chatbotTools');
const { parseTriage } = require('../utils/triageParser');

const TOOL_MODEL      = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
const TOOL_MAX_ROUNDS = 3;
const TOOL_TIMEOUT_MS = 60000; // 60s — longer than text-only (tool rounds add latency)

// Medical triage system prompt — instructs the AI on role, safety rules, and output format.
// The <triage> block is the structured output contract; triageParser.js extracts it.
const TRIAGE_SYSTEM_PROMPT = `You are a medical triage assistant for Salamtak. Your role is to help patients understand their symptoms and connect them with the right doctor.

STRICT RULES:
1. You provide general health information ONLY — never diagnoses, never medication recommendations.
2. Always include this disclaimer at the end of your first response: "This is general health information only, not medical advice. Please consult a qualified healthcare provider."
3. If the patient describes ANY of these — chest pain, difficulty breathing, severe bleeding, loss of consciousness, stroke signs, anaphylaxis, severe burns — respond IMMEDIATELY with urgency=emergency and instruct them to call emergency services NOW. Do not continue the conversation.
4. Never roleplay as a doctor or claim to examine the patient.
5. Do not ask for or repeat personally identifiable information.

INTAKE PROTOCOL:
Before generating the triage block, ask the patient 2–3 targeted questions to understand their situation. Cover:
- Main symptom and its location/quality (e.g. sharp, dull, burning)
- Duration and whether it is getting better, worse, or staying the same
- Severity on a scale of 1–10, and any associated symptoms

Ask one question at a time conversationally. Once you have gathered enough information (or the patient explicitly asks for a referral), produce the triage block.

RESPONSE FORMAT:
After gathering sufficient information, output a structured JSON block enclosed in <triage> tags:
<triage>
{
  "urgency": "routine" | "soon" | "urgent" | "emergency",
  "specialties": ["string"],
  "summary": "one sentence for display in the UI",
  "chief_complaint": "2–3 sentence clinical summary for the doctor written in third person. Include: main symptom, duration, severity, quality, and any relevant associated symptoms the patient described.",
  "ready_for_referral": true | false
}
</triage>

Urgency definitions:
- routine: can wait days/weeks, no acute distress
- soon: should see doctor within 1–3 days
- urgent: needs same-day or next-day care
- emergency: call emergency services immediately

Only output the <triage> block when you have gathered enough clinical detail to write a useful chief_complaint, or when the patient explicitly asks for doctor recommendations.`;

/**
 * Streams an AI response over SSE and returns the full accumulated text.
 *
 * STREAM LIFECYCLE CONTRACT:
 * - This function sets SSE headers and writes delta/error events.
 * - It does NOT finalize the stream (no done event, no stream close).
 * - The CALLER (route handler) owns stream finalization and the done event.
 * - This allows the route to append triage + doctors to the done event AFTER the stream completes.
 *
 * Active provider is selected via AI_PROVIDER env var (default: 'anthropic').
 * Provider API key env vars: ANTHROPIC_API_KEY | OPENAI_API_KEY | GEMINI_API_KEY.
 *
 * Returns:
 * - The accumulated response text string on success.
 * - null if the active provider is not configured (a 503 JSON response is sent — no SSE headers set).
 * - Re-throws on error after writing an SSE error event (caller handles close).
 *
 * @param {import('express').Response} res
 * @param {Array<{role:string,content:string}>} history - conversation history including current user message
 * @param {string} systemPrompt
 * @param {{ requestId: string, userId: string }} meta - for structured (non-PHI) logging
 * @returns {Promise<string|null>}
 */
async function streamChatResponse(res, history, systemPrompt, { requestId, userId } = {}) {
  const provider = getProvider();

  // Guard: graceful degradation if the active provider's API key is not configured
  if (!provider.isConfigured()) {
    res.status(503).json({ message: 'AI service unavailable' });
    return null;
  }

  // Set SSE headers BEFORE any async work — once headers are sent the response is streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: disable proxy buffering for SSE

  // AbortController limits AI API calls to 25 seconds.
  // Without this, a slow/hung API call leaves the SSE connection open indefinitely.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let accumulatedText = '';
  const startedAt = Date.now();

  try {
    for await (const chunk of provider.streamChat({ history, systemPrompt, signal: controller.signal })) {
      accumulatedText += chunk;
      res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
    }

    // Log non-PHI metrics — never log history or accumulated text content
    console.log(
      `[chatbot] provider=${provider.name} requestId=${requestId} userId=${userId} ` +
      `durationMs=${Date.now() - startedAt} tokens_approx=${Math.ceil(accumulatedText.length / 4)}`
    );

    return accumulatedText;
  } catch (err) {
    // Distinguish abort (timeout) from other errors for client messaging
    if (err.name === 'AbortError' || err.name === 'APIUserAbortError') {
      console.error(`[chatbot] provider=${provider.name} requestId=${requestId} userId=${userId} error=timeout durationMs=${Date.now() - startedAt}`);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Response timed out — please try again.' })}\n\n`);
    } else {
      console.error(`[chatbot] provider=${provider.name} requestId=${requestId} userId=${userId} error=${err.name}: ${String(err.message).slice(0, 200)} durationMs=${Date.now() - startedAt}`);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service temporarily unavailable' })}\n\n`);
    }
    // Re-throw so the route handler can close the stream and log the failure
    throw err;
  } finally {
    // Only clear the timeout — stream finalization is the route's responsibility.
    clearTimeout(timeoutId);
  }
}

/**
 * Streams an AI response with Anthropic tool use (doctor search, availability, booking).
 *
 * STREAM LIFECYCLE CONTRACT: Same as streamChatResponse.
 * - Sets SSE headers and writes delta / tool_call / tool_result / error events.
 * - Does NOT finalize the stream (no done event, no stream close) — caller owns that.
 * - Returns accumulated text string, or null if not configured (503 sent, no SSE headers).
 * - Re-throws on error after writing SSE error event.
 *
 * Emergency guard: after each streaming round, if accumulated text contains an emergency
 * triage block, tool execution for that round is skipped and the loop terminates.
 *
 * @param {import('express').Response} res
 * @param {Array<{role:string,content:string|Array}>} history
 * @param {string} systemPrompt
 * @param {{ userId: string, lat: number, lng: number, requestId: string }} toolContext
 * @param {{ requestId: string, userId: string }} meta
 * @returns {Promise<string|null>}
 */
async function streamChatWithTools(res, history, systemPrompt, toolContext, { requestId, userId } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ message: 'AI service unavailable' });
    return null;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  const client     = getAnthropicClient();

  let messages        = [...history];
  let accumulatedText = '';
  let toolRounds      = 0;
  const startedAt     = Date.now();

  try {
    while (true) {
      const includeTools = toolRounds < TOOL_MAX_ROUNDS;

      const stream = client.messages.stream(
        {
          model: TOOL_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          ...(includeTools ? { tools: TOOL_DEFINITIONS } : {}),
        },
        { signal: controller.signal }
      );

      // Accumulate content blocks for this round to build the next assistant message
      const assistantBlocks  = [];
      const pendingTools      = []; // { id, name, input }
      let   currentBlockIndex = -1;
      let   currentBlockType  = null;
      let   toolInputBuffer   = '';
      let   stopReason        = 'end_turn';

      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start':
            currentBlockIndex = event.index;
            currentBlockType  = event.content_block.type;
            if (currentBlockType === 'text') {
              assistantBlocks[event.index] = { type: 'text', text: '' };
            } else if (currentBlockType === 'tool_use') {
              assistantBlocks[event.index] = {
                type:  'tool_use',
                id:    event.content_block.id,
                name:  event.content_block.name,
                input: {},
              };
              toolInputBuffer = '';
            }
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              const text = event.delta.text;
              accumulatedText += text;
              if (assistantBlocks[event.index]) assistantBlocks[event.index].text += text;
              res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
            } else if (event.delta.type === 'input_json_delta') {
              toolInputBuffer += event.delta.partial_json;
            }
            break;

          case 'content_block_stop':
            if (currentBlockType === 'tool_use') {
              let parsedInput = {};
              try { parsedInput = JSON.parse(toolInputBuffer); } catch (_) { /* malformed JSON — use empty input */ }
              assistantBlocks[currentBlockIndex].input = parsedInput;
              pendingTools.push({
                id:    assistantBlocks[currentBlockIndex].id,
                name:  assistantBlocks[currentBlockIndex].name,
                input: parsedInput,
              });
              toolInputBuffer = '';
            }
            break;

          case 'message_delta':
            stopReason = event.delta.stop_reason || 'end_turn';
            break;
        }
      }

      // No tool calls — conversation turn is complete
      if (pendingTools.length === 0 || stopReason !== 'tool_use') break;

      // Emergency guard — never execute tools if emergency triage detected
      const triage = parseTriage(accumulatedText);
      if (triage?.urgency === 'emergency') break;

      toolRounds++;

      // Execute tools and emit SSE events
      const toolResults = [];
      for (const tool of pendingTools) {
        res.write(`data: ${JSON.stringify({ type: 'tool_call', name: tool.name })}\n\n`);

        const result = await executeTool(tool.name, tool.input, toolContext);

        res.write(`data: ${JSON.stringify({ type: 'tool_result', name: tool.name, data: result })}\n\n`);

        toolResults.push({
          type:        'tool_result',
          tool_use_id: tool.id,
          content:     typeof result === 'object' ? JSON.stringify(result) : String(result),
        });
      }

      // Build next message round — include tool results as user message
      messages = [
        ...messages,
        { role: 'assistant', content: assistantBlocks.filter(Boolean) },
        { role: 'user',      content: toolResults },
      ];

      if (toolRounds >= TOOL_MAX_ROUNDS) break;
    }

    console.log(
      `[chatbot:tools] requestId=${requestId} userId=${userId} toolRounds=${toolRounds} ` +
      `durationMs=${Date.now() - startedAt} tokens_approx=${Math.ceil(accumulatedText.length / 4)}`
    );

    return accumulatedText;
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'APIUserAbortError') {
      console.error(`[chatbot:tools] requestId=${requestId} userId=${userId} error=timeout durationMs=${Date.now() - startedAt}`);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Response timed out — please try again.' })}\n\n`);
    } else {
      console.error(`[chatbot:tools] requestId=${requestId} userId=${userId} error=${err.name}: ${String(err.message).slice(0, 200)} durationMs=${Date.now() - startedAt}`);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service temporarily unavailable' })}\n\n`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { streamChatResponse, streamChatWithTools, TRIAGE_SYSTEM_PROMPT };
