import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDoctor, getAvailableSlots } from '../../api/doctors';
import Button from '../../components/ui/Button';

function dateLabel(d) {
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}
function toISO(d) {
  return d.toISOString().slice(0,10);
}

export default function DoctorProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()));
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d;
  });

  useEffect(() => { getDoctor(id).then(setDoctor).catch(() => {}); }, [id]);

  useEffect(() => {
    setSlotsLoading(true);
    getAvailableSlots(id, selectedDate)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [id, selectedDate]);

  if (!doctor) return <div style={{ padding:40, color:'var(--text2)' }}>Loading…</div>;

  const user = doctor.userId || {};
  const name = user.name || 'Doctor';

  return (
    <div style={{ padding:26, maxWidth:680 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:24, marginBottom:24 }}>
        <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
          <div style={{ width:64, height:64, borderRadius:14, background:'linear-gradient(135deg,#0fe3b0,#0891b2)', display:'grid', placeItems:'center', fontSize:22, fontWeight:700, color:'#fff', flexShrink:0 }}>
            {name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('')}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18, fontWeight:600 }}>{name}</div>
            <div style={{ fontSize:13, color:'var(--mint)', marginTop:3 }}>{doctor.specialty}</div>
            {doctor.bio && <div style={{ fontSize:12.5, color:'var(--text2)', marginTop:8 }}>{doctor.bio}</div>}
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:8, display:'flex', gap:16 }}>
              {doctor.consultationFee > 0 && <span>{doctor.consultationFee} SAR / visit</span>}
              {doctor.yearsOfExperience > 0 && <span>{doctor.yearsOfExperience} years experience</span>}
              {doctor.clinicAddress && <span>📍 {doctor.clinicAddress}</span>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>Pick a date</div>
      <div style={{ display:'flex', gap:8, marginBottom:20, overflowX:'auto', paddingBottom:4 }}>
        {days.map(d => {
          const iso = toISO(d);
          const active = iso === selectedDate;
          return (
            <button key={iso} onClick={() => setSelectedDate(iso)}
              style={{ flexShrink:0, padding:'8px 14px', borderRadius:'var(--r-sm)', border:`1px solid ${active ? 'var(--mint)' : 'var(--border2)'}`, background: active ? 'var(--mint-dim)' : 'var(--bg2)', color: active ? 'var(--mint)' : 'var(--text2)', fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
              {dateLabel(d)}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>Available times</div>
      {slotsLoading && <p style={{ fontSize:12, color:'var(--text3)' }}>Loading slots…</p>}
      {!slotsLoading && slots.length === 0 && <p style={{ fontSize:12, color:'var(--text3)' }}>No availability on this day.</p>}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        {slots.map(s => (
          <button key={s.time} disabled={!s.available}
            onClick={() => navigate(`/book/${id}?date=${selectedDate}&slot=${s.time}`)}
            style={{ padding:'8px 16px', borderRadius:20, border:`1px solid ${s.available ? 'var(--mint)' : 'var(--border)'}`, background: s.available ? 'var(--mint-dim)' : 'var(--bg3)', color: s.available ? 'var(--mint)' : 'var(--text3)', fontSize:12.5, cursor: s.available ? 'pointer' : 'default', opacity: s.available ? 1 : 0.5 }}>
            {s.time}
          </button>
        ))}
      </div>
    </div>
  );
}
