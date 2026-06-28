import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusChip from '../../components/ui/StatusChip';
import { useIsMobile } from '../../hooks/useIsMobile';
import { getAppointments } from '../../api/appointments';
import { getPatientByUserId } from '../../api/patients';

function calcAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function refCode(id) {
  return '#P-' + String(id).slice(-4).toUpperCase();
}

export default function PatientRecordsPage() {
  const navigate  = useNavigate();
  const { t }     = useTranslation();
  const isMobile  = useIsMobile();

  const [patients, setPatients]         = useState([]);   // [{ userId, name, appts[] }]
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState(null); // userId
  const [profile, setProfile]           = useState(null); // Patient doc
  const [profileLoading, setProfileLoading] = useState(false);
  const [search, setSearch]             = useState('');

  // Load all appointments → derive unique patients + their appointment history
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
        if (list.length) setSelected(list[0].userId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // When selected patient changes, load their profile
  useEffect(() => {
    if (!selected) return;
    setProfile(null);
    setProfileLoading(true);
    getPatientByUserId(selected)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setProfileLoading(false));
  }, [selected]);

  const selectedData = patients.find(p => p.userId === selected);

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const initials = (name) =>
    name?.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(6,13,24,0.88)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 500 }}>{t('patientRecords.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>{t('patientRecords.subtitle')}</div>
        </div>
      </div>

      <div style={{ padding: isMobile ? 14 : 26 }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 20 }}>
          <span style={{ padding: '0 13px', color: 'var(--text3)', fontSize: 15 }}>⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('patientRecords.searchPlaceholder')}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '11px 0', color: 'var(--text)', fontSize: 13.5 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18 }}>
          {/* Patient list */}
          <div>
            {loading && [1, 2, 3].map(i => (
              <div key={i} style={{ height: 62, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 8, opacity: 0.4 }} />
            ))}
            {!loading && filtered.length === 0 && (
              <p style={{ color: 'var(--text3)', fontSize: 13 }}>{t('patientRecords.noPatients', 'No patients yet.')}</p>
            )}
            {!loading && filtered.map(p => {
              const age = profile && selected === p.userId ? calcAge(profile.dateOfBirth) : null;
              const tags = profile && selected === p.userId
                ? [...(profile.conditions || []), ...(profile.allergies || [])]
                : [];
              return (
                <div key={p.userId} onClick={() => setSelected(p.userId)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg3)', border: `1px solid ${selected === p.userId ? 'var(--mint)' : 'var(--border)'}`, borderRadius: 'var(--r-sm)', marginBottom: 8, cursor: 'pointer', transition: 'all .13s' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg,var(--mint),#0891b2)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {initials(p.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[age ? `${age}y` : null, ...tags.slice(0, 3)].filter(Boolean).join(' · ') || t('patientRecords.noProfile', 'No profile data')}
                    </div>
                  </div>
                  <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)', flexShrink: 0 }}>
                    {refCode(p.userId)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Patient detail */}
          {selectedData && (
            <Card>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 11, background: 'linear-gradient(135deg,var(--mint),#0891b2)', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, color: '#fff' }}>
                    {initials(selectedData.name)}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{selectedData.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>
                      {[
                        profile?.dateOfBirth ? `${calcAge(profile.dateOfBirth)}y` : null,
                        profile?.bloodType   || null,
                        refCode(selectedData.userId),
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
                <Button
                  style={{ padding: '6px 13px', fontSize: 12 }}
                  onClick={() => navigate('/prescriptions', { state: { patientId: selectedData.userId, patientName: selectedData.name } })}
                >
                  {t('patientRecords.prescribe')}
                </Button>
              </div>

              {/* Profile cards */}
              {profileLoading && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>Loading profile…</div>}

              {profile && (
                <>
                  {(profile.allergies?.length > 0 || profile.conditions?.length > 0) && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                      {(profile.conditions || []).map(c => (
                        <span key={c} style={{ padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>{c}</span>
                      ))}
                      {(profile.allergies || []).map(a => (
                        <span key={a} style={{ padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--rose)' }}>{a} ⚠</span>
                      ))}
                    </div>
                  )}
                  {!profile.dateOfBirth && !profile.bloodType && !profile.allergies?.length && !profile.conditions?.length && (
                    <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{t('records.noProfileData')}</p>
                  )}
                </>
              )}

              <div style={{ height: 1, background: 'var(--border)', margin: '10px 0 14px' }} />

              {/* Appointment history timeline */}
              <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 10 }}>
                {t('patientRecords.medicalHistory')}
              </div>
              {selectedData.appts.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text3)' }}>{t('patientRecords.noHistory', 'No appointments yet.')}</p>
              )}
              <div style={{ position: 'relative', paddingLeft: 26 }}>
                <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
                {[...selectedData.appts]
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((a, i) => {
                    const isActive = a.status === 'confirmed' || a.status === 'in_progress';
                    return (
                      <div key={a._id} style={{ position: 'relative', marginBottom: 14 }}>
                        <div style={{ position: 'absolute', left: -22, top: 5, width: isActive ? 9 : 7, height: isActive ? 9 : 7, borderRadius: '50%', background: isActive ? 'var(--mint)' : 'var(--text3)', border: '2px solid var(--bg)', boxShadow: isActive ? '0 0 0 3px var(--mint-dim)' : 'none' }} />
                        <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginBottom: 3 }}>
                          {new Date(a.date).toLocaleDateString()} {a.timeSlot?.start ? `· ${a.timeSlot.start}` : ''}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>{a.visitType}</div>
                          <StatusChip status={a.status} />
                        </div>
                        {a.reason && <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{a.reason}</div>}
                      </div>
                    );
                  })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
