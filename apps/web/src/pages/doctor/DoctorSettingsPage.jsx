import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { updateDoctorSettings } from '../../api/doctors';
import useAuthStore from '../../store/authStore';
import Button from '../../components/ui/Button';
import client from '../../api/client';
import { getNotificationPrefs, updateNotificationPrefs } from '../../api/users';
import { useIsMobile } from '../../hooks/useIsMobile';

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

const PREDEFINED_KEYS = ['initial', 'follow-up', 'check-up', 'urgent'];
const DEFAULT_DURATIONS = { initial: 30, 'follow-up': 20, 'check-up': 30, urgent: 15 };
const PRESET_DURATIONS = [15, 20, 30];
const DEFAULT_APPT_TYPES = PREDEFINED_KEYS.map(key => ({
  key, label: '', duration: DEFAULT_DURATIONS[key], fee: 0, enabled: true,
}));

const SHARE_BASE = 'https://web-production-1d93d.up.railway.app';

export default function DoctorSettingsPage() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [doctorId, setDoctorId] = useState(null);
  const [autoAccept, setAutoAccept] = useState(false);
  const [slots, setSlots] = useState([]);
  const [timezone, setTimezone] = useState('UTC');
  const [consultationFee, setConsultationFee] = useState('');
  const [apptTypes, setApptTypes] = useState([]);
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

  // Share panel UI state
  const [copied, setCopied] = useState(false);

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
        setApptTypes(profile.appointmentTypes?.length ? profile.appointmentTypes : DEFAULT_APPT_TYPES);
        setBio(profile.bio || '');
        setYearsOfExperience(profile.yearsOfExperience != null ? String(profile.yearsOfExperience) : '');
        setLicenseNumber(profile.licenseNumber || '');
        setLanguagesRaw((profile.languages || []).join(', '));
        setEducation(profile.education || []);
        setAchievementsRaw((profile.achievements || []).join(', '));
      }
    }).catch(() => {});

    getNotificationPrefs().then(data => {
      if (data?.notificationPrefs) {
        setPushEnabled(data.notificationPrefs.pushEnabled);
        setEmailEnabled(data.notificationPrefs.emailEnabled);
      }
    }).catch(() => {});
  }, [user.id]);

  const addCustomApptType = () => setApptTypes(a => [...a, { key: `custom_${Date.now()}`, label: '', duration: 30, enabled: true }]);
  const removeApptType = (i) => setApptTypes(a => a.filter((_, idx) => idx !== i));
  const updateApptType = (i, field, val) => setApptTypes(a => a.map((at, idx) => idx === i ? { ...at, [field]: val } : at));

  const addSlot = () => setSlots(s => [...s, { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }]);
  const removeSlot = (i) => setSlots(s => s.filter((_, idx) => idx !== i));
  const updateSlot = (i, key, val) => setSlots(s => s.map((sl, idx) => idx === i ? { ...sl, [key]: val } : sl));

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
        appointmentTypes: apptTypes,
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
          <div style={{ fontSize:14, fontWeight:500, marginBottom:4 }}>Share Your Profile</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>
            Send this link to patients — no login required to view.
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
              {copied ? '✓ Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>
      )}

      {/* Rich Profile Info */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:14 }}>Profile Information</div>

        {/* Bio */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, color:'var(--text2)', marginBottom:5 }}>Bio</label>
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="A short description about yourself, your expertise, and approach…"
            rows={3}
            style={{ ...inputStyle, resize:'vertical', minHeight:72 }}
          />
        </div>

        {/* Years of Experience */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, color:'var(--text2)', marginBottom:5 }}>Years of Experience</label>
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
            <span style={{ fontSize:13, color:'var(--text2)' }}>years</span>
          </div>
        </div>

        {/* License Number */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, color:'var(--text2)', marginBottom:5 }}>License Number</label>
          <input
            type="text"
            value={licenseNumber}
            onChange={e => setLicenseNumber(e.target.value)}
            placeholder="e.g. MD-123456"
            style={inputStyle}
          />
        </div>

        {/* Languages */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, color:'var(--text2)', marginBottom:5 }}>Languages Spoken</label>
          <input
            type="text"
            value={languagesRaw}
            onChange={e => setLanguagesRaw(e.target.value)}
            placeholder="e.g. English, Arabic, French"
            style={inputStyle}
          />
          <div style={{ fontSize:11, color:'var(--text3,#64748b)', marginTop:4 }}>Comma-separated list</div>
        </div>

        {/* Achievements */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, color:'var(--text2)', marginBottom:5 }}>Achievements</label>
          <input
            type="text"
            value={achievementsRaw}
            onChange={e => setAchievementsRaw(e.target.value)}
            placeholder="e.g. Board Certified, Fellow of ACS, Top Doctor 2024"
            style={inputStyle}
          />
          <div style={{ fontSize:11, color:'var(--text3,#64748b)', marginTop:4 }}>Comma-separated list</div>
        </div>

        {/* Education */}
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <label style={{ fontSize:12, color:'var(--text2)' }}>Education</label>
            <Button variant="ghost" style={{ padding:'3px 10px', fontSize:11 }} onClick={addEduRow}>+ Add</Button>
          </div>
          {education.length === 0 && (
            <p style={{ fontSize:12, color:'var(--text3,#64748b)', margin:0 }}>No education entries yet.</p>
          )}
          {education.map((row, i) => (
            <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:8, flexWrap:'wrap' }}>
              <input
                type="text"
                value={row.degree}
                onChange={e => updateEdu(i, 'degree', e.target.value)}
                placeholder="Degree (e.g. MD)"
                style={{ ...inputStyle, flex:'2 1 120px' }}
              />
              <input
                type="text"
                value={row.institution}
                onChange={e => updateEdu(i, 'institution', e.target.value)}
                placeholder="Institution"
                style={{ ...inputStyle, flex:'3 1 160px' }}
              />
              <input
                type="text"
                value={row.year}
                onChange={e => updateEdu(i, 'year', e.target.value)}
                placeholder="Year"
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

      {/* Consultation Fee */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:4 }}>Consultation Fee</div>
        <div style={{ fontSize:12, color:'var(--text2)', marginBottom:10 }}>Amount patients pay per appointment</div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <input
            type="number"
            min="0"
            value={consultationFee}
            onChange={e => setConsultationFee(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0"
            style={{ ...inputStyle, width:120 }}
          />
          <span style={{ fontSize:13, color:'var(--text2)' }}>SAR</span>
        </div>
      </div>

      {/* Appointment Types */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <div style={{ fontSize:14, fontWeight:500 }}>{t('settings.apptTypes.title')}</div>
          <Button variant="ghost" style={{ padding:'4px 10px', fontSize:12 }} onClick={addCustomApptType}>
            {t('settings.apptTypes.addCustom')}
          </Button>
        </div>
        <div style={{ fontSize:12, color:'var(--text2)', marginBottom:14 }}>{t('settings.apptTypes.desc')}</div>
        {apptTypes.length === 0 && <p style={{ fontSize:12, color:'var(--text3)', margin:0 }}>{t('settings.apptTypes.noTypes')}</p>}
        {apptTypes.map((at, i) => {
          const isPredefined = PREDEFINED_KEYS.includes(at.key);
          const isCustomDuration = !PRESET_DURATIONS.includes(at.duration);
          return (
            <div key={at.key + i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, padding:'8px 10px', background:'var(--bg3)', borderRadius:8, border:'1px solid var(--border2)', opacity: at.enabled ? 1 : 0.55 }}>
              <button onClick={() => updateApptType(i, 'enabled', !at.enabled)}
                style={{ width:34, height:18, borderRadius:9, background: at.enabled ? 'var(--mint)' : 'var(--border2)', border:'none', cursor:'pointer', position:'relative', flexShrink:0, transition:'background .2s' }}>
                <span style={{ position:'absolute', top:2, left: at.enabled ? 17 : 2, width:14, height:14, borderRadius:7, background:'#fff', transition:'left .2s', display:'block' }} />
              </button>
              {isPredefined ? (
                <span style={{ flex:1, fontSize:13, color:'var(--text)' }}>{t(`settings.apptTypes.types.${at.key}`, at.key)}</span>
              ) : (
                <input value={at.label} onChange={e => updateApptType(i, 'label', e.target.value)}
                  placeholder={t('settings.apptTypes.labelPlaceholder')}
                  style={{ ...inputStyle, flex:1 }} />
              )}
              <select
                value={isCustomDuration ? 'custom' : at.duration}
                onChange={e => { if (e.target.value !== 'custom') updateApptType(i, 'duration', parseInt(e.target.value)); else updateApptType(i, 'duration', 45); }}
                style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:6, padding:'4px 8px', color:'var(--text)', fontSize:12 }}>
                {PRESET_DURATIONS.map(d => <option key={d} value={d}>{t(`settings.apptTypes.durations.${d}`, `${d} min`)}</option>)}
                <option value="custom">{t('settings.apptTypes.durations.custom', 'Custom')}</option>
              </select>
              {isCustomDuration && (
                <input type="number" min="5" max="240" value={at.duration}
                  onChange={e => updateApptType(i, 'duration', parseInt(e.target.value) || 30)}
                  style={{ ...inputStyle, width:54, textAlign:'center' }} />
              )}
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <input
                  type="number" min="0" value={at.fee ?? 0}
                  onChange={e => updateApptType(i, 'fee', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  style={{ ...inputStyle, width:64, textAlign:'center' }}
                />
                <span style={{ fontSize:11, color:'var(--text3)', whiteSpace:'nowrap' }}>SAR</span>
              </div>
              {!isPredefined && (
                <button onClick={() => removeApptType(i)} style={{ background:'none', border:'none', color:'var(--rose)', cursor:'pointer', fontSize:18, padding:'2px', lineHeight:1 }}>×</button>
              )}
            </div>
          );
        })}
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
    </div>
  );
}
