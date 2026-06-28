'use strict';

const { Worker }    = require('bullmq');
const Appointment   = require('../models/Appointment');
const { getConnection } = require('../queues/reminderQueue');

const SYSTEM_PROMPT = `You are a medical triage assistant. Extract two things from the patient's symptom description and return ONLY valid JSON — no other text, no markdown.
Schema: { "urgency": "low" | "medium" | "high", "category": "<one short phrase>" }
Rules:
- urgency=high only for: chest pain, difficulty breathing, severe bleeding, loss of consciousness, or stroke signs.
- urgency=medium for moderate pain, fever >39°C, persistent vomiting, or worsening chronic symptoms.
- urgency=low for everything else.
- category: one short phrase, e.g. "respiratory", "joint pain", "skin rash", "digestive".
- Never diagnose. Never suggest medications.`;

async function processSymptomJob(job) {
  const { appointmentId } = job.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[symptom] ANTHROPIC_API_KEY not set — skipping');
    return;
  }

  const appt = await Appointment.findById(appointmentId);
  if (!appt || !appt.symptomText) return;

  let urgency = null;
  let category = null;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: appt.symptomText }],
    });
    const parsed = JSON.parse(response.content[0].text);
    if (['low', 'medium', 'high'].includes(parsed.urgency)) urgency = parsed.urgency;
    if (typeof parsed.category === 'string') category = parsed.category.slice(0, 100);
  } catch (err) {
    console.error('[symptom] analysis failed:', err.message);
  }

  appt.symptomAnalysis = { urgency, category, processedAt: new Date() };
  await appt.save();
}

function startSymptomWorker() {
  const worker = new Worker('symptom-analysis', processSymptomJob, { connection: getConnection() });
  worker.on('failed', (job, err) =>
    console.error('[symptom] job failed:', job?.id, err.message)
  );
  console.log('[symptom] worker started');
  return worker;
}

module.exports = { startSymptomWorker, processSymptomJob };
