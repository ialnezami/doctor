import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const publicClient = axios.create({ baseURL: API_BASE });
publicClient.interceptors.response.use((res) => res.data);

const C = {
  bg:        '#060d18',
  card:      '#0d1626',
  card2:     '#111d2e',
  border:    '#1e3a5f',
  border2:   '#2d4f7c',
  mint:      '#0fe3b0',
  mintDim:   '#0fe3b015',
  mintBorder:'#0fe3b030',
  text:      '#f1f5f9',
  text2:     '#94a3b8',
  text3:     '#64748b',
  amber:     '#f59e0b',
  blue:      '#93c5fd',
  rose:      '#f43f5e',
  blueDim:   '#1e3a5f',
};

const S = {
  page:    { minHeight:'100vh', background:C.bg, color:C.text, fontFamily:'Inter,system-ui,sans-serif', padding:'24px 16px 48px' },
  wrap:    { maxWidth:700, margin:'0 auto' },
  card:    { background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:24, marginBottom:16 },
  label:   { color:C.text3, fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600 },
  muted:   { color:C.text2, fontSize:13 },
  chip:    { display:'inline-block', background:C.mintDim, border:`1px solid ${C.mintBorder}`, color:C.mint, borderRadius:99, padding:'3px 12px', fontSize:12, margin:'3px 4px 3px 0' },
  badge:   { display:'inline-block', background:C.blueDim, color:C.blue, borderRadius:8, padding:'4px 12px', fontSize:12, margin:'3px 4px 3px 0', border:`1px solid ${C.border2}` },
  divider: { borderTop:`1px solid ${C.border}`, margin:'18px 0' },
  bookBtn: { display:'block', width:'100%', padding:'14px 0', background:C.mint, color:'#060d18', border:'none', borderRadius:10, fontSize:15, fontWeight:700, cursor:'pointer', letterSpacing:'0.01em' },
};

function Stars({ rating }) {
  const full = Math.round(rating || 0);
  return (
    <span>
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{ fontSize:15, color: n <= full ? C.amber : C.border2 }}>★</span>
      ))}
    </span>
  );
}

function StatPill({ value, label, sub }) {
  return (
    <div style={{ flex:1, textAlign:'center', padding:'14px 8px', background:C.card2, borderRadius:12, border:`1px solid ${C.border}` }}>
      <div style={{ fontSize:20, fontWeight:700, color:C.mint }}>{value ?? '—'}</div>
      <div style={{ fontSize:11, color:C.text2, marginTop:3 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:C.text3, marginTop:1 }}>{sub}</div>}
    </div>
  );
}

