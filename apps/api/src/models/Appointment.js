const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  timeSlot: {
    start: { type: String, required: true }, // "10:30"
    end:   { type: String, required: true }, // "11:00"
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'validated', 'cancelled', 'completed', 'archived'],
    default: 'pending',
  },
  initiatedBy: {
    type: String,
    enum: ['patient', 'doctor'],
    default: 'patient',
  },
  visitType: {
    type: String,
    enum: ['initial', 'follow-up', 'check-up', 'urgent'],
    default: 'initial',
  },
  reason: String,
  chiefComplaint: { type: String, default: null },
  notes: String,
  videoRoomName: { type: String, default: '' },
  remindersDisabled: { type: Boolean, default: false },
  locationId:      { type: mongoose.Schema.Types.ObjectId, default: null },
  locationName:    { type: String, default: '' },
  locationAddress: { type: String, default: '' },
  locationType:    { type: String, enum: ['bookable', 'hospital', null], default: null },
  reminder24hJobId:  { type: String,  default: null },
  reminder1hJobId:   { type: String,  default: null },
  symptomText:     { type: String, default: null },
  symptomAnalysis: {
    urgency:     { type: String, enum: ['low', 'medium', 'high'], default: null },
    category:    { type: String, default: null },
    processedAt: { type: Date,   default: null },
  },
  rescheduleSuggestions: {
    type: [{
      dayOfWeek: { type: Number, min: 0, max: 6 },
      time:      { type: String },
      reason:    { type: String },
    }],
    default: [],
  },
  paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
  invoiceAmount: { type: Number, default: 0 },
  qrToken:     { type: String, unique: true, sparse: true, default: null },
  checkedInAt: { type: Date, default: null },
}, { timestamps: true });

// Prevent querying a cancelled or completed slot as "booked"
appointmentSchema.index({ doctorId: 1, locationId: 1, date: 1, 'timeSlot.start': 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
