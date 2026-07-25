import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getDoctor, getAvailableSlots } from '../../api/doctors';
import { getDoctorReviews } from '../../api/reviews';
import Button from '../../components/ui/Button';
import { useIsMobile } from '../../hooks/useIsMobile';
import client from '../../api/client';

const REPORT_REASONS = [
  { value: 'fraud',                 label: 'Fraud / Fake credentials' },
  { value: 'harassment',            label: 'Harassment' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'fake_profile',          label: 'Fake profile' },
  { value: 'spam',                  label: 'Spam' },
  { value: 'other',                 label: 'Other' },
];

function ReportModal({ doctorUserId, onClose }) {
  const [reason, setReason]       = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState('');

  const submit = async () => {
    if (!reason) return;
    setSubmitting(true);
    setError('');
    try {
      await client.post('/reports', { targetType: 'user', targetId: doctorUserId, reason, description });
      setDone(true);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--bg2,#0d1a2b)', border:'1px solid var(--border)', borderRadius:12, padding:24, width:'100%', maxWidth:420 }}>
        {done ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>✓</div>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:8 }}>Report submitted</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:20 }}>Our team will review it shortly.</div>
            <button onClick={onClose} style={{ padding:'8px 24px', background:'var(--mint)', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', color:'#000' }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>Report this doctor</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Reason</div>
              {REPORT_REASONS.map(r => (
                <label key={r.value} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, cursor:'pointer', fontSize:13 }}>
                  <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                  {r.label}
                </label>
              ))}
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Additional details (optional)</div>
              <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={3}
                style={{ width:'100%', boxSizing:'border-box', padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', fontSize:13, resize:'vertical', outline:'none' }} />
            </div>
            {error && <div style={{ fontSize:12, color:'#f43f5e', marginBottom:10 }}>{error}</div>}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={onClose} style={{ padding:'8px 16px', background:'none', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text2)', cursor:'pointer', fontSize:13 }}>Cancel</button>
              <button onClick={submit} disabled={!reason || submitting}
                style={{ padding:'8px 16px', background:'rgba(244,63,94,0.15)', border:'1px solid rgba(244,63,94,0.3)', borderRadius:8, color:'#f43f5e', fontWeight:600, cursor: !reason || submitting ? 'not-allowed' : 'pointer', fontSize:13, opacity: !reason || submitting ? 0.6 : 1 }}>
                {submitting ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function dateLabel(d) { return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }); }
function toISO(d) { return d.toISOString().slice(0,10); }

function Stars({ rating, size = 16 }) {
  const full = Math.round(rating);
  return (
    <span style={{ fontSize: size, letterSpacing: 2 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{ color: n <= full ? 'var(--amber)' : 'var(--border2)' }}>★</span>
      ))}
    </span>
  );
}

