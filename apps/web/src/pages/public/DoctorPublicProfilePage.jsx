import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Plain axios instance — no auth interceptor, no token injection.
// This endpoint is intentionally public.
const publicClient = axios.create({ baseURL: API_BASE });
publicClient.interceptors.response.use((res) => res.data);

const S = {
  page: {
    minHeight: '100vh',
    background: '#060d18',
    color: '#e2e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
    padding: '32px 16px',
  },
  centered: { maxWidth: 720, margin: '0 auto' },
  card: {
    background: '#0d1626',
    border: '1px solid #1e3a5f',
    borderRadius: 16,
    padding: 28,
    marginBottom: 20,
  },
  accent: { color: '#0fe3b0' },
  muted: { color: '#94a3b8', fontSize: 13 },
  label: { color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 },
  chip: {
    display: 'inline-block',
    background: '#0fe3b020',
    border: '1px solid #0fe3b040',
    color: '#0fe3b0',
    borderRadius: 99,
    padding: '3px 12px',
    fontSize: 12,
    margin: '3px 4px 3px 0',
  },
  badge: {
    display: 'inline-block',
    background: '#1e3a5f',
    color: '#93c5fd',
    borderRadius: 8,
    padding: '4px 12px',
    fontSize: 12,
    margin: '3px 4px 3px 0',
    border: '1px solid #2d4f7c',
  },
  divider: { borderTop: '1px solid #1e3a5f', margin: '18px 0' },
  bookBtn: {
    display: 'block',
    width: '100%',
    padding: '14px 0',
    background: '#0fe3b0',
    color: '#060d18',
    border: 'none',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 8,
    letterSpacing: '0.01em',
  },
};

function StatPill({ icon, value, label }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0fe3b0' }}>{value ?? '—'}</div>
      <div style={{ ...S.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function DoctorPublicProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    publicClient
      .get(`/doctors/public/${id}`)
      .then((data) => {
        if (!cancelled) setDoctor(data);
      })
      .catch((err) => {
        if (!cancelled) {
          if (err?.response?.status === 404 || err?.status === 404) {
            setNotFound(true);
          } else {
            // Treat unexpected errors as not-found for the public surface
            setNotFound(true);
          }
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id]);

  const handleBook = () => {
    // Check if user is authenticated via localStorage (works regardless of store hydration)
    const token = localStorage.getItem('token') ||
      (() => {
        try {
          const raw = localStorage.getItem('auth-storage');
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return parsed?.state?.token || null;
        } catch { return null; }
      })();

    if (!token) {
      navigate(`/login?redirect=/find-doctor`);
    } else {
      navigate(`/book/${id}`);
    }
  };

  if (loading) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#0fe3b0', fontSize: 14 }}>Loading profile…</div>
      </div>
    );
  }

  if (notFound || !doctor) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Doctor not found</div>
          <div style={{ ...S.muted, marginBottom: 20 }}>This profile may have been removed or the link is incorrect.</div>
          <button
            onClick={() => navigate('/')}
            style={{ background: '#0fe3b0', color: '#060d18', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/dr/${id}`;
  const edu = Array.isArray(doctor.education) ? doctor.education : [];
  const achievements = Array.isArray(doctor.achievements) ? doctor.achievements : [];
  const languages = Array.isArray(doctor.languages) ? doctor.languages : [];

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback for environments without clipboard API
      const el = document.createElement('textarea');
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={S.page}>
      <div style={S.centered}>

        {/* Header card */}
        <div style={S.card}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Avatar placeholder */}
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, #0fe3b0 0%, #0284c7 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32, fontWeight: 700, color: '#060d18', flexShrink: 0,
            }}>
              {(doctor.name || 'D').charAt(0).toUpperCase()}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>
                {doctor.name || 'Unknown Doctor'}
              </h1>
              {doctor.specialty && (
                <div style={{ ...S.accent, fontSize: 14, fontWeight: 500, marginTop: 4 }}>
                  {doctor.specialty}
                </div>
              )}
              {doctor.bio && (
                <div style={{ ...S.muted, marginTop: 8, lineHeight: 1.6 }}>
                  {doctor.bio}
                </div>
              )}
              {doctor.licenseNumber && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                  📋 License: <span style={{ color: '#94a3b8' }}>{doctor.licenseNumber}</span>
                </div>
              )}
            </div>
          </div>

          <div style={S.divider} />

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatPill icon="⭐" value={doctor.averageRating != null ? Number(doctor.averageRating).toFixed(1) : '—'} label={`${doctor.reviewCount ?? 0} reviews`} />
            {doctor.yearsOfExperience != null && (
              <StatPill icon="💼" value={doctor.yearsOfExperience} label="years exp." />
            )}
            {doctor.consultationFee != null && (
              <StatPill icon="💰" value={`$${doctor.consultationFee}`} label="consultation" />
            )}
          </div>

          <div style={S.divider} />

          {/* Languages */}
          {languages.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...S.label, marginBottom: 8 }}>🌐 Languages</div>
              <div>{languages.map((lang) => <span key={lang} style={S.chip}>{lang}</span>)}</div>
            </div>
          )}

          {/* Book CTA */}
          <button style={S.bookBtn} onClick={handleBook}>
            Book an Appointment
          </button>

          {/* Share link */}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              readOnly
              value={shareUrl}
              style={{
                flex: 1, background: '#0a1628', border: '1px solid #1e3a5f',
                borderRadius: 8, padding: '7px 12px', color: '#64748b', fontSize: 12,
                minWidth: 0,
              }}
            />
            <button
              onClick={handleCopy}
              style={{
                background: copied ? '#0fe3b020' : '#1e3a5f', border: '1px solid #2d4f7c',
                color: copied ? '#0fe3b0' : '#93c5fd', borderRadius: 8,
                padding: '7px 14px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {copied ? '✓ Copied' : 'Copy Link'}
            </button>
          </div>
        </div>

        {/* Education timeline */}
        {edu.length > 0 && (
          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>🎓 Education</div>
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              {/* Vertical line */}
              <div style={{
                position: 'absolute', left: 6, top: 4, bottom: 4,
                width: 2, background: '#1e3a5f', borderRadius: 2,
              }} />
              {edu.map((item, i) => (
                <div key={i} style={{ position: 'relative', marginBottom: i < edu.length - 1 ? 20 : 0 }}>
                  {/* Dot */}
                  <div style={{
                    position: 'absolute', left: -17, top: 4,
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#0fe3b0', border: '2px solid #060d18',
                  }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                    {item.degree || 'Degree'}
                  </div>
                  <div style={{ ...S.muted, marginTop: 2 }}>
                    {item.institution}{item.year ? ` · ${item.year}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Achievements */}
        {achievements.length > 0 && (
          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>🏆 Achievements</div>
            <div>
              {achievements.map((ach, i) => (
                <span key={i} style={S.badge}>{ach}</span>
              ))}
            </div>
          </div>
        )}

        {/* Bottom CTA (repeated for long profiles) */}
        {(edu.length > 0 || achievements.length > 0) && (
          <div style={{ ...S.card, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Ready to book?</div>
            <div style={{ ...S.muted, marginBottom: 14 }}>
              Schedule a consultation with {doctor.name?.split(' ')[0] || 'this doctor'} today.
            </div>
            <button
              style={{ ...S.bookBtn, display: 'inline-block', width: 'auto', padding: '12px 32px' }}
              onClick={handleBook}
            >
              Book Appointment
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
