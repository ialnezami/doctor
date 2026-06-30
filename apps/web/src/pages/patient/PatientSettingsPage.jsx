import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getNotificationPrefs, updateNotificationPrefs } from '../../api/users';
import { getPatientMe, updatePatientProfile } from '../../api/patients';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { useIsMobile } from '../../hooks/useIsMobile';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function Toggle({ label, value, onToggle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 14, color: 'var(--text)' }}>{label}</span>
      <button
        onClick={onToggle}
        style={{ width: 38, height: 20, borderRadius: 10, background: value ? 'var(--mint)' : 'var(--border2)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}
      >
        <span style={{ position: 'absolute', top: 2, left: value ? 20 : 2, width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'left .2s', display: 'block' }} />
      </button>
    </div>
  );
}

function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('');

  const add = () => {
    const val = input.trim();
    if (!val || tags.includes(val)) { setInput(''); return; }
    onChange([...tags, val]);
    setInput('');
  };

  const remove = (tag) => onChange(tags.filter(t => t !== tag));

  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    if (e.key === 'Backspace' && !input && tags.length) remove(tags[tags.length - 1]);
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg3)', padding: '6px 8px', display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 42, alignItems: 'center' }}>
      {tags.map(tag => (
        <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, fontSize: 12, color: 'var(--text)' }}>
          {tag}
          <button onClick={() => remove(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={tags.length === 0 ? placeholder : ''}
        style={{ flex: 1, minWidth: 80, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13 }}
      />
    </div>
  );
}

export default function PatientSettingsPage() {
  const { t }    = useTranslation();
  const isMobile = useIsMobile();

  const [pushEnabled, setPushEnabled]   = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);

  const [profile, setProfile]       = useState({ dateOfBirth: '', bloodType: '', allergies: [], conditions: [] });
  const [saving, setSaving]         = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    getNotificationPrefs().then(data => {
      if (data?.notificationPrefs) {
        setPushEnabled(data.notificationPrefs.pushEnabled);
        setEmailEnabled(data.notificationPrefs.emailEnabled);
      }
    }).catch(() => {});

    getPatientMe().then(res => {
      const p = res?.data ?? res;
      setProfile({
        dateOfBirth: p?.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '',
        bloodType:   p?.bloodType   || '',
        allergies:   p?.allergies   || [],
        conditions:  p?.conditions  || [],
      });
    }).catch(() => {});
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    setSaveStatus('');
    try {
      const payload = {};
      if (profile.dateOfBirth) payload.dateOfBirth = profile.dateOfBirth;
      if (profile.bloodType)   payload.bloodType   = profile.bloodType;
      payload.allergies  = profile.allergies;
      payload.conditions = profile.conditions;
      await updatePatientProfile(payload);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', padding: '9px 12px',
    color: 'var(--text)', fontSize: 13, outline: 'none',
  };

  const labelStyle = {
    fontSize: 12, color: 'var(--text2)', marginBottom: 6,
    display: 'block', fontWeight: 500,
  };

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(6,13,24,0.88)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 26px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 500 }}>{t('patientSettings.title')}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>{t('patientSettings.subtitle', 'Manage your profile and preferences')}</div>
      </div>

      <div style={{ padding: isMobile ? 14 : 26, maxWidth: 680 }}>

        {/* Health Profile */}
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 10 }}>
          {t('patientSettings.healthProfile')}
        </div>
        <Card style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>{t('patientSettings.dateOfBirth')}</label>
              <input
                type="date"
                value={profile.dateOfBirth}
                min="1900-01-01"
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => {
                  const val = e.target.value;
                  const year = val ? parseInt(val.slice(0, 4), 10) : 0;
                  if (year > 0 && year < 1900) return;
                  setProfile(p => ({ ...p, dateOfBirth: val }));
                }}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('patientSettings.bloodType')}</label>
              <select
                value={profile.bloodType}
                onChange={e => setProfile(p => ({ ...p, bloodType: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">{t('patientSettings.selectBloodType', '— Select —')}</option>
                {BLOOD_TYPES.map(bt => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              {t('patientSettings.allergies')}
              <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 4 }}>{t('patientSettings.tagHint', '— press Enter to add')}</span>
            </label>
            <TagInput
              tags={profile.allergies}
              onChange={tags => setProfile(p => ({ ...p, allergies: tags }))}
              placeholder={t('patientSettings.allergiesPlaceholder', 'e.g. Penicillin')}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>
              {t('patientSettings.conditions')}
              <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 4 }}>{t('patientSettings.tagHint', '— press Enter to add')}</span>
            </label>
            <TagInput
              tags={profile.conditions}
              onChange={tags => setProfile(p => ({ ...p, conditions: tags }))}
              placeholder={t('patientSettings.conditionsPlaceholder', 'e.g. Diabetes')}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button onClick={saveProfile} disabled={saving}>
              {saving ? t('common.saving') : t('patientSettings.saveProfile', 'Save Profile')}
            </Button>
            {saveStatus === 'saved' && <span style={{ fontSize: 13, color: 'var(--mint)' }}>{t('common.saved')}</span>}
            {saveStatus === 'error' && <span style={{ fontSize: 13, color: 'var(--rose)' }}>{t('common.error')}</span>}
          </div>
        </Card>

        {/* Notifications */}
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: 10 }}>
          {t('patientSettings.notificationChannels')}
        </div>
        <Card>
          <Toggle
            label={t('patientSettings.pushNotifications')}
            value={pushEnabled}
            onToggle={async () => {
              const next = !pushEnabled;
              setPushEnabled(next);
              await updateNotificationPrefs({ pushEnabled: next }).catch(() => setPushEnabled(!next));
            }}
          />
          <Toggle
            label={t('patientSettings.emailNotifications')}
            value={emailEnabled}
            onToggle={async () => {
              const next = !emailEnabled;
              setEmailEnabled(next);
              await updateNotificationPrefs({ emailEnabled: next }).catch(() => setEmailEnabled(!next));
            }}
          />
        </Card>
      </div>
    </div>
  );
}
