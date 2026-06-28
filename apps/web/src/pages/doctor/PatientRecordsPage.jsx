import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile';

const MOCK_PATIENTS = [
  { id:'1', name:'Omar Faisal', age:32, sex:'Male', conditions:['Hypertension','Arrhythmia'], ref:'#P-0042', bp:'138/88', hr:76, spo2:98,
    notes:[{ date:'Today · 11:00', title:'ECG + Cardiology Consultation', desc:'Active appointment — Arrhythmia follow-up', current:true },
           { date:'12 Apr 2026', title:'Blood Pressure Review', desc:'Bisoprolol 5mg prescribed. BP 144/92 → target <130/80' },
           { date:'01 Mar 2026', title:'Initial Consultation', desc:'Dx: Stage 1 Hypertension, Paroxysmal AF' }] },
  { id:'2', name:'Khalid Al-Rashidi', age:58, sex:'Male', conditions:['Post-MI','Diabetes T2'], ref:'#P-0018', bp:'142/90', hr:68, spo2:97, notes:[] },
  { id:'3', name:'Layla Hassan', age:27, sex:'Female', conditions:['Anxiety','Palpitations'], ref:'#P-0091', bp:'120/78', hr:82, spo2:99, notes:[] },
];

export default function PatientRecordsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(MOCK_PATIENTS[0]);

  const filtered = MOCK_PATIENTS.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>{t('patientRecords.title')}</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{t('patientRecords.subtitle')}</div>
        </div>
        <Button>{t('patientRecords.newPatient')}</Button>
      </div>
      <div style={{ padding: isMobile ? 14 : 26 }}>
        <div style={{ display:'flex', alignItems:'center', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden', marginBottom:20 }}>
          <span style={{ padding:'0 13px', color:'var(--text3)', fontSize:15 }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('patientRecords.searchPlaceholder')}
            style={{ flex:1, background:'transparent', border:'none', outline:'none', padding:'11px 0', color:'var(--text)', fontSize:13.5 }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:18 }}>
          <div>
            {filtered.map(p => (
              <div key={p.id} onClick={() => setSelected(p)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg3)', border:`1px solid ${selected?.id===p.id ? 'var(--mint)' : 'var(--border)'}`, borderRadius:'var(--r-sm)', marginBottom:8, cursor:'pointer', transition:'all .13s' }}>
                <div style={{ width:34, height:34, borderRadius:8, background:'linear-gradient(135deg,var(--mint),#0891b2)', display:'grid', placeItems:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {p.name.split(' ').map(w=>w[0]).join('')}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:500 }}>{p.name}</div>
                  <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{p.age} · {p.sex} · {p.conditions.join(', ')}</div>
                </div>
                <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:'var(--bg3)', border:'1px solid var(--border2)', color:'var(--text2)' }}>{p.ref}</span>
              </div>
            ))}
          </div>

          {selected && (
            <Card>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                  <div style={{ width:44, height:44, borderRadius:11, background:'linear-gradient(135deg,var(--mint),#0891b2)', display:'grid', placeItems:'center', fontSize:16, fontWeight:700, color:'#fff' }}>
                    {selected.name.split(' ').map(w=>w[0]).join('')}
                  </div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:600 }}>{selected.name}</div>
                    <div style={{ fontSize:11.5, color:'var(--text2)' }}>{selected.age} · {selected.sex} · {selected.ref}</div>
                  </div>
                </div>
                <Button style={{ padding:'6px 13px', fontSize:12 }} onClick={() => navigate('/prescriptions')}>{t('patientRecords.prescribe')}</Button>
              </div>

              <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(3,1fr)' : 'repeat(3,1fr)', gap: isMobile ? 6 : 10, marginBottom:14 }}>
                {[
                  [t('patientRecords.vitals.bp'),        selected.bp,           t('patientRecords.vitals.mmhg')],
                  [t('patientRecords.vitals.heartRate'),  selected.hr,           t('patientRecords.vitals.bpm')],
                  [t('patientRecords.vitals.spo2'),       `${selected.spo2}%`,   t('patientRecords.vitals.oxygen')],
                ].map(([l,v,u]) => (
                  <div key={l} style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'10px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)' }}>{l}</div>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:600, margin:'3px 0' }}>{v}</div>
                    <div style={{ fontSize:10.5, color:'var(--text2)' }}>{u}</div>
                  </div>
                ))}
              </div>

              <div style={{ height:1, background:'var(--border)', margin:'14px 0' }} />
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>
                {t('patientRecords.medicalHistory')}
              </div>
              <div style={{ position:'relative', paddingLeft:26 }}>
                <div style={{ position:'absolute', left:6, top:0, bottom:0, width:1, background:'var(--border)' }} />
                {selected.notes.map((n, i) => (
                  <div key={i} style={{ position:'relative', marginBottom:14 }}>
                    <div style={{ position:'absolute', left:-22, top:5, width: n.current ? 9 : 7, height: n.current ? 9 : 7, borderRadius:'50%', background: n.current ? 'var(--mint)' : 'var(--text3)', border:'2px solid var(--bg)', boxShadow: n.current ? '0 0 0 3px var(--mint-dim)' : 'none' }} />
                    <div style={{ fontSize:10.5, fontFamily:'var(--font-mono)', color:'var(--text3)', marginBottom:3 }}>{n.date}</div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{n.title}</div>
                    <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{n.desc}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
