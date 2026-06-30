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

const emptyMed = { name:'', dosage:'', frequency:'', duration:'' };

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
  const [form, setForm] = useState({ patientId: presetPatientId, instructions:'', medications:[{ ...emptyMed }] });
  const [saving, setSaving] = useState(false);

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

  const printRx = (rx) => {
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

    const el = document.createElement('div');
    el.id = '__rx_print__';
    el.innerHTML = `
      <style>@media not print { #__rx_print__ { display:none; } } @media print { body > *:not(#__rx_print__) { display:none; } }</style>
      <div style="font-family:Georgia,serif;padding:40px;max-width:600px;margin:0 auto;color:#000">
        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:14px;margin-bottom:20px">
          <div><h2 style="margin:0;font-size:22px">MediConnect</h2><p style="margin:4px 0 0;font-size:12px;color:#555">${pdfTitle}</p></div>
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
        <div style="margin-top:36px;border-top:1px solid #ccc;padding-top:14px;font-size:11px;color:#555;text-align:center">${pdfFooter}</div>
      </div>`;
    document.body.appendChild(el);
    window.print();
    document.body.removeChild(el);
  };

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
      await createPrescription(form);
      load();
      setForm({ patientId: presetPatientId, instructions:'', medications:[{ ...emptyMed }] });
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
    </div>
  );
}
