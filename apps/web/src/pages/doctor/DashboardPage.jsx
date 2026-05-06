import { useState, useEffect } from 'react';
import { getAppointments } from '../../api/appointments';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import Card from '../../components/ui/Card';
import StatusChip from '../../components/ui/StatusChip';
import Button from '../../components/ui/Button';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);

  useEffect(() => { getAppointments().then(setAppointments).catch(() => {}); }, []);

  const today = appointments.filter(a => {
    const d = new Date(a.date);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const pending = appointments.filter(a => a.status === 'pending');

  return (
    <div>
      {/* Topbar */}
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>Good morning, {user?.name?.split(' ')[0]}</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{new Date().toDateString()} — {today.length} appointments today</div>
        </div>
        <Button onClick={() => navigate('/prescriptions')}>+ New Prescription</Button>
      </div>

      <div style={{ padding:26 }}>
        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
          {[
            { label:"Today's Appointments", value: today.length, accent:'var(--mint)' },
            { label:'Pending Requests',     value: pending.length, accent:'var(--amber)' },
            { label:'Total Patients',       value: appointments.length, accent:'var(--blue)' },
            { label:'Prescriptions Today',  value: 0, accent:'var(--rose)' },
          ].map(s => (
            <Card key={s.label} style={{ position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:s.accent }} />
              <div style={{ fontSize:10.5, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', fontWeight:500 }}>{s.label}</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:34, fontWeight:600, color:s.accent, margin:'3px 0', lineHeight:1 }}>{s.value}</div>
            </Card>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
          {/* Today's schedule */}
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)' }}>Today's Schedule</div>
              <Button variant="outline" style={{ padding:'5px 11px', fontSize:11.5 }} onClick={() => navigate('/appointments')}>View all</Button>
            </div>
            {today.length === 0 && <p style={{ color:'var(--text3)', fontSize:13 }}>No appointments today.</p>}
            {today.map(a => (
              <div key={a._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginBottom:8, cursor:'pointer' }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--mint)', minWidth:48, fontWeight:500 }}>{a.timeSlot?.start}</span>
                <div style={{ width:1, height:28, background:'var(--border)', flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:500 }}>{a.patientId?.name}</div>
                  <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{a.visitType} · {a.timeSlot?.start}–{a.timeSlot?.end}</div>
                </div>
                <StatusChip status={a.status} />
              </div>
            ))}
          </div>

          {/* Weekly chart */}
          <div>
            <Card>
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:14 }}>Weekly Volume</div>
              <div style={{ height:110, display:'flex', alignItems:'flex-end', gap:5, paddingTop:14 }}>
                {[45,72,55,90,65,80,38].map((h, i) => (
                  <div key={i} style={{ flex:1, height:`${h}%`, borderRadius:'3px 3px 0 0', background:'var(--mint-dim)', borderTop:'2px solid var(--mint)', transition:'all .2s' }} />
                ))}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
                {DAYS.map(d => <span key={d} style={{ fontSize:9.5, color:'var(--text3)', fontFamily:'var(--font-mono)' }}>{d}</span>)}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
