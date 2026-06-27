const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
  senderId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',        required: true },
  type:          { type: String, enum: ['text', 'image', 'file'], required: true },
  text:          { type: String, maxlength: 2000, default: '' },
  fileUrl:       { type: String, default: '' },
  fileName:      { type: String, default: '' },
}, { timestamps: true });

messageSchema.index({ appointmentId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
