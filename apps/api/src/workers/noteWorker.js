'use strict';

const { Worker }        = require('bullmq');
const ConsultationNote  = require('../models/ConsultationNote');
const { getConnection } = require('../queues/reminderQueue');

const SYSTEM_PROMPT = `You are a clinical documentation assistant. Analyze this doctor's consultation note and return ONLY valid JSON — no other text, no markdown.
Schema: { "icdCodes": [{"code": string, "description": string}], "patientSummary": string, "flags": [string] }
Rules:
- icdCodes: up to 5 ICD-10 codes suggested by the note. Empty array if none clear.
- patientSummary: rewrite the note in plain language a patient can understand. Max 300 chars.
- flags: missing info like "Missing: follow-up date", "Missing: medication dosage". Max 3. Empty array if complete.
- Never diagnose. Never prescribe.`;

async function processNoteJob(job) {
  const { noteId } = job.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[note] ANTHROPIC_API_KEY not set — skipping');
    return;
  }

  const note = await ConsultationNote.findById(noteId);
  if (!note) return;

  let icdCodes       = [];
  let patientSummary = null;
  let flags          = [];

  // Lazy-require so the module loads without crashing when SDK is absent
  const Anthropic = require('@anthropic-ai/sdk');
  const client    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Errors propagate — BullMQ will retry with backoff
  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: [
      {
        type:          'text',
        text:          SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: note.content }],
  }, {
    headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
  });

  const rawText = response.content[0].text;

  // Silent degradation on malformed output — keep empty defaults
  try {
    const parsed = JSON.parse(rawText);

    if (Array.isArray(parsed.icdCodes)) {
      icdCodes = parsed.icdCodes
        .filter(e => typeof e.code === 'string' && typeof e.description === 'string')
        .slice(0, 5)
        .map(e => ({ code: e.code.slice(0, 20), description: e.description.slice(0, 200) }));
    }

    if (typeof parsed.patientSummary === 'string') {
      patientSummary = parsed.patientSummary.slice(0, 300);
    }

    if (Array.isArray(parsed.flags)) {
      flags = parsed.flags
        .filter(f => typeof f === 'string')
        .slice(0, 3)
        .map(f => f.slice(0, 200));
    }
  } catch (err) {
    console.error('[note] JSON parse error:', err.message, '— raw:', rawText?.slice(0, 200));
    // icdCodes/patientSummary/flags remain at safe defaults — processedAt still set
  }

  note.aiAssist = { icdCodes, patientSummary, flags, processedAt: new Date() };
  await note.save();
}

function startNoteWorker() {
  const worker = new Worker('note-analysis', processNoteJob, { connection: getConnection() });
  worker.on('failed', (job, err) =>
    console.error('[note] job failed:', job?.id, err.message)
  );
  console.log('[note] worker started');
  return worker;
}

module.exports = { startNoteWorker, processNoteJob };
