'use strict';

const { Worker }        = require('bullmq');
const LabResult         = require('../models/LabResult');
const { getConnection } = require('../queues/reminderQueue');

const SYSTEM_PROMPT = `You are a medical communication specialist. A patient needs to understand their lab results in plain, non-technical language. Return ONLY valid JSON — no other text, no markdown.
Schema: { "summary": string }
Rules:
- summary: 2-4 sentences. Simple words. Explain what flagged values mean.
- For 'critical' flags: mention the patient should contact their doctor promptly.
- For 'high'/'low' flags: note the deviation calmly and non-alarmingly.
- All 'normal': briefly reassure.
- Never diagnose. Never recommend treatment. Always end with "consult your doctor".`;

async function processLabJob(job) {
  const { labResultId } = job.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[lab] ANTHROPIC_API_KEY not set — skipping');
    return;
  }

  // Fetch LabResult — may not exist if deleted between enqueue and processing
  const labResult = await LabResult.findById(labResultId);
  if (!labResult) {
    console.warn('[lab] LabResult not found:', labResultId);
    return;
  }

  const testsText = labResult.tests.map(t =>
    `${t.name}: ${t.value} ${t.unit} (ref: ${t.referenceRange || 'N/A'}) — ${t.flag}`
  ).join('\n');

  // Require Anthropic inside the function so the module can be loaded without
  // the SDK present (e.g. in test environments that mock it at the module level).
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: `Lab: ${labResult.labName}\nTests:\n${testsText}` }],
  });

  const rawText = response.content[0].text;

  // Silent degradation — malformed JSON is logged but does not fail the job;
  // the field is saved as null so the UI can detect "not yet available".
  let summary = null;
  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed.summary === 'string') {
      summary = parsed.summary.trim() || null;
    }
  } catch (err) {
    console.error('[lab] JSON parse error:', err.message, '| raw:', rawText.slice(0, 200));
  }

  labResult.aiInterpretation = { summary, processedAt: new Date() };
  await labResult.save();
}

function startLabWorker() {
  const worker = new Worker('lab-interpretation', processLabJob, { connection: getConnection() });
  worker.on('failed', (job, err) =>
    console.error('[lab] job failed:', job?.id, err.message)
  );
  console.log('[lab] worker started');
  return worker;
}

module.exports = { startLabWorker, processLabJob };
