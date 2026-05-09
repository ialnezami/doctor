import { useState, useEffect } from 'react';
import { updateDoctorSettings } from '../../api/doctors';
import useAuthStore from '../../store/authStore';
import Button from '../../components/ui/Button';
import client from '../../api/client';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function DoctorSettingsPage() {
  const { user } = useAuthStore();
  const [doctorId, setDoctorId] = useState(null);
  const [autoAccept, setAutoAccept] = useState(false);
  const [slots, setSlots] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    client.get('/doctors').then(docs => {
      const profile = docs.find(d => (d.userId?._id || d.userId) === user.id);
      if (profile) {
        setDoctorId(profile._id);
        setAutoAccept(profile.autoAcceptAppointments || false);
        setSlots(profile.availabilitySlots || []);
      }
    }).catch(() => {});
  }, [user.id]);

  const addSlot = () => setSlots(s => [...s, { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }]);
  const removeSlot = (i) => setSlots(s => s.filter((_, idx) => idx !== i));
  const updateSlot = (i, key, val) => setSlots(s => s.map((sl, idx) => idx === i ? { ...sl, [key]: val } : sl));

  const save = async () => {
    if (!doctorId) return;
    setSaving(true);
    try {
      await updateDoctorSettings(doctorId, { autoAcceptAppointments: autoAccept, availabilitySlots: slots });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding:26, maxWidth:600 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500, marginBottom:24 }}>Settings</div>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:500 }}>Auto-accept appointments</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginTop:3 }}>When on, new bookings are confirmed immediately without manual approval.</div>
          </div>
          <button onClick={() => setAutoAccept(v => !v)}
            style={{ width:44, height:24, borderRadius:12, background: autoAccept ? 'var(--mint)' : 'var(--border2)', border:'none', cursor:'pointer', position:'relative', transition:'background .2s' }}>
            <span style={{ position:'absolute', top:3, left: autoAccept ? 23 : 3, width:18, height:18, borderRadius:9, background:'#fff', transition:'left .2s', display:'block' }} />
          </button>
        </div>
      </div>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div style={{ fontSize:14, fontWeight:500 }}>Availability</div>
          <Button variant="ghost" style={{ padding:'4px 10px', fontSize:12 }} onClick={addSlot}>+ Add day</Button>
        </div>
        {slots.length === 0 && <p style={{ fontSize:12, color:'var(--text3)' }}>No availability set — patients won't see any slots.</p>}
        {slots.map((sl, i) => (
          <div key={i} style={{ display:'flex', gap:10, alignItems:'center', marginBottom:8 }}>
            <select value={sl.dayOfWeek} onChange={e => updateSlot(i, 'dayOfWeek', parseInt(e.target.value))}
              style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'6px 10px', color:'var(--text)', fontSize:12 }}>
              {DAYS.map((d, idx) => <option key={d} value={idx}>{d}</option>)}
            </select>
            <input type="time" value={sl.startTime} onChange={e => updateSlot(i, 'startTime', e.target.value)}
              style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'6px 10px', color:'var(--text)', fontSize:12 }} />
            <span style={{ color:'var(--text3)', fontSize:12 }}>to</span>
            <input type="time" value={sl.endTime} onChange={e => updateSlot(i, 'endTime', e.target.value)}
              style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'6px 10px', color:'var(--text)', fontSize:12 }} />
            <button onClick={() => removeSlot(i)} style={{ background:'none', border:'none', color:'var(--rose)', cursor:'pointer', fontSize:16 }}>×</button>
          </div>
        ))}
      </div>

      <Button onClick={save} disabled={saving} style={{ padding:'11px 28px' }}>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
      </Button>
    </div>
  );
}
