import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAppointments, updateStatus } from '../../api/appointments';
import api from '../../api/client';
import StatusChip from '../../components/ui/StatusChip';
import Button from '../../components/ui/Button';

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

export default function AppointmentsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>{t('appointments.title')}</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{t('appointments.subtitle')}</div>
        </div>
      </div>

      <div style={{ padding:26 }}>
        <div style={{ display:'flex', gap:7, marginBottom:16, flexWrap:'wrap' }}>
          {FILTER_KEYS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding:'5px 13px', borderRadius:20, border:`1px solid ${filter===f ? 'var(--mint)' : 'var(--border2)'}`, background: filter===f ? 'var(--mint-dim)' : 'transparent', color: filter===f ? 'var(--mint)' : 'var(--text2)', fontSize:12, fontWeight:500, cursor:'pointer' }}>
              {filterLabel(f)}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
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
          </div>
        )}
      </div>
    </div>
  );
}
