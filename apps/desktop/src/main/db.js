'use strict';
// Wave 2 agent (Task 2) will implement SQLite schema + typed helpers
const noop = () => {};
module.exports = {
  initialize: async () => {},
  products:      { list: () => [], adjustStock: noop, upsert: noop, remove: noop },
  sales:         { list: () => [], create: noop },
  appointments:  { list: () => [], listByDate: () => [], upsert: noop },
  patients:      { list: () => [], get: () => null, upsert: noop },
  prescriptions: { list: () => [], create: noop },
  labOrders:     { list: () => [], updateStatus: noop },
  syncQueue:     { push: noop, list: () => [], remove: noop },
};
