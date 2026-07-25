const { DateTime, IANAZone } = require('luxon');

function computeReminderDelays(appointmentDate) {
  const now = Date.now();
  const apptMs = new Date(appointmentDate).getTime();
  return {
    delay24h: Math.max(0, apptMs - 24 * 60 * 60 * 1000 - now),
    delay1h:  Math.max(0, apptMs -      60 * 60 * 1000 - now),
  };
}

function nextLocalSevenAmDelay(timezone) {
  const tz = IANAZone.isValidZone(timezone) ? timezone : 'UTC';
  const now = DateTime.now().setZone(tz);
  let target = now.set({ hour: 7, minute: 0, second: 0, millisecond: 0 });
  if (target <= now) target = target.plus({ days: 1 });
  return target.toMillis() - Date.now();
}

module.exports = { computeReminderDelays, nextLocalSevenAmDelay };
