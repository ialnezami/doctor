'use strict';
const mongoose = require('mongoose');

const SUPPORTED_CURRENCIES = [
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'QAR', name: 'Qatari Riyal' },
  { code: 'JOD', name: 'Jordanian Dinar' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'SYP', name: 'Syrian Pound' },
  { code: 'TRY', name: 'Turkish Lira' },
];

const SUPPORTED_CODES = SUPPORTED_CURRENCIES.map(c => c.code);

const platformSettingsSchema = new mongoose.Schema({
  availableCurrencies: {
    type: [String],
    default: ['SAR', 'USD', 'EUR'],
    validate: {
      validator: (codes) => Array.isArray(codes) && codes.length > 0 && codes.every(c => SUPPORTED_CODES.includes(c)),
      message: 'One or more currency codes are not supported.',
    },
  },
}, { timestamps: true });

platformSettingsSchema.statics.getOrCreate = async function () {
  let doc = await this.findOne().lean();
  if (!doc) doc = await this.create({});
  return doc;
};

const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);

module.exports = { PlatformSettings, SUPPORTED_CURRENCIES, SUPPORTED_CODES };
