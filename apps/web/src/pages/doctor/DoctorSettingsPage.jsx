import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { updateDoctorSettings, getDoctorLocations, addDoctorLocation, updateDoctorLocation, deleteDoctorLocation, getPlatformCurrencies } from '../../api/doctors';
import useAuthStore from '../../store/authStore';
import Button from '../../components/ui/Button';
import client from '../../api/client';
import { getNotificationPrefs, updateNotificationPrefs } from '../../api/users';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { getStaff, inviteSecretary, revokeSecretary } from '../../api/staff';

const TIMEZONES = [
  { label: 'UTC',                 value: 'UTC' },
  { label: 'Riyadh (AST +3)',     value: 'Asia/Riyadh' },
  { label: 'Dubai (GST +4)',      value: 'Asia/Dubai' },
  { label: 'Kuwait (AST +3)',     value: 'Asia/Kuwait' },
  { label: 'Cairo (EET +2)',      value: 'Africa/Cairo' },
  { label: 'London (GMT)',        value: 'Europe/London' },
  { label: 'Paris (CET +1)',      value: 'Europe/Paris' },
  { label: 'New York (ET -5)',    value: 'America/New_York' },
  { label: 'Los Angeles (PT -8)', value: 'America/Los_Angeles' },
  { label: 'Karachi (PKT +5)',    value: 'Asia/Karachi' },
  { label: 'Mumbai (IST +5:30)', value: 'Asia/Kolkata' },
  { label: 'Singapore (SGT +8)', value: 'Asia/Singapore' },
];

const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];

const SHARE_BASE = 'https://web-production-1d93d.up.railway.app';

