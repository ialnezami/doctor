import { useState, useEffect } from 'react';
import { getLabResults, searchLabResults, addLabNotes, createShareLink, revokeShareLink } from '../../api/labResults';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

const FLAG_STYLE = {
  normal:   { color: 'var(--mint)',  bg: 'rgba(15,227,176,0.1)',  label: 'Normal' },
  high:     { color: 'var(--amber)', bg: 'rgba(251,191,36,0.1)',  label: 'High' },
  low:      { color: 'var(--amber)', bg: 'rgba(251,191,36,0.1)',  label: 'Low' },
  critical: { color: 'var(--rose)',  bg: 'rgba(244,63,94,0.12)',  label: 'Critical' },
};

function FlagBadge({ flag }) {
  const s = FLAG_STYLE[flag] || FLAG_STYLE.normal;
  return (
    <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:10, background:s.bg, color:s.color, textTransform:'uppercase', letterSpacing:'0.05em' }}>
      {s.label}
    </span>
  );
}

function ShareModal({ result, onClose }) {
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState('24h');
  const [link, setLink] = useState(null);
  const [copying, setCopying] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const generate = async () => {
    const res = await createShareLink({
      resourceType: 'lab_result',
      resourceId: result._id,
      password: password || undefined,
      expiry,
    });
    setLink(res);
  };

  const copy = () => {
    navigator.clipboard.writeText(`${window.location.origin}/s/${link.token}`);
    setCopying(true);
    setTimeout(() => setCopying(false), 1500);
  };

  const revoke = async () => {
    setRevoking(true);
    await revokeShareLink(link.token).catch(() => {});
    setLink(null);
    setRevoking(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'grid', placeItems:'center', zIndex:100 }} onClick={onClose}>
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:28, width:420, maxWidth:'90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <span style={{ fontSize:20 }}>🔗</span>
          <div>
            <div style={{ fontSize:15, fontWeight:600 }}>Share Lab Result</div>
            <div style={{ fontSize:11.5, color:'var(--text2)' }}>{result.labName}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--text3)', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>

        {!link ? (
          <>
            <div style={{ marginBottom:14 }}>
              <label style={labelStyle}>Password (optional)</label>
              <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank for no password" style={inputStyle} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={labelStyle}>Link Expiry</label>
              <select value={expiry} onChange={e => setExpiry(e.target.value)} style={inputStyle}>
                <option value="1h">1 hour</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="">Never</option>
              </select>
            </div>
            <Button style={{ width:'100%' }} onClick={generate}>Generate Secure Link</Button>
          </>
        ) : (
          <>
            <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 13px', marginBottom:14 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--mint)', wordBreak:'break-all' }}>
                {window.location.origin}/s/{link.token}
              </div>
            </div>
            {link.expiresAt && (
              <div style={{ fontSize:11.5, color:'var(--text3)', marginBottom:14 }}>
                Expires: {new Date(link.expiresAt).toLocaleString()}
              </div>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <Button onClick={copy} style={{ flex:1 }}>{copying ? 'Copied!' : 'Copy Link'}</Button>
              <Button variant="ghost" onClick={revoke} disabled={revoking} style={{ color:'var(--rose)' }}>
                {revoking ? '…' : 'Revoke'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle = { display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:7 };
const inputStyle = { width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:8, padding:'10px 13px', color:'var(--text)', fontSize:13.5, outline:'none', boxSizing:'border-box' };

export default function LabResultsPage() {
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [search, setSearch] = useState('');
  const [shareTarget, setShareTarget] = useState(null);

  const load = () => getLabResults().then(setResults).catch(() => {});
  useEffect(() => { load(); }, []);

  const doSearch = async () => {
    if (!search.trim()) return load();
    searchLabResults({ q: search }).then(setResults).catch(() => {});
  };

  const selectResult = (r) => { setSelected(r); setNotes(r.notes || ''); };

  const saveNotes = async () => {
    if (!selected) return;
    setSavingNotes(true);
    try {
      const updated = await addLabNotes(selected._id, notes);
      setSelected(updated);
      setResults(prev => prev.map(r => r._id === updated._id ? updated : r));
    } catch {} finally { setSavingNotes(false); }
  };

  const worstFlag = (tests) => {
    const order = { critical: 3, high: 2, low: 2, normal: 0 };
    return tests.reduce((acc, t) => (order[t.flag] > order[acc] ? t.flag : acc), 'normal');
  };

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'14px 26px', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>Lab Results</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>Patient laboratory reports</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key==='Enter' && doSearch()}
            placeholder="Search tests, lab names…" style={{ ...inputStyle, width:220, padding:'8px 13px' }} />
          <Button variant="ghost" onClick={doSearch}>Search</Button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.6fr', gap:0, height:'calc(100vh - 57px)' }}>
        {/* List */}
        <div style={{ borderRight:'1px solid var(--border)', overflowY:'auto', padding:16 }}>
          {results.length === 0 && (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text3)' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>🧪</div>
              <div style={{ fontSize:13 }}>No lab results yet</div>
            </div>
          )}
          {results.map(r => {
            const flag = worstFlag(r.tests);
            const fs = FLAG_STYLE[flag];
            const isActive = selected?._id === r._id;
            return (
              <div key={r._id} onClick={() => selectResult(r)}
                style={{ padding:'12px 14px', borderRadius:8, border:'1px solid', marginBottom:8, cursor:'pointer', transition:'all .12s',
                  borderColor: isActive ? 'var(--mint)' : 'var(--border)',
                  background: isActive ? 'rgba(15,227,176,0.04)' : 'var(--bg3)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:fs.color, flexShrink:0 }} />
                  <div style={{ fontSize:13.5, fontWeight:500, flex:1 }}>{r.labName}</div>
                  <FlagBadge flag={flag} />
                </div>
                <div style={{ fontSize:11.5, color:'var(--text2)' }}>
                  {r.patientId?.name || 'Patient'} · {r.tests.length} test{r.tests.length !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:3, fontFamily:'var(--font-mono)' }}>
                  {new Date(r.issuedAt).toLocaleDateString()}
                  {r.status === 'ready' && <span style={{ marginLeft:8, color:'var(--mint)' }}>● Ready</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail */}
        <div style={{ overflowY:'auto', padding:22 }}>
          {!selected ? (
            <div style={{ display:'grid', placeItems:'center', height:'100%', color:'var(--text3)' }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:48, marginBottom:12, opacity:0.4 }}>🔬</div>
                <div style={{ fontSize:13 }}>Select a result to view details</div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:20 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:19, fontWeight:600, marginBottom:4 }}>{selected.labName}</div>
                  <div style={{ fontSize:12.5, color:'var(--text2)' }}>
                    Patient: {selected.patientId?.name} · Issued: {new Date(selected.issuedAt).toLocaleDateString()}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setShareTarget(selected)} style={{ fontSize:12 }}>🔗 Share</Button>
                {selected.reportFile && (
                  <a href={selected.reportFile} target="_blank" rel="noreferrer">
                    <Button variant="ghost" style={{ fontSize:12 }}>↓ PDF</Button>
                  </a>
                )}
              </div>

              {/* Tests table */}
              <Card style={{ marginBottom:18, padding:0, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'var(--bg3)' }}>
                      {['Test Name','Value','Unit','Range','Flag'].map(h => (
                        <th key={h} style={{ padding:'9px 13px', textAlign:'left', fontSize:10.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', borderBottom:'1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.tests.map((t, i) => {
                      const fs = FLAG_STYLE[t.flag];
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid var(--border)', background: t.flag !== 'normal' ? fs.bg : 'transparent' }}>
                          <td style={{ padding:'9px 13px', fontWeight:500 }}>{t.name}</td>
                          <td style={{ padding:'9px 13px', fontFamily:'var(--font-mono)', color:fs.color, fontWeight:600 }}>{t.value}</td>
                          <td style={{ padding:'9px 13px', color:'var(--text2)' }}>{t.unit}</td>
                          <td style={{ padding:'9px 13px', color:'var(--text3)', fontFamily:'var(--font-mono)', fontSize:11.5 }}>{t.referenceRange}</td>
                          <td style={{ padding:'9px 13px' }}><FlagBadge flag={t.flag} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              {/* Doctor notes */}
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:8 }}>Interpretation Notes</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Add clinical interpretation…"
                style={{ ...inputStyle, resize:'vertical', minHeight:90, marginBottom:10 }} />
              <Button onClick={saveNotes} disabled={savingNotes}>{savingNotes ? 'Saving…' : 'Save Notes'}</Button>
            </>
          )}
        </div>
      </div>

      {shareTarget && <ShareModal result={shareTarget} onClose={() => setShareTarget(null)} />}
    </div>
  );
}
