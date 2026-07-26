'use strict';
/**
 * GDPR Article 20 — Data Export Worker
 *
 * Processes 'gdpr-data-export' BullMQ jobs.
 * Each job payload: { userId } where userId is an ObjectId string.
 *
 * Steps:
 *   1. Collect all patient data across 6+ collections
 *   2. Data is automatically decrypted by post('init') hooks when documents are loaded
 *      (use .exec() / hydrated queries, not .lean(), for encrypted models)
 *   3. Serialize to JSON with _metadata envelope
 *   4. Upload to Cloudinary as a private raw file
 *   5. Create in-app Notification with download link (24h conceptual expiry)
 *   6. Write AuditLog entry
 *
 * PHI note: The export JSON contains plaintext PHI — the patient IS the data subject
 * receiving their own data. Transport is HTTPS. The Cloudinary URL should be treated
 * as sensitive; it is delivered only via the patient's in-app notification (not in the
 * API response body).
 *
 * Encrypted fields: Mongoose post('init') hooks decrypt on hydration (.exec() / toObject()).
 * Never use .lean() on models that have encrypted fields (PHI) — post('init') does not fire.
 */
const { Worker } = require('bullmq');
const mongoose   = require('mongoose');
const User              = require('../models/User');
const Patient           = require('../models/Patient');
const Appointment       = require('../models/Appointment');
const ConsultationNote  = require('../models/ConsultationNote');
const Prescription      = require('../models/Prescription');
const LabResult         = require('../models/LabResult');
const Notification      = require('../models/Notification');
const AuditLog          = require('../models/AuditLog');
const { getConnection } = require('../queues/reminderQueue');
const { uploadBuffer }  = require('../utils/cloudinary');

/**
 * Safely load a Mongoose model that may not be registered in every deployment.
 * Returns null (not an exception) if the model is not registered.
 *
 * @param {string} modelName
 * @returns {mongoose.Model|null}
 */
function safeRequireModel(modelName) {
  try {
    return mongoose.model(modelName);
  } catch {
    return null;
  }
}

/**
 * Core job processor — called by the BullMQ Worker for each 'gdpr-data-export' job.
 *
 * @param {import('bullmq').Job} job
 * @returns {Promise<{ downloadUrl: string, jobId: string }>}
 */
