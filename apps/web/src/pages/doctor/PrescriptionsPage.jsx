import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import QRCode from 'qrcode';
import { getPrescriptions, createPrescription } from '../../api/prescriptions';
import { getAppointments } from '../../api/appointments';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ComboSelect from '../../components/ui/ComboSelect';
import { useIsMobile } from '../../hooks/useIsMobile';

const DOSAGE_OPTIONS = [
  '2.5mg','5mg','10mg','20mg','25mg','40mg','50mg',
  '75mg','100mg','125mg','150mg','200mg','250mg',
  '400mg','500mg','600mg','800mg','1g','1.5g','2g',
  '5ml','10ml','15ml','20ml',
  '1 puff','2 puffs','1 drop','2 drops',
  '1 patch','½ tablet','1 tablet','2 tablets',
];

const FREQUENCY_KEYS = [
  'onceDaily','twiceDaily','threeTimesDaily','fourTimesDaily',
  'every6h','every8h','every12h','every24h',
  'withMeals','beforeMeals','afterMeals','beforeBreakfast',
  'atBedtime','inMorning','asNeeded','alternateDays','weekly',
];

const DURATION_KEYS = [
  '1day','3days','5days','7days','10days','14days',
  '21days','1month','6weeks','2months','3months',
  '6months','1year','ongoing','untilFinished',
];

const emptyMed      = { name:'', dosage:'', frequency:'', duration:'' };
const emptyAnalysis = { name:'', instructions:'' };

const LAB_TESTS = [
  'CBC (Complete Blood Count)', 'Blood Glucose (Fasting)', 'Blood Glucose (Random)',
  'HbA1c', 'Lipid Panel', 'Total Cholesterol', 'HDL / LDL',
  'Liver Function Tests (LFT)', 'AST / ALT / ALP / GGT / Bilirubin',
  'Kidney Function Tests (KFT)', 'Creatinine / Urea / BUN / eGFR',
  'Electrolytes (Na / K / Cl / HCO₃)', 'Thyroid (TSH)', 'Free T3 / Free T4',
  'Urine Analysis (UA)', 'Urine Culture', 'Blood Culture',
  'CRP (C-Reactive Protein)', 'ESR (Erythrocyte Sedimentation Rate)',
  'INR / PT / PTT', 'D-Dimer', 'Ferritin / Serum Iron / TIBC',
  'Vitamin D (25-OH)', 'Vitamin B12', 'Folic Acid',
  'PSA (Prostate-Specific Antigen)', 'Beta-hCG (Pregnancy Test)',
  'COVID-19 PCR', 'Influenza A/B', 'Hepatitis B (HBsAg)', 'Hepatitis C (Anti-HCV)',
  'HIV Antibody', 'Serum Protein Electrophoresis', 'Chest X-Ray', 'ECG',
  'Abdominal Ultrasound', 'Echocardiogram',
];

function RxQR({ token }) {
  const canvasRef = useRef(null);
  const [enlarged, setEnlarged] = useState(false);
  const url = `${window.location.origin}/rx/${token}`;

  useEffect(() => {
    if (!token || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 72, margin: 1, color: { dark: '#0fe3b0', light: '#0a1628' } });
  }, [token, url]);

  return (
    <>
      <canvas
        ref={canvasRef}
        title="Scan to verify prescription"
        onClick={() => setEnlarged(true)}
        style={{ cursor: 'pointer', borderRadius: 6, border: '1px solid rgba(15,227,176,0.2)', flexShrink: 0 }}
      />
      {enlarged && (
        <div
          onClick={() => setEnlarged(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}
        >
          <canvas ref={el => { if (el) QRCode.toCanvas(el, url, { width: 260, margin: 2, color: { dark: '#0fe3b0', light: '#0a1628' } }); }} style={{ borderRadius:10 }} />
          <span style={{ color:'#94a3b8', fontSize:12 }}>Tap anywhere to close</span>
        </div>
      )}
    </>
  );
}

function RxQRLarge({ token }) {
  const url = `${window.location.origin}/rx/${token}`;
  return (
    <canvas ref={el => {
      if (el) QRCode.toCanvas(el, url, { width: 200, margin: 2, color: { dark: '#0fe3b0', light: '#0a1628' } });
    }} style={{ borderRadius: 10, display: 'block', margin: '0 auto' }} />
  );
}

