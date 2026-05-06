import { useState, useEffect } from 'react';
import { getPrescriptions, createPrescription } from '../../api/prescriptions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

const emptyMed = { name:'', dosage:'', frequency:'', duration:'' };

export default function PrescriptionsPage() {
  const [rxList, setRxList] = useState([]);
  const [form, setForm] = useState({ patientId:'', instructions:'', medications:[{ ...emptyMed }] });
  const [saving, setSaving] = useState(false);

  const load = () => getPrescriptions().then(setRxList).catch(() => {});
  useEffect(() => { load(); }, []);

  const addMed = () => setForm(p => ({ ...p, medications: [...p.medications, { ...emptyMed }] }));
  const updateMed = (i, field, val) => setForm(p => {
    const meds = [...p.medications]; meds[i] = { ...meds[i], [field]: val }; return { ...p, medications: meds };
  });

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await createPrescription(form); load(); setForm({ patientId:'', instructions:'', medications:[{ ...emptyMed }] }); }
    catch {} finally { setSaving(false); }
  };

  const ACCENT = ['var(--mint)','var(--amber)','var(--blue)','var(--rose)'];

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div><div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>Prescriptions</div><div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>Digital ordonnances</div></div>
        <div style={{ display:'flex', gap:8 }}>
          <Button variant="ghost">↓ Export PDF</Button>
          <Button type="submit" form="rx-form" disabled={saving}>{saving ? 'Saving…' : 'Save & Sign'}</Button>
        </div>
      </div>
      <div style={{ padding:26 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
          <Card>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingBottom:14, borderBottom:'1px solid var(--border)', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)' }}>Ordonnance Médicale</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--text3)', marginTop:3 }}>RX-{Date.now().toString().slice(-6)}</div>
              </div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:44, fontWeight:600, color:'var(--mint)', lineHeight:1, opacity:0.3 }}>℞</div>
            </div>

            <form id="rx-form" onSubmit={submit}>
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:7 }}>Patient ID</label>
                <input value={form.patientId} onChange={e => setForm(p => ({ ...p, patientId: e.target.value }))} placeholder="Patient ID"
                  style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13.5, outline:'none' }} />
              </div>

              <div style={{ height:1, background:'var(--border)', margin:'14px 0' }} />
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>Medications</div>

              {form.medications.map((med, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginBottom:7 }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:ACCENT[i % ACCENT.length], flexShrink:0 }} />
                  <input value={med.name} onChange={e => updateMed(i,'name',e.target.value)} placeholder="Drug name" style={{ flex:2, background:'transparent', border:'none', outline:'none', color:'var(--text)', fontSize:13.5 }} />
                  <input value={med.dosage} onChange={e => updateMed(i,'dosage',e.target.value)} placeholder="Dose" style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'var(--mint)', fontSize:11.5, fontFamily:'var(--font-mono)' }} />
                  <input value={med.frequency} onChange={e => updateMed(i,'frequency',e.target.value)} placeholder="Freq." style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'var(--text2)', fontSize:11.5 }} />
                  <input value={med.duration} onChange={e => updateMed(i,'duration',e.target.value)} placeholder="Duration" style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'var(--text2)', fontSize:11.5 }} />
                </div>
              ))}
              <button type="button" onClick={addMed}
                style={{ width:'100%', padding:'9px', background:'transparent', border:'1px dashed var(--border2)', borderRadius:'var(--r-sm)', color:'var(--text2)', fontSize:12.5, marginTop:4, cursor:'pointer' }}>
                + Add Medication
              </button>

              <div style={{ height:1, background:'var(--border)', margin:'14px 0' }} />
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:7 }}>Clinical Notes</label>
                <textarea value={form.instructions} onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))} rows={3}
                  style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13, outline:'none', resize:'vertical', minHeight:80 }} />
              </div>
            </form>
          </Card>

          <div>
            <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>Recent Prescriptions</div>
            {rxList.map((rx, i) => (
              <div key={rx._id || i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginBottom:8 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--mint)', minWidth:64 }}>RX-{String(i+48).padStart(4,'0')}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:500 }}>{rx.patientId?.name || 'Patient'}</div>
                  <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{rx.medications?.map(m=>m.name).join(', ')} · {new Date(rx.createdAt).toLocaleDateString()}</div>
                </div>
                <Button variant="ghost" style={{ padding:'4px 9px', fontSize:11 }}>PDF</Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
