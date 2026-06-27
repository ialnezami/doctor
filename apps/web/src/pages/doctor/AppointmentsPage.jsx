import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAppointments, updateStatus } from '../../api/appointments';
import StatusChip from '../../components/ui/StatusChip';
import Button from '../../components/ui/Button';

const FILTERS = ['all','pending','confirmed','completed','cancelled'];

export default function AppointmentsPage() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [filter, setFilter] = useState('all');

  const load = () => getAppointments().then(setAppointments).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleStatus = async (id, status) => {
    await updateStatus(id, status);
    load();
  };

  const visible = filter === 'all' ? appointments : appointments.filter(a => a.status === filter);
  const pending  = appointments.filter(a => a.status === 'pending');

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>Appointments</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>Manage your schedule</div>
        </div>
      </div>

      <div style={{ padding:26 }}>
        <div style={{ display:'flex', gap:7, marginBottom:16, flexWrap:'wrap' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding:'5px 13px', borderRadius:20, border:`1px solid ${filter===f ? 'var(--mint)' : 'var(--border2)'}`, background: filter===f ? 'var(--mint-dim)' : 'transparent', color: filter===f ? 'var(--mint)' : 'var(--text2)', fontSize:12, fontWeight:500, cursor:'pointer', textTransform:'capitalize' }}>
              {f}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)' }}>
                {filter === 'all' ? 'All Appointments' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </div>
              <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:'var(--bg3)', border:'1px solid var(--border2)', color:'var(--text2)' }}>
                {visible.length} total
              </span>
            </div>
            {visible.map(a => (
              <div key={a._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginBottom:8 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--mint)', minWidth:52 }}>{a.timeSlot?.start}</span>
                <div style={{ width:1, height:28, background:'var(--border)', flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:500 }}>{a.patientId?.name}</div>
                  <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{new Date(a.date).toLocaleDateString()} · {a.visitType}</div>
                </div>
                <StatusChip status={a.status} />
                {a.status !== 'cancelled' && (
                  <button
                    onClick={() => navigate(`/appointments/${a._id}/chat`, { state: { otherPartyName: a.patientId?.name || 'Patient' } })}
                    style={{ background: 'var(--mint-dim)', border: '1px solid rgba(15,227,176,0.3)', borderRadius: 6, padding: '3px 9px', color: 'var(--mint)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    💬 Chat
                  </button>
                )}
              </div>
            ))}
          </div>

          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)' }}>Pending Approval</div>
              <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:'var(--amber-dim)', border:'1px solid rgba(245,158,11,0.3)', color:'var(--amber)' }}>{pending.length} requests</span>
            </div>
            {pending.map(a => (
              <div key={a._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg3)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'var(--r-sm)', marginBottom:8 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--amber)', minWidth:52 }}>{new Date(a.date).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}</span>
                <div style={{ width:1, height:28, background:'var(--border)', flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:500 }}>{a.patientId?.name}</div>
                  <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{a.reason}</div>
                </div>
                <div style={{ display:'flex', gap:5 }}>
                  <Button style={{ padding:'4px 8px', fontSize:11 }} onClick={() => handleStatus(a._id, 'confirmed')}>✓</Button>
                  <Button variant="danger" style={{ padding:'4px 8px', fontSize:11 }} onClick={() => handleStatus(a._id, 'cancelled')}>✗</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
