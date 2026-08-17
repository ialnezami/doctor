const mongoose = require('mongoose');
const { hmacHash } = require('../utils/blindIndex');
const { normalizePhone } = require('../utils/phoneUtils');

const messageSchema = new mongoose.Schema({
  role:    { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  phoneHash: { type: String, required: true, unique: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  history:   { type: [messageSchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

// TTL index: session auto-deleted 24h after last message
sessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });

sessionSchema.statics.findByPhone = function (phone) {
  const hash = hmacHash(normalizePhone(phone));
  return this.findOne({ phoneHash: hash });
};

sessionSchema.statics.upsertForPhone = async function (phone, patientId, history) {
  const hash = hmacHash(normalizePhone(phone));
  return this.findOneAndUpdate(
    { phoneHash: hash },
    { phoneHash: hash, patientId, history, updatedAt: new Date() },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model('WhatsappSession', sessionSchema);
