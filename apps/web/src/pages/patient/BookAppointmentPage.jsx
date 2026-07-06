import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getDoctor, getDoctorLocations } from '../../api/doctors';
import { createAppointment } from '../../api/appointments';
import Button from '../../components/ui/Button';
import { useIsMobile } from '../../hooks/useIsMobile';

export default function BookAppointmentPage() {
  const { doctorId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const date = params.get('date') || '';
  const slot = params.get('slot') || '';
  const [doctor, setDoctor] = useState(null);
  const [apptTypes, setApptTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState(null);
  const [visitType, setVisitType] = useState('initial');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getDoctor(doctorId).then(doc => {
      setDoctor(doc);
      const enabled = (doc.appointmentTypes || []).filter(at => at.enabled);
      if (enabled.length > 0) {
        setApptTypes(enabled);
        setVisitType(enabled[0].key);
      }
    }).catch(() => {});
  }, [doctorId]);

  useEffect(() => {
    getDoctorLocations(doctorId)
      .then(locs => {
        const bookable = (locs || []).filter(l => l.type === 'bookable');
        setLocations(bookable);
        if (bookable.length > 0) setLocationId(bookable[0]._id);
      })
      .catch(() => {});
  }, [doctorId]);

  const submit = async () => {
    if (!locationId) { setError('Please select a location'); return; }
    setLoading(true); setError('');
    try {
      const appt = await createAppointment({
        doctorId: doctor.userId._id || doctor.userId,
        date,
        timeSlot: { start: slot, end: addThirtyMin(slot) },
        visitType,
        reason,
        locationId,
      });
      navigate(`/book/confirmed?status=${appt.status}`);
    } catch (e) {
      setError(e.message || t('book.error'));
    } finally {
      setLoading(false);
    }
  };

  const labelStyle = { display:'block', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginBottom:8 };

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

      {locations.length > 1 && (
        <div style={{ marginBottom:20 }}>
          <label style={labelStyle}>Location</label>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {locations.map(loc => (
              <button key={loc._id} onClick={() => setLocationId(loc._id)}
                style={{ textAlign:'left', padding:'10px 14px', borderRadius:'var(--r-sm)', border:`1px solid ${locationId===loc._id ? 'var(--mint)' : 'var(--border2)'}`, background: locationId===loc._id ? 'var(--bg3)' : 'transparent', cursor:'pointer' }}>
                <div style={{ fontSize:13, fontWeight:500, color: locationId===loc._id ? 'var(--mint)' : 'var(--text)' }}>{loc.name}</div>
                {loc.address && <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{loc.address}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {locations.length === 1 && (
        <div style={{ marginBottom:20 }}>
          <label style={labelStyle}>Location</label>
          <div style={{ fontSize:13, color:'var(--text2)' }}>
            {locations[0].name}{locations[0].address ? ` · ${locations[0].address}` : ''}
          </div>
        </div>
      )}

      <div style={{ marginBottom:16 }}>
        <label style={labelStyle}>{t('book.visitType')}</label>
        <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
          {apptTypes.map(at => (
            <button key={at.key} onClick={() => setVisitType(at.key)}
              style={{ padding:'6px 14px', borderRadius:20, border:`1px solid ${visitType===at.key ? 'var(--mint)' : 'var(--border2)'}`, background: visitType===at.key ? 'var(--mint-dim)' : 'transparent', color: visitType===at.key ? 'var(--mint)' : 'var(--text2)', fontSize:12, cursor:'pointer' }}>
              {at.label || at.key}
              {at.fee > 0 && <span style={{ fontSize:10, marginLeft:5, opacity:0.7 }}>{at.fee} {doctor?.currency || 'SAR'}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <label style={labelStyle}>{t('book.reason')}</label>
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
