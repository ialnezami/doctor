const mongoose = require('mongoose');

const readEventSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  doctorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  readAt:        { type: Date, default: Date.now },
});

// One record per doctor per appointment — upserted on each read
readEventSchema.index({ appointmentId: 1, doctorId: 1 }, { unique: true });

module.exports = mongoose.model('ReadEvent', readEventSchema);
