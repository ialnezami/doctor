import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile';
import { getAppointments } from '../../api/appointments';

function calcAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function refCode(id) {
  return '#P-' + String(id).slice(-4).toUpperCase();
}

function initials(name) {
  return name?.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
}

const STATUS_ORDER = { in_progress: 0, confirmed: 1, pending: 2, validated: 3, cancelled: 4 };

export default function PatientRecordsPage() {
  const navigate  = useNavigate();
  const { t }     = useTranslation();
  const isMobile  = useIsMobile();

  const [patients, setPatients] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');

  useEffect(() => {
    getAppointments()
      .then(appts => {
        const map = new Map();
        for (const a of appts) {
          const uid  = a.patientId?._id;
          const name = a.patientId?.name;
          if (!uid) continue;
          if (!map.has(uid)) map.set(uid, { userId: uid, name, appts: [] });
          map.get(uid).appts.push(a);
        }
        const list = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
        setPatients(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(6,13,24,0.88)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 26px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 500 }}>{t('patientRecords.title')}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
          {loading ? 'Loading…' : t('patientRecords.subtitle') || `${filtered.length} patient${filtered.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      <div style={{ padding: isMobile ? 14 : 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 20 }}>
          <span style={{ padding: '0 13px', color: 'var(--text3)', fontSize: 15 }}>⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('patientRecords.searchPlaceholder', 'Search patients…')}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '11px 0', color: 'var(--text)', fontSize: 13.5 }}
          />
        </div>

        {loading && [1, 2, 3, 4].map(i => (
          <div key={i} style={{ height: 66, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 8, opacity: 0.4 }} />
        ))}

        {!loading && filtered.length === 0 && (
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>{t('patientRecords.noPatients', 'No patients yet.')}</p>
        )}

        {!loading && filtered.map(p => {
          const lastAppt = [...p.appts].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
          const activeAppt = p.appts.find(a => STATUS_ORDER[a.status] <= 1);
          return (
            <div
              key={p.userId}
              onClick={() => navigate(`/patients/${p.userId}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 8, cursor: 'pointer', transition: 'all .13s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--mint)'; e.currentTarget.style.background = 'var(--bg2)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)'; }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,var(--mint),#0891b2)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {initials(p.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>
                  {p.appts.length} appointment{p.appts.length !== 1 ? 's' : ''}
                  {lastAppt ? ` · Last: ${new Date(lastAppt.date).toLocaleDateString()}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {activeAppt && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'var(--mint-dim)', border: '1px solid rgba(15,227,176,0.3)', color: 'var(--mint)' }}>
                    Active
                  </span>
                )}
                <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)', flexShrink: 0 }}>
                  {refCode(p.userId)}
                </span>
                <span style={{ color: 'var(--text3)', fontSize: 13 }}>›</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
