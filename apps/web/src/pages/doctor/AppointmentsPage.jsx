import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAppointments, updateStatus } from '../../api/appointments';
import api from '../../api/client';
import StatusChip from '../../components/ui/StatusChip';
import Button from '../../components/ui/Button';
import { useIsMobile } from '../../hooks/useIsMobile';

const FILTER_KEYS = ['all','confirmed','completed','cancelled'];

const toLocalDate = (date) => new Date(date).toLocaleDateString('en-CA'); // YYYY-MM-DD

function formatNavDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

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
function NoteAiAssistCard({ apptId, note, apptStatus, onAnalysisComplete, onNoteUpdated, onNoteDeleted }) {
  const [analyzing, setAnalyzing]       = useState(false);
  const [error, setError]               = useState(null);
  const [editing, setEditing]           = useState(false);
  const [editContent, setEditContent]   = useState(note.content);
  const [editVis, setEditVis]           = useState(note.visibility);
  const [saving, setSaving]             = useState(false);
  const [editError, setEditError]       = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const pollRef = useRef(null);

  const canEdit = apptStatus !== 'validated';

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

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

  const handleSave = async () => {
    if (!editContent.trim()) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await api.patch(`/appointments/${apptId}/notes/${note._id}`, {
        content: editContent.trim(),
        visibility: editVis,
      });
      onNoteUpdated(res.data.note);
      setEditing(false);
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.delete(`/appointments/${apptId}/notes/${note._id}`);
      onNoteDeleted(note._id);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete note');
      setDeleting(false);
    }
  };

  const aiAssist  = note.aiAssist;
  const hasResult = Boolean(aiAssist?.processedAt);

  return (
    <div style={{ marginTop: 12, padding: 14, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>

      {editing ? (
        /* ── Edit mode ── */
        <div>
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            maxLength={5000}
            rows={5}
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13, resize: 'vertical', outline: 'none', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Visibility:</span>
            {['private', 'shared'].map(v => (
              <button
                key={v}
                onClick={() => setEditVis(v)}
                style={{ padding: '3px 10px', borderRadius: 20, border: `1px solid ${editVis === v ? 'var(--mint)' : 'var(--border2)'}`, background: editVis === v ? 'var(--mint-dim)' : 'transparent', color: editVis === v ? 'var(--mint)' : 'var(--text2)', fontSize: 11, cursor: 'pointer' }}
              >
                {v}
              </button>
            ))}
          </div>
          {editError && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 6 }}>{editError}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving || !editContent.trim()}
              style={{ padding: '5px 14px', borderRadius: 6, background: 'var(--mint)', border: 'none', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (saving || !editContent.trim()) ? 0.5 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setEditContent(note.content); setEditVis(note.visibility); setEditError(null); }}
              style={{ padding: '5px 14px', borderRadius: 6, background: 'none', border: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* ── View mode ── */
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', lineHeight: 1.5 }}>
              {note.content}
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => { setEditing(true); setEditContent(note.content); setEditVis(note.visibility); }}
                  title="Edit note"
                  style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 6, padding: '3px 8px', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  title="Delete note"
                  style={{ background: 'none', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 6, padding: '3px 8px', color: '#f43f5e', fontSize: 11, cursor: 'pointer', opacity: deleting ? 0.5 : 1 }}
                >
                  {deleting ? '…' : 'Delete'}
                </button>
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
            {note.visibility === 'private' ? '🔒 Private' : '👁 Shared with patient'}
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

              {aiAssist.patientSummary && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 4 }}>Patient-Friendly Summary</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 6, borderLeft: '3px solid var(--mint)' }}>
                    {aiAssist.patientSummary}
                  </div>
                </div>
              )}

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
      )}
    </div>
  );
}

