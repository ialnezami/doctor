'use strict';

const { executeTool } = require('./whatsappBookingTools');

const SYSTEM_PROMPT = `You are Salamtak's WhatsApp booking assistant. You help patients find doctors, book appointments, view upcoming appointments, and cancel appointments.

Rules:
- Respond in the same language the user writes in (Arabic or English).
- If you do not know the patient's name, call save_patient_name as soon as they tell you.
- Never invent doctor names, specialties, or time slots. Only use data returned by tools.
- Always show booking details and ask for explicit confirmation before calling book_appointment.
- Always ask for explicit confirmation before calling cancel_appointment.
- Keep messages short and clear — this is WhatsApp, not a web form. Max 3 sentences per reply.
- If the user asks for something outside appointment booking, politely decline.`;

const TOOL_DEFINITIONS = [
  {
    name: 'find_doctors',
    description: 'Search for doctors by medical specialty or name. Call when the user mentions a specialty or doctor name.',
    input_schema: {
      type: 'object',
      properties: {
        specialty: { type: 'string', description: 'Medical specialty in Arabic or English e.g. cardiology, قلبية' },
        name:      { type: 'string', description: 'Doctor name, optional' },
        city:      { type: 'string', description: 'City filter, optional' },
      },
    },
  },
  {
    name: 'get_available_slots',
    description: 'Get free appointment slots for a specific doctor and location over the next N days.',
    input_schema: {
      type: 'object',
      required: ['doctorId', 'locationId'],
      properties: {
        doctorId:   { type: 'string' },
        locationId: { type: 'string' },
        daysAhead:  { type: 'number' },
      },
    },
  },
  {
    name: 'book_appointment',
    description: 'Book an appointment after the user has explicitly confirmed the doctor, date, and time.',
    input_schema: {
      type: 'object',
      required: ['doctorId', 'locationId', 'date', 'timeSlot'],
      properties: {
        doctorId:   { type: 'string' },
        locationId: { type: 'string' },
        date:       { type: 'string', description: 'ISO date e.g. 2026-08-20' },
        timeSlot:   { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
        visitType:  { type: 'string' },
        reason:     { type: 'string' },
      },
    },
  },
  {
    name: 'list_my_appointments',
    description: "List the patient's upcoming confirmed or pending appointments.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancel a specific appointment. Only call after user confirms cancellation.',
    input_schema: {
      type: 'object',
      required: ['appointmentId'],
      properties: { appointmentId: { type: 'string' } },
    },
  },
  {
    name: 'save_patient_name',
    description: "Persist the patient's name immediately when they provide it.",
    input_schema: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
  },
];

const MAX_HISTORY = 20;
const MAX_TOOL_LOOPS = 5;

/**
 * Run one conversational turn through the Claude agent.
 * @param {string} message   - The user's incoming WhatsApp message
 * @param {Array}  history   - Previous [{role, content}] for this session (max MAX_HISTORY)
 * @param {object} ctx       - { userId, patientId }
 * @returns {{ reply: string, history: Array }}
 */
async function runAgent(message, history, ctx) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const trimmedHistory = history.slice(-MAX_HISTORY);
  const messages = [...trimmedHistory, { role: 'user', content: message }];

  let loops = 0;
  let finalReply = 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.';

  while (loops < MAX_TOOL_LOOPS) {
    loops++;
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      tools:      TOOL_DEFINITIONS,
      messages:   [...messages],
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      finalReply = textBlock?.text ?? finalReply;
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await executeTool(block.name, block.input, ctx);
        toolResults.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     JSON.stringify(result),
        });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    break;
  }

  return { reply: finalReply, history: messages };
}

module.exports = { runAgent };
