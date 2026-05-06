import { useState, useEffect } from 'react';
import { getPrescriptions } from '../../api/prescriptions';
import { getLabResults } from '../../api/labResults';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

const FLAG_STYLE = {
  normal:   { color: 'var(--mint)',  bg: 'rgba(15,227,176,0.1)' },
  high:     { color: 'var(--amber)', bg: 'rgba(251,191,36,0.1)' },
  low:      { color: 'var(--amber)', bg: 'rgba(251,191,36,0.1)' },
  critical: { color: 'var(--rose)',  bg: 'rgba(244,63,94,0.12)' },
};

export default function MedicalRecordsPage() {
  const [rxList, setRxList] = useState([]);
  const [labResults, setLabResults] = useState([]);
  const [tab, setTab] = useState('prescriptions');
  useEffect(() => {
    getPrescriptions().then(setRxList).catch(() => {});
    getLabResults().then(setLabResults).catch(() => {});
  }, []);

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'14px 26px' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>Medical Records</div>
        <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>Your complete health history</div>
      </div>
      <div style={{ padding:26 }}>
        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)', paddingBottom:12 }}>
          {[['prescriptions','Prescriptions'],['labs','Lab Results'],['profile','Health Profile']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding:'6px 16px', borderRadius:8, border:'1px solid', cursor:'pointer', fontSize:13, fontWeight:500, transition:'all .12s',
                background: tab === key ? 'var(--mint-dim)' : 'transparent',
                borderColor: tab === key ? 'rgba(15,227,176,0.2)' : 'transparent',
                color: tab === key ? 'var(--mint)' : 'var(--text2)' }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
          <div>
            {tab === 'prescriptions' && (
              <>
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
              </>
            )}

            {tab === 'labs' && (
              <>
                <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>Lab Results</div>
                {labResults.length === 0 && <p style={{ color:'var(--text3)', fontSize:13 }}>No lab results yet.</p>}
                {labResults.map(r => {
                  const worstFlag = r.tests.reduce((acc, t) => {
                    const order = { critical:3, high:2, low:2, normal:0 };
                    return order[t.flag] > order[acc] ? t.flag : acc;
                  }, 'normal');
                  const fs = FLAG_STYLE[worstFlag];
                  return (
                    <div key={r._id} style={{ padding:'12px 14px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:fs.color }} />
                        <div style={{ fontSize:13.5, fontWeight:500, flex:1 }}>{r.labName}</div>
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:10, background:fs.bg, color:fs.color, textTransform:'uppercase' }}>
                          {worstFlag}
                        </span>
                      </div>
                      <div style={{ fontSize:11.5, color:'var(--text2)', marginBottom:6 }}>{r.tests.length} test{r.tests.length !== 1 ? 's' : ''} · {new Date(r.issuedAt).toLocaleDateString()}</div>
                      {r.tests.slice(0, 3).map((t, i) => (
                        <div key={i} style={{ display:'flex', gap:8, fontSize:11.5, color:'var(--text3)', marginBottom:2 }}>
                          <span style={{ flex:1 }}>{t.name}</span>
                          <span style={{ fontFamily:'var(--font-mono)', color:(FLAG_STYLE[t.flag]||FLAG_STYLE.normal).color }}>{t.value} {t.unit}</span>
                        </div>
                      ))}
                      {r.tests.length > 3 && <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>+{r.tests.length - 3} more</div>}
                      {r.reportFile && (
                        <a href={r.reportFile} target="_blank" rel="noreferrer" style={{ display:'inline-block', marginTop:8 }}>
                          <Button variant="ghost" style={{ padding:'4px 9px', fontSize:11 }}>↓ Download PDF</Button>
                        </a>
                      )}
                    </div>
                  );
                })}
              </>
            )}
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