export default function DoctorSettingsPage({ initialTab }) {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const [doctorId, setDoctorId] = useState(null);
  const [autoAccept, setAutoAccept] = useState(false);
  const [slots, setSlots] = useState([]);
  const [timezone, setTimezone] = useState('UTC');
  const [consultationFee, setConsultationFee] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [availableCurrencies, setAvailableCurrencies] = useState([{ code: 'SAR', name: 'Saudi Riyal' }]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);

  // Rich profile fields
  const [bio, setBio] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [languagesRaw, setLanguagesRaw] = useState('');   // comma-separated string
  const [education, setEducation] = useState([]);          // [{degree, institution, year}]
  const [achievementsRaw, setAchievementsRaw] = useState(''); // comma-separated string

  // Locations
  const [locations, setLocations] = useState([]);
  const [editingLocId, setEditingLocId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDraft, setAddDraft] = useState({ name: '', address: '', type: 'bookable' });
  const [locError, setLocError] = useState('');
  const [locSaving, setLocSaving] = useState(false);

  // Share panel UI state
  const [copied, setCopied] = useState(false);

  // Staff / Secretaries state
  const [staffList,    setStaffList]    = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [inviteEmail,  setInviteEmail]  = useState('');
  const [inviting,     setInviting]     = useState(false);
  const [staffError,   setStaffError]   = useState('');
  const [staffSuccess, setStaffSuccess] = useState('');

  const DAYS = DAY_KEYS.map(k => t(`common.days.${k}`));

  useEffect(() => {
    client.get('/doctors').then(docs => {
      const profile = docs.find(d => (d.userId?._id || d.userId) === user.id);
      if (profile) {
        setDoctorId(profile._id);
        setAutoAccept(profile.autoAcceptAppointments || false);
        setSlots(profile.availabilitySlots || []);
        setTimezone(profile.timezone || 'UTC');
        setConsultationFee(profile.consultationFee != null ? String(profile.consultationFee) : '');
        setCurrency(profile.currency || 'SAR');
        setBio(profile.bio || '');
        setYearsOfExperience(profile.yearsOfExperience != null ? String(profile.yearsOfExperience) : '');
        setLicenseNumber(profile.licenseNumber || '');
        setLanguagesRaw((profile.languages || []).join(', '));
        setEducation(profile.education || []);
        setAchievementsRaw((profile.achievements || []).join(', '));
        getDoctorLocations(profile._id).then(locs => setLocations(locs || [])).catch(() => {});
      }
    }).catch(() => {});

    getNotificationPrefs().then(data => {
      if (data?.notificationPrefs) {
        setPushEnabled(data.notificationPrefs.pushEnabled);
        setEmailEnabled(data.notificationPrefs.emailEnabled);
      }
    }).catch(() => {});

    getPlatformCurrencies().then(data => {
      if (data?.currencies?.length) setAvailableCurrencies(data.currencies);
    }).catch(() => {});
  }, [user.id]);

  const addSlot = () => setSlots(s => [...s, { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }]);
  const removeSlot = (i) => setSlots(s => s.filter((_, idx) => idx !== i));
  const updateSlot = (i, key, val) => setSlots(s => s.map((sl, idx) => idx === i ? { ...sl, [key]: val } : sl));

  // Location handlers
  const startEditLoc = (loc) => { setEditingLocId(loc._id); setEditDraft({ name: loc.name, address: loc.address || '', type: loc.type }); setLocError(''); };
  const cancelEditLoc = () => { setEditingLocId(null); setEditDraft({}); setLocError(''); };
  const saveEditLoc = async () => {
    if (!editDraft.name?.trim()) { setLocError('Name is required'); return; }
    setLocSaving(true);
    try {
      const updated = await updateDoctorLocation(editingLocId, editDraft);
      setLocations(ls => ls.map(l => l._id === editingLocId ? updated : l));
      setEditingLocId(null); setLocError('');
    } catch (e) { setLocError(e.message || 'Failed to update location'); }
    finally { setLocSaving(false); }
  };
  const deleteLoc = async (locId) => {
    setLocSaving(true);
    try {
      await deleteDoctorLocation(locId);
      setLocations(ls => ls.filter(l => l._id !== locId));
      setLocError('');
    } catch (e) { setLocError(e.message || 'Failed to delete location'); }
    finally { setLocSaving(false); }
  };
  const addLoc = async () => {
    if (!addDraft.name?.trim()) { setLocError('Name is required'); return; }
    setLocSaving(true);
    try {
      const created = await addDoctorLocation(addDraft);
      setLocations(ls => [...ls, created]);
      setShowAddForm(false); setAddDraft({ name: '', address: '', type: 'bookable' }); setLocError('');
    } catch (e) { setLocError(e.message || 'Failed to add location'); }
    finally { setLocSaving(false); }
  };

  // Education helpers
  const addEduRow = () => setEducation(e => [...e, { degree: '', institution: '', year: '' }]);
  const removeEduRow = (i) => setEducation(e => e.filter((_, idx) => idx !== i));
  const updateEdu = (i, key, val) => setEducation(e => e.map((row, idx) => idx === i ? { ...row, [key]: val } : row));

  const save = async () => {
    if (!doctorId) return;
    setSaving(true);
    try {
      const languages = languagesRaw.split(',').map(s => s.trim()).filter(Boolean);
      const achievements = achievementsRaw.split(',').map(s => s.trim()).filter(Boolean);
      const fee = consultationFee.trim() === '' ? 0 : Number(consultationFee);
      const yoe = yearsOfExperience.trim() === '' ? 0 : Number(yearsOfExperience);
      await updateDoctorSettings(doctorId, {
        autoAcceptAppointments: autoAccept,
        availabilitySlots: slots,
        timezone,
        consultationFee: fee,
        currency,
        bio: bio.trim() || '',
        yearsOfExperience: yoe,
        licenseNumber: licenseNumber.trim() || '',
        languages,
        education,
        achievements,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  };

  const saveLabel = saving ? t('settings.saving') : saved ? t('settings.saved') : t('settings.saveSettings');

  const shareUrl = doctorId ? `${SHARE_BASE}/dr/${doctorId}` : null;

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
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

  // Staff handlers
  const loadStaff = useCallback(() => {
    setStaffLoading(true);
    getStaff()
      .then(d => setStaffList(d.secretaries || []))
      .catch(() => setStaffError('تعذر تحميل قائمة الموظفين'))
      .finally(() => setStaffLoading(false));
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true); setStaffError(''); setStaffSuccess('');
    try {
      await inviteSecretary(inviteEmail.trim());
      setStaffSuccess('تم إرسال الدعوة');
      setInviteEmail('');
      loadStaff();
    } catch (err) {
      setStaffError(err.response?.data?.message || err.message || 'تعذر إرسال الدعوة');
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (userId) => {
    if (!window.confirm('هل تريد إلغاء وصول هذا الموظف؟')) return;
    try {
      await revokeSecretary(userId);
      setStaffList(prev => prev.map(s => s._id === userId ? { ...s, isActive: false } : s));
    } catch {
      setStaffError('تعذر إلغاء الوصول');
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg3)',
    color: 'var(--text)',
    fontSize: 13,
    boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: isMobile ? 14 : 26, maxWidth:600 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500, marginBottom:24 }}>{t('settings.title')}</div>

      {/* Share Profile */}
      {doctorId && (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:500, marginBottom:4 }}>{t('settings.shareProfile.title')}</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>
            {t('settings.shareProfile.desc')}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input
              readOnly
              value={shareUrl}
              style={{ ...inputStyle, color:'var(--text2)', cursor:'text', flex:1 }}
            />
            <button
              onClick={handleCopy}
              style={{
                background: copied ? 'var(--mint,#0fe3b0)' : 'var(--bg3)',
                border: '1px solid var(--border)',
                color: copied ? '#060d18' : 'var(--text)',
                borderRadius: 6,
                padding: '8px 14px',
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontWeight: copied ? 600 : 400,
                transition: 'background .2s, color .2s',
              }}
            >
              {copied ? t('settings.shareProfile.copied') : t('settings.shareProfile.copy')}
            </button>
          </div>
        </div>
      )}

      {/* Rich Profile Info */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:14 }}>{t('settings.profileInfo.title')}</div>

        {/* Bio */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, color:'var(--text2)', marginBottom:5 }}>{t('settings.profileInfo.bio')}</label>
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder={t('settings.profileInfo.bioPlaceholder')}
            rows={3}
            style={{ ...inputStyle, resize:'vertical', minHeight:72 }}
          />
        </div>

        {/* Years of Experience */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, color:'var(--text2)', marginBottom:5 }}>{t('settings.profileInfo.yearsExp')}</label>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input
              type="number"
              min="0"
              max="60"
              value={yearsOfExperience}
              onChange={e => setYearsOfExperience(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
              style={{ ...inputStyle, width:90 }}
            />
            <span style={{ fontSize:13, color:'var(--text2)' }}>{t('settings.profileInfo.years')}</span>
          </div>
        </div>

        {/* License Number */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, color:'var(--text2)', marginBottom:5 }}>{t('settings.profileInfo.license')}</label>
          <input
            type="text"
            value={licenseNumber}
            onChange={e => setLicenseNumber(e.target.value)}
            placeholder={t('settings.profileInfo.licensePlaceholder')}
            style={inputStyle}
          />
        </div>

        {/* Languages */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, color:'var(--text2)', marginBottom:5 }}>{t('settings.profileInfo.languages')}</label>
          <input
            type="text"
            value={languagesRaw}
            onChange={e => setLanguagesRaw(e.target.value)}
            placeholder={t('settings.profileInfo.languagesPlaceholder')}
            style={inputStyle}
          />
          <div style={{ fontSize:11, color:'var(--text3,#64748b)', marginTop:4 }}>{t('settings.profileInfo.commaSeparated')}</div>
        </div>

        {/* Achievements */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, color:'var(--text2)', marginBottom:5 }}>{t('settings.profileInfo.achievements')}</label>
          <input
            type="text"
            value={achievementsRaw}
            onChange={e => setAchievementsRaw(e.target.value)}
            placeholder={t('settings.profileInfo.achievementsPlaceholder')}
            style={inputStyle}
          />
          <div style={{ fontSize:11, color:'var(--text3,#64748b)', marginTop:4 }}>{t('settings.profileInfo.commaSeparated')}</div>
        </div>

        {/* Education */}
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <label style={{ fontSize:12, color:'var(--text2)' }}>{t('settings.profileInfo.education')}</label>
            <Button variant="ghost" style={{ padding:'3px 10px', fontSize:11 }} onClick={addEduRow}>{t('settings.profileInfo.addEntry')}</Button>
          </div>
          {education.length === 0 && (
            <p style={{ fontSize:12, color:'var(--text3,#64748b)', margin:0 }}>{t('settings.profileInfo.noEducation')}</p>
          )}
          {education.map((row, i) => (
            <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:8, flexWrap:'wrap' }}>
              <input
                type="text"
                value={row.degree}
                onChange={e => updateEdu(i, 'degree', e.target.value)}
                placeholder={t('settings.profileInfo.degreePlaceholder')}
                style={{ ...inputStyle, flex:'2 1 120px' }}
              />
              <input
                type="text"
                value={row.institution}
                onChange={e => updateEdu(i, 'institution', e.target.value)}
                placeholder={t('settings.profileInfo.institutionPlaceholder')}
                style={{ ...inputStyle, flex:'3 1 160px' }}
              />
              <input
                type="text"
                value={row.year}
                onChange={e => updateEdu(i, 'year', e.target.value)}
                placeholder={t('settings.profileInfo.yearPlaceholder')}
                style={{ ...inputStyle, flex:'1 1 70px' }}
                maxLength={4}
              />
              <button
                onClick={() => removeEduRow(i)}
                style={{ background:'none', border:'none', color:'var(--rose,#f43f5e)', cursor:'pointer', fontSize:18, padding:'6px 2px', lineHeight:1 }}
              >×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Clinic Locations */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <div style={{ fontSize:14, fontWeight:500 }}>{t('settings.locations.title')}</div>
          <Button variant="ghost" style={{ padding:'4px 10px', fontSize:12 }}
            onClick={() => { setShowAddForm(v => !v); setLocError(''); }}>
            {showAddForm ? t('settings.locations.cancel') : t('settings.locations.add')}
          </Button>
        </div>
        <div style={{ fontSize:12, color:'var(--text2)', marginBottom:14 }}>
          <strong>{t('settings.locations.descBookable')}</strong> {t('settings.locations.descSuffix')}
        </div>

        {locations.length === 0 && !showAddForm && (
          <p style={{ fontSize:12, color:'var(--text3)', margin:'0 0 4px' }}>{t('settings.locations.empty')}</p>
        )}

        {locations.map(loc => (
          <div key={loc._id} style={{ marginBottom:8, padding:'10px 12px', background:'var(--bg3)', borderRadius:8, border:'1px solid var(--border2)' }}>
            {editingLocId === loc._id ? (
              <div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
                  <input value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                    placeholder={t('settings.locations.namePlaceholder')} style={{ ...inputStyle, flex:'2 1 140px' }} />
                  <input value={editDraft.address} onChange={e => setEditDraft(d => ({ ...d, address: e.target.value }))}
                    placeholder={t('settings.locations.addressPlaceholder')} style={{ ...inputStyle, flex:'3 1 180px' }} />
                  <select value={editDraft.type} onChange={e => setEditDraft(d => ({ ...d, type: e.target.value }))}
                    style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:6, padding:'6px 10px', color:'var(--text)', fontSize:13 }}>
                    <option value="bookable">{t('settings.locations.typeBookable')}</option>
                    <option value="hospital">{t('settings.locations.typeHospital')}</option>
                  </select>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <Button style={{ padding:'5px 14px', fontSize:12 }} onClick={saveEditLoc} disabled={locSaving}>{t('settings.locations.save')}</Button>
                  <Button variant="ghost" style={{ padding:'5px 14px', fontSize:12 }} onClick={cancelEditLoc}>{t('settings.locations.cancel')}</Button>
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{loc.name}</div>
                  {loc.address && <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{loc.address}</div>}
                </div>
                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background: loc.type === 'bookable' ? 'rgba(15,227,176,0.15)' : 'var(--bg2)', color: loc.type === 'bookable' ? 'var(--mint)' : 'var(--text2)', fontWeight:500 }}>
                  {loc.type === 'bookable' ? t('settings.locations.typeBookable') : t('settings.locations.typeHospital')}
                </span>
                <button onClick={() => startEditLoc(loc)} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:12, padding:'4px 8px' }}>{t('settings.locations.edit')}</button>
                <button onClick={() => deleteLoc(loc._id)} disabled={locSaving} style={{ background:'none', border:'none', color:'var(--rose)', cursor:'pointer', fontSize:18, padding:'2px', lineHeight:1 }}>×</button>
              </div>
            )}
          </div>
        ))}

        {showAddForm && (
          <div style={{ marginTop:8, padding:12, background:'var(--bg3)', borderRadius:8, border:'1px solid var(--border2)' }}>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:8, fontWeight:500 }}>{t('settings.locations.newLocation')}</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
              <input value={addDraft.name} onChange={e => setAddDraft(d => ({ ...d, name: e.target.value }))}
                placeholder={t('settings.locations.namePlaceholder')} style={{ ...inputStyle, flex:'2 1 140px' }} />
              <input value={addDraft.address} onChange={e => setAddDraft(d => ({ ...d, address: e.target.value }))}
                placeholder={t('settings.locations.addressPlaceholder')} style={{ ...inputStyle, flex:'3 1 180px' }} />
              <select value={addDraft.type} onChange={e => setAddDraft(d => ({ ...d, type: e.target.value }))}
                style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:6, padding:'6px 10px', color:'var(--text)', fontSize:13 }}>
                <option value="bookable">{t('settings.locations.typeBookable')}</option>
                <option value="hospital">{t('settings.locations.typeHospital')}</option>
              </select>
            </div>
            <Button style={{ padding:'6px 16px', fontSize:12 }} onClick={addLoc} disabled={locSaving}>{t('settings.locations.addLocation')}</Button>
          </div>
        )}

        {locError && <p style={{ color:'var(--rose)', fontSize:12, marginTop:8, marginBottom:0 }}>{locError}</p>}
      </div>

      {/* Auto-accept */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:500 }}>{t('settings.autoAccept.label')}</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginTop:3 }}>{t('settings.autoAccept.desc')}</div>
          </div>
          <button onClick={() => setAutoAccept(v => !v)}
            style={{ width:44, height:24, borderRadius:12, background: autoAccept ? 'var(--mint)' : 'var(--border2)', border:'none', cursor:'pointer', position:'relative', transition:'background .2s' }}>
            <span style={{ position:'absolute', top:3, left: autoAccept ? 23 : 3, width:18, height:18, borderRadius:9, background:'#fff', transition:'left .2s', display:'block' }} />
          </button>
        </div>
      </div>

      {/* Timezone */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:4 }}>{t('settings.timezone.label')}</div>
        <div style={{ fontSize:12, color:'var(--text2)', marginBottom:10 }}>{t('settings.timezone.desc')}</div>
        <select value={timezone} onChange={e => setTimezone(e.target.value)}
          style={{ width:'100%', padding:'8px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg3)', color:'var(--text)', fontSize:13, cursor:'pointer' }}>
          {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
        </select>
      </div>

      {/* Notification channels */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:14 }}>{t('settings.notifications.title')}</div>
        {[
          { labelKey: 'settings.notifications.push',  value: pushEnabled,  key: 'pushEnabled',  set: setPushEnabled },
          { labelKey: 'settings.notifications.email', value: emailEnabled, key: 'emailEnabled', set: setEmailEnabled },
        ].map(({ labelKey, value, key, set }) => (
          <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ fontSize:13, color:'var(--text2)' }}>{t(labelKey)}</span>
            <button
              onClick={async () => {
                set(!value);
                await updateNotificationPrefs({ [key]: !value }).catch(() => set(value));
              }}
              style={{ width:38, height:20, borderRadius:10, background: value ? 'var(--accent, #0ea5e9)' : 'var(--border2, #334155)', border:'none', cursor:'pointer', position:'relative', transition:'background .2s' }}
            >
              <span style={{ position:'absolute', top:2, left: value ? 20 : 2, width:16, height:16, borderRadius:8, background:'#fff', transition:'left .2s', display:'block' }} />
            </button>
          </div>
        ))}
      </div>

      {/* Consultation Fee + Currency */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:4 }}>{t('settings.fee.title')}</div>
        <div style={{ fontSize:12, color:'var(--text2)', marginBottom:10 }}>{t('settings.fee.desc')}</div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <input
            type="number"
            min="0"
            value={consultationFee}
            onChange={e => setConsultationFee(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0"
            style={{ ...inputStyle, width:120 }}
          />
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:6, padding:'6px 10px', color:'var(--text)', fontSize:13, cursor:'pointer' }}
          >
            {availableCurrencies.map(c => (
              <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize:11, color:'var(--text3)', marginTop:6 }}>{t('settings.fee.currencyNote')}</div>
      </div>

      {/* Appointment Types — moved to ServicesPage */}
      <div style={{ padding: '16px 0', borderTop: '1px solid var(--border)', marginTop: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
          لإدارة خدمات العيادة والأسعار،{' '}
          <Link to="/services" style={{ color: 'var(--mint)' }}>انتقل إلى صفحة الخدمات</Link>
        </p>
      </div>

      {/* Availability */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div style={{ fontSize:14, fontWeight:500 }}>{t('settings.availability.title')}</div>
          <Button variant="ghost" style={{ padding:'4px 10px', fontSize:12 }} onClick={addSlot}>{t('settings.availability.addDay')}</Button>
        </div>
        {slots.length === 0 && <p style={{ fontSize:12, color:'var(--text3)' }}>{t('settings.availability.noSlots')}</p>}
        {slots.map((sl, i) => (
          <div key={i} style={{ display:'flex', gap:10, alignItems:'center', marginBottom:8 }}>
            <select value={sl.dayOfWeek} onChange={e => updateSlot(i, 'dayOfWeek', parseInt(e.target.value))}
              style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'6px 10px', color:'var(--text)', fontSize:12 }}>
              {DAYS.map((d, idx) => <option key={d} value={idx}>{d}</option>)}
            </select>
            <input type="time" value={sl.startTime} onChange={e => updateSlot(i, 'startTime', e.target.value)}
              style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'6px 10px', color:'var(--text)', fontSize:12 }} />
            <span style={{ color:'var(--text3)', fontSize:12 }}>{t('settings.availability.to')}</span>
            <input type="time" value={sl.endTime} onChange={e => updateSlot(i, 'endTime', e.target.value)}
              style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', padding:'6px 10px', color:'var(--text)', fontSize:12 }} />
            <button onClick={() => removeSlot(i)} style={{ background:'none', border:'none', color:'var(--rose)', cursor:'pointer', fontSize:16 }}>×</button>
          </div>
        ))}
      </div>

      <Button onClick={save} disabled={saving} style={{ padding:'11px 28px' }}>{saveLabel}</Button>

      {/* Appearance */}
      <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text2)', marginBottom:10, marginTop:28 }}>
        {t('settings.appearance', 'Appearance')}
      </div>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:12 }}>{t('settings.theme', 'Theme')}</div>
        <div style={{ display:'flex', gap:10 }}>
          {[
            { value: 'dark',  label: '🌙 Night' },
            { value: 'light', label: '☀️ Light' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              style={{
                flex:1, padding:'10px 0', borderRadius:'var(--r-sm)',
                border: theme === opt.value ? '1.5px solid var(--mint)' : '1px solid var(--border)',
                background: theme === opt.value ? 'var(--mint-dim)' : 'var(--bg3)',
                color: theme === opt.value ? 'var(--mint)' : 'var(--text2)',
                fontWeight: theme === opt.value ? 600 : 400,
                fontSize:13, cursor:'pointer', transition:'all .15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Staff / Secretaries */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 20, marginTop: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>الموظفون</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>أضف سكرتيرة للوصول إلى غرفة الانتظار والمواعيد</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13 }}
          />
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            style={{ background: 'var(--mint)', color: '#060d18', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: inviting || !inviteEmail.trim() ? 'not-allowed' : 'pointer', opacity: inviting ? 0.7 : 1, whiteSpace: 'nowrap' }}
          >
            {inviting ? '...' : 'دعوة'}
          </button>
        </div>

        {staffError   && <p style={{ fontSize: 13, color: 'var(--rose)',  marginBottom: 8, marginTop: 0 }}>{staffError}</p>}
        {staffSuccess && <p style={{ fontSize: 13, color: '#16a34a',      marginBottom: 8, marginTop: 0 }}>{staffSuccess}</p>}

        {staffLoading && <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>جاري التحميل...</p>}

        {staffList.length === 0 && !staffLoading && (
          <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '16px 0', margin: 0 }}>لا يوجد موظفون — أرسل دعوة أعلاه</p>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          {staffList.map(s => (
            <div key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name || s.email}</div>
                {s.name && <div style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: s.isActive ? 'rgba(22,163,74,0.15)' : 'var(--bg2)', color: s.isActive ? '#16a34a' : 'var(--text3)', whiteSpace: 'nowrap' }}>
                {s.isActive ? 'نشط' : 'معلق'}
              </span>
              {s.isActive && (
                <button
                  onClick={() => handleRevoke(s._id)}
                  style={{ fontSize: 12, color: 'var(--rose)', background: 'none', border: '1px solid var(--rose)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  إلغاء
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
