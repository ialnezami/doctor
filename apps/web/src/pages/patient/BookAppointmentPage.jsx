import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getDoctor } from '../../api/doctors';
import { createAppointment } from '../../api/appointments';
import Button from '../../components/ui/Button';
import { useIsMobile } from '../../hooks/useIsMobile';

const VISIT_TYPES = ['initial','follow-up','check-up','urgent'];

export default function BookAppointmentPage() {
  const { doctorId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const date = params.get('date') || '';
  const slot = params.get('slot') || '';
  const [doctor, setDoctor] = useState(null);
  const [visitType, setVisitType] = useState('initial');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { getDoctor(doctorId).then(setDoctor).catch(() => {}); }, [doctorId]);

  const submit = async () => {
    setLoading(true); setError('');
    try {
      const appt = await createAppointment({
        doctorId: doctor.userId._id || doctor.userId,
        date,
        timeSlot: { start: slot, end: addThirtyMin(slot) },
        visitType,
        reason,
      });
      navigate(`/book/confirmed?status=${appt.status}`);
    } catch (e) {
      setError(e.message || t('book.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: isMobile ? 14 : 26, maxWidth:520 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500, marginBottom:20 }}>{t('book.title')}</div>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:18, marginBottom:24 }}>
        <div style={{ fontSize:13, color:'var(--text2)', marginBottom:4 }}>{t('book.doctor')}</div>
        <div style={{ fontSize:15, fontWeight:600 }}>{doctor?.userId?.name || '…'}</div>
        <div style={{ fontSize:12, color:'var(--mint)', marginTop:2 }}>{doctor?.specialty}</div>
        <div style={{ marginTop:12, display:'flex', gap:20, flexWrap:'wrap' }}>
          <div><div style={{ fontSize:11, color:'var(--text3)' }}>{t('book.date')}</div><div style={{ fontSize:13, fontWeight:500 }}>{date}</div></div>
          <div><div style={{ fontSize:11, color:'var(--text3)' }}>{t('book.time')}</div><div style={{ fontSize:13, fontWeight:500 }}>{slot}</div></div>
        </div>
      </div>

      <div style={{ marginBottom:16 }}>
        <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:8 }}>{t('book.visitType')}</label>
        <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
          {VISIT_TYPES.map(vt => (
            <button key={vt} onClick={() => setVisitType(vt)}
              style={{ padding:'6px 14px', borderRadius:20, border:`1px solid ${visitType===vt ? 'var(--mint)' : 'var(--border2)'}`, background: visitType===vt ? 'var(--mint-dim)' : 'transparent', color: visitType===vt ? 'var(--mint)' : 'var(--text2)', fontSize:12, cursor:'pointer', textTransform:'capitalize' }}>
              {vt}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <label style={{ display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:8 }}>{t('book.reason')}</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
          placeholder={t('book.reasonPlaceholder')}
          style={{ width:'100%', background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'10px 13px', color:'var(--text)', fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box' }} />
      </div>

      {error && <p style={{ color:'var(--rose)', fontSize:13, marginBottom:12 }}>{error}</p>}
      <Button full disabled={loading} onClick={submit} style={{ padding:13, fontSize:14 }}>
        {loading ? t('book.submitting') : t('book.submit')}
      </Button>
    </div>
  );
}

function addThirtyMin(time) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + 30;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
