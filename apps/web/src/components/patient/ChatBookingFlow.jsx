import { useEffect, useState } from 'react';
import { fetchDoctorSlots, bookFromChat } from '../../api/chatbot';

const NEXT_DAYS = 7;

function formatDate(d) {
  // Use local year/month/day — toISOString() converts to UTC which can shift the date in GMT+3
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * ChatBookingFlow — inline date/slot picker shown inside ChatWidget when a
 * patient clicks "Book" on a doctor recommendation card.
 *
 * Props:
 *   doctor   — doctor object { _id, userId, user: { name }, locations, consultationFee }
 *   onDone   — (message: string) => void — called with success/cancel text to append to chat
 *   onCancel — () => void
 */
export default function ChatBookingFlow({ doctor, onDone, onCancel }) {
  const days = Array.from({ length: NEXT_DAYS }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d;
  });

  const bookableLocations = (doctor.locations || []).filter(l => l.type === 'bookable');
  const [locationId, setLocationId] = useState(bookableLocations[0]?._id || null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedDay) return;
    setSlots([]);
    setSelectedSlot(null);
    setLoadingSlots(true);
    setError('');
    fetchDoctorSlots(doctor._id, formatDate(selectedDay))
      .then(data => setSlots(data.filter(s => s.available)))
      .catch(() => setError('Could not load slots. Try another date.'))
      .finally(() => setLoadingSlots(false));
  }, [selectedDay, doctor._id]);

  const confirm = async () => {
    if (!selectedSlot || !locationId || !selectedDay) return;
    setBooking(true);
    setError('');
    try {
      await bookFromChat({
        doctorUserId: doctor.userId,
        locationId,
        date: formatDate(selectedDay),
        timeSlot: selectedSlot,
        reason: 'Booked via AI assistant',
      });
      onDone(`✓ Appointment booked with Dr. ${doctor.user?.name} on ${dayLabel(selectedDay)} at ${selectedSlot}.`);
    } catch (e) {
      const msg = e?.response?.data?.message || 'Booking failed. Please try again.';
      setError(msg);
    } finally {
      setBooking(false);
    }
  };

  const box = { backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 14, marginTop: 8, fontSize: 13 };
  const label = { fontWeight: 600, color: '#0369a1', marginBottom: 8, display: 'block' };
  const chip = (active) => ({
    padding: '5px 10px', borderRadius: 16, border: `1px solid ${active ? '#2563eb' : '#d1d5db'}`,
    backgroundColor: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#374151',
    cursor: 'pointer', fontSize: 12, margin: '0 4px 6px 0', fontFamily: 'inherit',
  });

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: '#1e40af' }}>
          Book with Dr. {doctor.user?.name}
        </span>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
      </div>

      {bookableLocations.length > 1 && (
        <div style={{ marginBottom: 10 }}>
          <span style={label}>Location</span>
          <select
            value={locationId}
            onChange={e => setLocationId(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
          >
            {bookableLocations.map(l => (
              <option key={l._id} value={l._id}>{l.name || l.address}</option>
            ))}
          </select>
        </div>
      )}

      <span style={label}>Pick a date</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 10 }}>
        {days.map(d => (
          <button
            key={d.toISOString()}
            style={chip(selectedDay?.toDateString() === d.toDateString())}
            onClick={() => setSelectedDay(d)}
          >
            {dayLabel(d)}
          </button>
        ))}
      </div>

      {selectedDay && (
        <>
          <span style={label}>Available slots</span>
          {loadingSlots && <div style={{ color: '#6b7280', fontSize: 12 }}>Loading...</div>}
          {!loadingSlots && slots.length === 0 && !error && (
            <div style={{ color: '#6b7280', fontSize: 12 }}>No slots available on this date.</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {slots.map(s => (
              <button
                key={s.time}
                style={chip(selectedSlot === s.time)}
                onClick={() => setSelectedSlot(s.time)}
              >
                {s.time}
              </button>
            ))}
          </div>
        </>
      )}

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>{error}</div>}

      {selectedSlot && (
        <button
          onClick={confirm}
          disabled={booking}
          style={{
            marginTop: 12, width: '100%', padding: '9px 0', borderRadius: 8,
            backgroundColor: booking ? '#93c5fd' : '#2563eb', color: '#fff',
            border: 'none', fontWeight: 700, fontSize: 14, cursor: booking ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {booking ? 'Booking…' : `Confirm — ${selectedSlot} on ${dayLabel(selectedDay)}`}
        </button>
      )}
    </div>
  );
}
