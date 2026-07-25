import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getLabResults, getLabResult, searchLabResults, addLabNotes, interpret, createShareLink, revokeShareLink } from '../../api/labResults';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useIsMobile } from '../../hooks/useIsMobile';

function FlagBadge({ flag, t }) {
  const FLAGS = {
    normal:   { color: 'var(--mint)',  bg: 'rgba(15,227,176,0.1)' },
    high:     { color: 'var(--amber)', bg: 'rgba(251,191,36,0.1)' },
    low:      { color: 'var(--amber)', bg: 'rgba(251,191,36,0.1)' },
    critical: { color: 'var(--rose)',  bg: 'rgba(244,63,94,0.12)' },
  };
  const s = FLAGS[flag] || FLAGS.normal;
  return (
    <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:10, background:s.bg, color:s.color, textTransform:'uppercase', letterSpacing:'0.05em' }}>
      {t(`labResults.flags.${flag}`, flag)}
    </span>
  );
}

function ShareModal({ result, onClose, t }) {
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
            <div style={{ fontSize:15, fontWeight:600 }}>{t('labResults.shareModal.title')}</div>
            <div style={{ fontSize:11.5, color:'var(--text2)' }}>{result.labName}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--text3)', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>

        {!link ? (
          <>
            <div style={{ marginBottom:14 }}>
              <label style={labelStyle}>{t('labResults.shareModal.password')}</label>
              <input value={password} onChange={e => setPassword(e.target.value)}
                placeholder={t('labResults.shareModal.passwordPlaceholder')} style={inputStyle} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={labelStyle}>{t('labResults.shareModal.expiry')}</label>
              <select value={expiry} onChange={e => setExpiry(e.target.value)} style={inputStyle}>
                <option value="1h">{t('labResults.shareModal.1h')}</option>
                <option value="24h">{t('labResults.shareModal.24h')}</option>
                <option value="7d">{t('labResults.shareModal.7d')}</option>
                <option value="">{t('labResults.shareModal.never')}</option>
              </select>
            </div>
            <Button style={{ width:'100%' }} onClick={generate}>{t('labResults.shareModal.generate')}</Button>
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
                {t('labResults.shareModal.expires')} {new Date(link.expiresAt).toLocaleString()}
              </div>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <Button onClick={copy} style={{ flex:1 }}>
                {copying ? t('labResults.shareModal.copied') : t('labResults.shareModal.copyLink')}
              </Button>
              <Button variant="ghost" onClick={revoke} disabled={revoking} style={{ color:'var(--rose)' }}>
                {revoking ? t('labResults.shareModal.revoking') : t('labResults.shareModal.revoke')}
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

// Per-result AI interpretation state: { loading, summary, error }
function useLabInterpretation() {
  const [aiState, setAiState] = useState({});
  const pollTimers = useRef({});

  const startInterpret = async (result) => {
    const id = result._id;
    setAiState(prev => ({ ...prev, [id]: { loading: true, summary: null, error: null } }));
    try {
      await interpret(id);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to queue interpretation';
      setAiState(prev => ({ ...prev, [id]: { loading: false, summary: null, error: msg } }));
      return;
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 5;
    const poll = async () => {
      attempts += 1;
      try {
        const updated = await getLabResult(id);
        if (updated?.aiInterpretation?.processedAt) {
          setAiState(prev => ({
            ...prev,
            [id]: { loading: false, summary: updated.aiInterpretation.summary, error: null },
          }));
          return;
        }
      } catch {} // ignore transient poll errors
      if (attempts < MAX_ATTEMPTS) {
        pollTimers.current[id] = setTimeout(poll, 2000);
      } else {
        setAiState(prev => ({
          ...prev,
          [id]: { loading: false, summary: null, error: 'Interpretation is taking longer than expected. Try again shortly.' },
        }));
      }
    };
    pollTimers.current[id] = setTimeout(poll, 2000);
  };

  useEffect(() => () => Object.values(pollTimers.current).forEach(clearTimeout), []);

  return { aiState, startInterpret };
}

export default function LabResultsPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [search, setSearch] = useState('');
  const [shareTarget, setShareTarget] = useState(null);
  const { aiState, startInterpret } = useLabInterpretation();

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
    return tests.reduce((acc, test) => (order[test.flag] > order[acc] ? test.flag : acc), 'normal');
  };

  const flagColor = (flag) => {
    const MAP = { normal: 'var(--mint)', high: 'var(--amber)', low: 'var(--amber)', critical: 'var(--rose)' };
    return MAP[flag] || MAP.normal;
  };

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 26px', display:'flex', alignItems:'center', gap:12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>{t('labResults.title')}</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{t('labResults.subtitle')}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', width: isMobile ? '100%' : 'auto' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key==='Enter' && doSearch()}
            placeholder={t('labResults.searchPlaceholder')} style={{ ...inputStyle, flex:1, padding:'8px 13px' }} />
          <Button variant="ghost" onClick={doSearch}>{t('labResults.search')}</Button>
        </div>
      </div>

      <div style={isMobile ? { display:'flex', flexDirection:'column' } : { display:'grid', gridTemplateColumns:'1fr 1.6fr', gap:0, height:'calc(100vh - 57px)' }}>
        {/* List */}
        <div style={{ borderRight:'1px solid var(--border)', overflowY:'auto', padding:16 }}>
          {results.length === 0 && (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text3)' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>🧪</div>
              <div style={{ fontSize:13 }}>{t('labResults.noResults')}</div>
            </div>
          )}
          {results.map(r => {
            const flag = worstFlag(r.tests);
            const color = flagColor(flag);
            const isActive = selected?._id === r._id;
            return (
              <div key={r._id} onClick={() => selectResult(r)}
                style={{ padding:'12px 14px', borderRadius:8, border:'1px solid', marginBottom:8, cursor:'pointer', transition:'all .12s',
                  borderColor: isActive ? 'var(--mint)' : 'var(--border)',
                  background: isActive ? 'rgba(15,227,176,0.04)' : 'var(--bg3)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:color, flexShrink:0 }} />
                  <div style={{ fontSize:13.5, fontWeight:500, flex:1 }}>{r.labName}</div>
                  <FlagBadge flag={flag} t={t} />
                </div>
                <div style={{ fontSize:11.5, color:'var(--text2)' }}>
                  {r.patientId?.name || t('labResults.patient')} · {r.tests.length} {r.tests.length !== 1 ? t('records.tests_plural') : t('records.tests')}
                </div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:3, fontFamily:'var(--font-mono)' }}>
                  {new Date(r.issuedAt).toLocaleDateString()}
                  {r.status === 'ready' && <span style={{ marginLeft:8, color:'var(--mint)' }}>● {t('labResults.ready')}</span>}
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
                <div style={{ fontSize:13 }}>{t('labResults.selectPrompt')}</div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:20 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:19, fontWeight:600, marginBottom:4 }}>{selected.labName}</div>
                  <div style={{ fontSize:12.5, color:'var(--text2)' }}>
                    {t('labResults.patient')}: {selected.patientId?.name} · {t('labResults.issued')}: {new Date(selected.issuedAt).toLocaleDateString()}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setShareTarget(selected)} style={{ fontSize:12 }}>{t('labResults.share')}</Button>
                {selected.reportFile && (
                  <a href={selected.reportFile} target="_blank" rel="noreferrer">
                    <Button variant="ghost" style={{ fontSize:12 }}>↓ PDF</Button>
                  </a>
                )}
              </div>

              {/* Tests table */}
              <Card style={{ marginBottom:18, padding:0, overflow:'hidden' }}>
                <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth: isMobile ? 480 : 'auto' }}>
                  <thead>
                    <tr style={{ background:'var(--bg3)' }}>
                      {['testName','value','unit','range','flag'].map(h => (
                        <th key={h} style={{ padding:'9px 13px', textAlign:'left', fontSize:10.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', borderBottom:'1px solid var(--border)' }}>
                          {t(`labResults.table.${h}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.tests.map((test, i) => {
                      const color2 = flagColor(test.flag);
                      const bg = { critical: 'rgba(244,63,94,0.12)', high: 'rgba(251,191,36,0.1)', low: 'rgba(251,191,36,0.1)' }[test.flag] || 'transparent';
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid var(--border)', background: test.flag !== 'normal' ? bg : 'transparent' }}>
                          <td style={{ padding:'9px 13px', fontWeight:500 }}>{test.name}</td>
                          <td style={{ padding:'9px 13px', fontFamily:'var(--font-mono)', color:color2, fontWeight:600 }}>{test.value}</td>
                          <td style={{ padding:'9px 13px', color:'var(--text2)' }}>{test.unit}</td>
                          <td style={{ padding:'9px 13px', color:'var(--text3)', fontFamily:'var(--font-mono)', fontSize:11.5 }}>{test.referenceRange}</td>
                          <td style={{ padding:'9px 13px' }}><FlagBadge flag={test.flag} t={t} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </Card>

              {/* AI Interpretation panel — visible to doctor for context */}
              {selected.status === 'ready' && (() => {
                const ai = aiState[selected._id];
                if (ai?.summary) {
                  return (
                    <div style={{ marginBottom:18, padding:14, borderRadius:10, border:'1px solid var(--mint)', background:'rgba(15,227,176,0.06)' }}>
                      <div style={{ fontSize:10.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--mint)', marginBottom:8 }}>
                        AI Explanation (patient-facing)
                      </div>
                      <p style={{ margin:0, fontSize:13.5, color:'var(--text)', lineHeight:'1.6' }}>{ai.summary}</p>
                      <p style={{ margin:'8px 0 0', fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>
                        AI-generated explanation — consult your doctor for medical advice.
                      </p>
                    </div>
                  );
                }
                if (ai?.error) {
                  return (
                    <div style={{ marginBottom:18, padding:12, borderRadius:10, border:'1px solid var(--rose)', background:'rgba(244,63,94,0.06)', fontSize:13, color:'var(--rose)' }}>
                      {ai.error}
                    </div>
                  );
                }
                if (ai?.loading) {
                  return (
                    <div style={{ marginBottom:18, padding:12, borderRadius:10, border:'1px solid var(--border)', background:'var(--bg3)', fontSize:13, color:'var(--text2)', display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ animation:'spin 1s linear infinite', display:'inline-block' }}>⟳</span>
                      Generating AI explanation…
                    </div>
                  );
                }
                return (
                  <div style={{ marginBottom:18 }}>
                    <Button variant="ghost" style={{ fontSize:12 }} onClick={() => startInterpret(selected)}>
                      ✨ Generate AI Explanation
                    </Button>
                  </div>
                );
              })()}

              {/* Doctor notes */}
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:8 }}>
                {t('labResults.interpretationNotes')}
              </div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                placeholder={t('labResults.addInterpretation')}
                style={{ ...inputStyle, resize:'vertical', minHeight:90, marginBottom:10 }} />
              <Button onClick={saveNotes} disabled={savingNotes}>
                {savingNotes ? t('labResults.saving') : t('labResults.saveNotes')}
              </Button>
            </>
          )}
        </div>
      </div>

      {shareTarget && <ShareModal result={shareTarget} onClose={() => setShareTarget(null)} t={t} />}
    </div>
  );
}
