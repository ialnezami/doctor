import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { getPrescriptions } from '../../api/prescriptions';
import { getLabResults } from '../../api/labResults';
import { getPatientMe } from '../../api/patients';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useIsMobile } from '../../hooks/useIsMobile';

function calcAge(dob) {
  if (!dob) return '—';
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

const FLAG_STYLE = {
  normal:   { color: 'var(--mint)',  bg: 'rgba(15,227,176,0.1)' },
  high:     { color: 'var(--amber)', bg: 'rgba(251,191,36,0.1)' },
  low:      { color: 'var(--amber)', bg: 'rgba(251,191,36,0.1)' },
  critical: { color: 'var(--rose)',  bg: 'rgba(244,63,94,0.12)' },
};

function QRFullscreen({ url, rxNumber, onClose }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 280, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
    }
  }, [url]);

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,0.92)', backdropFilter:'blur(8px)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div onClick={e => e.stopPropagation()} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0fe3b0', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4 }}>MediConnect</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>Prescription Verification</div>
        </div>

        <div style={{ background:'#fff', padding:16, borderRadius:16, boxShadow:'0 0 0 4px rgba(15,227,176,0.25)' }}>
          <canvas ref={canvasRef} style={{ display:'block' }} />
        </div>

        <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:'monospace', fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:6 }}>{rxNumber}</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>Show this to your pharmacist to verify</div>
        </div>

        <button onClick={onClose}
          style={{ marginTop:8, padding:'10px 28px', background:'transparent', border:'1px solid rgba(255,255,255,0.2)', borderRadius:24, color:'rgba(255,255,255,0.6)', fontSize:13, cursor:'pointer' }}>
          Close
        </button>
      </div>
    </div>
  );
}