// ── Notes panel: lists notes + AI Assist for each ────────────────────────────
function NotesPanel({ apptId, apptStatus, t }) {
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

  const handleNoteUpdated = useCallback((updatedNote) => {
    setNotes(prev => prev.map(n => n._id === updatedNote._id ? updatedNote : n));
  }, []);

  const handleNoteDeleted = useCallback((noteId) => {
    setNotes(prev => prev.filter(n => n._id !== noteId));
  }, []);

  if (loading) return <div style={{ fontSize: 12, color: 'var(--text2)', padding: '12px 0' }}>Loading notes…</div>;
  if (!notes.length) return <div style={{ fontSize: 12, color: 'var(--text2)', padding: '12px 0' }}>No notes yet.</div>;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 10 }}>
        Consultation Notes &amp; AI Assist
      </div>
      {notes.map(note => (
        <NoteAiAssistCard
          key={note._id}
          apptId={apptId}
          note={note}
          apptStatus={apptStatus}
          onAnalysisComplete={handleAnalysisComplete}
          onNoteUpdated={handleNoteUpdated}
          onNoteDeleted={handleNoteDeleted}
        />
      ))}
    </div>
  );
}

// ── Mini Calendar ───────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function MiniCalendar({ selectedDate, onSelect, apptDates, todayStr }) {
  const dateToView = (ds) => {
    const d = new Date(ds + 'T00:00:00');
    return { year: d.getFullYear(), month: d.getMonth() };
  };
  const [view, setView] = useState(() => dateToView(selectedDate));

  useEffect(() => {
    const v = dateToView(selectedDate);
    setView(prev => (prev.year === v.year && prev.month === v.month) ? prev : v);
  }, [selectedDate]);

  const prevMonth = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  const nextMonth = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });

  const firstDow    = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div style={{ padding: '14px 10px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, userSelect: 'none' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <button onClick={prevMonth} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:18, padding:'0 8px', lineHeight:1 }}>‹</button>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{MONTH_NAMES[view.month]} {view.year}</span>
        <button onClick={nextMonth} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:18, padding:'0 8px', lineHeight:1 }}>›</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
        {DAY_LABELS.map(l => (
          <div key={l} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:'var(--text3)', letterSpacing:'0.05em' }}>{l}</div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px 0' }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const mm      = String(view.month + 1).padStart(2, '0');
          const dd      = String(day).padStart(2, '0');
          const dateStr = `${view.year}-${mm}-${dd}`;
          const isTod   = dateStr === todayStr;
          const isSel   = dateStr === selectedDate;
          const isPast  = dateStr < todayStr;
          const hasAppt = apptDates.has(dateStr);
          return (
            <div key={i} onClick={() => onSelect(dateStr)} style={{
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              padding:'3px 1px', borderRadius:6, cursor:'pointer',
              background: isSel ? 'var(--mint)' : isTod ? 'var(--mint-dim)' : 'transparent',
              border: isTod && !isSel ? '1px solid rgba(15,227,176,0.3)' : '1px solid transparent',
            }}>
              <span style={{
                fontSize:12, lineHeight:1.7, fontWeight: isTod || isSel ? 700 : 400,
                color: isSel ? '#0a0f0d' : isTod ? 'var(--mint)' : isPast ? 'var(--text3)' : 'var(--text)',
              }}>{day}</span>
              <div style={{ height:4, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {hasAppt && (
                  <div style={{ width:4, height:4, borderRadius:'50%', background: isSel ? '#0a0f0d' : 'var(--mint)', opacity: isPast ? 0.45 : 1 }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Appointment row ─────────────────────────────────────────────────────────────
function ApptRow({ a, selected, onSelect, onNavigate, tFn, faded }) {
  return (
    <div
      onClick={() => onSelect(a)}
      style={{
        display:'flex', alignItems:'center', gap:10, padding:'11px 13px',
        background: faded ? 'rgba(255,255,255,0.02)' : 'var(--bg3)',
        border:`1px solid ${selected ? 'var(--mint)' : faded ? 'var(--border)' : 'var(--border)'}`,
        borderRadius:'var(--r-sm)', marginBottom:6, cursor:'pointer',
        opacity: faded ? 0.55 : 1,
        transition:'border-color 0.15s, opacity 0.15s',
      }}
    >
      <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color: faded ? 'var(--text3)' : 'var(--mint)', minWidth:42, flexShrink:0 }}>{a.timeSlot?.start}</span>
      <div style={{ width:1, height:26, background:'var(--border)', flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.patientId?.name}</div>
        <div style={{ fontSize:11, color:'var(--text2)', marginTop:1 }}>{a.visitType}</div>
      </div>
      <StatusChip status={a.status} />
      {!faded && (a.status === 'confirmed' || a.status === 'in_progress') && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate(`/appointments/${a._id}/video`, a.patientId?.name); }}
          style={{ background:'rgba(124,58,237,0.12)', border:'1px solid rgba(124,58,237,0.3)', borderRadius:6, padding:'3px 8px', color:'#a78bfa', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
          🎥 {tFn('appointments.video')}
        </button>
      )}
      {!faded && a.status !== 'cancelled' && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate(`/appointments/${a._id}/chat`, a.patientId?.name); }}
          style={{ background:'var(--mint-dim)', border:'1px solid rgba(15,227,176,0.3)', borderRadius:6, padding:'3px 8px', color:'var(--mint)', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
          💬 {tFn('appointments.chat')}
        </button>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────
export default function AppointmentsPage() {
  const navigate   = useNavigate();
  const { t }      = useTranslation();
  const isMobile   = useIsMobile();

  const [appointments,       setAppointments]       = useState([]);
  const [filter,             setFilter]             = useState('all');
  const [selectedAppointment,setSelectedAppointment]= useState(null);
  const [pageView,           setPageView]           = useState('schedule'); // 'schedule' | 'archive'
  const [archSearch,         setArchSearch]         = useState('');

  const todayStr = toLocalDate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isToday      = selectedDate === todayStr;
  const dayIsInPast  = selectedDate < todayStr;
  const dayIsInFuture= selectedDate > todayStr;

  // Mobile-only prev/next navigation
  function prevDay() {
    const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() - 1); setSelectedDate(toLocalDate(d));
  }
  function nextDay() {
    const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() + 1); setSelectedDate(toLocalDate(d));
  }

  const load = useCallback(() => getAppointments().then(setAppointments).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedAppointment?.symptomText) return;
    if (selectedAppointment?.symptomAnalysis?.processedAt) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const fresh = await api.get(`/appointments/${selectedAppointment._id}`);
        if (fresh?.symptomAnalysis?.processedAt) { setSelectedAppointment(fresh); clearInterval(interval); }
      } catch (_) {}
      if (attempts >= 12) clearInterval(interval);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedAppointment?._id, selectedAppointment?.symptomAnalysis?.processedAt]);

  const handleStatus = async (id, status) => { await updateStatus(id, status); load(); };

  // Dates that have at least one non-cancelled appointment (for calendar dots)
  const apptDates = useMemo(() => {
    const s = new Set();
    appointments.forEach(a => { if (a.status !== 'cancelled') s.add(toLocalDate(a.date)); });
    return s;
  }, [appointments]);

  const pending = appointments.filter(a => a.status === 'pending');

  const dayAppts = appointments
    .filter(a => a.status !== 'pending' && toLocalDate(a.date) === selectedDate)
    .filter(a => filter === 'all' || a.status === filter)
    .sort((a, b) => (a.timeSlot?.start || '').localeCompare(b.timeSlot?.start || ''));

  // Split into upcoming vs past
  function isTimePast(a) {
    if (dayIsInPast)   return true;
    if (dayIsInFuture) return false;
    const endTime = a.timeSlot?.end || a.timeSlot?.start;
    if (!endTime) return false;
    const [h, m] = endTime.split(':').map(Number);
    const apptEnd = new Date(); apptEnd.setHours(h, m, 0, 0);
    return new Date() > apptEnd;
  }
  const upcomingAppts = dayAppts.filter(a => !isTimePast(a));
  const pastAppts     = dayAppts.filter(a =>  isTimePast(a));

  // Archive: all past-date appointments grouped by date descending
  const archivedByDate = useMemo(() => {
    const filtered = appointments
      .filter(a => a.status !== 'pending' && toLocalDate(a.date) < todayStr)
      .filter(a => filter === 'all' || a.status === filter)
      .filter(a => !archSearch || (a.patientId?.name || '').toLowerCase().includes(archSearch.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date));
    return filtered.reduce((acc, a) => {
      const d = toLocalDate(a.date);
      if (!acc[d]) acc[d] = [];
      acc[d].push(a);
      return acc;
    }, {});
  }, [appointments, filter, archSearch, todayStr]);
  const archivedDates = Object.keys(archivedByDate).sort((a, b) => b.localeCompare(a));
  const archivedTotal = archivedDates.reduce((s, d) => s + archivedByDate[d].length, 0);

  const goNav = (path, name) => navigate(path, { state: { otherPartyName: name || t('appointments.details.patient') } });

  const filterLabel = (f) => t(`appointments.filters.${f}`);

  // Mobile-only nav button style
  const navBtnSt = { background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:16, lineHeight:1, padding:'6px 11px', cursor:'pointer', fontWeight:600 };

  return (
    <div>
      {/* ── Sticky header ── */}
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 26px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>{t('appointments.title')}</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{t('appointments.subtitle')}</div>
          </div>

          {/* Mobile-only day navigator (desktop uses the sidebar calendar) */}
          {isMobile && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <button onClick={prevDay} style={navBtnSt}>‹</button>
              <div style={{ position:'relative' }}>
                <div style={{ padding:'6px 12px', borderRadius:8, background: isToday ? 'var(--mint-dim)' : 'var(--bg3)', border:`1px solid ${isToday ? 'rgba(15,227,176,0.4)' : 'var(--border2)'}`, color: isToday ? 'var(--mint)' : 'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                  {isToday ? 'Today' : formatNavDate(selectedDate)} 📅
                </div>
                <input type="date" value={selectedDate} onChange={e => e.target.value && setSelectedDate(e.target.value)}
                  style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer', width:'100%', height:'100%' }} />
              </div>
              <button onClick={nextDay} style={navBtnSt}>›</button>
              {!isToday && <button onClick={() => setSelectedDate(todayStr)} style={{ ...navBtnSt, fontSize:12, color:'var(--mint)', borderColor:'rgba(15,227,176,0.3)', background:'var(--mint-dim)' }}>Today</button>}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: isMobile ? 14 : 26 }}>

        {/* ── View toggle + status filters ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:18 }}>
          {/* Schedule / Archive tabs */}
          <div style={{ display:'flex', background:'var(--bg3)', borderRadius:10, padding:3, gap:2 }}>
            {[['schedule','Schedule'],['archive','Archive']].map(([v, label]) => (
              <button key={v} onClick={() => { setPageView(v); setSelectedAppointment(null); }}
                style={{ padding:'6px 18px', borderRadius:8, border:'none', fontSize:13, fontWeight:600, cursor:'pointer',
                  background: pageView===v ? 'var(--bg2)' : 'transparent',
                  color: pageView===v ? 'var(--text)' : 'var(--text3)',
                  boxShadow: pageView===v ? '0 1px 4px rgba(0,0,0,0.3)' : 'none' }}>
                {label}{v==='archive' && archivedTotal > 0 && <span style={{ marginLeft:6, fontSize:10, background:'var(--bg3)', borderRadius:99, padding:'1px 6px', color:'var(--text2)' }}>{archivedTotal}</span>}
              </button>
            ))}
          </div>

          {/* Status filter pills */}
          <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
            {FILTER_KEYS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding:'5px 13px', borderRadius:20, border:`1px solid ${filter===f ? 'var(--mint)' : 'var(--border2)'}`, background: filter===f ? 'var(--mint-dim)' : 'transparent', color: filter===f ? 'var(--mint)' : 'var(--text2)', fontSize:12, fontWeight:500, cursor:'pointer' }}>
                {filterLabel(f)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Archive view ── */}
        {pageView === 'archive' && (
          <div>
            <input
              placeholder="Search by patient name…"
              value={archSearch}
              onChange={e => setArchSearch(e.target.value)}
              style={{ width:'100%', maxWidth:340, padding:'9px 13px', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box', marginBottom:20 }}
            />
            {archivedDates.length === 0 && (
              <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text3)', fontSize:13 }}>
                {archSearch ? 'No archived appointments match that name.' : 'No archived appointments yet.'}
              </div>
            )}
            {archivedDates.map(dateStr => (
              <div key={dateStr} style={{ marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', whiteSpace:'nowrap' }}>
                    {new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short', year:'numeric' })}
                  </div>
                  <div style={{ flex:1, height:1, background:'var(--border)' }} />
                  <span style={{ fontSize:10, color:'var(--text3)' }}>{archivedByDate[dateStr].length} appt{archivedByDate[dateStr].length!==1?'s':''}</span>
                </div>
                {archivedByDate[dateStr].map(a => (
                  <ApptRow key={a._id} a={a} selected={selectedAppointment?._id === a._id}
                    onSelect={setSelectedAppointment} onNavigate={goNav} tFn={t} faded={true} />
                ))}
              </div>
            ))}

            {selectedAppointment && (
              <div style={{ marginTop:24, padding:20, background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <div style={{ fontSize:16, fontWeight:600 }}>{t('appointments.details.title')}</div>
                  <button onClick={() => setSelectedAppointment(null)} style={{ background:'none', border:'none', color:'var(--text2)', fontSize:20, cursor:'pointer' }}>✕</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:12, marginBottom:16 }}>
                  {[
                    [t('appointments.details.patient'), selectedAppointment.patientId?.name],
                    [t('appointments.details.dateTime'), `${new Date(selectedAppointment.date).toLocaleDateString()} at ${selectedAppointment.timeSlot?.start}`],
                    [t('appointments.details.visitType'), selectedAppointment.visitType],
                    [t('appointments.details.status'), null],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text2)', marginBottom:4 }}>{label}</div>
                      <div style={{ fontSize:14, textTransform: label.includes('Visit') ? 'capitalize' : 'none' }}>
                        {val ?? <StatusChip status={selectedAppointment.status} />}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedAppointment.reason && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text2)', marginBottom:4 }}>{t('appointments.details.reason')}</div>
                    <div style={{ fontSize:13, color:'var(--text)' }}>{selectedAppointment.reason}</div>
                  </div>
                )}
                <SymptomCard appt={selectedAppointment} t={t} />
                <NotesPanel apptId={selectedAppointment._id} apptStatus={selectedAppointment.status} t={t} />
              </div>
            )}
          </div>
        )}

        {/* ── 3-column layout on desktop, 1-column on mobile ── */}
        {pageView === 'schedule' &&
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '252px 1fr 320px', gap: isMobile ? 20 : 22, alignItems:'start' }}>

          {/* Col 1: Mini calendar (desktop only) */}
          {!isMobile && (
            <div style={{ position:'sticky', top:80 }}>
              <MiniCalendar
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
                apptDates={apptDates}
                todayStr={todayStr}
              />
              {!isToday && (
                <button onClick={() => setSelectedDate(todayStr)}
                  style={{ marginTop:10, width:'100%', padding:'7px 0', borderRadius:8, background:'var(--mint-dim)', border:'1px solid rgba(15,227,176,0.3)', color:'var(--mint)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  Jump to Today
                </button>
              )}
            </div>
          )}

          {/* Col 2: Day schedule */}
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>
                  {isToday ? 'Today' : formatNavDate(selectedDate)}
                  {dayIsInPast && <span style={{ marginLeft:8, fontSize:11, color:'var(--text3)', fontWeight:400 }}>past day</span>}
                </div>
              </div>
              <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:'var(--bg3)', border:'1px solid var(--border2)', color:'var(--text2)' }}>
                {dayAppts.length} appt{dayAppts.length !== 1 ? 's' : ''}
              </span>
            </div>

            {dayAppts.length === 0 && (
              <div style={{ textAlign:'center', padding:'36px 20px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r)', color:'var(--text2)' }}>
                <div style={{ fontSize:26, marginBottom:8 }}>📭</div>
                <div style={{ fontSize:13, fontWeight:500 }}>No appointments {isToday ? 'today' : 'on this day'}</div>
                {!isMobile && <div style={{ fontSize:12, marginTop:4, opacity:0.6 }}>Select a date with a dot on the calendar</div>}
              </div>
            )}

            {/* Upcoming / active appointments */}
            {upcomingAppts.length > 0 && (
              <>
                {pastAppts.length > 0 && (
                  <div style={{ fontSize:10.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--mint)', marginBottom:8 }}>
                    Upcoming
                  </div>
                )}
                {upcomingAppts.map(a => (
                  <ApptRow key={a._id} a={a} selected={selectedAppointment?._id === a._id}
                    onSelect={setSelectedAppointment} onNavigate={goNav} tFn={t} faded={false} />
                ))}
              </>
            )}

            {/* Past appointments for this day */}
            {pastAppts.length > 0 && (
              <div style={{ marginTop: upcomingAppts.length > 0 ? 16 : 0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <div style={{ fontSize:10.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)' }}>
                    {dayIsInPast ? 'Archived' : 'Passed'}
                  </div>
                  <div style={{ flex:1, height:1, background:'var(--border)' }} />
                </div>
                {pastAppts.map(a => (
                  <ApptRow key={a._id} a={a} selected={selectedAppointment?._id === a._id}
                    onSelect={setSelectedAppointment} onNavigate={goNav} tFn={t} faded={true} />
                ))}
              </div>
            )}
          </div>

          {/* Col 3: Pending approval */}
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)' }}>{t('appointments.pendingApproval')}</div>
              <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:'var(--amber-dim)', border:'1px solid rgba(245,158,11,0.3)', color:'var(--amber)' }}>
                {t('appointments.requests', { count: pending.length })}
              </span>
            </div>
            {pending.length === 0 && (
              <div style={{ textAlign:'center', padding:'20px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r)', color:'var(--text3)', fontSize:12 }}>
                No pending requests
              </div>
            )}
            {pending.map(a => (
              <div key={a._id} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 13px', background:'var(--bg3)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'var(--r-sm)', marginBottom:8 }}>
                <div style={{ flexShrink:0, textAlign:'center', minWidth:36 }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--amber)', fontWeight:700 }}>{new Date(a.date).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}</div>
                  <div style={{ fontSize:10, color:'var(--text3)' }}>{a.timeSlot?.start}</div>
                </div>
                <div style={{ width:1, height:32, background:'var(--border)', flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.patientId?.name}</div>
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.reason}</div>
                </div>
                <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                  <Button style={{ padding:'4px 8px', fontSize:11 }} onClick={() => handleStatus(a._id, 'confirmed')}>✓</Button>
                  <Button variant="danger" style={{ padding:'4px 8px', fontSize:11 }} onClick={() => handleStatus(a._id, 'cancelled')}>✗</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Detail panel ── */}
        {selectedAppointment && (
          <div style={{ marginTop:24, padding:20, background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:16, fontWeight:600 }}>{t('appointments.details.title')}</div>
              <button onClick={() => setSelectedAppointment(null)} style={{ background:'none', border:'none', color:'var(--text2)', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:12, marginBottom:16 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text2)', marginBottom:4 }}>{t('appointments.details.patient')}</div>
                <div style={{ fontSize:14 }}>{selectedAppointment.patientId?.name}</div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text2)', marginBottom:4 }}>{t('appointments.details.dateTime')}</div>
                <div style={{ fontSize:14 }}>{new Date(selectedAppointment.date).toLocaleDateString()} at {selectedAppointment.timeSlot?.start}</div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text2)', marginBottom:4 }}>{t('appointments.details.visitType')}</div>
                <div style={{ fontSize:14, textTransform:'capitalize' }}>{selectedAppointment.visitType}</div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text2)', marginBottom:4 }}>{t('appointments.details.status')}</div>
                <div style={{ fontSize:14 }}><StatusChip status={selectedAppointment.status} /></div>
              </div>
            </div>
            {selectedAppointment.reason && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text2)', marginBottom:4 }}>{t('appointments.details.reason')}</div>
                <div style={{ fontSize:13, color:'var(--text)' }}>{selectedAppointment.reason}</div>
              </div>
            )}
            <SymptomCard appt={selectedAppointment} t={t} />
            <NotesPanel apptId={selectedAppointment._id} apptStatus={selectedAppointment.status} t={t} />
          </div>
        )}
      </div>
    </div>
  );
}
