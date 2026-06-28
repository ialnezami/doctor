import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAppointments, updateStatus } from '../../api/appointments';
import api from '../../api/client';
import StatusChip from '../../components/ui/StatusChip';
import Button from '../../components/ui/Button';
import { useIsMobile } from '../../hooks/useIsMobile';

const FILTER_KEYS = ['all','pending','confirmed','completed','cancelled'];

function SymptomCard({ appt, t }) {
  if (!appt?.symptomText) return null;
  const { urgency, category, processedAt } = appt.symptomAnalysis || {};
  const pillColor = urgency === 'high' ? '#ef4444' : urgency === 'medium' ? '#f59e0b' : '#22c55e';
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', padding: 16, marginBottom: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10, color: 'var(--text)' }}>
        {t('appointments.symptoms.title')}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 12 }}>
        {appt.symptomText}
      </p>
      {processedAt ? (
        urgency ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: pillColor, color: '#fff',
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 10,
            }}>
              {urgency}
            </span>
            {category && (
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{category}</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t('appointments.symptoms.unavailable')}</span>
        )
      ) : (
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t('appointments.symptoms.pending')}</span>
      )}
      <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10 }}>
        {t('appointments.symptoms.aiDisclaimer')}
      </p>
    </div>
  );
}

// ── AI Assist card for a single consultation note ─────────────────────────────
function NoteAiAssistCard({ apptId, note, onAnalysisComplete }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError]         = useState(null);
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // Clean up on unmount
  useEffect(() => () => stopPolling(), []);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    stopPolling();

    try {
      await api.post(`/appointments/${apptId}/notes/${note._id}/analyze`);
    } catch {
      setAnalyzing(false);
      setError('Failed to queue analysis. Please try again.');
      return;
    }

    // Poll GET /appointments/:apptId/notes every 2 s for up to 10 s
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await api.get(`/appointments/${apptId}/notes`);
        const fresh = res.data?.notes?.find(n => n._id === note._id);
        if (fresh?.aiAssist?.processedAt) {
          stopPolling();
          setAnalyzing(false);
          onAnalysisComplete(fresh);
          return;
        }
      } catch (_) {}
      if (attempts >= 5) {
        stopPolling();
        setAnalyzing(false);
        setError('Analysis is taking longer than expected. Refresh to check results.');
      }
    }, 2000);
  };

  const aiAssist = note.aiAssist;
  const hasResult = Boolean(aiAssist?.processedAt);

  return (
    <div style={{ marginTop: 12, padding: 14, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
      {/* Note content preview */}
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {note.content?.slice(0, 120)}{note.content?.length > 120 ? '…' : ''}
      </div>

      {!hasResult && (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--mint-dim)', border: '1px solid rgba(15,227,176,0.3)',
            borderRadius: 6, padding: '5px 12px', color: 'var(--mint)',
            fontSize: 12, fontWeight: 600, cursor: analyzing ? 'not-allowed' : 'pointer',
            opacity: analyzing ? 0.6 : 1,
          }}
        >
          {analyzing ? (
            <><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--mint)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Analyzing…</>
          ) : 'AI Assist'}
        </button>
      )}

      {error && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{error}</div>}

      {hasResult && (
        <div style={{ marginTop: 10 }}>
          {/* ICD-10 codes */}
          {aiAssist.icdCodes?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 6 }}>ICD-10 Codes</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {aiAssist.icdCodes.map((entry, i) => (
                  <span key={i} title={entry.description} style={{
                    background: 'rgba(15,227,176,0.1)', border: '1px solid rgba(15,227,176,0.25)',
                    borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--mint)', fontWeight: 600,
                  }}>
                    {entry.code}
                    <span style={{ fontWeight: 400, color: 'var(--text2)', marginLeft: 4, fontSize: 10 }}>{entry.description}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Patient summary */}
          {aiAssist.patientSummary && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 4 }}>Patient-Friendly Summary</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 6, borderLeft: '3px solid var(--mint)' }}>
                {aiAssist.patientSummary}
              </div>
            </div>
          )}

          {/* Flags */}
          {aiAssist.flags?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 4 }}>Missing Information</div>
              {aiAssist.flags.map((flag, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f59e0b', marginBottom: 3 }}>
                  <span>⚠</span><span>{flag}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 10, color: 'var(--text2)', fontStyle: 'italic', marginTop: 6 }}>
            AI-generated — not a substitute for clinical judgment.
          </div>

          {/* Re-analyze */}
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            style={{ marginTop: 8, background: 'none', border: '1px solid var(--border2)', borderRadius: 6, padding: '3px 10px', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}
          >
            Re-analyze
          </button>
        </div>
      )}
    </div>
  );
}

