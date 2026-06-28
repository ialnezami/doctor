import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getMyReviews, flagReview } from '../../api/reviews';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useIsMobile } from '../../hooks/useIsMobile';

function Stars({ rating, size = 15 }) {
  const full = Math.round(rating);
  return (
    <span style={{ fontSize: size, letterSpacing: 2, lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ color: n <= full ? 'var(--amber)' : 'var(--border2)' }}>★</span>
      ))}
    </span>
  );
}

function RatingBar({ star, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <span style={{ fontSize: 11, color: 'var(--text2)', width: 14, textAlign: 'right', flexShrink: 0 }}>{star}</span>
      <span style={{ fontSize: 11, color: 'var(--amber)', flexShrink: 0 }}>★</span>
      <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--amber)', borderRadius: 3, transition: 'width .4s ease' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text3)', width: 22, textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{count}</span>
    </div>
  );
}

function FlagModal({ reviewId, onClose, onDone, t }) {
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const submit = async () => {
    setLoading(true);
    try {
      await flagReview(reviewId, reason.trim());
      onDone();
    } catch (e) {
      setError(e.response?.data?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 24, width: 380, maxWidth: '90vw' }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{t('reviews.flagModal.title')}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>{t('reviews.flagModal.subtitle', 'The review will be marked for moderation.')}</div>
        <textarea
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 10, color: 'var(--text)', fontSize: 13, resize: 'vertical', minHeight: 80 }}
          placeholder={t('reviews.flagModal.reasonPlaceholder')}
          maxLength={500}
          value={reason}
          onChange={e => setReason(e.target.value)}
          autoFocus
        />
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', marginTop: 2 }}>{reason.length}/500</div>
        {error && <div style={{ color: 'var(--rose)', fontSize: 12, marginTop: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t('reviews.flagModal.cancel')}</Button>
          <Button variant="danger" onClick={submit} disabled={loading} style={{ flex: 1 }}>
            {loading ? '…' : t('reviews.flagModal.report')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ review, onFlag, t }) {
  const name     = review.patientId?.name || t('appointments.details.patient', 'Patient');
  const parts    = name.trim().split(' ').filter(Boolean);
  const initials = parts.slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const display  = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0] || '?';

  return (
    <div style={{ display: 'flex', gap: 14, padding: '14px 16px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 10 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--mint-dim)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: 'var(--mint)', flexShrink: 0 }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{display}</span>
          <Stars rating={review.rating} />
          <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>
            {new Date(review.createdAt).toLocaleDateString()}
          </span>
        </div>
        {review.comment && (
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 8 }}>{review.comment}</div>
        )}
        {review.flagged
          ? <span style={{ fontSize: 11, color: 'var(--text3)', display: 'inline-block' }}>{t('reviews.reported')}</span>
          : (
            <button
              onClick={() => onFlag(review._id)}
              style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 6, padding: '3px 9px', color: 'var(--rose)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              {t('reviews.report')}
            </button>
          )
        }
      </div>
    </div>
  );
}

const RATING_FILTERS = [0, 5, 4, 3, 2, 1];

export default function ReviewsPage() {
  const { t }       = useTranslation();
  const isMobile    = useIsMobile();

  const [data, setData]         = useState({ reviews: [], averageRating: 0, reviewCount: 0, distribution: {}, totalPages: 1 });
  const [page, setPage]         = useState(1);
  const [ratingFilter, setRatingFilter] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]       = useState('');
  const [flagModal, setFlagModal] = useState(null);

  const load = useCallback(async (p, rating, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const d = await getMyReviews(p, rating || '');
      setData(prev => append ? { ...d, reviews: [...prev.reviews, ...d.reviews] } : d);
      setPage(p);
    } catch {
      setError(t('common.errorLoading', 'Failed to load reviews.'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t]);

  useEffect(() => { load(1, ratingFilter); }, [ratingFilter]);

  const handleFilterChange = (r) => {
    if (r === ratingFilter) return;
    setRatingFilter(r);
    setPage(1);
  };

  const handleFlag = (id) => setFlagModal(id);
  const handleFlagDone = () => { setFlagModal(null); load(1, ratingFilter); };

  const { reviews, averageRating, reviewCount, distribution, totalPages } = data;
  const totalForDist = Object.values(distribution).reduce((s, c) => s + c, 0);

  return (
    <div>
      {/* Topbar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(6,13,24,0.88)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 500 }}>{t('reviews.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>{t('reviews.subtitle')}</div>
        </div>
        {!loading && reviewCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, color: 'var(--amber)', lineHeight: 1 }}>{averageRating.toFixed(1)}</span>
            <div>
              <Stars rating={averageRating} size={18} />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{reviewCount} {t('reviews.reviewsLabel', 'reviews')}</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: isMobile ? 14 : 26 }}>

        {/* Stats + Distribution */}
        {!loading && reviewCount > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 22 }}>
            <Card style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 700, color: 'var(--amber)', lineHeight: 1 }}>{averageRating.toFixed(1)}</div>
                <Stars rating={averageRating} size={20} />
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{reviewCount} {t('reviews.reviewsLabel', 'reviews')}</div>
              </div>
              <div style={{ flex: 1 }}>
                {[5, 4, 3, 2, 1].map(s => (
                  <RatingBar key={s} star={s} count={distribution[s] || 0} total={totalForDist} />
                ))}
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 12 }}>
                {t('reviews.quickStats', 'Quick Stats')}
              </div>
              {[5, 4, 3, 2, 1].map(s => {
                const count = distribution[s] || 0;
                const pct   = reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <button
                      onClick={() => handleFilterChange(ratingFilter === s ? 0 : s)}
                      style={{ background: ratingFilter === s ? 'var(--mint-dim)' : 'transparent', border: ratingFilter === s ? '1px solid rgba(15,227,176,0.2)' : '1px solid transparent', borderRadius: 6, padding: '3px 8px', color: ratingFilter === s ? 'var(--mint)' : 'var(--text2)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {s} <span style={{ color: 'var(--amber)' }}>★</span>
                    </button>
                    <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{count} ({pct}%)</span>
                  </div>
                );
              })}
            </Card>
          </div>
        )}

        {/* Rating filter pills */}
        {!loading && reviewCount > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {RATING_FILTERS.map(r => (
              <button
                key={r}
                onClick={() => handleFilterChange(r)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all .13s',
                  background: ratingFilter === r ? 'var(--mint)' : 'var(--bg3)',
                  color: ratingFilter === r ? '#000' : 'var(--text2)',
                  border: ratingFilter === r ? 'none' : '1px solid var(--border)',
                }}
              >
                {r === 0 ? t('reviews.filterAll', 'All') : `${r} ★`}
              </button>
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 16px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 10, opacity: 0.5 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--border)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: 120, height: 12, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
                  <div style={{ width: '80%', height: 10, background: 'var(--border)', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <Card style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠</div>
            <div style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 14 }}>{error}</div>
            <Button variant="outline" onClick={() => load(1, ratingFilter)}>{t('common.retry', 'Retry')}</Button>
          </Card>
        )}

        {/* Empty state */}
        {!loading && !error && reviewCount === 0 && (
          <Card style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{t('reviews.noReviews')}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('reviews.noReviewsHint', 'Reviews appear after patients complete a consultation.')}</div>
          </Card>
        )}

        {!loading && !error && reviewCount > 0 && reviews.length === 0 && (
          <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 32 }}>
            {t('reviews.noReviewsForFilter', 'No reviews match this filter.')}
          </div>
        )}

        {/* Review list */}
        {!loading && !error && reviews.map(r => (
          <ReviewCard key={r._id} review={r} onFlag={handleFlag} t={t} />
        ))}

        {/* Load more */}
        {!loading && !error && page < totalPages && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Button variant="ghost" onClick={() => load(page + 1, ratingFilter, true)} disabled={loadingMore}>
              {loadingMore ? '…' : t('reviews.loadMore')}
            </Button>
          </div>
        )}
      </div>

      {flagModal && (
        <FlagModal
          reviewId={flagModal}
          onClose={() => setFlagModal(null)}
          onDone={handleFlagDone}
          t={t}
        />
      )}
    </div>
  );
}