async function processExportJob(job) {
  const { userId } = job.data;

  if (!userId) {
    throw new Error('Export job missing required field: userId');
  }

  // -------------------------------------------------------------------------
  // 1. User profile — exclude password hash (belt-and-suspenders: -password in
  //    select AND explicit delete below). Use lean() — User fields are not
  //    encrypted at-rest beyond bcrypt password; we strip that field entirely.
  // -------------------------------------------------------------------------
  const user = await User.findById(userId)
    .select('-password -__v')
    .lean();

  if (!user) {
    throw new Error(`Export job: User ${userId} not found`);
  }

  // -------------------------------------------------------------------------
  // 2. Patient medical profile — DO NOT use .lean(); post('init') hooks decrypt
  //    encrypted fields (PHI) on hydration. toObject() produces a plain object.
  // -------------------------------------------------------------------------
  const patientDoc  = await Patient.findOne({ userId });
  const patientData = patientDoc ? patientDoc.toObject() : null;

  // -------------------------------------------------------------------------
  // 3. Appointments — lean is safe; Appointment fields are not encrypted.
  // -------------------------------------------------------------------------
  const appointments = await Appointment.find({ patientId: userId })
    .populate('doctorId', 'name specialty')
    .lean();

  const apptIds = appointments.map(a => a._id);

  // -------------------------------------------------------------------------
  // 4. ConsultationNotes — shared only (private notes are doctor work product).
  //    Decrypt via toObject() in case note body is encrypted.
  // -------------------------------------------------------------------------
  const noteDocs  = await ConsultationNote.find({
    appointmentId: { $in: apptIds },
    visibility: 'shared',
  });
  const notesData = noteDocs.map(n => n.toObject());

  // -------------------------------------------------------------------------
  // 5. Prescriptions — toObject() ensures any encrypted fields are decrypted.
  // -------------------------------------------------------------------------
  const prescriptionDocs  = await Prescription.find({ patientId: userId });
  const prescriptionsData = prescriptionDocs.map(p => p.toObject());

  // -------------------------------------------------------------------------
  // 6. LabResults — toObject() for encrypted field safety.
  // -------------------------------------------------------------------------
  const labResultDocs  = await LabResult.find({ patientId: userId });
  const labResultsData = labResultDocs.map(l => l.toObject());

  // -------------------------------------------------------------------------
  // 7. Reviews authored by the patient (optional model — not always present).
  // -------------------------------------------------------------------------
  const Review      = safeRequireModel('Review');
  const reviewsData = Review
    ? await Review.find({ patientId: userId }).lean()
    : [];

  // -------------------------------------------------------------------------
  // 8. Assemble export payload with _metadata envelope (GDPR Article 20 format).
  //    Explicitly delete password at object level — belt-and-suspenders against
  //    any future select() regression.
  // -------------------------------------------------------------------------
  const profileExport = { ...user };
  delete profileExport.password; // never export password hash

  const exportPayload = {
    _metadata: {
      exportedAt:    new Date().toISOString(),
      version:       '1.0',
      dataSubject: {
        userId: user._id,
        name:   user.name,
        email:  user.email,
        role:   user.role,
      },
      generatedBy: 'Salamtak GDPR Export (Article 20)',
    },
    data: {
      profile:           profileExport,
      medicalProfile:    patientData,
      appointments,
      consultationNotes: notesData,
      prescriptions:     prescriptionsData,
      labResults:        labResultsData,
      reviews:           reviewsData,
    },
  };

  // -------------------------------------------------------------------------
  // 9. Upload to Cloudinary as a private raw JSON file.
  //    resource_type:'raw' is mandatory — Cloudinary treats JSON as a document,
  //    not an image. image transformations are stripped automatically in uploadBuffer.
  // -------------------------------------------------------------------------
  const jsonBuffer = Buffer.from(JSON.stringify(exportPayload, null, 2), 'utf8');

  const uploadResult = await uploadBuffer(
    jsonBuffer,
    `mediconnect/gdpr-exports/${userId}`,
    {
      resource_type: 'raw',
      format:        'json',
      public_id:     `export-${userId}-${Date.now()}`,
    }
  );

  const downloadUrl = uploadResult.secure_url;

  // -------------------------------------------------------------------------
  // 10. Create in-app Notification so the patient can retrieve their download URL.
  //     The URL is NOT returned in the API response (job status endpoint returns
  //     only a pointer to check notifications) — reducing URL leakage surface.
  // -------------------------------------------------------------------------
  await Notification.create({
    recipientId: userId,
    type:        'gdpr_export_ready',
    payload: {
      message:    'Your data export is ready. Download link expires in 24 hours.',
      downloadUrl,
      expiresAt:  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  // -------------------------------------------------------------------------
  // 11. Audit log — fire-and-forget; audit failure must not fail the export.
  //     NEVER store downloadUrl or export content in AuditLog.meta.
  // -------------------------------------------------------------------------
  AuditLog.create({
    actorId:      userId,
    actorRole:    'patient',
    action:       'export',
    resourceType: 'User',
    resourceId:   userId,
    targetUserId: userId,
    outcome:      'success',
    meta: {
      exportJobId:         job.id,
      cloudinaryPublicId:  uploadResult.public_id,
    },
  }).catch(err => console.error('[export][audit] AuditLog write failed:', err.message));

  return { downloadUrl, jobId: job.id };
}

/**
 * Start the GDPR export BullMQ worker and attach error listeners.
 *
 * Concurrency is intentionally low (2) — export jobs are CPU + I/O heavy:
 * they hydrate 6+ collections, serialize large JSON, and call Cloudinary.
 *
 * @returns {import('bullmq').Worker}
 */
function startExportWorker() {
  const worker = new Worker('gdpr-data-export', processExportJob, {
    connection:  getConnection(),
    concurrency: 2,
  });

  worker.on('failed', (job, err) =>
    console.error(`[export] job ${job?.id} failed:`, err.message)
  );

  console.log('[export] worker started');
  return worker;
}

module.exports = { startExportWorker, processExportJob };