// ── Notes panel: lists notes + AI Assist for each ────────────────────────────
function NotesPanel({ apptId, t }) {
  const [notes, setNotes]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/appointments/${apptId}/notes`);
      setNotes(res.data?.notes || []);
    } catch (_) {}
    setLoading(false);
  }, [apptId]);

  useEffect(() => { load(); }, [load]);

  const handleAnalysisComplete = useCallback((updatedNote) => {
    setNotes(prev => prev.map(n => n._id === updatedNote._id ? updatedNote : n));
  }, []);

  if (loading) return <div style={{ fontSize: 12, color: 'var(--text2)', padding: '12px 0' }}>Loading notes…</div>;
  if (!notes.length) return <div style={{ fontSize: 12, color: 'var(--text2)', padding: '12px 0' }}>No notes yet.</div>;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 10 }}>
        Consultation Notes &amp; AI Assist
      </div>
      {notes.map(note => (
        <NoteAiAssistCard key={note._id} apptId={apptId} note={note} onAnalysisComplete={handleAnalysisComplete} />
      ))}
    </div>
  );
}

export default function AppointmentsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [appointments, setAppointments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  const load = useCallback(() => getAppointments().then(setAppointments).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedAppointment?.symptomText) return;
    if (selectedAppointment?.symptomAnalysis?.processedAt) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 12;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const fresh = await api.get(`/appointments/${selectedAppointment._id}`);
        if (fresh.data?.symptomAnalysis?.processedAt) {
          setSelectedAppointment(fresh.data);
          clearInterval(interval);
        }
      } catch (_) {}
      if (attempts >= MAX_ATTEMPTS) clearInterval(interval);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedAppointment?._id, selectedAppointment?.symptomAnalysis?.processedAt]);

  const handleStatus = async (id, status) => {
    await updateStatus(id, status);
    load();
  };

  const visible = filter === 'all' ? appointments : appointments.filter(a => a.status === filter);
  const pending  = appointments.filter(a => a.status === 'pending');

  const filterLabel = (f) => {
    const key = `appointments.filters.${f}`;
    return t(key);
  };

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>{t('appointments.title')}</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{t('appointments.subtitle')}</div>
        </div>
      </div>

      <div style={{ padding: isMobile ? 14 : 26 }}>
        <div style={{ display:'flex', gap:7, marginBottom:16, flexWrap:'wrap' }}>
          {FILTER_KEYS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding:'5px 13px', borderRadius:20, border:`1px solid ${filter===f ? 'var(--mint)' : 'var(--border2)'}`, background: filter===f ? 'var(--mint-dim)' : 'transparent', color: filter===f ? 'var(--mint)' : 'var(--text2)', fontSize:12, fontWeight:500, cursor:'pointer' }}>
              {filterLabel(f)}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:18 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)' }}>
                {filter === 'all' ? t('appointments.allAppointments') : filterLabel(filter)}
              </div>
              <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:'var(--bg3)', border:'1px solid var(--border2)', color:'var(--text2)' }}>
                {t('appointments.total', { count: visible.length })}
              </span>
            </div>
            {visible.map(a => (
              <div key={a._id} onClick={() => setSelectedAppointment(a)} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg3)', border:`1px solid ${selectedAppointment?._id === a._id ? 'var(--mint)' : 'var(--border)'}`, borderRadius:'var(--r-sm)', marginBottom:8, cursor: 'pointer', transition: 'all 0.2s' }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--mint)', minWidth:52 }}>{a.timeSlot?.start}</span>
                <div style={{ width:1, height:28, background:'var(--border)', flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:500 }}>{a.patientId?.name}</div>
                  <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{new Date(a.date).toLocaleDateString()} · {a.visitType}</div>
                </div>
                <StatusChip status={a.status} />
                {(a.status === 'confirmed' || a.status === 'in_progress') && (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/appointments/${a._id}/video`, { state: { otherPartyName: a.patientId?.name || t('appointments.details.patient') } }); }}
                    style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 6, padding: '3px 9px', color: '#a78bfa', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    🎥 {t('appointments.video')}
                  </button>
                )}
                {a.status !== 'cancelled' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/appointments/${a._id}/chat`, { state: { otherPartyName: a.patientId?.name || t('appointments.details.patient') } }); }}
                    style={{ background: 'var(--mint-dim)', border: '1px solid rgba(15,227,176,0.3)', borderRadius: 6, padding: '3px 9px', color: 'var(--mint)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    💬 {t('appointments.chat')}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)' }}>{t('appointments.pendingApproval')}</div>
              <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:'var(--amber-dim)', border:'1px solid rgba(245,158,11,0.3)', color:'var(--amber)' }}>
                {t('appointments.requests', { count: pending.length })}
              </span>
            </div>
            {pending.map(a => (
              <div key={a._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg3)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'var(--r-sm)', marginBottom:8 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--amber)', minWidth:52 }}>{new Date(a.date).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}</span>
                <div style={{ width:1, height:28, background:'var(--border)', flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:500 }}>{a.patientId?.name}</div>
                  <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{a.reason}</div>
                </div>
                <div style={{ display:'flex', gap:5 }}>
                  <Button style={{ padding:'4px 8px', fontSize:11 }} onClick={() => handleStatus(a._id, 'confirmed')}>✓</Button>
                  <Button variant="danger" style={{ padding:'4px 8px', fontSize:11 }} onClick={() => handleStatus(a._id, 'cancelled')}>✗</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedAppointment && (
          <div style={{ marginTop: 24, padding: 20, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{t('appointments.details.title')}</div>
              <button onClick={() => setSelectedAppointment(null)} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 4 }}>{t('appointments.details.patient')}</div>
                <div style={{ fontSize: 14 }}>{selectedAppointment.patientId?.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 4 }}>{t('appointments.details.dateTime')}</div>
                <div style={{ fontSize: 14 }}>{new Date(selectedAppointment.date).toLocaleDateString()} at {selectedAppointment.timeSlot?.start}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 4 }}>{t('appointments.details.visitType')}</div>
                <div style={{ fontSize: 14, textTransform: 'capitalize' }}>{selectedAppointment.visitType}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 4 }}>{t('appointments.details.status')}</div>
                <div style={{ fontSize: 14 }}><StatusChip status={selectedAppointment.status} /></div>
              </div>
            </div>
            {selectedAppointment.reason && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 4 }}>{t('appointments.details.reason')}</div>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>{selectedAppointment.reason}</div>
              </div>
            )}
            <SymptomCard appt={selectedAppointment} t={t} />
            <NotesPanel apptId={selectedAppointment._id} t={t} />
          </div>
        )}
      </div>
    </div>
  );
}