export default function DoctorProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [doctor, setDoctor]             = useState(null);
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()));
  const [slots, setSlots]               = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [reviewData, setReviewData]     = useState({ reviews: [], averageRating: 0, reviewCount: 0 });
  const [showReport, setShowReport]     = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d;
  });

  useEffect(() => { getDoctor(id).then(setDoctor).catch(() => {}); }, [id]);
  useEffect(() => { getDoctorReviews(id, 1).then(setReviewData).catch(() => {}); }, [id]);
  useEffect(() => {
    setSlotsLoading(true);
    getAvailableSlots(id, selectedDate).then(setSlots).catch(() => setSlots([])).finally(() => setSlotsLoading(false));
  }, [id, selectedDate]);

  if (!doctor) return <div style={{ padding:40, color:'var(--text2)' }}>{t('doctorProfile.loading')}</div>;

  const doctorUserId = (doctor.userId?._id || doctor.userId || id);

  const user = doctor.userId || {};
  const name = user.name || t('myAppts.doctor');
  const { reviews, averageRating, reviewCount } = reviewData;

  return (
    <div style={{ padding: isMobile ? 14 : 26, maxWidth:680 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding: isMobile ? 16 : 24, marginBottom:24 }}>
        <div style={{ display:'flex', gap:16, alignItems:'flex-start', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <div style={{ width:64, height:64, borderRadius:14, background:'linear-gradient(135deg,#0fe3b0,#0891b2)', display:'grid', placeItems:'center', fontSize:22, fontWeight:700, color:'#fff', flexShrink:0 }}>
            {name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('')}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18, fontWeight:600 }}>{name}</div>
            <div style={{ fontSize:13, color:'var(--mint)', marginTop:3 }}>{doctor.specialty}</div>
            {doctor.bio && <div style={{ fontSize:12.5, color:'var(--text2)', marginTop:8 }}>{doctor.bio}</div>}
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:8, display:'flex', gap:16, flexWrap:'wrap' }}>
              {doctor.consultationFee > 0 && <span>{doctor.consultationFee} {t('doctorProfile.sar')}</span>}
              {doctor.yearsOfExperience > 0 && <span>{t('doctorProfile.yearsExp', { years: doctor.yearsOfExperience })}</span>}
              {doctor.clinicAddress && <span>📍 {doctor.clinicAddress}</span>}
            </div>
            {reviewCount > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, flexWrap:'wrap' }}>
                <Stars rating={averageRating} />
                <span style={{ fontSize:15, fontWeight:700, color:'var(--amber)' }}>{averageRating}</span>
                <span style={{ fontSize:12, color:'var(--text3)' }}>{t('doctorProfile.reviewCount', { count: reviewCount })}</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ marginTop:14, display:'flex', justifyContent:'flex-end' }}>
          <button onClick={() => setShowReport(true)}
            style={{ background:'none', border:'none', color:'var(--text3)', fontSize:12, cursor:'pointer', textDecoration:'underline' }}>
            Report this doctor
          </button>
        </div>
      </div>

      {showReport && <ReportModal doctorUserId={doctorUserId} onClose={() => setShowReport(false)} />}

      <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>{t('doctorProfile.pickDate')}</div>
      <div style={{ display:'flex', gap:8, marginBottom:20, overflowX:'auto', paddingBottom:4 }}>
        {days.map(d => {
          const iso = toISO(d); const active = iso === selectedDate;
          return (
            <button key={iso} onClick={() => setSelectedDate(iso)}
              style={{ flexShrink:0, padding:'8px 14px', borderRadius:'var(--r-sm)', border:`1px solid ${active ? 'var(--mint)' : 'var(--border2)'}`, background: active ? 'var(--mint-dim)' : 'var(--bg2)', color: active ? 'var(--mint)' : 'var(--text2)', fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
              {dateLabel(d)}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>{t('doctorProfile.availableTimes')}</div>
      {slotsLoading && <p style={{ fontSize:12, color:'var(--text3)' }}>{t('doctorProfile.loadingSlots')}</p>}
      {!slotsLoading && slots.length === 0 && <p style={{ fontSize:12, color:'var(--text3)' }}>{t('doctorProfile.noAvailability')}</p>}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:28 }}>
        {slots.map(s => (
          <button key={s.time} disabled={!s.available}
            onClick={() => navigate(`/book/${id}?date=${selectedDate}&slot=${s.time}`)}
            style={{ padding:'8px 16px', borderRadius:20, border:`1px solid ${s.available ? 'var(--mint)' : 'var(--border)'}`, background: s.available ? 'var(--mint-dim)' : 'var(--bg3)', color: s.available ? 'var(--mint)' : 'var(--text3)', fontSize:12.5, cursor: s.available ? 'pointer' : 'default', opacity: s.available ? 1 : 0.5 }}>
            {s.time}
          </button>
        ))}
      </div>

      {reviews.length > 0 && (
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:14 }}>{t('doctorProfile.reviews')}</div>
          {reviews.slice(0,5).map(r => {
            const pname = r.patientId?.name || t('doctorProfile.patient');
            const initials = pname.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('');
            const display = `${pname.split(' ')[0]} ${pname.split(' ')[1]?.[0] || ''}.`;
            return (
              <div key={r._id} style={{ display:'flex', gap:12, padding:'12px 14px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', marginBottom:8 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--mint-dim)', display:'grid', placeItems:'center', fontSize:12, fontWeight:700, color:'var(--mint)', flexShrink:0 }}>{initials}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ fontSize:13, fontWeight:500 }}>{display}</span>
                    <Stars rating={r.rating} />
                    <span style={{ fontSize:11, color:'var(--text3)', marginLeft:'auto' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  {r.comment && <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.5 }}>{r.comment}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
