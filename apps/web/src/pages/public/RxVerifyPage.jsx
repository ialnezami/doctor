import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import client from '../../api/client';

export default function RxVerifyPage() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | valid | invalid
  const [rx, setRx]       = useState(null);

  useEffect(() => {
    client.get(`/prescriptions/verify/${token}`)
      .then(res => { setRx(res.data.prescription); setState('valid'); })
      .catch(() => setState('invalid'));
  }, [token]);

  const base = {
    minHeight: '100vh',
    background: '#060d18',
    color: '#e2e8f0',
    fontFamily: "'Segoe UI', Arial, sans-serif",
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '40px 16px',
  };

  if (state === 'loading') return (
    <div style={base}>
      <div style={{ marginTop: 80, fontSize: 14, color: '#94a3b8' }}>Verifying prescription…</div>
    </div>
  );

  if (state === 'invalid') return (
    <div style={base}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✗</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#f43f5e', marginBottom: 8 }}>
          Invalid Prescription
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>
          This QR code does not match any prescription in our system.<br />
          It may have been tampered with or does not exist.
        </div>
        <div style={{ marginTop: 24, fontSize: 12, color: '#475569' }}>
          Powered by <strong style={{ color: '#0fe3b0' }}>MediConnect</strong>
        </div>
      </div>
    </div>
  );

  return (
    <div style={base}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0fe3b0', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
            MediConnect
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(15,227,176,0.1)', border: '1px solid rgba(15,227,176,0.3)', borderRadius: 24, padding: '6px 16px' }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0fe3b0' }}>Authentic Prescription Verified</span>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 14, overflow: 'hidden' }}>
          {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, borderBottom: '1px solid #1e3a5f' }}>
            {[
              ['Prescribing Doctor', rx.doctor || '—'],
              ['Patient',            rx.patient || '—'],
              ['Issued',             new Date(rx.issuedAt).toLocaleDateString()],
              ['Valid Until',        rx.validUntil ? new Date(rx.validUntil).toLocaleDateString() : 'Not specified'],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: '14px 18px', borderBottom: '1px solid #1e3a5f' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#475569', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Medications */}
          <div style={{ padding: '18px 18px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#475569', marginBottom: 12 }}>
              Medications
            </div>
            {(rx.medications || []).map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: '#060d18', border: '1px solid #1e3a5f', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#0fe3b0', marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{m.name}</div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#94a3b8' }}>
                    <span><span style={{ color: '#475569' }}>Dose: </span>{m.dosage}</span>
                    <span><span style={{ color: '#475569' }}>Freq: </span>{m.frequency}</span>
                    <span><span style={{ color: '#475569' }}>Duration: </span>{m.duration}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {rx.instructions && (
            <div style={{ padding: '0 18px 18px' }}>
              <div style={{ marginTop: 8, padding: '12px 14px', background: '#060d18', border: '1px solid #1e3a5f', borderRadius: 8, fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Instructions: </span>{rx.instructions}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ padding: '14px 18px', borderTop: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#475569' }}>
              Verified · {new Date().toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: '#0fe3b0', fontWeight: 600 }}>
              MediConnect Digital Health
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
