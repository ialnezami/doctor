import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getDoctors } from '../../api/doctors';
import Button from '../../components/ui/Button';
import { useIsMobile } from '../../hooks/useIsMobile';

const SPECIALTIES = [
  { key: 'All',                en: 'All' },
  { key: 'general',            en: 'General Medicine' },
  { key: 'dentistry',          en: 'Dentistry' },
  { key: 'ophthalmology',      en: 'Ophthalmology' },
  { key: 'pediatrics',         en: 'Pediatrics' },
  { key: 'obstetrics',         en: 'OB/GYN' },
  { key: 'internal_medicine',  en: 'Internal Medicine' },
  { key: 'ent',                en: 'ENT' },
  { key: 'cardiology',         en: 'Cardiology' },
  { key: 'orthopedics',        en: 'Orthopedics' },
  { key: 'general_surgery',    en: 'General Surgery' },
  { key: 'psychiatry',         en: 'Psychiatry' },
  { key: 'dermatology',        en: 'Dermatology' },
  { key: 'aesthetics',         en: 'Aesthetics' },
  { key: 'neurology',          en: 'Neurology' },
  { key: 'vascular',           en: 'Vascular' },
  { key: 'oncology',           en: 'Oncology' },
  { key: 'nutrition',          en: 'Nutrition' },
  { key: 'endocrinology',      en: 'Endocrinology & Diabetes' },
  { key: 'urology',            en: 'Urology' },
  { key: 'gastroenterology',   en: 'Gastroenterology' },
  { key: 'physical_therapy',   en: 'Physical Therapy' },
  { key: 'thoracic_surgery',   en: 'Thoracic Surgery' },
  { key: 'neurosurgery',       en: 'Neurosurgery' },
  { key: 'orthopedic_surgery', en: 'Orthopedic Surgery' },
  { key: 'vascular_surgery',   en: 'Vascular Surgery' },
];
const GRADIENTS = ['linear-gradient(135deg,#0fe3b0,#0891b2)','linear-gradient(135deg,#f59e0b,#ef4444)','linear-gradient(135deg,#8b5cf6,#3b82f6)','linear-gradient(135deg,#10b981,#0591d1)'];

export default function FindDoctorPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [spec, setSpec] = useState('All');
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [city, setCity]             = useState('');
  const [geoCoords, setGeoCoords]   = useState(null);   // { lat, lng } | null
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError]     = useState('');

  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search)         params.name      = search;
      if (spec !== 'All') params.specialty = SPECIALTIES.find(s => s.key === spec)?.en || spec;
      if (city.trim())    params.city      = city.trim();
      if (geoCoords) {
        params.lat    = geoCoords.lat;
        params.lng    = geoCoords.lng;
        params.radius = 10000;
      }
      const data = await getDoctors(params);
      setDoctors(data);
    } catch {
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, [search, spec, city, geoCoords]);

  useEffect(() => {
    const timer = setTimeout(fetchDoctors, 350);
    return () => clearTimeout(timer);
  }, [fetchDoctors]);

  const handleNearMe = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    setCity('');
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLoading(false);
      },
      () => {
        setGeoError('Location unavailable');
        setGeoLoading(false);
      },
      { timeout: 8000 }
    );
  };

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.88)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500 }}>{t('findDoctor.title')}</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>
            {loading ? t('findDoctor.searching') : t('findDoctor.results', { count: doctors.length })}
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? 14 : 26 }}>
        <div style={{ display:'flex', alignItems:'center', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden', marginBottom:16 }}>
          <span style={{ padding:'0 13px', color:'var(--text3)', fontSize:15 }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('findDoctor.searchPlaceholder')}
            style={{ flex:1, background:'transparent', border:'none', outline:'none', padding:'11px 0', color:'var(--text)', fontSize:13.5 }} />
        </div>

        {/* City + Near Me */}
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
          <div style={{ flex:1, display:'flex', alignItems:'center', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden' }}>
            <span style={{ padding:'0 11px', color:'var(--text3)', fontSize:14 }}>⊕</span>
            <input
              value={city}
              onChange={e => { setCity(e.target.value); setGeoCoords(null); setGeoError(''); }}
              placeholder="Filter by city…"
              style={{ flex:1, background:'transparent', border:'none', outline:'none', padding:'10px 0', color:'var(--text)', fontSize:13.5 }}
            />
            {geoCoords && (
              <button
                onClick={() => setGeoCoords(null)}
                style={{ display:'flex', alignItems:'center', gap:4, margin:'0 8px', padding:'3px 10px', borderRadius:12, border:'none', background:'var(--mint-dim)', color:'var(--mint)', fontSize:11.5, cursor:'pointer', fontWeight:500 }}
              >
                Near you ×
              </button>
            )}
          </div>
          {navigator.geolocation && (
            <button
              onClick={handleNearMe}
              disabled={geoLoading}
              style={{ padding:'8px 14px', borderRadius:'var(--r)', border:'1px solid var(--border2)', background:'transparent', color: geoLoading ? 'var(--text3)' : 'var(--text2)', fontSize:12.5, cursor: geoLoading ? 'not-allowed' : 'pointer', whiteSpace:'nowrap' }}
            >
              {geoLoading ? '…' : '📍 Near me'}
            </button>
          )}
        </div>
        {geoError && (
          <div style={{ fontSize:12, color:'#f87171', marginBottom:8 }}>{geoError}</div>
        )}

        <div style={{ display:'flex', gap:7, marginBottom:20, flexWrap:'wrap' }}>
          {SPECIALTIES.map(s => (
            <button key={s.key} onClick={() => setSpec(s.key)}
              style={{ padding:'5px 13px', borderRadius:20, border:`1px solid ${spec===s.key ? 'var(--mint)' : 'var(--border2)'}`, background: spec===s.key ? 'var(--mint-dim)' : 'transparent', color: spec===s.key ? 'var(--mint)' : 'var(--text2)', fontSize:12, fontWeight:500, cursor:'pointer' }}>
              {t(`findDoctor.specialties.${s.key}`, s.en)}
            </button>
          ))}
        </div>

        {loading && <p style={{ color:'var(--text3)', fontSize:13 }}>{t('findDoctor.loading')}</p>}
        {!loading && doctors.length === 0 && <p style={{ color:'var(--text3)', fontSize:13 }}>{t('findDoctor.noDoctors')}</p>}

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {doctors.map((doc, i) => {
            const user = doc.userId || {};
            const name = user.name || 'Unknown';
            const initials = name.split(' ').slice(1).map(w => w[0]).join('').slice(0,2) || name.slice(0,2).toUpperCase();
            return (
              <div key={doc._id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:18, display:'flex', gap:14, cursor:'pointer', transition:'all .18s', alignItems:'center' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--mint)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='none'; }}>
                <div style={{ width:52, height:52, borderRadius:11, background:GRADIENTS[i%GRADIENTS.length], display:'grid', placeItems:'center', fontSize:18, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {initials}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14.5, fontWeight:600 }}>{name}</div>
                  <div style={{ fontSize:12.5, color:'var(--mint)', margin:'3px 0' }}>{doc.specialty}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>
                    {doc.consultationFee ? `${doc.consultationFee} ${t('findDoctor.sar')}` : ''}
                    {doc.yearsOfExperience ? ` · ${t('findDoctor.exp', { years: doc.yearsOfExperience })}` : ''}
                  </div>
                </div>
                <Button onClick={() => navigate(`/doctor/${doc._id}`)} style={{ padding:'6px 13px', fontSize:12, flexShrink:0 }}>{t('findDoctor.view')}</Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
