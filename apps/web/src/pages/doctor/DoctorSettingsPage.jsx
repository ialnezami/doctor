import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { updateDoctorSettings } from '../../api/doctors';
import useAuthStore from '../../store/authStore';
import Button from '../../components/ui/Button';
import client from '../../api/client';
import { getNotificationPrefs, updateNotificationPrefs } from '../../api/users';

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

export default function DoctorSettingsPage() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [doctorId, setDoctorId] = useState(null);
  const [autoAccept, setAutoAccept] = useState(false);
  const [slots, setSlots] = useState([]);
  const [timezone, setTimezone] = useState('UTC');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);

  const DAYS = DAY_KEYS.map(k => t(`common.days.${k}`));

  useEffect(() => {
    client.get('/doctors').then(docs => {
      const profile = docs.find(d => (d.userId?._id || d.userId) === user.id);
      if (profile) {
        setDoctorId(profile._id);
        setAutoAccept(profile.autoAcceptAppointments || false);
        setSlots(profile.availabilitySlots || []);
        setTimezone(profile.timezone || 'UTC');
      }
    }).catch(() => {});

    getNotificationPrefs().then(data => {
      if (data?.notificationPrefs) {
        setPushEnabled(data.notificationPrefs.pushEnabled);
        setEmailEnabled(data.notificationPrefs.emailEnabled);
      }
    }).catch(() => {});
  }, [user.id]);

  const addSlot = () => setSlots(s => [...s, { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }]);
  const removeSlot = (i) => setSlots(s => s.filter((_, idx) => idx !== i));
  const updateSlot = (i, key, val) => setSlots(s => s.map((sl, idx) => idx === i ? { ...sl, [key]: val } : sl));

  const save = async () => {
    if (!doctorId) return;
    setSaving(true);
    try {
      await updateDoctorSettings(doctorId, { autoAcceptAppointments: autoAccept, availabilitySlots: slots, timezone });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  };

  const saveLabel = saving ? t('settings.saving') : saved ? t('settings.saved') : t('settings.saveSettings');

  return (
    <div style={{ padding:26, maxWidth:600 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:21, fontWeight:500, marginBottom:24 }}>{t('settings.title')}</div>

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
