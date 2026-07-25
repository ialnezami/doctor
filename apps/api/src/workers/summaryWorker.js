'use strict';

const { Worker }        = require('bullmq');
const Anthropic         = require('@anthropic-ai/sdk');
const Appointment       = require('../models/Appointment');
const ConsultationNote  = require('../models/ConsultationNote');
const Prescription      = require('../models/Prescription');
const LabResult         = require('../models/LabResult');
const Patient           = require('../models/Patient');
const User              = require('../models/User');
const { getConnection } = require('../queues/reminderQueue');

const SYSTEM_PROMPT = `You are a clinical documentation assistant. After a completed appointment, summarize the patient's current health situation for the medical record.

Return ONLY valid JSON — no other text, no markdown.
Schema: { "summary": string, "keyPoints": [string] }

Rules:
- summary: 2–3 sentence plain-language overview of the patient's current situation (diagnosis, treatment, outlook). Max 500 chars.
- keyPoints: 3–6 bullet strings covering: main diagnosis/condition, current medications, notable lab findings, follow-up instructions, and any red flags. Each ≤ 120 chars.
- Never invent information not present in the input.
- Never diagnose beyond what the doctor has documented.
- Write as a clinical summary for the next treating doctor to read.`;

async function processSummaryJob(job) {
  const { appointmentId } = job.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[summary] ANTHROPIC_API_KEY not set — skipping');
    return;
  }

  const appt = await Appointment.findById(appointmentId);
  if (!appt) return;

  // Idempotency: skip if summary already generated for this appointment
  const patient = await Patient.findOne({ userId: appt.patientId });
  if (!patient) return;
  const alreadyDone = patient.healthSummaries.some(
    s => s.appointmentId?.toString() === appointmentId
  );
  if (alreadyDone) return;

  const [doctor, notes, prescriptions, labResults] = await Promise.all([
    User.findById(appt.doctorId).select('name'),
    ConsultationNote.find({ appointmentId: appt._id }).sort({ createdAt: 1 }).limit(10),
    Prescription.find({ patientId: appt.patientId }).sort({ createdAt: -1 }).limit(5),
    LabResult.find({ patientId: appt.patientId }).sort({ issuedAt: -1 }).limit(5),
  ]);

  // Build context for the AI
  const sections = [];

  sections.push(`APPOINTMENT
Date: ${new Date(appt.date).toLocaleDateString()}
Type: ${appt.visitType || 'consultation'}
Reason: ${appt.reason || 'not specified'}
Doctor: ${doctor?.name || 'unknown'}`);

  if (notes.length > 0) {
    const noteLines = notes
      .filter(n => n.content)
      .map(n => `[${n.visibility}] ${n.content}`)
      .join('\n');
    sections.push(`CONSULTATION NOTES\n${noteLines}`);
  }

  if (prescriptions.length > 0) {
    const rxLines = prescriptions.map(rx => {
      const meds = (rx.medications || []).map(m =>
        `${m.name} ${m.dosage} — ${m.frequency} for ${m.duration}`
      ).join(', ');
      return `${new Date(rx.createdAt).toLocaleDateString()}: ${meds}${rx.instructions ? ` | Notes: ${rx.instructions}` : ''}`;
    }).join('\n');
    sections.push(`RECENT PRESCRIPTIONS\n${rxLines}`);
  }

  if (labResults.length > 0) {
    const labLines = labResults.map(lr => {
      const flags = (lr.tests || []).filter(t => t.flag === 'abnormal').map(t => `${t.name}: ${t.value} ${t.unit}`).join(', ');
      return `${lr.labName} (${new Date(lr.issuedAt || lr.createdAt).toLocaleDateString()})${flags ? ` — ABNORMAL: ${flags}` : ' — all normal'}`;
    }).join('\n');
    sections.push(`RECENT LAB RESULTS\n${labLines}`);
  }

  const userContent = sections.join('\n\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: [{
      type:          'text',
      text:          SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{ role: 'user', content: userContent }],
  }, {
    headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
  });

  const rawText = response.content[0]?.text || '';
  let summary   = '';
  let keyPoints = [];

  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed.summary === 'string')   summary   = parsed.summary.slice(0, 500);
    if (Array.isArray(parsed.keyPoints))      keyPoints = parsed.keyPoints.filter(k => typeof k === 'string').slice(0, 6);
  } catch (err) {
    console.error('[summary] JSON parse error:', err.message, '— raw:', rawText.slice(0, 200));
    // Degrade gracefully — save raw text as summary rather than drop the job
    summary = rawText.slice(0, 500);
  }

  const entry = {
    appointmentId:   appt._id,
    appointmentDate: appt.date,
    doctorName:      doctor?.name || '',
    summary,
    keyPoints,
    generatedAt:     new Date(),
  };

  patient.healthSummaries.push(entry);
  patient.latestHealthSummary = entry;
  patient.markModified('healthSummaries');
  patient.markModified('latestHealthSummary');
  await patient.save();

  console.log(`[summary] generated for patient ${patient._id}, appt ${appointmentId}`);
}

function startSummaryWorker() {
  const worker = new Worker('health-summary', processSummaryJob, { connection: getConnection() });
  worker.on('failed', (job, err) =>
    console.error('[summary] job failed:', job?.id, err.message)
  );
  console.log('[summary] worker started');
  return worker;
}

module.exports = { startSummaryWorker, processSummaryJob };
