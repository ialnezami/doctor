import { useMemo } from 'react';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_START = 8;   // 08:00
const HOUR_END   = 20;  // 20:00
const TOTAL_MIN  = (HOUR_END - HOUR_START) * 60; // 720
const ROW_PX     = 48;  // height per 30-min slot
const GRID_H     = (TOTAL_MIN / 30) * ROW_PX;    // 1152px

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  return d;
}

function toLocalDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA'); // YYYY-MM-DD
}

export default function WeekGrid({ appointments, selectedDate, onSelectDate, onSelectAppointment }) {
  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate]);
  const todayStr  = new Date().toLocaleDateString('en-CA');

  const days = useMemo(() => (
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString('en-CA');
    })
  ), [weekStart]);

  const apptsByDay = useMemo(() => {
    const map = {};
    days.forEach(d => { map[d] = []; });
    appointments.forEach(a => {
      const d = toLocalDate(a.date);
      if (map[d]) map[d].push(a);
    });
    return map;
  }, [appointments, days]);

  const timeLabels = useMemo(() => (
    Array.from({ length: TOTAL_MIN / 30 }, (_, i) => {
      const totalMin = HOUR_START * 60 + i * 30;
      const h = Math.floor(totalMin / 60).toString().padStart(2, '0');
      const m = (totalMin % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    })
  ), []);

  const statusColor = (status) => {
    if (['confirmed', 'in_progress'].includes(status)) return 'var(--mint)';
    if (status === 'completed') return 'rgba(34,197,94,0.8)';
    if (status === 'cancelled') return 'var(--text3)';
    return 'var(--primary)';
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
        <div />
        {days.map((d, i) => {
          const isToday    = d === todayStr;
          const isSelected = d === selectedDate;
          const label      = new Date(d + 'T00:00:00');
          return (
            <div key={d} onClick={() => onSelectDate(d)}
              style={{ padding: '10px 4px', textAlign: 'center', cursor: 'pointer',
                borderLeft: i === 0 ? 'none' : '1px solid var(--border)',
                borderBottom: isSelected ? '2px solid var(--mint)' : '2px solid transparent' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{DAY_LABELS[i]}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: isToday ? 'var(--mint)' : 'var(--text)', marginTop: 2 }}>{label.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', position: 'relative' }}>
        {/* Time labels column */}
        <div style={{ position: 'relative', height: GRID_H }}>
          {timeLabels.map((t, i) => (
            <div key={t} style={{ position: 'absolute', top: i * ROW_PX - 8, right: 8, fontSize: 10, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
              {i % 2 === 0 ? t : ''}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d) => (
          <div key={d} style={{ position: 'relative', height: GRID_H, borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            {/* Hour lines */}
            {timeLabels.map((_, i) => (
              <div key={i} style={{ position: 'absolute', top: i * ROW_PX, left: 0, right: 0,
                borderTop: i % 2 === 0 ? '1px solid var(--border)' : '1px dashed var(--border2)', pointerEvents: 'none' }} />
            ))}

            {/* Today highlight */}
            {d === todayStr && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,227,176,0.03)', pointerEvents: 'none' }} />
            )}

            {/* Appointment blocks */}
            {(apptsByDay[d] || []).filter(a => a.status !== 'cancelled').map(a => {
              const startMin     = toMinutes(a.timeSlot?.start || '08:00') - HOUR_START * 60;
              const rawEndMin    = a.timeSlot?.end
                ? toMinutes(a.timeSlot.end) - HOUR_START * 60
                : startMin + 30;
              const clampedStart = Math.max(0, Math.min(startMin, TOTAL_MIN));
              const clampedEnd   = Math.max(clampedStart + 15, Math.min(rawEndMin, TOTAL_MIN));
              const top          = (clampedStart / TOTAL_MIN) * GRID_H;
              const height       = Math.max(((clampedEnd - clampedStart) / TOTAL_MIN) * GRID_H, 24);
              const color        = statusColor(a.status);
              return (
                <div key={a._id} onClick={() => onSelectAppointment(a)}
                  style={{ position: 'absolute', top, left: 3, right: 3, height,
                    background: `${color}22`, border: `1px solid ${color}`,
                    borderRadius: 6, padding: '2px 5px', cursor: 'pointer', overflow: 'hidden',
                    boxSizing: 'border-box', zIndex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.patientId?.name || 'Patient'}
                  </div>
                  {height > 30 && (
                    <div style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.visitType || 'Consultation'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
