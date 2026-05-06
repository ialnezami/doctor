import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';

const SPECIALTIES = ['All','Cardiology','Dermatology','Pediatrics','Orthopedics','Neurology'];

const DOCTORS = [
  { id:'d1', name:'Dr. Sarah Al-Amin', specialty:'Cardiologist', rating:4.9, reviews:128, distance:1.2, availableToday:true, fee:250 },
  { id:'d2', name:'Dr. Mahmoud Karimi', specialty:'Neurologist', rating:4.6, reviews:84, distance:3.7, availableToday:false, nextSlot:'Thu', fee:200 },
  { id:'d3', name:'Dr. Rania Al-Jaber', specialty:'Pediatrician', rating:4.8, reviews:201, distance:2.1, availableToday:true, fee:180 },
  { id:'d4', name:'Dr. Yaw Boateng', specialty:'Orthopedic Surgeon', rating:4.4, reviews:57, distance:5.3, availableToday:false, nextSlot:'Mon', fee:300 },
];

const GRADIENTS = ['linear-gradient(135deg,#0fe3b0,#0891b2)','linear-gradient(135deg,#f59e0b,#ef4444)','linear-gradient(135deg,#8b5cf6,#3b82f6)','linear-gradient(135deg,#10b981,#0591d1)'];

export default function FindDoctorPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [spec, setSpec] = useState('All');

  const filtered = DOCTORS.filter(d =>
    (spec === 'All' || d.specialty.toLowerCase().includes(spec.toLowerCase())) &&
    (d.name.toLowerCase().includes(search.toLowerCase()) || d.specialty.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div><div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>Find a Doctor</div><div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>47 doctors near your location</div></div>
        <Button variant="ghost">📍 Use My Location</Button>
      </div>

      <div style={{ padding:26 }}>
        <div style={{ display:'flex', alignItems:'center', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden', marginBottom:16 }}>
          <span style={{ padding:'0 13px', color:'var(--text3)', fontSize:15 }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, specialty…"
            style={{ flex:1, background:'transparent', border:'none', outline:'none', padding:'11px 0', color:'var(--text)', fontSize:13.5 }} />
        </div>

        <div style={{ display:'flex', gap:7, marginBottom:20, flexWrap:'wrap' }}>
          {SPECIALTIES.map(s => (
            <button key={s} onClick={() => setSpec(s)}
              style={{ padding:'5px 13px', borderRadius:20, border:`1px solid ${spec===s ? 'var(--mint)' : 'var(--border2)'}`, background: spec===s ? 'var(--mint-dim)' : 'transparent', color: spec===s ? 'var(--mint)' : 'var(--text2)', fontSize:12, fontWeight:500, cursor:'pointer' }}>
              {s}
            </button>
          ))}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {filtered.map((doc, i) => (
            <div key={doc.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:18, display:'flex', gap:14, cursor:'pointer', transition:'all .18s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--mint)'; e.currentTarget.style.transform='translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='none'; }}>
              <div style={{ width:52, height:52, borderRadius:11, background:GRADIENTS[i%GRADIENTS.length], display:'grid', placeItems:'center', fontSize:18, fontWeight:700, color:'#fff', flexShrink:0 }}>
                {doc.name.split(' ').slice(1).map(w=>w[0]).join('').slice(0,2)}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14.5, fontWeight:600 }}>{doc.name}</div>
                <div style={{ fontSize:12.5, color:'var(--mint)', margin:'3px 0' }}>{doc.specialty}</div>
                <div style={{ fontSize:12, color:'var(--text2)', display:'flex', gap:10 }}>
                  <span style={{ color:'var(--amber)' }}>{'★'.repeat(Math.floor(doc.rating))}{'☆'.repeat(5-Math.floor(doc.rating))}</span>
                  <span>{doc.rating} ({doc.reviews} reviews)</span>
                  <span>📍 {doc.distance} km</span>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
                {doc.availableToday
                  ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'2px 8px', borderRadius:12, background:'var(--mint-dim)', color:'var(--mint)' }}>● Available today</span>
                  : <span style={{ fontSize:11, color:'var(--text3)' }}>Next: {doc.nextSlot}</span>}
                <Button onClick={() => navigate('/my-appointments')} style={{ padding:'6px 13px', fontSize:12 }}>Book</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
