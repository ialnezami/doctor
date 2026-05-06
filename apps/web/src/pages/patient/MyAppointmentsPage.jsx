import { useState, useEffect } from 'react';
import { getAppointments, updateStatus } from '../../api/appointments';
import { useNavigate } from 'react-router-dom';
import StatusChip from '../../components/ui/StatusChip';
import Button from '../../components/ui/Button';

const GRADIENTS = ['linear-gradient(135deg,#0fe3b0,#0891b2)','linear-gradient(135deg,#f59e0b,#ef4444)','linear-gradient(135deg,#8b5cf6,#3b82f6)'];

export default function MyAppointmentsPage() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);

  const load = () => getAppointments().then(setAppointments).catch(() => {});
  useEffect(() => { load(); }, []);

  const cancel = async (id) => { await updateStatus(id, 'cancelled'); load(); };

  const upcoming = appointments.filter(a => ['pending','confirmed'].includes(a.status));
  const past     = appointments.filter(a => ['completed','cancelled'].includes(a.status));

  const Card = ({ a, i, isPast }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg3)', border:`1px solid ${!isPast ? 'rgba(15,227,176,0.25)' : 'var(--border)'}`, borderRadius:'var(--r-sm)', marginBottom:8 }}>
      <div style={{ width:38, height:38, borderRadius:9, background:GRADIENTS[i%GRADIENTS.length], display:'grid', placeItems:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
        {a.doctorId?.name?.split(' ').slice(1,3).map(w=>w[0]).join('') || 'DR'}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13.5, fontWeight:500 }}>{a.doctorId?.name}</div>
        <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{new Date(a.date).toLocaleDateString()} · {a.timeSlot?.start}</div>
      </div>
      <StatusChip status={a.status} />
      {!isPast
        ? <Button variant="danger" style={{ padding:'5px 9px', fontSize:11 }} onClick={() => cancel(a._id)}>Cancel</Button>
        : <Button variant="ghost" style={{ padding:'5px 9px', fontSize:11 }} onClick={() => navigate('/records')}>Records</Button>}
    </div>
  );

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div><div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>My Appointments</div><div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>Upcoming and past bookings</div></div>
        <Button onClick={() => navigate('/find-doctor')}>+ Book New</Button>
      </div>
      <div style={{ padding:26 }}>
        <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>Upcoming</div>
        {upcoming.length === 0 && <p style={{ color:'var(--text3)', fontSize:13, marginBottom:20 }}>No upcoming appointments. <span style={{ color:'var(--mint)', cursor:'pointer' }} onClick={() => navigate('/find-doctor')}>Book one →</span></p>}
        {upcoming.map((a, i) => <Card key={a._id} a={a} i={i} isPast={false} />)}

        <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', margin:'20px 0 10px' }}>Past</div>
        {past.map((a, i) => <Card key={a._id} a={a} i={i} isPast={true} />)}
      </div>
    </div>
  );
}
