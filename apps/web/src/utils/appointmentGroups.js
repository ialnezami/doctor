export function parseTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function groupTodayAppointments(appointments) {
  const now = new Date();
  const today = appointments.filter(a => {
    if (!a.date) return false;
    return isSameDay(new Date(a.date), now);
  });

  const current = today.filter(a => {
    const start = parseTime(a.timeSlot?.start);
    const end   = parseTime(a.timeSlot?.end);
    if (!start || !end) return false;
    return start <= now && now <= end;
  });

  const upcoming = today.filter(a => {
    const start = parseTime(a.timeSlot?.start);
    if (!start) return false;
    return start > now;
  });

  return { current, upcoming };
}
