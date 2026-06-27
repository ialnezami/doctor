import { useState, useEffect } from 'react';
import { getAppointments, updateStatus } from '../../api/appointments';
import { submitReview } from '../../api/reviews';
import { useNavigate } from 'react-router-dom';
import StatusChip from '../../components/ui/StatusChip';
import Button from '../../components/ui/Button';

const GRADIENTS = ['linear-gradient(135deg,#0fe3b0,#0891b2)','linear-gradient(135deg,#f59e0b,#ef4444)','linear-gradient(135deg,#8b5cf6,#3b82f6)'];

function isReviewEligible(appt) {
  if (appt.status !== 'validated') return false;
  return Date.now() - new Date(appt.updatedAt).getTime() <= 7 * 24 * 60 * 60 * 1000;
}

function StarPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} onClick={() => onChange(n)} style={{ fontSize: 30, cursor: 'pointer', color: n <= value ? 'var(--amber)' : 'var(--border2)', userSelect: 'none' }}>★</span>
      ))}
    </div>
  );
}

function ReviewModal({ appt, onClose, onDone }) {
  const [rating, setRating]   = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const submit = async () => {
    if (!rating) { setError('Please select a rating.'); return; }
    setLoading(true);
    try {
      await submitReview(appt._id, rating, comment.trim());
      onDone();
    } catch (e) {
      setError(e.response?.data?.message || 'Error submitting review.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 28, width: 420, maxWidth: '90vw' }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Leave a Review</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>{appt.doctorId?.name}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Rating</div>
        <StarPicker value={rating} onChange={setRating} />
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', margin: '16px 0 8px' }}>Comment (optional)</div>
        <textarea
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 10, color: 'var(--text)', fontSize: 13, resize: 'vertical', minHeight: 90 }}
          placeholder="Share your experience…"
          maxLength={1000}
          value={comment}
          onChange={e => setComment(e.target.value)}
        />
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', marginTop: 3 }}>{comment.length} / 1000</div>
        {error && <div style={{ color: 'var(--rose)', fontSize: 12, marginTop: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Button variant="ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button style={{ flex: 1 }} onClick={submit} disabled={loading}>{loading ? 'Submitting…' : 'Submit Review'}</Button>
        </div>
      </div>
    </div>
  );
}

export default function MyAppointmentsPage() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [reviewModal, setReviewModal]   = useState(null);

  const load = () => getAppointments().then(setAppointments).catch(() => {});
  useEffect(() => { load(); }, []);

  const cancel = async (id) => { await updateStatus(id, 'cancelled'); load(); };

  const upcoming = appointments.filter(a => ['pending','confirmed'].includes(a.status));
  const past     = appointments.filter(a => ['completed','cancelled','validated'].includes(a.status));

  const Card = ({ a, i, isPast }) => {
    const eligible = isPast && isReviewEligible(a);
    return (
      <div style={{ background: 'var(--bg3)', border: `1px solid ${!isPast ? 'rgba(15,227,176,0.25)' : 'var(--border)'}`, borderRadius: 'var(--r-sm)', marginBottom: 8, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: GRADIENTS[i%GRADIENTS.length], display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {a.doctorId?.name?.split(' ').slice(1,3).map(w=>w[0]).join('') || 'DR'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.doctorId?.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{new Date(a.date).toLocaleDateString()} · {a.timeSlot?.start}</div>
          </div>
          <StatusChip status={a.status} />
          {!isPast && a.status === 'confirmed' && (
            <button
              onClick={() => navigate(`/my-appointments/${a._id}/video`, { state: { otherPartyName: a.doctorId?.name || 'Doctor' } })}
              style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 6, padding: '5px 9px', color: '#a78bfa', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              🎥
            </button>
          )}
          {!isPast && (
            <button
              onClick={() => navigate(`/my-appointments/${a._id}/chat`, { state: { otherPartyName: a.doctorId?.name || 'Doctor' } })}
              style={{ background: 'var(--mint-dim)', border: '1px solid rgba(15,227,176,0.3)', borderRadius: 6, padding: '5px 9px', color: 'var(--mint)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              💬
            </button>
          )}
          {!isPast
            ? <Button variant="danger" style={{ padding: '5px 9px', fontSize: 11 }} onClick={() => cancel(a._id)}>Cancel</Button>
            : <Button variant="ghost" style={{ padding: '5px 9px', fontSize: 11 }} onClick={() => navigate('/records')}>Records</Button>}
        </div>
        {eligible && (
          <button onClick={() => setReviewModal(a)} style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'var(--mint-dim)', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--mint)', fontWeight: 700, fontSize: 12, cursor: 'pointer', textAlign: 'center' }}>
            ⭐ Leave a review
          </button>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(6,13,24,0.88)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)', padding: '14px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div><div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 500 }}>My Appointments</div><div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>Upcoming and past bookings</div></div>
        <Button onClick={() => navigate('/find-doctor')}>+ Book New</Button>
      </div>
      <div style={{ padding: 26 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 10 }}>Upcoming</div>
        {upcoming.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 20 }}>No upcoming appointments. <span style={{ color: 'var(--mint)', cursor: 'pointer' }} onClick={() => navigate('/find-doctor')}>Book one →</span></p>}
        {upcoming.map((a, i) => <Card key={a._id} a={a} i={i} isPast={false} />)}
        <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', margin: '20px 0 10px' }}>Past</div>
        {past.map((a, i) => <Card key={a._id} a={a} i={i} isPast={true} />)}
      </div>

      {reviewModal && (
        <ReviewModal
          appt={reviewModal}
          onClose={() => setReviewModal(null)}
          onDone={() => { setReviewModal(null); load(); }}
        />
      )}
    </div>
  );
}