function PrescriptionModal({ rx, rxNumber, onClose, t }) {
  const qrCanvasRef = useRef(null);
  const [qrFullscreen, setQrFullscreen] = useState(false);
  const verifyUrl = rx.verificationToken
    ? `${window.location.origin}/rx/${rx.verificationToken}`
    : null;

  useEffect(() => {
    if (verifyUrl && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, verifyUrl, { width: 80, margin: 1, color: { dark: '#0fe3b0', light: '#0d1525' } });
    }
  }, [verifyUrl]);

  const handleDownloadPDF = useCallback(async () => {
    const issuedAt = new Date(rx.createdAt).toLocaleDateString();
    const validUntil = rx.validUntil ? new Date(rx.validUntil).toLocaleDateString() : '—';
    const qrDataUrl = verifyUrl ? await QRCode.toDataURL(verifyUrl, { width: 120, margin: 1 }) : null;

    const html = `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Prescription ${rxNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; padding: 40px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0fe3b0; padding-bottom:18px; margin-bottom:24px; }
    .logo { font-size:22px; font-weight:700; color:#0fe3b0; letter-spacing:-0.5px; }
    .rx-meta { text-align:right; font-size:12px; color:#555; }
    .rx-num { font-size:16px; font-weight:700; color:#0fe3b0; margin-bottom:3px; }
    .section { margin-bottom:20px; }
    .section-title { font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:#888; font-weight:600; margin-bottom:8px; }
    .info-row { display:flex; gap:40px; margin-bottom:16px; }
    .info-field { flex:1; }
    .info-label { font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:#888; margin-bottom:2px; }
    .info-value { font-size:14px; font-weight:500; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { text-align:left; padding:8px 12px; background:#f5f5f5; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#555; }
    td { padding:10px 12px; border-bottom:1px solid #eee; }
    tr:last-child td { border-bottom:none; }
    .instructions { background:#f9fffe; border:1px solid #0fe3b060; border-radius:6px; padding:14px; font-size:13px; line-height:1.6; color:#333; }
    .footer { margin-top:36px; padding-top:16px; border-top:1px solid #eee; display:flex; justify-content:space-between; font-size:11px; color:#aaa; }
    .sig-line { margin-top:40px; border-top:1px solid #333; width:200px; padding-top:6px; font-size:11px; color:#555; }
    @media print { body { padding: 20mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">MediConnect</div>
      <div style="font-size:12px;color:#777;margin-top:3px;">Digital Health Platform</div>
    </div>
    <div class="rx-meta">
      <div class="rx-num">${rxNumber}</div>
      <div>Issued: ${issuedAt}</div>
      <div>Valid until: ${validUntil}</div>
    </div>
  </div>

  <div class="info-row">
    <div class="info-field">
      <div class="info-label">Prescribing Physician</div>
      <div class="info-value">${rx.doctorId?.name || '—'}</div>
    </div>
    <div class="info-field">
      <div class="info-label">Patient</div>
      <div class="info-value">${rx.patientId?.name || '—'}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Medications</div>
    <table>
      <thead>
        <tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Duration</th></tr>
      </thead>
      <tbody>
        ${(rx.medications || []).map(m => `
        <tr>
          <td><strong>${m.name}</strong></td>
          <td>${m.dosage}</td>
          <td>${m.frequency}</td>
          <td>${m.duration}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  ${rx.instructions ? `
  <div class="section">
    <div class="section-title">Instructions</div>
    <div class="instructions">${rx.instructions}</div>
  </div>` : ''}

  <div style="margin-top:36px; display:flex; justify-content:flex-end;">
    <div class="sig-line">Physician Signature</div>
  </div>

  <div class="footer">
    <div>
      <div>Generated by MediConnect &mdash; ${new Date().toLocaleString()}</div>
      <div style="margin-top:4px;font-size:10px;">This is a digitally authenticated prescription</div>
    </div>
    ${qrDataUrl ? `
    <div style="text-align:center">
      <img src="${qrDataUrl}" width="80" height="80" style="display:block;margin-bottom:4px;"/>
      <div style="font-size:9px;color:#888;">Scan to verify</div>
    </div>` : ''}
  </div>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=800,height=900');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }, [rx, rxNumber]);

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, width:'100%', maxWidth:560, maxHeight:'90vh', overflow:'auto' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--mint)', fontWeight:600 }}>{rxNumber}</div>
            <div style={{ fontSize:16, fontWeight:600, marginTop:2 }}>{t('records.modal.prescription')}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text2)', fontSize:20, lineHeight:1, padding:4 }}>✕</button>
        </div>

        <div style={{ padding:'20px 20px' }}>
          {/* Meta */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
            {[
              [t('records.modal.doctor'), rx.doctorId?.name || '—'],
              [t('records.modal.patient'), rx.patientId?.name || '—'],
              [t('records.modal.issued'), new Date(rx.createdAt).toLocaleDateString()],
              [t('records.modal.validUntil'), rx.validUntil ? new Date(rx.validUntil).toLocaleDateString() : '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text3)', marginBottom:3 }}>{label}</div>
                <div style={{ fontSize:13, fontWeight:500 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Medications */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>{t('records.modal.medications')}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(rx.medications || []).map((m, i) => (
                <div key={i} style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px' }}>
                  <div style={{ fontSize:13.5, fontWeight:600, color:'var(--mint)', marginBottom:6 }}>{m.name}</div>
                  <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                    {[
                      [t('records.modal.dosage'), m.dosage],
                      [t('records.modal.frequency'), m.frequency],
                      [t('records.modal.duration'), m.duration],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{l}</div>
                        <div style={{ fontSize:12.5, fontWeight:500, marginTop:1 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Instructions */}
          {rx.instructions && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:8 }}>{t('records.modal.instructions')}</div>
              <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', fontSize:13, lineHeight:1.6, color:'var(--text1)' }}>
                {rx.instructions}
              </div>
            </div>
          )}

          {/* QR Code */}
          {verifyUrl && (
            <>
              {qrFullscreen && <QRFullscreen url={verifyUrl} rxNumber={rxNumber} onClose={() => setQrFullscreen(false)} />}
              <div style={{ display:'flex', alignItems:'center', gap:14, padding:'14px', background:'var(--bg3)', border:'1px solid rgba(15,227,176,0.2)', borderRadius:8, marginBottom:16, cursor:'pointer' }}
                onClick={() => setQrFullscreen(true)}>
                <canvas ref={qrCanvasRef} style={{ borderRadius:4, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--mint)', marginBottom:3 }}>Tap to enlarge QR</div>
                  <div style={{ fontSize:11, color:'var(--text2)', lineHeight:1.5 }}>Show to pharmacist or take a photo to verify this prescription's authenticity.</div>
                </div>
                <div style={{ fontSize:18, color:'var(--text3)', flexShrink:0 }}>⛶</div>
              </div>
            </>
          )}

          {/* Actions */}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Button variant="ghost" onClick={onClose} style={{ fontSize:13 }}>{t('common.cancel')}</Button>
            <Button onClick={handleDownloadPDF} style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
              ↓ PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MedicalRecordsPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [rxList, setRxList] = useState([]);
  const [labResults, setLabResults] = useState([]);
  const [patient, setPatient] = useState(null);
  const [tab, setTab] = useState('prescriptions');
  const [selectedRx, setSelectedRx] = useState(null);

  useEffect(() => {
    getPrescriptions().then(setRxList).catch(() => {});
    getLabResults().then(setLabResults).catch(() => {});
    getPatientMe().then(setPatient).catch(() => {});
  }, []);

  const tabs = [
    ['prescriptions', t('records.tabs.prescriptions')],
    ['labs',          t('records.tabs.labs')],
    ['profile',       t('records.tabs.profile')],
  ];

  return (
    <div>
      {selectedRx && (
        <PrescriptionModal
          rx={selectedRx.rx}
          rxNumber={selectedRx.rxNumber}
          onClose={() => setSelectedRx(null)}
          t={t}
        />
      )}
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 26px' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>{t('records.title')}</div>
        <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{t('records.subtitle')}</div>
      </div>
      <div style={{ padding: isMobile ? 14 : 26 }}>
        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)', paddingBottom:12, flexWrap:'wrap' }}>
          {tabs.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding:'6px 16px', borderRadius:8, border:'1px solid', cursor:'pointer', fontSize:13, fontWeight:500, transition:'all .12s',
                background: tab === key ? 'var(--mint-dim)' : 'transparent',
                borderColor: tab === key ? 'rgba(15,227,176,0.2)' : 'transparent',
                color: tab === key ? 'var(--mint)' : 'var(--text2)' }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:18 }}>
          <div>
            {tab === 'prescriptions' && (
              <>
                <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>{t('records.prescriptions')}</div>
                {rxList.length === 0 && <p style={{ color:'var(--text3)', fontSize:13 }}>{t('records.noPrescriptions')}</p>}
                {rxList.map((rx, i) => {
                  const rxNumber = `RX-${String(i + 31).padStart(4, '0')}`;
                  return (
                    <div key={rx._id} onClick={() => setSelectedRx({ rx, rxNumber })}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginBottom:8, cursor:'pointer', transition:'border-color .15s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(15,227,176,0.3)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--mint)', minWidth:64 }}>{rxNumber}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13.5, fontWeight:500 }}>{rx.doctorId?.name}</div>
                        <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{rx.medications?.map(m=>m.name).join(', ')} · {new Date(rx.createdAt).toLocaleDateString()}</div>
                      </div>
                      <Button variant="ghost" onClick={e => { e.stopPropagation(); setSelectedRx({ rx, rxNumber }); }} style={{ padding:'4px 9px', fontSize:11, flexShrink:0 }}>{t('records.downloadPdf')}</Button>
                    </div>
                  );
                })}
              </>
            )}

            {tab === 'labs' && (
              <>
                <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10 }}>{t('records.tabs.labs')}</div>
                {labResults.length === 0 && <p style={{ color:'var(--text3)', fontSize:13 }}>{t('records.noLabResults')}</p>}
                {labResults.map(r => {
                  const worstFlag = r.tests.reduce((acc, tst) => {
                    const order = { critical:3, high:2, low:2, normal:0 };
                    return order[tst.flag] > order[acc] ? tst.flag : acc;
                  }, 'normal');
                  const fs = FLAG_STYLE[worstFlag];
                  return (
                    <div key={r._id} style={{ padding:'12px 14px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:fs.color, flexShrink:0 }} />
                        <div style={{ fontSize:13.5, fontWeight:500, flex:1 }}>{r.labName}</div>
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:10, background:fs.bg, color:fs.color, textTransform:'uppercase' }}>
                          {worstFlag}
                        </span>
                      </div>
                      <div style={{ fontSize:11.5, color:'var(--text2)', marginBottom:6 }}>
                        {r.tests.length} {r.tests.length !== 1 ? t('records.tests_plural') : t('records.tests')} · {new Date(r.issuedAt).toLocaleDateString()}
                      </div>
                      {r.tests.slice(0, 3).map((tst, i) => (
                        <div key={i} style={{ display:'flex', gap:8, fontSize:11.5, color:'var(--text3)', marginBottom:2 }}>
                          <span style={{ flex:1 }}>{tst.name}</span>
                          <span style={{ fontFamily:'var(--font-mono)', color:(FLAG_STYLE[tst.flag]||FLAG_STYLE.normal).color }}>{tst.value} {tst.unit}</span>
                        </div>
                      ))}
                      {r.tests.length > 3 && <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>{t('records.more', { count: r.tests.length - 3 })}</div>}
                      {r.reportFile && (
                        <a href={r.reportFile} target="_blank" rel="noreferrer" style={{ display:'inline-block', marginTop:8 }}>
                          <Button variant="ghost" style={{ padding:'4px 9px', fontSize:11 }}>{t('records.downloadPdf')}</Button>
                        </a>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {tab === 'profile' && (
            <Card>
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:12 }}>{t('records.healthProfile')}</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
                {[
                  [t('records.age'),       calcAge(patient?.dateOfBirth), t('records.years')],
                  [t('records.bloodType'), patient?.bloodType || '—',     ''],
                  [t('records.allergies'), (patient?.allergies?.length ?? '—'), t('records.recorded')],
                ].map(([l,v,u]) => (
                  <div key={l} style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'10px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)' }}>{l}</div>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:600, margin:'3px 0' }}>{v}</div>
                    {u && <div style={{ fontSize:10.5, color:'var(--text2)' }}>{u}</div>}
                  </div>
                ))}
              </div>
              {((patient?.conditions?.length > 0) || (patient?.allergies?.length > 0)) && (
                <>
                  <div style={{ height:1, background:'var(--border)', margin:'12px 0' }} />
                  <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:8 }}>{t('records.conditionsAllergies')}</div>
                  <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
                    {(patient?.conditions || []).map(c => (
                      <span key={c} style={{ padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:'var(--bg3)', border:'1px solid var(--border2)', color:'var(--text2)' }}>{c}</span>
                    ))}
                    {(patient?.allergies || []).map(a => (
                      <span key={a} style={{ padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.3)', color:'var(--rose)' }}>{a} {t('records.allergy')}</span>
                    ))}
                  </div>
                </>
              )}
              {!patient?.dateOfBirth && !patient?.bloodType && (
                <p style={{ color:'var(--text3)', fontSize:13, marginTop:8 }}>{t('records.noProfileData')}</p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
