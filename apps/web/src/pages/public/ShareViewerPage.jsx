import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

function useCountdown(expiresAt) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = new Date(expiresAt) - Date.now();
      if (diff <= 0) { setRemaining('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}h ${m}m ${s}s remaining`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const FLAG_STYLE = {
  normal:   { color: '#0fe3b0', bg: 'rgba(15,227,176,0.08)'  },
  high:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)'  },
  low:      { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)'  },
  critical: { color: '#f43f5e', bg: 'rgba(244,63,94,0.10)'   },
};

export default function ShareViewerPage() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | need_password | viewing | error | expired
  const [password, setPassword] = useState('');
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const countdown = useCountdown(data?.expiresAt);

  const fetch = async (pwd) => {
    try {
      const headers = pwd ? { 'x-share-password': pwd } : {};
      const res = await axios.get(`${API}/share/${token}`, { headers });
      setData(res.data);
      setState('viewing');
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || 'Error';
      if (status === 401) setState('need_password');
      else if (status === 410) { setState('error'); setErrorMsg(msg); }
      else { setState('error'); setErrorMsg(msg); }
    }
  };

  useEffect(() => { fetch(null); }, [token]);

  const containerStyle = {
    minHeight: '100vh',
    background: '#060d18',
    color: '#e2e8f0',
    fontFamily: "'Outfit', sans-serif",
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 60,
  };

  const cardStyle = {
    background: '#0b1628',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '32px 36px',
    width: '100%',
    maxWidth: 680,
    margin: '0 16px',
  };

  if (state === 'loading') return (
    <div style={containerStyle}>
      <div style={{ color: '#0fe3b0', fontSize: 14 }}>Loading secure document…</div>
    </div>
  );

  if (state === 'error') return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Document Unavailable</div>
          <div style={{ fontSize: 13.5, color: '#94a3b8' }}>{errorMsg}</div>
        </div>
      </div>
    </div>
  );

  if (state === 'need_password') return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ fontSize: 28 }}>🔐</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Password Protected</div>
            <div style={{ fontSize: 12.5, color: '#64748b' }}>Enter the password to view this document</div>
          </div>
        </div>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetch(password)}
          placeholder="Enter password"
          autoFocus
          style={{ width: '100%', background: '#060d18', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '11px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
        />
        <button
          onClick={() => fetch(password)}
          style={{ width: '100%', padding: '11px', background: '#0fe3b0', border: 'none', borderRadius: 8, color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          View Document
        </button>
      </div>
    </div>
  );

  if (state === 'viewing' && data) {
    const { resourceType, resource } = data;

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ width: 32, height: 32, background: '#0fe3b0', borderRadius: 7, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800, color: '#000' }}>M</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Salamtak</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Secure shared document</div>
            </div>
            <div style={{ fontSize: 11, color: '#0fe3b0', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>🔒</span> Secure link
            </div>
          </div>
          {data.expiresAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8', marginBottom: 16, padding: '10px 14px', background: 'rgba(15,227,176,0.06)', border: '1px solid rgba(15,227,176,0.18)', borderRadius: 8 }}>
              <span>🔒</span>
              <span>Encrypted, secure link</span>
              {countdown && <span style={{ marginLeft: 'auto', color: '#0fe3b0', fontVariantNumeric: 'tabular-nums' }}>{countdown}</span>}
            </div>
          )}

          {resourceType === 'lab_result' && (
            <>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 6 }}>Laboratory Report</div>
                <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{resource.labName}</div>
                <div style={{ fontSize: 12.5, color: '#94a3b8' }}>
                  Issued: {new Date(resource.issuedAt).toLocaleDateString()} · {resource.tests?.length} test{resource.tests?.length !== 1 ? 's' : ''}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 18 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {['Test Name', 'Value', 'Unit', 'Reference Range', 'Flag'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(resource.tests || []).map((t, i) => {
                    const fs = FLAG_STYLE[t.flag] || FLAG_STYLE.normal;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: t.flag !== 'normal' ? fs.bg : 'transparent' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 500 }}>{t.name}</td>
                        <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: fs.color, fontWeight: 600 }}>{t.value}</td>
                        <td style={{ padding: '9px 12px', color: '#94a3b8' }}>{t.unit}</td>
                        <td style={{ padding: '9px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: 11.5 }}>{t.referenceRange}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: fs.bg, color: fs.color, textTransform: 'uppercase', border: `1px solid ${fs.color}30` }}>
                            {t.flag}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {resource.notes && (
                <div style={{ background: 'rgba(15,227,176,0.05)', border: '1px solid rgba(15,227,176,0.15)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#0fe3b0', marginBottom: 7 }}>Doctor's Interpretation</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: '#cbd5e1' }}>{resource.notes}</div>
                </div>
              )}

              {resource.reportFile && (
                <a href={resource.reportFile} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>
                  ↓ Download Full PDF Report
                </a>
              )}
            </>
          )}

          {resourceType === 'prescription' && (
            <>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 6 }}>Prescription</div>
                <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Ordonnance Médicale</div>
                <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Issued: {new Date(resource.createdAt).toLocaleDateString()}</div>
              </div>

              {(resource.medications || []).map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 13px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#0fe3b0', marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{m.dosage} · {m.frequency} · {m.duration}</div>
                  </div>
                </div>
              ))}

              {resource.instructions && (
                <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                  {resource.instructions}
                </div>
              )}
            </>
          )}

          <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>🔒 This document was shared securely via Salamtak. Do not share this link further.</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
