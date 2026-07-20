import { useMemo, useState } from 'react';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function toLocalDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA');
}

export default function MonthGrid({ appointments, selectedDate, onSelectDate }) {
  const todayStr = new Date().toLocaleDateString('en-CA');

  const [view, setView] = useState(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const prevMonth = () => setView(v => v.month === 0  ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  const nextMonth = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0  } : { ...v, month: v.month + 1 });

  const { cells } = useMemo(() => {
    const firstDow    = new Date(view.year, view.month, 1).getDay();
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const cells = [
      ...Array(firstDow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return { cells };
  }, [view]);

  const apptsByDate = useMemo(() => {
    const map = {};
    appointments.forEach(a => {
      if (a.status === 'cancelled') return;
      const d = toLocalDate(a.date);
      if (!map[d]) map[d] = [];
      map[d].push(a);
    });
    return map;
  }, [appointments]);

  const cellDate = (day) => {
    const mm = String(view.month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${view.year}-${mm}-${dd}`;
  };

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 20, padding: '0 10px' }}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{MONTH_NAMES[view.month]} {view.year}</span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 20, padding: '0 10px' }}>›</button>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', padding: '4px 0', letterSpacing: '0.05em' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const dateStr  = cellDate(day);
          const dayAppts = apptsByDate[dateStr] || [];
          const isToday    = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const shown    = dayAppts.slice(0, 2);
          const overflow = dayAppts.length - shown.length;

          return (
            <div key={dateStr} onClick={() => onSelectDate(dateStr)}
              style={{ minHeight: 76, padding: '4px 5px', borderRadius: 8, cursor: 'pointer',
                background: isSelected ? 'var(--mint-dim)' : isToday ? 'var(--bg3)' : 'var(--bg2)',
                border: `1px solid ${isSelected ? 'rgba(15,227,176,0.3)' : 'var(--border)'}`,
                transition: 'background .1s' }}>
              <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--mint)' : 'var(--text)', marginBottom: 3 }}>{day}</div>
              {shown.map(a => (
                <div key={a._id} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, marginBottom: 2,
                  background: 'var(--primary)', color: '#fff',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.timeSlot?.start} {a.patientId?.name || ''}
                </div>
              ))}
              {overflow > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text3)', paddingLeft: 5 }}>+{overflow} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
