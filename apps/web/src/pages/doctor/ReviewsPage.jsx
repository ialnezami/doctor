import { useState, useEffect } from 'react';
import { getDoctorReviews, flagReview } from '../../api/reviews';
import useAuthStore from '../../store/authStore';

function Stars({ rating, size = 16 }) {
  const full = Math.round(rating);
  return (
    <span style={{ fontSize: size, letterSpacing: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ color: n <= full ? 'var(--amber)' : 'var(--border2)' }}>★</span>
      ))}
    </span>
  );
}

function FlagModal({ reviewId, onClose, onDone }) {
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const submit = async () => {
    setLoading(true);
    try {
      await flagReview(reviewId, reason.trim());
      onDone();
    } catch (e) {
      setError(e.response?.data?.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 24, width: 380, maxWidth: '90vw' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Report this review?</div>
        <textarea
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 10, color: 'var(--text)', fontSize: 13, resize: 'vertical', minHeight: 80 }}
          placeholder="Reason (optional)"
          maxLength={500}
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        {error && <div style={{ color: 'var(--rose)', fontSize: 12, marginTop: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px 0', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex: 1, padding: '9px 0', background: 'var(--rose)', border: 'none', borderRadius: 'var(--r-sm)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: loading ? 0.6 : 1 }}>
            {loading ? '…' : 'Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  const { user }                    = useAuthStore();
  const [data, setData]             = useState({ reviews: [], averageRating: 0, reviewCount: 0, totalPages: 1 });
  const [page, setPage]             = useState(1);
  const [flagModal, setFlagModal]   = useState(null);

  const load = (p = 1) => {
    if (!user?.id) return;
    getDoctorReviews(user.id, p)
      .then(d => {
        setData(prev => p === 1 ? d : { ...d, reviews: [...prev.reviews, ...d.reviews] });
        setPage(p);
      })
      .catch(() => {});
  };

  useEffect(() => { load(1); }, [user?.id]);

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(6,13,24,0.88)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)', padding: '14px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 500 }}>My Reviews</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>Patient feedback on your consultations</div>
        </div>
        {data.reviewCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--amber)' }}>{data.averageRating}</span>
            <Stars rating={data.averageRating} size={20} />
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>({data.reviewCount})</span>
          </div>
        )}
      </div>

      <div style={{ padding: 26 }}>
        {data.reviewCount === 0 && <p style={{ color: 'var(--text3)', fontSize: 13 }}>No reviews yet.</p>}
        {data.reviews.map(r => {
          const name     = r.patientId?.name || 'Patient';
          const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');
          const display  = `${name.split(' ')[0]} ${name.split(' ')[1]?.[0] || ''}.`;
          return (
            <div key={r._id} style={{ display: 'flex', gap: 14, padding: '14px 16px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--mint-dim)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: 'var(--mint)', flexShrink: 0 }}>{initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{display}</span>
                  <Stars rating={r.rating} />
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                {r.comment && <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{r.comment}</div>}
                {!r.flagged
                  ? <button onClick={() => setFlagModal(r._id)} style={{ marginTop: 8, background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: 6, padding: '4px 10px', color: 'var(--rose)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      Report
                    </button>
                  : <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, display: 'inline-block' }}>⚑ Reported</span>
                }
              </div>
            </div>
          );
        })}

        {page < data.totalPages && (
          <button onClick={() => load(page + 1)} style={{ display: 'block', margin: '0 auto', padding: '9px 24px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
            Load more
          </button>
        )}
      </div>

      {flagModal && (
        <FlagModal
          reviewId={flagModal}
          onClose={() => setFlagModal(null)}
          onDone={() => { setFlagModal(null); load(1); }}
        />
      )}
    </div>
  );
}