function ApptTypeCard({ type }) {
  const labelMap = { initial:'Initial Visit', 'follow-up':'Follow-Up', 'check-up':'Check-Up', urgent:'Urgent' };
  const label = type.label?.trim() || labelMap[type.key] || type.key;
  return (
    <div style={{ padding:'12px 16px', background:C.card2, borderRadius:12, border:`1px solid ${C.border}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{label}</div>
          <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>{type.duration} min</div>
        </div>
        {type.fee > 0
          ? <div style={{ fontSize:15, fontWeight:700, color:C.mint }}>{type.fee} <span style={{ fontSize:11, fontWeight:400, color:C.text3 }}>SAR</span></div>
          : <div style={{ fontSize:12, color:C.text3 }}>Included</div>
        }
      </div>
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
    publicClient.get(`/doctors/public/${id}`)
      .then(data => { if (!cancelled) setDoctor(data); })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const handleBook = () => {
    const token = localStorage.getItem('token') || (() => {
      try {
        const raw = localStorage.getItem('auth-storage');
        return raw ? JSON.parse(raw)?.state?.token || null : null;
      } catch { return null; }
    })();
    navigate(token ? `/book/${id}` : `/login?redirect=/find-doctor`);
  };

  const handleCopy = () => {
    const url = `${window.location.origin}/dr/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:40, height:40, border:`3px solid ${C.border}`, borderTopColor:C.mint, borderRadius:'50%', margin:'0 auto 14px', animation:'spin 0.8s linear infinite' }} />
          <div style={{ color:C.text3, fontSize:13 }}>Loading profile…</div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (notFound || !doctor) {
    return (
      <div style={{ ...S.page, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🔍</div>
          <div style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>Doctor not found</div>
          <div style={{ ...S.muted, marginBottom:20 }}>This profile may have been removed or the link is incorrect.</div>
          <button onClick={() => navigate('/')} style={{ background:C.mint, color:'#060d18', border:'none', borderRadius:8, padding:'10px 24px', fontWeight:600, cursor:'pointer', fontSize:14 }}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const name        = doctor.userId?.name || doctor.name || 'Doctor';
  const initials    = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const edu         = Array.isArray(doctor.education)     ? doctor.education     : [];
  const achievements= Array.isArray(doctor.achievements)  ? doctor.achievements  : [];
  const languages   = Array.isArray(doctor.languages)     ? doctor.languages     : [];
  const apptTypes   = (Array.isArray(doctor.appointmentTypes) ? doctor.appointmentTypes : []).filter(t => t.enabled);
  const locations   = (Array.isArray(doctor.locations)    ? doctor.locations     : []).filter(l => l.type === 'bookable');
  const shareUrl    = `${window.location.origin}/dr/${id}`;

  return (
    <div style={S.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={S.wrap}>

        {/* Hero card */}
        <div style={S.card}>
          <div style={{ display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap' }}>
            {/* Avatar */}
            <div style={{
              width:88, height:88, borderRadius:'50%', flexShrink:0,
              background:'linear-gradient(135deg, #0fe3b0 0%, #0284c7 100%)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:30, fontWeight:700, color:'#060d18',
              boxShadow:`0 0 0 3px ${C.bg}, 0 0 0 5px ${C.border}`,
            }}>
              {initials || 'D'}
            </div>

            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:C.text }}>{name}</h1>
                {doctor.isVerified && (
                  <span style={{ background:'#0fe3b020', color:C.mint, border:`1px solid ${C.mintBorder}`, borderRadius:99, padding:'2px 10px', fontSize:11, fontWeight:600 }}>
                    Verified
                  </span>
                )}
              </div>
              {doctor.specialty && (
                <div style={{ color:C.mint, fontSize:14, fontWeight:500, marginTop:4 }}>{doctor.specialty}</div>
              )}
              {doctor.licenseNumber && (
                <div style={{ fontSize:12, color:C.text3, marginTop:5 }}>
                  License: <span style={{ color:C.text2 }}>{doctor.licenseNumber}</span>
                </div>
              )}
              {doctor.bio && (
                <p style={{ margin:'10px 0 0', fontSize:13, color:C.text2, lineHeight:1.65, maxWidth:480 }}>{doctor.bio}</p>
              )}
            </div>
          </div>

          {/* Stats row */}
          {(doctor.reviewCount > 0 || doctor.yearsOfExperience > 0 || doctor.consultationFee > 0) && (
            <>
              <div style={S.divider} />
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {doctor.reviewCount > 0 && (
                  <div style={{ flex:1, minWidth:90, textAlign:'center', padding:'14px 8px', background:C.card2, borderRadius:12, border:`1px solid ${C.border}` }}>
                    <Stars rating={doctor.averageRating} />
                    <div style={{ fontSize:18, fontWeight:700, color:C.amber, marginTop:2 }}>
                      {Number(doctor.averageRating).toFixed(1)}
                    </div>
                    <div style={{ fontSize:11, color:C.text2, marginTop:2 }}>{doctor.reviewCount} reviews</div>
                  </div>
                )}
                {doctor.yearsOfExperience > 0 && (
                  <StatPill value={`${doctor.yearsOfExperience}y`} label="Experience" />
                )}
                {doctor.consultationFee > 0 && (
                  <StatPill value={`${doctor.consultationFee}`} label="SAR" sub="per visit" />
                )}
              </div>
            </>
          )}

          {/* Languages */}
          {languages.length > 0 && (
            <>
              <div style={S.divider} />
              <div style={{ ...S.label, marginBottom:8 }}>Languages</div>
              <div>{languages.map(lang => <span key={lang} style={S.chip}>{lang}</span>)}</div>
            </>
          )}

          <div style={S.divider} />

          {/* Book CTA */}
          <button style={S.bookBtn} onClick={handleBook}>Book an Appointment</button>

          {/* Share link */}
          <div style={{ marginTop:14, display:'flex', gap:8, alignItems:'center' }}>
            <input readOnly value={shareUrl} style={{ flex:1, minWidth:0, background:'#0a1628', border:`1px solid ${C.border}`, borderRadius:8, padding:'7px 12px', color:C.text3, fontSize:12, outline:'none' }} />
            <button onClick={handleCopy} style={{ background: copied ? C.mintDim : C.blueDim, border:`1px solid ${C.border2}`, color: copied ? C.mint : C.blue, borderRadius:8, padding:'7px 14px', fontSize:12, cursor:'pointer', whiteSpace:'nowrap', transition:'all .2s' }}>
              {copied ? '✓ Copied' : 'Copy Link'}
            </button>
          </div>
        </div>

        {/* Appointment Types */}
        {apptTypes.length > 0 && (
          <div style={S.card}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>Appointment Types</div>
            <div style={{ fontSize:12, color:C.text3, marginBottom:16 }}>Select the type when booking</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10 }}>
              {apptTypes.map((t, i) => <ApptTypeCard key={i} type={t} />)}
            </div>
            <button style={{ ...S.bookBtn, marginTop:16 }} onClick={handleBook}>Book Now</button>
          </div>
        )}

        {/* Clinic Locations */}
        {locations.length > 0 && (
          <div style={S.card}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>Clinic Locations</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {locations.map((loc, i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', background:C.card2, borderRadius:12, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:20, flexShrink:0, marginTop:1 }}>📍</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{loc.name}</div>
                    {loc.address && <div style={{ fontSize:12, color:C.text3, marginTop:3 }}>{loc.address}</div>}
                    {loc.contactNote && <div style={{ fontSize:12, color:C.text2, marginTop:3 }}>{loc.contactNote}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {edu.length > 0 && (
          <div style={S.card}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>Education</div>
            <div style={{ position:'relative', paddingLeft:20 }}>
              <div style={{ position:'absolute', left:6, top:4, bottom:4, width:2, background:C.border, borderRadius:2 }} />
              {edu.map((item, i) => (
                <div key={i} style={{ position:'relative', marginBottom: i < edu.length - 1 ? 20 : 0 }}>
                  <div style={{ position:'absolute', left:-17, top:5, width:8, height:8, borderRadius:'50%', background:C.mint, border:`2px solid ${C.bg}` }} />
                  <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{item.degree || 'Degree'}</div>
                  <div style={{ ...S.muted, marginTop:2 }}>
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
            <div style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>Achievements</div>
            <div>{achievements.map((ach, i) => <span key={i} style={S.badge}>{ach}</span>)}</div>
          </div>
        )}

        {/* Bottom CTA */}
        {(edu.length > 0 || achievements.length > 0 || apptTypes.length > 0) && (
          <div style={{ ...S.card, textAlign:'center' }}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Ready to book?</div>
            <div style={{ ...S.muted, marginBottom:16 }}>
              Schedule a consultation with {name.split(' ')[0]} today.
            </div>
            <button style={{ ...S.bookBtn, display:'inline-block', width:'auto', padding:'12px 40px' }} onClick={handleBook}>
              Book Appointment
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
