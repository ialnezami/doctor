import { useState, useEffect } from 'react';
import { getPrescriptions } from '../../api/prescriptions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

export default function MedicalRecordsPage() {
  const [rxList, setRxList] = useState([]);
  useEffect(() => { getPrescriptions().then(setRxList).catch(() => {}); }, []);

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'14px 26px' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>Medical Records</div>
        <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>Your complete health history</div>
      </div>
      <div style={{ padding:26 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
          <div>
            <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>Prescriptions</div>
            {rxList.length === 0 && <p style={{ color:'var(--text3)', fontSize:13 }}>No prescriptions yet.</p>}
            {rxList.map((rx, i) => (
              <div key={rx._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginBottom:8 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--mint)', minWidth:64 }}>RX-{String(i+31).padStart(4,'0')}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:500 }}>{rx.doctorId?.name}</div>
                  <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{rx.medications?.map(m=>m.name).join(', ')} · {new Date(rx.createdAt).toLocaleDateString()}</div>
                </div>
                <Button variant="ghost" style={{ padding:'4px 9px', fontSize:11 }}>↓ PDF</Button>
              </div>
            ))}
          </div>

          <Card>
            <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:12 }}>Health Profile</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
              {[['Age','27','years'],['Blood Type','A+',''],['Allergies','2','recorded']].map(([l,v,u]) => (
                <div key={l} style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'10px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)' }}>{l}</div>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:600, margin:'3px 0' }}>{v}</div>
                  <div style={{ fontSize:10.5, color:'var(--text2)' }}>{u}</div>
                </div>
              ))}
            </div>
            <div style={{ height:1, background:'var(--border)', margin:'12px 0' }} />
            <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:8 }}>Conditions</div>
            <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
              {['Migraine','Anxiety'].map(c => (
                <span key={c} style={{ padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:'var(--bg3)', border:'1px solid var(--border2)', color:'var(--text2)' }}>{c}</span>
              ))}
              <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:'var(--rose-dim)', border:'1px solid rgba(244,63,94,0.3)', color:'var(--rose)' }}>Penicillin allergy</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