export default function PrescriptionsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const FREQUENCY_OPTIONS = FREQUENCY_KEYS.map(k => t(`prescriptions.frequencyOptions.${k}`));
  const DURATION_OPTIONS  = DURATION_KEYS.map(k => t(`prescriptions.durationOptions.${k}`));
  const isMobile = useIsMobile();

  const presetPatientId   = location.state?.patientId   || '';
  const presetPatientName = location.state?.patientName || '';

  const [rxList, setRxList] = useState([]);
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({ patientId: presetPatientId, instructions:'', medications:[{ ...emptyMed }], analyses:[] });
  const [labQuery, setLabQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdRx, setCreatedRx] = useState(null); // triggers success modal

  const load = () => getPrescriptions().then(setRxList).catch(() => {});
  useEffect(() => { load(); }, []);

  useEffect(() => {
    getAppointments().then(appts => {
      const seen = new Set();
      const unique = [];
      for (const a of appts) {
        const pid = a.patientId?._id;
        if (pid && !seen.has(pid)) { seen.add(pid); unique.push({ id: pid, name: a.patientId.name }); }
      }
      setPatients(unique);
    }).catch(() => {});
  }, []);

  const printRx = async (rx) => {
    const pdfTitle   = t('prescriptions.pdf.title');
    const pdfDate    = t('prescriptions.pdf.date');
    const pdfRx      = t('prescriptions.pdf.rx');
    const pdfPatient = t('prescriptions.pdf.patient');
    const pdfFooter  = t('prescriptions.pdf.footer');
    const pdfInstr   = t('prescriptions.pdf.instructions');
    const pdfHeaders = [
      t('prescriptions.pdf.medication'),
      t('prescriptions.pdf.dosage'),
      t('prescriptions.pdf.frequency'),
      t('prescriptions.pdf.duration'),
    ];

    let qrImg = '';
    if (rx.verificationToken) {
      const url = `${window.location.origin}/rx/${rx.verificationToken}`;
      const dataUrl = await QRCode.toDataURL(url, { width: 120, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
      qrImg = `<img src="${dataUrl}" width="120" height="120" style="display:block" alt="QR" />`;
    }

    const el = document.createElement('div');
    el.id = '__rx_print__';
    el.innerHTML = `
      <style>@media not print { #__rx_print__ { display:none; } } @media print { body > *:not(#__rx_print__) { display:none; } }</style>
      <div style="font-family:Georgia,serif;padding:40px;max-width:620px;margin:0 auto;color:#000">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:14px;margin-bottom:20px">
          <div><h2 style="margin:0;font-size:22px">Salamtak</h2><p style="margin:4px 0 0;font-size:12px;color:#555">${pdfTitle}</p></div>
          <div style="text-align:right;font-size:12px">
            <div>${pdfDate}: ${new Date(rx.createdAt).toLocaleDateString()}</div>
            <div>${pdfRx}${String(rx._id).slice(-6).toUpperCase()}</div>
          </div>
        </div>
        <div style="margin-bottom:18px;font-size:13px"><strong>${pdfPatient}:</strong> ${rx.patientId?.name || '—'}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f5f5f5">${pdfHeaders.map(h=>`<th style="border:1px solid #ddd;padding:6px 10px;text-align:left">${h}</th>`).join('')}</tr></thead>
          <tbody>${(rx.medications||[]).map(m=>`<tr>${[m.name,m.dosage,m.frequency,m.duration].map(v=>`<td style="border:1px solid #ddd;padding:6px 10px">${v||'—'}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
        ${rx.instructions ? `<div style="margin-top:18px;font-size:13px"><strong>${pdfInstr}:</strong> ${rx.instructions}</div>` : ''}
        ${(rx.analyses||[]).length > 0 ? `
        <div style="margin-top:20px">
          <strong style="font-size:13px">${t('prescriptions.analyses','Lab Analysis Requests')}:</strong>
          <ul style="margin:8px 0 0;padding-left:20px;font-size:13px">
            ${rx.analyses.map(a=>`<li><strong>${a.name}</strong>${a.instructions?` — ${a.instructions}`:''}</li>`).join('')}
          </ul>
        </div>` : ''}
        ${qrImg ? `
        <div style="margin-top:28px;display:flex;align-items:center;gap:20px;border-top:1px solid #eee;padding-top:20px">
          ${qrImg}
          <div style="font-size:11px;color:#555;line-height:1.6">
            <strong style="font-size:12px;color:#000">Verify this prescription</strong><br/>
            Scan the QR code or visit:<br/>
            <span style="font-family:monospace;font-size:10px">${window.location.origin}/rx/${rx.verificationToken}</span>
          </div>
        </div>` : ''}
        <div style="margin-top:24px;border-top:1px solid #ccc;padding-top:14px;font-size:11px;color:#555;text-align:center">${pdfFooter}</div>
      </div>`;
    document.body.appendChild(el);
    window.print();
    document.body.removeChild(el);
  };

  const addAnalysis    = (name) => { setForm(p => ({ ...p, analyses: [...p.analyses, { ...emptyAnalysis, name }] })); setLabQuery(''); };
  const removeAnalysis = (i)    => setForm(p => ({ ...p, analyses: p.analyses.filter((_,idx) => idx !== i) }));
  const updateAnalysis = (i, v) => setForm(p => { const a=[...p.analyses]; a[i]={...a[i],instructions:v}; return {...p,analyses:a}; });

  const addMed = () => setForm(p => ({ ...p, medications: [...p.medications, { ...emptyMed }] }));
  const removeMed = (i) => setForm(p => ({
    ...p,
    medications: p.medications.length > 1 ? p.medications.filter((_, idx) => idx !== i) : p.medications,
  }));
  const updateMed = (i, field, val) => setForm(p => {
    const meds = [...p.medications]; meds[i] = { ...meds[i], [field]: val }; return { ...p, medications: meds };
  });

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const rx = await createPrescription(form);
      load();
      setForm({ patientId: presetPatientId, instructions:'', medications:[{ ...emptyMed }], analyses:[] });
      setCreatedRx(rx);
    } catch {} finally { setSaving(false); }
  };

  const ACCENT = ['var(--mint)','var(--amber)','var(--blue)','var(--rose)'];

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>{t('prescriptions.title')}</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{t('prescriptions.subtitle')}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <Button variant="ghost">{t('prescriptions.exportPdf')}</Button>
          <Button type="submit" form="rx-form" disabled={saving}>
            {saving ? t('prescriptions.saving') : t('prescriptions.saveSign')}
          </Button>
        </div>
      </div>
      <div style={{ padding: isMobile ? 14 : 26 }}>
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:18 }}>
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
                <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:7 }}>
                  {t('prescriptions.patient', 'Patient')}
                </label>
                {presetPatientId ? (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--mint-dim)', border:'1px solid rgba(15,227,176,0.3)', borderRadius:'var(--r-sm)', padding:'10px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                      <span style={{ fontSize:14 }}>👤</span>
                      <span style={{ fontSize:13.5, fontWeight:600, color:'var(--mint)' }}>{presetPatientName}</span>
                    </div>
                    <span style={{ fontSize:11, color:'var(--mint)', opacity:0.7 }}>pre-selected</span>
                  </div>
                ) : (
                  <select
                    value={form.patientId}
                    onChange={e => setForm(p => ({ ...p, patientId: e.target.value }))}
                    required
                    style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color: form.patientId ? 'var(--text)' : 'var(--text3)', fontSize:13.5, outline:'none', cursor:'pointer' }}
                  >
                    <option value="">{t('prescriptions.selectPatient', '— Select patient —')}</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ height:1, background:'var(--border)', margin:'14px 0' }} />
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>
                {t('prescriptions.medications')}
              </div>

              {form.medications.map((med, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginBottom:7 }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:ACCENT[i % ACCENT.length], flexShrink:0 }} />
                  <input value={med.name} onChange={e => updateMed(i,'name',e.target.value)} placeholder={t('prescriptions.drugName')} style={{ flex:2, background:'transparent', border:'none', outline:'none', color:'var(--text)', fontSize:13.5 }} />
                  <ComboSelect
                    value={med.dosage}
                    onChange={val => updateMed(i,'dosage',val)}
                    options={DOSAGE_OPTIONS}
                    placeholder={t('prescriptions.dose')}
                    inputStyle={{ flex:1, color:'var(--mint)', fontSize:11.5, fontFamily:'var(--font-mono)' }}
                  />
                  <ComboSelect
                    value={med.frequency}
                    onChange={val => updateMed(i,'frequency',val)}
                    options={FREQUENCY_OPTIONS}
                    placeholder={t('prescriptions.freq')}
                    inputStyle={{ flex:1, color:'var(--text2)', fontSize:11.5 }}
                  />
                  <ComboSelect
                    value={med.duration}
                    onChange={val => updateMed(i,'duration',val)}
                    options={DURATION_OPTIONS}
                    placeholder={t('prescriptions.duration')}
                    inputStyle={{ flex:1, color:'var(--text2)', fontSize:11.5 }}
                  />
                  {form.medications.length > 1 && (
                    <button type="button" onClick={() => removeMed(i)}
                      style={{ background:'transparent', border:'none', color:'var(--rose)', fontSize:16, cursor:'pointer', padding:'0 2px', lineHeight:1, flexShrink:0, opacity:0.7 }}
                      title="Remove medication">
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addMed}
                style={{ width:'100%', padding:'9px', background:'transparent', border:'1px dashed var(--border2)', borderRadius:'var(--r-sm)', color:'var(--text2)', fontSize:12.5, marginTop:4, cursor:'pointer' }}>
                {t('prescriptions.addMedication')}
              </button>

              <div style={{ height:1, background:'var(--border)', margin:'14px 0' }} />
              {/* Lab Analysis Requests */}
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>
                {t('prescriptions.analyses', 'Lab Analysis Requests')}
              </div>
              <div style={{ position:'relative', marginBottom:8 }}>
                <input
                  value={labQuery}
                  onChange={e => setLabQuery(e.target.value)}
                  placeholder={t('prescriptions.searchTest', 'Search test (e.g. CBC, HbA1c…)')}
                  style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'9px 13px', color:'var(--text)', fontSize:13, outline:'none' }}
                />
                {labQuery.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', zIndex:50, maxHeight:180, overflowY:'auto', marginTop:2 }}>
                    {LAB_TESTS.filter(t => t.toLowerCase().includes(labQuery.toLowerCase())).slice(0,8).map(test => (
                      <div key={test} onMouseDown={() => addAnalysis(test)}
                        style={{ padding:'8px 13px', fontSize:12.5, cursor:'pointer', color:'var(--text)' }}
                        onMouseEnter={e => e.currentTarget.style.background='var(--bg3)'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        {test}
                      </div>
                    ))}
                    {LAB_TESTS.filter(t => t.toLowerCase().includes(labQuery.toLowerCase())).length === 0 && (
                      <div onMouseDown={() => addAnalysis(labQuery)}
                        style={{ padding:'8px 13px', fontSize:12.5, cursor:'pointer', color:'var(--mint)' }}>
                        + Add "{labQuery}"
                      </div>
                    )}
                  </div>
                )}
              </div>
              {form.analyses.map((a, i) => (
                <div key={i} style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'10px 12px', marginBottom:7 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:13, fontWeight:500, color:'var(--amber)' }}>🧪 {a.name}</span>
                    <button type="button" onClick={() => removeAnalysis(i)} style={{ background:'transparent', border:'none', color:'var(--rose)', fontSize:16, cursor:'pointer', lineHeight:1 }}>×</button>
                  </div>
                  <input
                    value={a.instructions}
                    onChange={e => updateAnalysis(i, e.target.value)}
                    placeholder={t('prescriptions.analysisInstructions', 'Instructions (e.g. fasting 8h, urgent…)')}
                    style={{ width:'100%', background:'transparent', border:'none', borderBottom:'1px solid var(--border)', outline:'none', color:'var(--text2)', fontSize:12, padding:'4px 0' }}
                  />
                </div>
              ))}

              <div style={{ height:1, background:'var(--border)', margin:'14px 0' }} />
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:7 }}>
                  {t('prescriptions.clinicalNotes')}
                </label>
                <textarea value={form.instructions} onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))} rows={3}
                  style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13, outline:'none', resize:'vertical', minHeight:80 }} />
              </div>
            </form>
          </Card>

          <div>
            <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>
              {t('prescriptions.recentPrescriptions')}
            </div>
            {rxList.map((rx, i) => (
              <div key={rx._id || i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginBottom:8 }}>
                {rx.verificationToken && <RxQR token={rx.verificationToken} />}
                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--mint)', minWidth:64 }}>RX-{String(i+48).padStart(4,'0')}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:500 }}>{rx.patientId?.name || t('appointments.details.patient')}</div>
                  <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{rx.medications?.map(m=>m.name).join(', ')} · {new Date(rx.createdAt).toLocaleDateString()}</div>
                </div>
                <Button variant="ghost" style={{ padding:'4px 9px', fontSize:11 }} onClick={() => printRx(rx)}>
                  🖨 {t('prescriptions.print')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {createdRx && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:28, maxWidth:380, width:'100%', textAlign:'center' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--mint)', marginBottom:4 }}>✓ {t('prescriptions.saveSign')}</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:20 }}>
              RX-{String(createdRx._id).slice(-6).toUpperCase()}
            </div>

            {createdRx.verificationToken && (
              <>
                <RxQRLarge token={createdRx.verificationToken} />
                <div style={{ marginTop:14, display:'flex', alignItems:'center', gap:8, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'8px 12px' }}>
                  <span style={{ flex:1, fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--text2)', textAlign:'left', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {window.location.origin}/rx/{createdRx.verificationToken}
                  </span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/rx/${createdRx.verificationToken}`)}
                    style={{ background:'transparent', border:'none', color:'var(--mint)', cursor:'pointer', fontSize:12, flexShrink:0 }}
                  >
                    Copy
                  </button>
                </div>
              </>
            )}

            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <Button variant="ghost" full onClick={() => { printRx(createdRx); }}>
                🖨 {t('prescriptions.print')}
              </Button>
              <Button full onClick={() => setCreatedRx(null)}>
                {t('common.done', 'Done')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
